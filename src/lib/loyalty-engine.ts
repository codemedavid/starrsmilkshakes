// src/lib/loyalty-engine.ts
// Pure business logic for the loyalty system — no I/O, no DB, no network.

import type {
  LoyaltyConfig,
  LoyaltyBooster,
  LoyaltyOrderItem,
  LoyaltyCard,
  LoyaltyReward,
  EarningsResult,
} from '@/types/loyalty';

/**
 * Filter order items to only those that qualify under the loyalty config's
 * allowlist/blocklist rules.
 *
 * - blocklist: exclude items whose menu_item_id OR category_id appears in the filter lists.
 *   Empty filter lists → every item qualifies.
 * - allowlist: include only items whose menu_item_id OR category_id appears in the filter lists.
 *   Empty filter lists → nothing qualifies.
 */
export function filterQualifyingItems(
  items: LoyaltyOrderItem[],
  config: LoyaltyConfig,
): LoyaltyOrderItem[] {
  if (items.length === 0) return [];

  const { filter_mode, filtered_item_ids, filtered_category_ids } = config;

  if (filter_mode === 'blocklist') {
    // Empty blocklist → all pass
    if (filtered_item_ids.length === 0 && filtered_category_ids.length === 0) {
      return items;
    }
    return items.filter(
      (item) =>
        !filtered_item_ids.includes(item.menu_item_id) &&
        !filtered_category_ids.includes(item.category_id),
    );
  }

  // allowlist: empty lists → nothing qualifies
  if (filtered_item_ids.length === 0 && filtered_category_ids.length === 0) {
    return [];
  }
  return items.filter(
    (item) =>
      filtered_item_ids.includes(item.menu_item_id) ||
      filtered_category_ids.includes(item.category_id),
  );
}

/**
 * Find the single best-matching active booster for this order.
 *
 * Rules:
 * - is_active must be true
 * - `date` must fall within [starts_at, ends_at]
 * - filter_mode='all'        → matches any order items
 * - filter_mode='category'   → at least one item's category_id in filter_ids
 * - filter_mode='item'       → at least one item's menu_item_id in filter_ids
 * - Multiple matches → highest multiplier wins (no stacking)
 *
 * Returns null when nothing matches.
 */
export function findActiveBoosters(
  boosters: LoyaltyBooster[],
  orderItems: LoyaltyOrderItem[],
  date: Date,
): LoyaltyBooster | null {
  const matching = boosters.filter((booster) => {
    if (!booster.is_active) return false;

    const start = new Date(booster.starts_at);
    const end = new Date(booster.ends_at);
    if (date < start || date > end) return false;

    if (booster.filter_mode === 'all') return true;

    if (booster.filter_mode === 'category') {
      if (booster.filter_ids.length === 0) return false;
      return orderItems.some((item) => booster.filter_ids.includes(item.category_id));
    }

    if (booster.filter_mode === 'item') {
      if (booster.filter_ids.length === 0) return false;
      return orderItems.some((item) => booster.filter_ids.includes(item.menu_item_id));
    }

    return false;
  });

  if (matching.length === 0) return null;

  // Highest multiplier wins
  return matching.reduce((best, current) =>
    current.multiplier > best.multiplier ? current : best,
  );
}

/**
 * Calculate stamps and points earned for an order.
 *
 * - Stamps: if stamps_enabled AND at least one qualifying item →
 *     floor(stamps_per_order × booster_multiplier)
 * - Points: if points_enabled AND qualifying_total > 0 →
 *     floor(qualifying_total × points_per_peso × booster_multiplier)
 * - `now` is optional for deterministic testing (defaults to new Date()).
 */
export function calculateEarnings(
  orderItems: LoyaltyOrderItem[],
  config: LoyaltyConfig,
  boosters: LoyaltyBooster[],
  now: Date = new Date(),
): EarningsResult {
  const qualifyingItems = filterQualifyingItems(orderItems, config);
  const qualifying_total = qualifyingItems.reduce((sum, item) => sum + item.subtotal, 0);

  const booster = findActiveBoosters(boosters, orderItems, now);
  const booster_multiplier = booster?.multiplier ?? 1;
  const booster_id = booster?.id ?? null;

  const stamps =
    config.stamps_enabled && qualifyingItems.length > 0
      ? Math.floor(config.stamps_per_order * booster_multiplier)
      : 0;

  const points =
    config.points_enabled && qualifying_total > 0
      ? Math.floor(qualifying_total * config.points_per_peso * booster_multiplier)
      : 0;

  return { stamps, points, booster_id, booster_multiplier, qualifying_total };
}

/**
 * Check whether a loyalty card has reached the goal for a given reward.
 * Returns true if EITHER the stamps OR the points requirement is satisfied.
 */
export function checkGoalReached(card: LoyaltyCard, reward: LoyaltyReward | null): boolean {
  if (reward === null) return false;

  const stampsOk =
    reward.stamps_required !== null && card.current_stamps >= reward.stamps_required;
  const pointsOk =
    reward.points_required !== null && card.current_points >= reward.points_required;

  return stampsOk || pointsOk;
}

/**
 * Calculate the carryover (excess) after redeeming a reward.
 *
 * stamps: current_stamps - (stamps_required ?? 0)
 * points: current_points - (points_required ?? 0)
 *
 * Note: may return negative values if called before the goal is reached.
 */
export function calculateCarryover(
  card: LoyaltyCard,
  reward: LoyaltyReward,
): { stamps: number; points: number } {
  return {
    stamps: card.current_stamps - (reward.stamps_required ?? 0),
    points: card.current_points - (reward.points_required ?? 0),
  };
}
