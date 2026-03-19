// tests/loyalty-system.test.ts
// System and acceptance tests for the Loyalty Card System.
// These tests exercise the full logical flow using pure engine functions
// and do NOT duplicate tests already in loyalty-engine.test.ts.

import { describe, it, expect } from 'vitest';
import {
  filterQualifyingItems,
  calculateEarnings,
  checkGoalReached,
  calculateCarryover,
  findActiveBoosters,
} from '@/lib/loyalty-engine';
import type {
  LoyaltyConfig,
  LoyaltyBooster,
  LoyaltyOrderItem,
  LoyaltyCard,
  LoyaltyReward,
} from '@/types/loyalty';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const NOW = new Date('2026-06-15T12:00:00Z');
const WITHIN_RANGE_START = '2026-01-01T00:00:00Z';
const WITHIN_RANGE_END   = '2026-12-31T23:59:59Z';

function makeConfig(overrides: Partial<LoyaltyConfig> = {}): LoyaltyConfig {
  return {
    id: 'cfg-1',
    stamps_enabled: true,
    points_enabled: true,
    points_per_peso: 0.1,
    stamps_per_order: 1,
    filter_mode: 'blocklist',
    filtered_category_ids: [],
    filtered_item_ids: [],
    claim_window_days: 30,
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeItem(overrides: Partial<LoyaltyOrderItem> = {}): LoyaltyOrderItem {
  return {
    menu_item_id: 'item-1',
    category_id: 'shakes',
    name: 'Classic Shake',
    quantity: 1,
    subtotal: 150,
    ...overrides,
  };
}

function makeBooster(overrides: Partial<LoyaltyBooster> = {}): LoyaltyBooster {
  return {
    id: 'boost-1',
    name: 'Double Points Weekend',
    multiplier: 2,
    applies_to: 'both',
    filter_mode: 'all',
    filter_ids: [],
    starts_at: WITHIN_RANGE_START,
    ends_at: WITHIN_RANGE_END,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeCard(overrides: Partial<LoyaltyCard> = {}): LoyaltyCard {
  return {
    id: 'card-1',
    customer_id: 'cust-1',
    card_code: 'STARR-ABCD',
    current_stamps: 0,
    current_points: 0,
    goal_reward_id: null,
    lifetime_stamps: 0,
    lifetime_points: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeReward(overrides: Partial<LoyaltyReward> = {}): LoyaltyReward {
  return {
    id: 'reward-1',
    name: 'Free Shake',
    description: null,
    image_url: null,
    stamps_required: 10,
    points_required: null,
    is_active: true,
    sort_order: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ─── Full Flow Tests ──────────────────────────────────────────────────────────

describe('Loyalty System — Full Flow', () => {
  it('earn → accumulate → goal reached → carryover', () => {
    const config = makeConfig({ stamps_per_order: 1, points_per_peso: 0.1 });
    const reward = makeReward({ stamps_required: 5, points_required: null });
    const items = [makeItem({ subtotal: 200 })];

    let card = makeCard();

    // Simulate 4 orders: each earns 1 stamp, 20 points
    for (let i = 0; i < 4; i++) {
      const earnings = calculateEarnings(items, config, [], NOW);
      card = {
        ...card,
        current_stamps: card.current_stamps + earnings.stamps,
        current_points: card.current_points + earnings.points,
      };
      // Goal NOT yet reached (need 5 stamps, have < 5)
      expect(checkGoalReached(card, reward)).toBe(false);
    }

    // 5th order reaches the goal
    const earnings = calculateEarnings(items, config, [], NOW);
    card = {
      ...card,
      current_stamps: card.current_stamps + earnings.stamps,
      current_points: card.current_points + earnings.points,
    };
    expect(card.current_stamps).toBe(5);
    expect(checkGoalReached(card, reward)).toBe(true);

    // Carryover after redemption: 5 - 5 = 0 excess stamps
    const carryover = calculateCarryover(card, reward);
    expect(carryover.stamps).toBe(0);
  });

  it('extra stamps beyond goal produce positive carryover', () => {
    const reward = makeReward({ stamps_required: 5, points_required: null });
    const card = makeCard({ current_stamps: 8, current_points: 0 });

    expect(checkGoalReached(card, reward)).toBe(true);
    const carryover = calculateCarryover(card, reward);
    expect(carryover.stamps).toBe(3); // 8 - 5
  });

  it('booster multiplies both stamps and points correctly', () => {
    const config = makeConfig({ stamps_per_order: 1, points_per_peso: 0.1 });
    const booster = makeBooster({ multiplier: 2, filter_mode: 'all' });
    const items = [makeItem({ subtotal: 150 })];

    const earnings = calculateEarnings(items, config, [booster], NOW);

    expect(earnings.stamps).toBe(2);        // floor(1 * 2)
    expect(earnings.points).toBe(30);       // floor(150 * 0.1 * 2)
    expect(earnings.booster_id).toBe('boost-1');
    expect(earnings.booster_multiplier).toBe(2);
  });

  it('config change — disable stamps mid-program', () => {
    const items = [makeItem({ subtotal: 100 })];

    // Phase 1: stamps enabled
    const configWith = makeConfig({ stamps_enabled: true, points_enabled: true });
    const earningsWith = calculateEarnings(items, configWith, [], NOW);
    expect(earningsWith.stamps).toBe(1);
    expect(earningsWith.points).toBe(10);

    // Phase 2: stamps disabled
    const configWithout = makeConfig({ stamps_enabled: false, points_enabled: true });
    const earningsWithout = calculateEarnings(items, configWithout, [], NOW);
    expect(earningsWithout.stamps).toBe(0);
    expect(earningsWithout.points).toBe(10); // points still earned

    // Phase 3: stamps re-enabled
    const earningsReEnabled = calculateEarnings(items, configWith, [], NOW);
    expect(earningsReEnabled.stamps).toBe(1);
  });

  it('allowlist mode only credits qualifying items', () => {
    const config = makeConfig({
      filter_mode: 'allowlist',
      filtered_category_ids: ['shakes'],
      filtered_item_ids: [],
    });

    const items = [
      makeItem({ menu_item_id: 'shake-1', category_id: 'shakes', subtotal: 100 }),
      makeItem({ menu_item_id: 'merch-1', category_id: 'merchandise', subtotal: 200 }),
    ];

    const qualifying = filterQualifyingItems(items, config);
    expect(qualifying).toHaveLength(1);
    expect(qualifying[0].category_id).toBe('shakes');

    const earnings = calculateEarnings(items, config, [], NOW);
    expect(earnings.qualifying_total).toBe(100); // only the shake counts
    expect(earnings.stamps).toBe(1);             // at least 1 qualifying item
    expect(earnings.points).toBe(10);            // floor(100 * 0.1)
  });

  it('category booster does not apply when no item is from the boosted category', () => {
    const config = makeConfig({ stamps_per_order: 1, points_per_peso: 1 });
    const booster = makeBooster({
      multiplier: 3,
      filter_mode: 'categories',
      filter_ids: ['premium-shakes'],
    });

    // Order contains items from a different category
    const items = [makeItem({ category_id: 'regular-shakes', subtotal: 100 })];

    const active = findActiveBoosters([booster], items, NOW);
    expect(active).toBeNull(); // category mismatch → no booster

    const earnings = calculateEarnings(items, config, [booster], NOW);
    expect(earnings.booster_multiplier).toBe(1);  // no booster applied
    expect(earnings.points).toBe(100);            // 100 * 1 * 1
  });

  it('highest-multiplier booster wins when multiple active boosters match', () => {
    const config = makeConfig({ stamps_per_order: 1, points_per_peso: 1 });
    const low  = makeBooster({ id: 'b-low',  multiplier: 1.5, filter_mode: 'all' });
    const high = makeBooster({ id: 'b-high', multiplier: 4,   filter_mode: 'all' });
    const mid  = makeBooster({ id: 'b-mid',  multiplier: 2,   filter_mode: 'all' });

    const items = [makeItem({ subtotal: 100 })];
    const earnings = calculateEarnings(items, config, [low, high, mid], NOW);

    expect(earnings.booster_id).toBe('b-high');
    expect(earnings.booster_multiplier).toBe(4);
    expect(earnings.points).toBe(400); // floor(100 * 1 * 4)
  });

  it('points-only goal: goal reached by points even when stamps are insufficient', () => {
    const reward = makeReward({ stamps_required: null, points_required: 500 });
    const card = makeCard({ current_stamps: 0, current_points: 500 });

    expect(checkGoalReached(card, reward)).toBe(true);

    const carryover = calculateCarryover(card, reward);
    expect(carryover.points).toBe(0);  // exact match
    expect(carryover.stamps).toBe(0);  // null stamps_required → treated as 0
  });

  it('OR logic: goal reached by stamps even when points requirement is not met', () => {
    const reward = makeReward({ stamps_required: 10, points_required: 1000 });
    const card = makeCard({ current_stamps: 10, current_points: 50 }); // points not met

    expect(checkGoalReached(card, reward)).toBe(true);
  });
});

// ─── Acceptance Tests ─────────────────────────────────────────────────────────

describe('Acceptance Tests', () => {
  it('earnings calculation is correct with a category booster', () => {
    const config = makeConfig({
      stamps_enabled: true,
      points_enabled: true,
      stamps_per_order: 1,
      points_per_peso: 0.1,
      filter_mode: 'blocklist',
      filtered_item_ids: [],
      filtered_category_ids: [],
    });

    const items: LoyaltyOrderItem[] = [
      { menu_item_id: 'i1', category_id: 'shakes', name: 'Shake', quantity: 1, subtotal: 150 },
    ];

    const booster = makeBooster({
      multiplier: 2,
      filter_mode: 'categories',
      filter_ids: ['shakes'],
    });

    const result = calculateEarnings(items, config, [booster], NOW);
    expect(result.stamps).toBe(2);  // floor(1 * 2)
    expect(result.points).toBe(30); // floor(150 * 0.1 * 2)
    expect(result.booster_id).toBe('boost-1');
  });

  it('expired reward is detected by carryover math — engine reports goal reached correctly', () => {
    // The engine has no concept of expiry (handled at UI/DB layer).
    // Confirm that checkGoalReached returns true, and carryover is correct.
    const card = makeCard({ current_stamps: 10, current_points: 500 });
    const reward = makeReward({ stamps_required: 10, points_required: 500 });

    expect(checkGoalReached(card, reward)).toBe(true);

    const carryover = calculateCarryover(card, reward);
    expect(carryover.stamps).toBe(0);
    expect(carryover.points).toBe(0);
  });

  it('fractional earnings are always floored — no rounding up', () => {
    const config = makeConfig({ points_per_peso: 0.1, stamps_per_order: 1 });
    const items = [makeItem({ subtotal: 99 })]; // 99 * 0.1 = 9.9 → floor → 9

    const earnings = calculateEarnings(items, config, [], NOW);
    expect(earnings.points).toBe(9);
  });

  it('blocklist with empty lists: all items qualify', () => {
    const config = makeConfig({
      filter_mode: 'blocklist',
      filtered_item_ids: [],
      filtered_category_ids: [],
      points_per_peso: 1,
    });

    const items = [
      makeItem({ menu_item_id: 'item-a', subtotal: 50 }),
      makeItem({ menu_item_id: 'item-b', subtotal: 75 }),
      makeItem({ menu_item_id: 'item-c', subtotal: 25 }),
    ];

    const earnings = calculateEarnings(items, config, [], NOW);
    expect(earnings.qualifying_total).toBe(150);
    expect(earnings.stamps).toBe(1);
    expect(earnings.points).toBe(150);
  });

  it('item-level booster only applies when the specific item is in the order', () => {
    const config = makeConfig({ stamps_per_order: 1, points_per_peso: 1 });
    const booster = makeBooster({
      multiplier: 5,
      filter_mode: 'items',
      filter_ids: ['special-item'],
    });

    // Order without the boosted item → no booster
    const ordinaryItems = [makeItem({ menu_item_id: 'regular-item', subtotal: 100 })];
    const resultWithout = calculateEarnings(ordinaryItems, config, [booster], NOW);
    expect(resultWithout.booster_multiplier).toBe(1);
    expect(resultWithout.points).toBe(100);

    // Order WITH the boosted item → booster applies
    const boostedItems = [makeItem({ menu_item_id: 'special-item', subtotal: 100 })];
    const resultWith = calculateEarnings(boostedItems, config, [booster], NOW);
    expect(resultWith.booster_multiplier).toBe(5);
    expect(resultWith.points).toBe(500);
  });

  it('completely blocked order (all items in blocklist) earns nothing', () => {
    const config = makeConfig({
      filter_mode: 'blocklist',
      filtered_category_ids: ['non-qualifying'],
      filtered_item_ids: [],
      stamps_per_order: 1,
      points_per_peso: 0.5,
    });

    const items = [
      makeItem({ category_id: 'non-qualifying', subtotal: 999 }),
    ];

    const earnings = calculateEarnings(items, config, [], NOW);
    expect(earnings.stamps).toBe(0);
    expect(earnings.points).toBe(0);
    expect(earnings.qualifying_total).toBe(0);
  });

  it('goal not reached one stamp short', () => {
    const reward = makeReward({ stamps_required: 10, points_required: null });
    const card = makeCard({ current_stamps: 9 }); // one short

    expect(checkGoalReached(card, reward)).toBe(false);
  });

  it('multiple items across categories: only allowlisted categories qualify', () => {
    const config = makeConfig({
      filter_mode: 'allowlist',
      filtered_category_ids: ['premium'],
      filtered_item_ids: [],
      points_per_peso: 1,
    });

    const items = [
      makeItem({ category_id: 'premium', subtotal: 200 }),
      makeItem({ category_id: 'standard', subtotal: 100 }),
      makeItem({ category_id: 'merch', subtotal: 50 }),
    ];

    const qualifying = filterQualifyingItems(items, config);
    expect(qualifying).toHaveLength(1);
    expect(qualifying[0].subtotal).toBe(200);

    const earnings = calculateEarnings(items, config, [], NOW);
    expect(earnings.qualifying_total).toBe(200);
    expect(earnings.points).toBe(200);
  });
});
