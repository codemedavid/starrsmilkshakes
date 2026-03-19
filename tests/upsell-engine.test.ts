// tests/upsell-engine.test.ts
// TDD-first tests for the upsell engine (pure business logic)

import { describe, it, expect } from 'vitest';
import {
  filterActiveRules,
  prioritizeOffers,
  shouldShowLoyaltyNudge,
  matchUpgradeOffers,
  suggestAddOns,
  matchPairOffers,
  matchInterstitialOffers,
} from '@/lib/upsell-engine';

import type {
  UpsellRule,
  AddonSuggestion,
  PairRule,
  UpsellCartItem,
  UpsellCart,
} from '@/types/upsell';
import type { LoyaltyCard, LoyaltyConfig, LoyaltyReward } from '@/types/loyalty';
import type { MenuItem } from '@/types';
import type { Bundle } from '@/types/bundle';

// ─── Fixture Builders ────────────────────────────────────────────────────────

const NOW = new Date('2026-01-15T12:00:00Z');
const PAST = '2026-01-01T00:00:00Z';
const FUTURE = '2026-02-01T00:00:00Z';

function makeUpsellRule(overrides: Partial<UpsellRule> = {}): UpsellRule {
  return {
    id: 'rule-1',
    name: 'Test Rule',
    phase: 'upgrade',
    trigger_type: 'item',
    trigger_item_ids: ['item-1'],
    trigger_category_ids: [],
    trigger_min_total: null,
    offer_type: 'item',
    offer_item_id: 'offer-item-1',
    offer_bundle_id: null,
    offer_discount_percent: null,
    offer_message: null,
    priority: 10,
    is_active: true,
    starts_at: null,
    ends_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makePairRule(overrides: Partial<PairRule> = {}): PairRule {
  return {
    id: 'pair-1',
    source_item_id: 'item-1',
    source_category_id: null,
    paired_item_id: 'paired-item-1',
    paired_bundle_id: null,
    message: 'Try this with your shake!',
    priority: 10,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeAddonSuggestion(overrides: Partial<AddonSuggestion> = {}): AddonSuggestion {
  return {
    id: 'addon-1',
    menu_item_id: 'item-1',
    add_on_id: 'add-on-1',
    suggestion_text: 'Add some whipped cream!',
    sort_order: 0,
    is_active: true,
    starts_at: null,
    ends_at: null,
    ...overrides,
  };
}

function makeCartItem(overrides: Partial<UpsellCartItem> = {}): UpsellCartItem {
  return {
    menu_item_id: 'item-1',
    category: 'shakes',
    quantity: 1,
    unit_price: 150,
    ...overrides,
  };
}

function makeCart(overrides: Partial<UpsellCart> = {}): UpsellCart {
  return {
    items: [makeCartItem()],
    total: 150,
    ...overrides,
  };
}

function makeLoyaltyCard(overrides: Partial<LoyaltyCard> = {}): LoyaltyCard {
  return {
    id: 'card-1',
    customer_id: 'cust-1',
    card_code: 'ABC123',
    current_stamps: 7,
    current_points: 0,
    goal_reward_id: 'reward-1',
    lifetime_stamps: 30,
    lifetime_points: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeLoyaltyConfig(overrides: Partial<LoyaltyConfig> = {}): LoyaltyConfig {
  return {
    id: 'config-1',
    stamps_enabled: true,
    points_enabled: false,
    points_per_peso: 1,
    stamps_per_order: 1,
    filter_mode: 'blocklist',
    filtered_category_ids: [],
    filtered_item_ids: [],
    claim_window_days: 30,
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeLoyaltyReward(overrides: Partial<LoyaltyReward> = {}): LoyaltyReward {
  return {
    id: 'reward-1',
    name: 'Free Shake',
    description: null,
    image_url: null,
    stamps_required: 10,
    points_required: null,
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeMenuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'menu-item-1',
    name: 'Chocolate Shake',
    description: 'Rich chocolate shake',
    basePrice: 150,
    category: 'shakes',
    ...overrides,
  };
}

function makeBundle(overrides: Partial<Bundle> = {}): Bundle {
  return {
    id: 'bundle-1',
    name: 'Combo Deal',
    description: null,
    image_url: null,
    base_price: 250,
    cost_price: null,
    category: 'combos',
    discount_price: null,
    discount_active: false,
    discount_start_date: null,
    discount_end_date: null,
    available: true,
    popular: false,
    sort_order: 0,
    slots: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ─── filterActiveRules ────────────────────────────────────────────────────────

describe('filterActiveRules', () => {
  it('passes active rules with no date constraints', () => {
    const rules = [makeUpsellRule()];
    expect(filterActiveRules(rules, NOW)).toHaveLength(1);
  });

  it('filters out inactive rules', () => {
    const rules = [makeUpsellRule({ is_active: false })];
    expect(filterActiveRules(rules, NOW)).toHaveLength(0);
  });

  it('filters out rules that have not started yet', () => {
    const rules = [makeUpsellRule({ starts_at: FUTURE })];
    expect(filterActiveRules(rules, NOW)).toHaveLength(0);
  });

  it('filters out rules that have expired', () => {
    const rules = [makeUpsellRule({ ends_at: PAST })];
    expect(filterActiveRules(rules, NOW)).toHaveLength(0);
  });

  it('passes rules whose window includes now', () => {
    const rules = [makeUpsellRule({ starts_at: PAST, ends_at: FUTURE })];
    expect(filterActiveRules(rules, NOW)).toHaveLength(1);
  });

  it('handles a mix of active and inactive rules', () => {
    const rules = [
      makeUpsellRule({ id: 'r1', is_active: true }),
      makeUpsellRule({ id: 'r2', is_active: false }),
      makeUpsellRule({ id: 'r3', is_active: true, ends_at: PAST }),
    ];
    const result = filterActiveRules(rules, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r1');
  });

  it('returns empty array when input is empty', () => {
    expect(filterActiveRules([], NOW)).toHaveLength(0);
  });
});

// ─── prioritizeOffers ─────────────────────────────────────────────────────────

describe('prioritizeOffers', () => {
  const makeOffer = (priority: number, id: string) => ({ id, priority });

  it('sorts by priority descending', () => {
    const offers = [
      makeOffer(5, 'a'),
      makeOffer(10, 'b'),
      makeOffer(1, 'c'),
    ];
    const result = prioritizeOffers(offers, 10);
    expect(result.map(o => o.id)).toEqual(['b', 'a', 'c']);
  });

  it('limits to maxCount', () => {
    const offers = [makeOffer(1, 'a'), makeOffer(2, 'b'), makeOffer(3, 'c'), makeOffer(4, 'd')];
    const result = prioritizeOffers(offers, 2);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('d');
    expect(result[1].id).toBe('c');
  });

  it('returns all when count is less than maxCount', () => {
    const offers = [makeOffer(1, 'a'), makeOffer(2, 'b')];
    expect(prioritizeOffers(offers, 5)).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(prioritizeOffers([], 5)).toHaveLength(0);
  });

  it('does not mutate the original array', () => {
    const offers = [makeOffer(3, 'a'), makeOffer(1, 'b')];
    const original = [...offers];
    prioritizeOffers(offers, 5);
    expect(offers).toEqual(original);
  });
});

// ─── shouldShowLoyaltyNudge ──────────────────────────────────────────────────

describe('shouldShowLoyaltyNudge', () => {
  it('returns show: false when card is null', () => {
    const result = shouldShowLoyaltyNudge(null, makeLoyaltyConfig(), makeLoyaltyReward());
    expect(result.show).toBe(false);
  });

  it('returns show: false when config is null', () => {
    const result = shouldShowLoyaltyNudge(makeLoyaltyCard(), null, makeLoyaltyReward());
    expect(result.show).toBe(false);
  });

  it('returns show: false when goal reward is null', () => {
    const result = shouldShowLoyaltyNudge(makeLoyaltyCard(), makeLoyaltyConfig(), null);
    expect(result.show).toBe(false);
  });

  it('shows nudge when 1 stamp away from goal', () => {
    const card = makeLoyaltyCard({ current_stamps: 9 });
    const reward = makeLoyaltyReward({ stamps_required: 10 });
    const result = shouldShowLoyaltyNudge(card, makeLoyaltyConfig(), reward);
    expect(result.show).toBe(true);
    expect(result.stampsAway).toBe(1);
    expect(result.message).toContain('1 stamp away');
    expect(result.message).toContain('Free Shake');
  });

  it('shows nudge when 3 stamps away from goal', () => {
    const card = makeLoyaltyCard({ current_stamps: 7 });
    const reward = makeLoyaltyReward({ stamps_required: 10 });
    const result = shouldShowLoyaltyNudge(card, makeLoyaltyConfig(), reward);
    expect(result.show).toBe(true);
    expect(result.stampsAway).toBe(3);
    expect(result.message).toContain('3 stamps away');
  });

  it('does NOT show nudge when 4 stamps away (outside threshold)', () => {
    const card = makeLoyaltyCard({ current_stamps: 6 });
    const reward = makeLoyaltyReward({ stamps_required: 10 });
    const result = shouldShowLoyaltyNudge(card, makeLoyaltyConfig(), reward);
    expect(result.show).toBe(false);
    expect(result.stampsAway).toBe(4);
  });

  it('does NOT show nudge when customer already reached goal (0 stamps away)', () => {
    const card = makeLoyaltyCard({ current_stamps: 10 });
    const reward = makeLoyaltyReward({ stamps_required: 10 });
    const result = shouldShowLoyaltyNudge(card, makeLoyaltyConfig(), reward);
    expect(result.show).toBe(false);
    expect(result.stampsAway).toBe(0);
  });

  it('shows nudge when 30 points away from goal', () => {
    const card = makeLoyaltyCard({ current_stamps: 0, current_points: 70 });
    const reward = makeLoyaltyReward({ stamps_required: null, points_required: 100 });
    const result = shouldShowLoyaltyNudge(card, makeLoyaltyConfig(), reward);
    expect(result.show).toBe(true);
    expect(result.pointsAway).toBe(30);
    expect(result.message).toContain('30 points away');
  });

  it('does NOT show nudge when 51 points away (outside threshold)', () => {
    const card = makeLoyaltyCard({ current_stamps: 0, current_points: 49 });
    const reward = makeLoyaltyReward({ stamps_required: null, points_required: 100 });
    const result = shouldShowLoyaltyNudge(card, makeLoyaltyConfig(), reward);
    expect(result.show).toBe(false);
    expect(result.pointsAway).toBe(51);
  });

  it('uses plural "stamps" for counts > 1', () => {
    const card = makeLoyaltyCard({ current_stamps: 8 });
    const reward = makeLoyaltyReward({ stamps_required: 10 });
    const result = shouldShowLoyaltyNudge(card, makeLoyaltyConfig(), reward);
    expect(result.message).toContain('stamps');
  });

  it('uses singular "stamp" for exactly 1', () => {
    const card = makeLoyaltyCard({ current_stamps: 9 });
    const reward = makeLoyaltyReward({ stamps_required: 10 });
    const result = shouldShowLoyaltyNudge(card, makeLoyaltyConfig(), reward);
    expect(result.message).toContain('1 stamp away');
    expect(result.message).not.toContain('stamps away');
  });
});

// ─── matchUpgradeOffers ───────────────────────────────────────────────────────

describe('matchUpgradeOffers', () => {
  it('returns empty array when no rules provided', () => {
    const cart = [makeCartItem()];
    expect(matchUpgradeOffers(cart, [], NOW)).toHaveLength(0);
  });

  it('matches an item trigger rule when item is in cart', () => {
    const rule = makeUpsellRule({ trigger_type: 'item', trigger_item_ids: ['item-1'] });
    const cart = [makeCartItem({ menu_item_id: 'item-1' })];
    const result = matchUpgradeOffers(cart, [rule], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].rule.id).toBe('rule-1');
  });

  it('does not match item trigger when item is not in cart', () => {
    const rule = makeUpsellRule({ trigger_type: 'item', trigger_item_ids: ['item-999'] });
    const cart = [makeCartItem({ menu_item_id: 'item-1' })];
    expect(matchUpgradeOffers(cart, [rule], NOW)).toHaveLength(0);
  });

  it('matches a category trigger rule when category is in cart', () => {
    const rule = makeUpsellRule({ trigger_type: 'category', trigger_category_ids: ['shakes'] });
    const cart = [makeCartItem({ category: 'shakes' })];
    const result = matchUpgradeOffers(cart, [rule], NOW);
    expect(result).toHaveLength(1);
  });

  it('does not match category trigger when category is not in cart', () => {
    const rule = makeUpsellRule({ trigger_type: 'category', trigger_category_ids: ['desserts'] });
    const cart = [makeCartItem({ category: 'shakes' })];
    expect(matchUpgradeOffers(cart, [rule], NOW)).toHaveLength(0);
  });

  it('matches cart_total trigger when total meets minimum', () => {
    const rule = makeUpsellRule({ trigger_type: 'cart_total', trigger_min_total: 300 });
    const cart = [makeCartItem({ unit_price: 200, quantity: 2 })]; // total = 400
    const result = matchUpgradeOffers(cart, [rule], NOW);
    expect(result).toHaveLength(1);
  });

  it('does not match cart_total trigger when total is below minimum', () => {
    const rule = makeUpsellRule({ trigger_type: 'cart_total', trigger_min_total: 500 });
    const cart = [makeCartItem({ unit_price: 100, quantity: 2 })]; // total = 200
    expect(matchUpgradeOffers(cart, [rule], NOW)).toHaveLength(0);
  });

  it('filters out inactive upgrade rules', () => {
    const rule = makeUpsellRule({ is_active: false });
    const cart = [makeCartItem()];
    expect(matchUpgradeOffers(cart, [rule], NOW)).toHaveLength(0);
  });

  it('only returns rules with phase "upgrade"', () => {
    const upgradeRule = makeUpsellRule({ id: 'upgrade-1', phase: 'upgrade' });
    const interstitialRule = makeUpsellRule({ id: 'interstitial-1', phase: 'interstitial' });
    const cart = [makeCartItem()];
    const result = matchUpgradeOffers(cart, [upgradeRule, interstitialRule], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].rule.id).toBe('upgrade-1');
  });

  it('returns at most 3 offers', () => {
    const rules = Array.from({ length: 5 }, (_, i) =>
      makeUpsellRule({ id: `rule-${i}`, priority: i })
    );
    const cart = [makeCartItem()];
    const result = matchUpgradeOffers(cart, rules, NOW);
    expect(result).toHaveLength(3);
  });

  it('sorts returned offers by priority descending', () => {
    const rules = [
      makeUpsellRule({ id: 'low', priority: 1 }),
      makeUpsellRule({ id: 'high', priority: 20 }),
      makeUpsellRule({ id: 'mid', priority: 10 }),
    ];
    const cart = [makeCartItem()];
    const result = matchUpgradeOffers(cart, rules, NOW);
    expect(result[0].rule.id).toBe('high');
  });

  // ─── savings calculation tests ──────────────────────────────────────────────

  it('should calculate savings when offer price is less than triggered items total', () => {
    // Cart item costs 200, bundle offer costs 150 → savings = 50
    const offerBundle = {
      ...makeBundle({ id: 'bundle-offer', base_price: 150 }),
      discount_active: false,
      discount_start_date: null,
      discount_end_date: null,
    } as any;
    const rule = makeUpsellRule({
      trigger_type: 'item',
      trigger_item_ids: ['item-1'],
      offer_type: 'bundle',
      offer_bundle_id: 'bundle-offer',
      offer_bundle: offerBundle,
    });
    const cart = [makeCartItem({ menu_item_id: 'item-1', unit_price: 200, quantity: 1 })];
    const result = matchUpgradeOffers(cart, [rule], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].savings).toBe(50); // 200 - 150
    expect(result[0].display_price).toBe(150);
  });

  it('should return null savings when offer price exceeds triggered items total', () => {
    // Cart item costs 100, bundle offer costs 250 → no savings
    const offerBundle = {
      ...makeBundle({ id: 'bundle-expensive', base_price: 250 }),
      discount_active: false,
      discount_start_date: null,
      discount_end_date: null,
    } as any;
    const rule = makeUpsellRule({
      trigger_type: 'item',
      trigger_item_ids: ['item-1'],
      offer_type: 'bundle',
      offer_bundle_id: 'bundle-expensive',
      offer_bundle: offerBundle,
    });
    const cart = [makeCartItem({ menu_item_id: 'item-1', unit_price: 100, quantity: 1 })];
    const result = matchUpgradeOffers(cart, [rule], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].savings).toBeNull();
  });

  it('should calculate display_price from bundle discount_price when discount is active', () => {
    const offerBundle = {
      ...makeBundle({
        id: 'bundle-discounted',
        base_price: 300,
        discount_price: 220,
      }),
      discount_active: true,
      discount_start_date: PAST,
      discount_end_date: FUTURE,
    } as any;
    const rule = makeUpsellRule({
      trigger_type: 'item',
      trigger_item_ids: ['item-1'],
      offer_type: 'bundle',
      offer_bundle_id: 'bundle-discounted',
      offer_bundle: offerBundle,
    });
    const cart = [makeCartItem({ menu_item_id: 'item-1', unit_price: 350, quantity: 1 })];
    const result = matchUpgradeOffers(cart, [rule], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].display_price).toBe(220);
    // savings = 350 - 220 = 130
    expect(result[0].savings).toBe(130);
  });

  it('should calculate display_price from bundle base_price when no discount', () => {
    const offerBundle = {
      ...makeBundle({
        id: 'bundle-no-discount',
        base_price: 300,
        discount_price: null,
      }),
      discount_active: false,
      discount_start_date: null,
      discount_end_date: null,
    } as any;
    const rule = makeUpsellRule({
      trigger_type: 'item',
      trigger_item_ids: ['item-1'],
      offer_type: 'bundle',
      offer_bundle_id: 'bundle-no-discount',
      offer_bundle: offerBundle,
    });
    const cart = [makeCartItem({ menu_item_id: 'item-1', unit_price: 400, quantity: 1 })];
    const result = matchUpgradeOffers(cart, [rule], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].display_price).toBe(300);
  });

  it('should calculate display_price from offer item basePrice', () => {
    const offerItem = makeMenuItem({ id: 'premium-shake', basePrice: 250 });
    const rule = makeUpsellRule({
      trigger_type: 'item',
      trigger_item_ids: ['item-1'],
      offer_type: 'item',
      offer_item_id: 'premium-shake',
      offer_item: offerItem,
    });
    const cart = [makeCartItem({ menu_item_id: 'item-1', unit_price: 300, quantity: 1 })];
    const result = matchUpgradeOffers(cart, [rule], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].display_price).toBe(250);
    // savings = 300 - 250 = 50
    expect(result[0].savings).toBe(50);
  });

  // ─── ID matching tests ──────────────────────────────────────────────────────

  it('should match when cart items use original menu_item_id (not composite IDs)', () => {
    // Rule triggers on 'shake-1', cart item uses plain 'shake-1'
    const rule = makeUpsellRule({
      trigger_type: 'item',
      trigger_item_ids: ['shake-1', 'shake-2'],
    });
    const cart = [makeCartItem({ menu_item_id: 'shake-1' })];
    const result = matchUpgradeOffers(cart, [rule], NOW);
    expect(result).toHaveLength(1);
  });

  it('should not match when cart items have composite IDs that don\'t match trigger_item_ids', () => {
    // Rule triggers on 'shake-1', but cart uses a composite ID like 'shake-1__var-lg__addon-cream'
    const rule = makeUpsellRule({
      trigger_type: 'item',
      trigger_item_ids: ['shake-1'],
    });
    const cart = [makeCartItem({ menu_item_id: 'shake-1__var-lg__addon-cream' })];
    const result = matchUpgradeOffers(cart, [rule], NOW);
    expect(result).toHaveLength(0);
  });
});

// ─── suggestAddOns ────────────────────────────────────────────────────────────

describe('suggestAddOns', () => {
  it('returns empty array when no suggestions match the menu item', () => {
    const suggestions = [makeAddonSuggestion({ menu_item_id: 'item-999' })];
    expect(suggestAddOns('item-1', suggestions, NOW)).toHaveLength(0);
  });

  it('returns suggestions for the given menu item', () => {
    const suggestions = [makeAddonSuggestion({ menu_item_id: 'item-1' })];
    const result = suggestAddOns('item-1', suggestions, NOW);
    expect(result).toHaveLength(1);
  });

  it('filters out suggestions for different items', () => {
    const suggestions = [
      makeAddonSuggestion({ id: 'a1', menu_item_id: 'item-1' }),
      makeAddonSuggestion({ id: 'a2', menu_item_id: 'item-2' }),
    ];
    const result = suggestAddOns('item-1', suggestions, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');
  });

  it('filters out inactive suggestions', () => {
    const suggestions = [makeAddonSuggestion({ is_active: false })];
    expect(suggestAddOns('item-1', suggestions, NOW)).toHaveLength(0);
  });

  it('filters out expired suggestions', () => {
    const suggestions = [makeAddonSuggestion({ ends_at: PAST })];
    expect(suggestAddOns('item-1', suggestions, NOW)).toHaveLength(0);
  });

  it('filters out future suggestions', () => {
    const suggestions = [makeAddonSuggestion({ starts_at: FUTURE })];
    expect(suggestAddOns('item-1', suggestions, NOW)).toHaveLength(0);
  });

  it('sorts by sort_order ascending', () => {
    const suggestions = [
      makeAddonSuggestion({ id: 'a1', sort_order: 3 }),
      makeAddonSuggestion({ id: 'a2', sort_order: 1 }),
      makeAddonSuggestion({ id: 'a3', sort_order: 2 }),
    ];
    const result = suggestAddOns('item-1', suggestions, NOW);
    expect(result.map(s => s.id)).toEqual(['a2', 'a3', 'a1']);
  });
});

// ─── matchPairOffers ──────────────────────────────────────────────────────────

describe('matchPairOffers', () => {
  it('returns empty array when no pair rules', () => {
    expect(matchPairOffers([makeCartItem()], [])).toHaveLength(0);
  });

  it('matches when source_item_id is in cart', () => {
    const rule = makePairRule({ source_item_id: 'item-1' });
    const cart = [makeCartItem({ menu_item_id: 'item-1' })];
    const result = matchPairOffers(cart, [rule]);
    expect(result).toHaveLength(1);
  });

  it('does not match when source_item_id is not in cart', () => {
    const rule = makePairRule({ source_item_id: 'item-999' });
    const cart = [makeCartItem({ menu_item_id: 'item-1' })];
    expect(matchPairOffers(cart, [rule])).toHaveLength(0);
  });

  it('matches when source_category_id matches a cart item category', () => {
    const rule = makePairRule({ source_item_id: null, source_category_id: 'shakes' });
    const cart = [makeCartItem({ category: 'shakes' })];
    const result = matchPairOffers(cart, [rule]);
    expect(result).toHaveLength(1);
  });

  it('does not match when source_category_id does not match', () => {
    const rule = makePairRule({ source_item_id: null, source_category_id: 'desserts' });
    const cart = [makeCartItem({ category: 'shakes' })];
    expect(matchPairOffers(cart, [rule])).toHaveLength(0);
  });

  it('excludes paired item if it is already in cart', () => {
    const rule = makePairRule({ source_item_id: 'item-1', paired_item_id: 'paired-item-1' });
    const cart = [
      makeCartItem({ menu_item_id: 'item-1' }),
      makeCartItem({ menu_item_id: 'paired-item-1' }),
    ];
    expect(matchPairOffers(cart, [rule])).toHaveLength(0);
  });

  it('includes offer when paired item is NOT in cart', () => {
    const rule = makePairRule({ source_item_id: 'item-1', paired_item_id: 'paired-item-1' });
    const cart = [makeCartItem({ menu_item_id: 'item-1' })];
    expect(matchPairOffers(cart, [rule])).toHaveLength(1);
  });

  it('filters out inactive pair rules', () => {
    const rule = makePairRule({ is_active: false });
    const cart = [makeCartItem()];
    expect(matchPairOffers(cart, [rule])).toHaveLength(0);
  });

  it('limits results to 4 offers', () => {
    const rules = Array.from({ length: 6 }, (_, i) =>
      makePairRule({ id: `pair-${i}`, priority: i, paired_item_id: `paired-${i}` })
    );
    const cart = [makeCartItem()];
    expect(matchPairOffers(cart, rules)).toHaveLength(4);
  });

  it('includes paired item in offer when provided via eager load', () => {
    const item = makeMenuItem({ id: 'paired-item-1' });
    const rule = makePairRule({ source_item_id: 'item-1', paired_item: item });
    const cart = [makeCartItem({ menu_item_id: 'item-1' })];
    const result = matchPairOffers(cart, [rule]);
    expect(result[0].item).toEqual(item);
  });

  it('includes bundle in offer when provided via eager load', () => {
    const bundle = makeBundle({ id: 'bundle-1' });
    const rule = makePairRule({
      source_item_id: 'item-1',
      paired_item_id: null,
      paired_bundle_id: 'bundle-1',
      paired_bundle: bundle,
    });
    const cart = [makeCartItem({ menu_item_id: 'item-1' })];
    const result = matchPairOffers(cart, [rule]);
    expect(result[0].bundle).toEqual(bundle);
  });

  // ─── data mapping tests ─────────────────────────────────────────────────────

  it('should include paired_item from rule in offer', () => {
    const pairedItem = makeMenuItem({
      id: 'fries-1',
      name: 'Loaded Fries',
      basePrice: 120,
      category: 'sides',
    });
    const rule = makePairRule({
      source_item_id: 'item-1',
      paired_item_id: 'fries-1',
      paired_item: pairedItem,
      paired_bundle_id: null,
    });
    const cart = [makeCartItem({ menu_item_id: 'item-1' })];
    const result = matchPairOffers(cart, [rule]);
    expect(result).toHaveLength(1);
    expect(result[0].item).not.toBeNull();
    expect(result[0].item!.id).toBe('fries-1');
    expect(result[0].item!.name).toBe('Loaded Fries');
    expect(result[0].item!.basePrice).toBe(120);
    expect(result[0].bundle).toBeNull();
  });

  it('should include paired_bundle from rule in offer', () => {
    const pairedBundle = makeBundle({
      id: 'combo-2',
      name: 'Shake + Fries Combo',
      base_price: 280,
      category: 'combos',
    });
    const rule = makePairRule({
      source_item_id: 'item-1',
      paired_item_id: null,
      paired_bundle_id: 'combo-2',
      paired_bundle: pairedBundle,
    });
    const cart = [makeCartItem({ menu_item_id: 'item-1' })];
    const result = matchPairOffers(cart, [rule]);
    expect(result).toHaveLength(1);
    expect(result[0].bundle).not.toBeNull();
    expect(result[0].bundle!.id).toBe('combo-2');
    expect(result[0].bundle!.name).toBe('Shake + Fries Combo');
    expect(result[0].bundle!.base_price).toBe(280);
    expect(result[0].item).toBeNull();
  });
});

// ─── matchInterstitialOffers ──────────────────────────────────────────────────

describe('matchInterstitialOffers', () => {
  it('returns null when no rules provided', () => {
    expect(matchInterstitialOffers(makeCart(), [], null, null, null, NOW)).toBeNull();
  });

  it('returns null when no rules match', () => {
    const rule = makeUpsellRule({
      phase: 'interstitial',
      trigger_type: 'item',
      trigger_item_ids: ['item-999'],
    });
    expect(matchInterstitialOffers(makeCart(), [rule], null, null, null, NOW)).toBeNull();
  });

  it('matches item trigger and returns the offer', () => {
    const rule = makeUpsellRule({
      phase: 'interstitial',
      trigger_type: 'item',
      trigger_item_ids: ['item-1'],
    });
    const cart = makeCart({ items: [makeCartItem({ menu_item_id: 'item-1' })] });
    const result = matchInterstitialOffers(cart, [rule], null, null, null, NOW);
    expect(result).not.toBeNull();
    expect(result!.rule.id).toBe('rule-1');
  });

  it('matches category trigger', () => {
    const rule = makeUpsellRule({
      phase: 'interstitial',
      trigger_type: 'category',
      trigger_category_ids: ['shakes'],
    });
    const cart = makeCart({ items: [makeCartItem({ category: 'shakes' })] });
    const result = matchInterstitialOffers(cart, [rule], null, null, null, NOW);
    expect(result).not.toBeNull();
  });

  it('matches cart_total trigger', () => {
    const rule = makeUpsellRule({
      phase: 'interstitial',
      trigger_type: 'cart_total',
      trigger_min_total: 200,
    });
    const cart = makeCart({ total: 300 });
    const result = matchInterstitialOffers(cart, [rule], null, null, null, NOW);
    expect(result).not.toBeNull();
  });

  it('does not match cart_total trigger when total is below minimum', () => {
    const rule = makeUpsellRule({
      phase: 'interstitial',
      trigger_type: 'cart_total',
      trigger_min_total: 500,
    });
    const cart = makeCart({ total: 100 });
    expect(matchInterstitialOffers(cart, [rule], null, null, null, NOW)).toBeNull();
  });

  it('matches cart_empty_category trigger when category is missing from cart', () => {
    const rule = makeUpsellRule({
      phase: 'interstitial',
      trigger_type: 'cart_empty_category',
      trigger_category_ids: ['desserts'],
    });
    const cart = makeCart({ items: [makeCartItem({ category: 'shakes' })] });
    const result = matchInterstitialOffers(cart, [rule], null, null, null, NOW);
    expect(result).not.toBeNull();
  });

  it('does NOT match cart_empty_category when category is present', () => {
    const rule = makeUpsellRule({
      phase: 'interstitial',
      trigger_type: 'cart_empty_category',
      trigger_category_ids: ['shakes'],
    });
    const cart = makeCart({ items: [makeCartItem({ category: 'shakes' })] });
    expect(matchInterstitialOffers(cart, [rule], null, null, null, NOW)).toBeNull();
  });

  it('returns only the single highest-priority matching offer', () => {
    const lowPriority = makeUpsellRule({
      id: 'low', phase: 'interstitial', priority: 1, trigger_item_ids: ['item-1'],
    });
    const highPriority = makeUpsellRule({
      id: 'high', phase: 'interstitial', priority: 99, trigger_item_ids: ['item-1'],
    });
    const cart = makeCart({ items: [makeCartItem({ menu_item_id: 'item-1' })] });
    const result = matchInterstitialOffers(cart, [lowPriority, highPriority], null, null, null, NOW);
    expect(result!.rule.id).toBe('high');
  });

  it('skips inactive interstitial rules', () => {
    const rule = makeUpsellRule({
      phase: 'interstitial',
      is_active: false,
      trigger_item_ids: ['item-1'],
    });
    const cart = makeCart({ items: [makeCartItem({ menu_item_id: 'item-1' })] });
    expect(matchInterstitialOffers(cart, [rule], null, null, null, NOW)).toBeNull();
  });

  it('skips only non-interstitial phases', () => {
    const rule = makeUpsellRule({
      phase: 'upgrade',
      trigger_item_ids: ['item-1'],
    });
    const cart = makeCart({ items: [makeCartItem({ menu_item_id: 'item-1' })] });
    expect(matchInterstitialOffers(cart, [rule], null, null, null, NOW)).toBeNull();
  });

  it('handles loyalty_nudge type: shows nudge when close to goal', () => {
    const rule = makeUpsellRule({
      phase: 'interstitial',
      offer_type: 'loyalty_nudge',
      trigger_type: 'item',
      trigger_item_ids: ['item-1'],
    });
    const card = makeLoyaltyCard({ current_stamps: 8 });
    const reward = makeLoyaltyReward({ stamps_required: 10 });
    const cart = makeCart({ items: [makeCartItem({ menu_item_id: 'item-1' })] });
    const result = matchInterstitialOffers(cart, [rule], card, makeLoyaltyConfig(), reward, NOW);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('loyalty_nudge');
    expect(result!.loyalty_message).toContain('2 stamps away');
  });

  it('handles loyalty_nudge type: skips when NOT close to goal', () => {
    const rule = makeUpsellRule({
      phase: 'interstitial',
      offer_type: 'loyalty_nudge',
      trigger_type: 'item',
      trigger_item_ids: ['item-1'],
    });
    const card = makeLoyaltyCard({ current_stamps: 2 });
    const reward = makeLoyaltyReward({ stamps_required: 10 });
    const cart = makeCart({ items: [makeCartItem({ menu_item_id: 'item-1' })] });
    const result = matchInterstitialOffers(cart, [rule], card, makeLoyaltyConfig(), reward, NOW);
    expect(result).toBeNull();
  });

  it('calculates discounted_price for discount offer type', () => {
    const item = makeMenuItem({ basePrice: 200 });
    const rule = makeUpsellRule({
      phase: 'interstitial',
      trigger_type: 'item',
      trigger_item_ids: ['item-1'],
      offer_type: 'discount',
      offer_discount_percent: 20,
      offer_item: item,
    });
    const cart = makeCart({ items: [makeCartItem({ menu_item_id: 'item-1' })] });
    const result = matchInterstitialOffers(cart, [rule], null, null, null, NOW);
    expect(result).not.toBeNull();
    expect(result!.discounted_price).toBe(160); // 200 * (1 - 0.20)
  });

  it('sets discounted_price to null for non-discount offer type', () => {
    const rule = makeUpsellRule({
      phase: 'interstitial',
      trigger_type: 'item',
      trigger_item_ids: ['item-1'],
      offer_type: 'item',
    });
    const cart = makeCart({ items: [makeCartItem({ menu_item_id: 'item-1' })] });
    const result = matchInterstitialOffers(cart, [rule], null, null, null, NOW);
    expect(result!.discounted_price).toBeNull();
  });
});
