// src/lib/upsell-engine.ts
// Pure business logic for upsell rule matching — no I/O, no DB, no network.

import type {
  UpsellRule,
  UpsellOffer,
  AddonSuggestion,
  PairRule,
  PairOffer,
  InterstitialOffer,
  UpsellCartItem,
  UpsellCart,
} from '@/types/upsell';
import type { LoyaltyCard, LoyaltyConfig, LoyaltyReward } from '@/types/loyalty';

/** Filter rules that are active and within date range. */
export function filterActiveRules<
  T extends { is_active: boolean; starts_at?: string | null; ends_at?: string | null },
>(rules: T[], now: Date): T[] {
  return rules.filter(r => {
    if (!r.is_active) return false;
    if (r.starts_at && new Date(r.starts_at) > now) return false;
    if (r.ends_at && new Date(r.ends_at) < now) return false;
    return true;
  });
}

/** Return top N offers sorted by priority descending. */
export function prioritizeOffers<T extends { priority: number }>(
  offers: T[],
  maxCount: number,
): T[] {
  return [...offers].sort((a, b) => b.priority - a.priority).slice(0, maxCount);
}

/** Check if a loyalty nudge should be shown. */
export function shouldShowLoyaltyNudge(
  card: LoyaltyCard | null,
  config: LoyaltyConfig | null,
  goalReward: LoyaltyReward | null,
): { show: boolean; message: string; stampsAway: number | null; pointsAway: number | null } {
  if (!card || !config || !goalReward) {
    return { show: false, message: '', stampsAway: null, pointsAway: null };
  }

  const stampsAway =
    goalReward.stamps_required !== null
      ? Math.max(0, goalReward.stamps_required - card.current_stamps)
      : null;
  const pointsAway =
    goalReward.points_required !== null
      ? Math.max(0, goalReward.points_required - card.current_points)
      : null;

  // Show nudge if within 3 stamps or 50 points of goal
  const isClose =
    (stampsAway !== null && stampsAway <= 3 && stampsAway > 0) ||
    (pointsAway !== null && pointsAway <= 50 && pointsAway > 0);

  if (!isClose) return { show: false, message: '', stampsAway, pointsAway };

  let message = '';
  if (stampsAway !== null && stampsAway > 0) {
    message = `You're ${stampsAway} stamp${stampsAway !== 1 ? 's' : ''} away from ${goalReward.name}!`;
  } else if (pointsAway !== null && pointsAway > 0) {
    message = `You're ${pointsAway} points away from ${goalReward.name}!`;
  }

  return { show: true, message, stampsAway, pointsAway };
}

/** Phase 1: Match upgrade offers based on cart items. */
export function matchUpgradeOffers(
  cartItems: UpsellCartItem[],
  rules: UpsellRule[],
  now: Date,
): UpsellOffer[] {
  const active = filterActiveRules(rules.filter(r => r.phase === 'upgrade'), now);
  const matchedRules: UpsellRule[] = [];

  for (const rule of active) {
    let matches = false;

    if (rule.trigger_type === 'item') {
      matches = cartItems.some(ci => rule.trigger_item_ids.includes(ci.menu_item_id));
    } else if (rule.trigger_type === 'category') {
      matches = cartItems.some(ci => rule.trigger_category_ids.includes(ci.category));
    } else if (rule.trigger_type === 'cart_total') {
      const total = cartItems.reduce((sum, ci) => sum + ci.unit_price * ci.quantity, 0);
      matches = rule.trigger_min_total !== null && total >= rule.trigger_min_total;
    }

    if (matches) {
      matchedRules.push(rule);
    }
  }

  return prioritizeOffers(matchedRules, 3).map(rule => ({
    rule,
    savings: null,
    display_price: 0,
  }));
}

/** Phase 2: Get suggested add-ons for a menu item. */
export function suggestAddOns(
  menuItemId: string,
  suggestions: AddonSuggestion[],
  now: Date,
): AddonSuggestion[] {
  return filterActiveRules(
    suggestions.filter(s => s.menu_item_id === menuItemId),
    now,
  ).sort((a, b) => a.sort_order - b.sort_order);
}

/** Phase 3: Match pair suggestions based on cart items. */
export function matchPairOffers(
  cartItems: UpsellCartItem[],
  pairRules: PairRule[],
): PairOffer[] {
  const active = pairRules.filter(r => r.is_active);
  const cartItemIds = new Set(cartItems.map(ci => ci.menu_item_id));
  const cartCategories = new Set(cartItems.map(ci => ci.category));
  const matchedRules: PairRule[] = [];

  for (const rule of active) {
    // Check source matches
    const sourceMatches =
      (rule.source_item_id && cartItemIds.has(rule.source_item_id)) ||
      (rule.source_category_id && cartCategories.has(rule.source_category_id));

    if (!sourceMatches) continue;

    // Exclude if paired item is already in cart
    if (rule.paired_item_id && cartItemIds.has(rule.paired_item_id)) continue;

    matchedRules.push(rule);
  }

  return prioritizeOffers(matchedRules, 4).map(rule => ({
    rule,
    item: rule.paired_item ?? null,
    bundle: rule.paired_bundle ?? null,
  }));
}

/** Phase 4: Match checkout interstitial offer. */
export function matchInterstitialOffers(
  cart: UpsellCart,
  rules: UpsellRule[],
  loyaltyCard: LoyaltyCard | null,
  loyaltyConfig: LoyaltyConfig | null,
  goalReward: LoyaltyReward | null,
  now: Date,
): InterstitialOffer | null {
  const active = filterActiveRules(rules.filter(r => r.phase === 'interstitial'), now);
  const sorted = prioritizeOffers(active, 10);

  for (const rule of sorted) {
    let matches = false;

    if (rule.trigger_type === 'item') {
      matches = cart.items.some(ci => rule.trigger_item_ids.includes(ci.menu_item_id));
    } else if (rule.trigger_type === 'category') {
      matches = cart.items.some(ci => rule.trigger_category_ids.includes(ci.category));
    } else if (rule.trigger_type === 'cart_total') {
      matches = rule.trigger_min_total !== null && cart.total >= rule.trigger_min_total;
    } else if (rule.trigger_type === 'cart_empty_category') {
      const cartCategories = new Set(cart.items.map(ci => ci.category));
      matches = rule.trigger_category_ids.some(catId => !cartCategories.has(catId));
    }

    if (!matches) continue;

    // Special handling for loyalty_nudge
    if (rule.offer_type === 'loyalty_nudge') {
      const nudge = shouldShowLoyaltyNudge(loyaltyCard, loyaltyConfig, goalReward);
      if (!nudge.show) continue;
      return {
        rule,
        type: 'loyalty_nudge',
        item: null,
        bundle: null,
        discounted_price: null,
        loyalty_message: nudge.message,
      };
    }

    // Build offer
    const discounted_price =
      rule.offer_type === 'discount' && rule.offer_discount_percent && rule.offer_item
        ? rule.offer_item.basePrice * (1 - rule.offer_discount_percent / 100)
        : null;

    return {
      rule,
      type: rule.offer_type,
      item: rule.offer_item ?? null,
      bundle: rule.offer_bundle ?? null,
      discounted_price,
      loyalty_message: null,
    };
  }

  return null;
}
