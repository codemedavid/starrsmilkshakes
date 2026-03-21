/**
 * Unit tests for src/lib/loyalty-engine.ts
 *
 * Requires: vitest (npm install --save-dev vitest)
 * Run:      npx vitest run src/__tests__/loyalty-engine.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  filterQualifyingItems,
  findActiveBoosters,
  calculateEarnings,
  checkGoalReached,
  calculateCarryover,
} from '@/lib/loyalty-engine';
import type {
  LoyaltyConfig,
  LoyaltyBooster,
  LoyaltyOrderItem,
  LoyaltyCard,
  LoyaltyGoal,
} from '@/types/loyalty';

// ---------------------------------------------------------------------------
// Helpers — reusable fixtures
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<LoyaltyConfig> = {}): LoyaltyConfig {
  return {
    id: 'cfg-1',
    stamps_enabled: true,
    points_enabled: true,
    points_per_peso: 1,
    stamps_per_order: 1,
    filter_mode: 'blocklist',
    filtered_category_ids: [],
    filtered_item_ids: [],
    claim_window_days: 7,
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeItem(overrides: Partial<LoyaltyOrderItem> = {}): LoyaltyOrderItem {
  return {
    menu_item_id: 'item-1',
    category_id: 'cat-1',
    name: 'Classic Shake',
    quantity: 1,
    subtotal: 100,
    ...overrides,
  };
}

function makeBooster(overrides: Partial<LoyaltyBooster> = {}): LoyaltyBooster {
  return {
    id: 'booster-1',
    name: 'Double Stars',
    multiplier: 2,
    applies_to: 'both',
    filter_mode: 'all',
    filter_ids: [],
    starts_at: '2026-01-01T00:00:00Z',
    ends_at: '2026-12-31T23:59:59Z',
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
    goal_id: null,
    lifetime_stamps: 0,
    lifetime_points: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeGoal(overrides: Partial<LoyaltyGoal> = {}): LoyaltyGoal {
  return {
    id: 'reward-1',
    name: 'Free Premium Shake',
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

// ---------------------------------------------------------------------------
// filterQualifyingItems
// ---------------------------------------------------------------------------

describe('filterQualifyingItems', () => {
  it('blocklist mode: empty lists → all items qualify', () => {
    const items = [makeItem(), makeItem({ menu_item_id: 'item-2', category_id: 'cat-2' })];
    const config = makeConfig({ filter_mode: 'blocklist', filtered_item_ids: [], filtered_category_ids: [] });

    const result = filterQualifyingItems(items, config);
    expect(result).toHaveLength(2);
  });

  it('blocklist mode: items in blocklist are excluded', () => {
    const items = [
      makeItem({ menu_item_id: 'item-1' }),
      makeItem({ menu_item_id: 'item-2' }),
    ];
    const config = makeConfig({ filter_mode: 'blocklist', filtered_item_ids: ['item-1'] });

    const result = filterQualifyingItems(items, config);
    expect(result).toHaveLength(1);
    expect(result[0].menu_item_id).toBe('item-2');
  });

  it('blocklist mode: categories in blocklist are excluded', () => {
    const items = [
      makeItem({ menu_item_id: 'item-1', category_id: 'cat-blocked' }),
      makeItem({ menu_item_id: 'item-2', category_id: 'cat-ok' }),
    ];
    const config = makeConfig({ filter_mode: 'blocklist', filtered_category_ids: ['cat-blocked'] });

    const result = filterQualifyingItems(items, config);
    expect(result).toHaveLength(1);
    expect(result[0].category_id).toBe('cat-ok');
  });

  it('allowlist mode: empty lists → nothing qualifies', () => {
    const items = [makeItem()];
    const config = makeConfig({ filter_mode: 'allowlist', filtered_item_ids: [], filtered_category_ids: [] });

    const result = filterQualifyingItems(items, config);
    expect(result).toHaveLength(0);
  });

  it('allowlist mode: only matching items pass', () => {
    const items = [
      makeItem({ menu_item_id: 'item-1', category_id: 'cat-1' }),
      makeItem({ menu_item_id: 'item-2', category_id: 'cat-2' }),
      makeItem({ menu_item_id: 'item-3', category_id: 'cat-3' }),
    ];
    const config = makeConfig({
      filter_mode: 'allowlist',
      filtered_item_ids: ['item-1'],
      filtered_category_ids: ['cat-3'],
    });

    const result = filterQualifyingItems(items, config);
    expect(result).toHaveLength(2);
    const ids = result.map((r) => r.menu_item_id);
    expect(ids).toContain('item-1');
    expect(ids).toContain('item-3');
  });

  it('empty input items → empty result', () => {
    const config = makeConfig();
    const result = filterQualifyingItems([], config);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// findActiveBoosters
// ---------------------------------------------------------------------------

describe('findActiveBoosters', () => {
  const now = new Date('2026-06-15T12:00:00Z');

  it('no matching boosters → returns null', () => {
    const result = findActiveBoosters([], [makeItem()], now);
    expect(result).toBeNull();
  });

  it('inactive booster is skipped', () => {
    const booster = makeBooster({ is_active: false });
    const result = findActiveBoosters([booster], [makeItem()], now);
    expect(result).toBeNull();
  });

  it('booster outside date range is skipped', () => {
    const booster = makeBooster({
      starts_at: '2027-01-01T00:00:00Z',
      ends_at: '2027-12-31T23:59:59Z',
    });
    const result = findActiveBoosters([booster], [makeItem()], now);
    expect(result).toBeNull();
  });

  it('filter_mode "all" matches everything', () => {
    const booster = makeBooster({ filter_mode: 'all' });
    const result = findActiveBoosters([booster], [makeItem()], now);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(booster.id);
  });

  it('filter_mode "categories" matches items with matching category_id', () => {
    const booster = makeBooster({
      filter_mode: 'category',
      filter_ids: ['cat-1'],
    });
    const items = [makeItem({ category_id: 'cat-1' })];
    const result = findActiveBoosters([booster], items, now);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(booster.id);
  });

  it('filter_mode "categories" does not match unrelated categories', () => {
    const booster = makeBooster({
      filter_mode: 'category',
      filter_ids: ['cat-other'],
    });
    const items = [makeItem({ category_id: 'cat-1' })];
    const result = findActiveBoosters([booster], items, now);
    expect(result).toBeNull();
  });

  it('filter_mode "items" matches items with matching menu_item_id', () => {
    const booster = makeBooster({
      filter_mode: 'item',
      filter_ids: ['item-1'],
    });
    const items = [makeItem({ menu_item_id: 'item-1' })];
    const result = findActiveBoosters([booster], items, now);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(booster.id);
  });

  it('filter_mode "items" does not match unrelated items', () => {
    const booster = makeBooster({
      filter_mode: 'item',
      filter_ids: ['item-other'],
    });
    const items = [makeItem({ menu_item_id: 'item-1' })];
    const result = findActiveBoosters([booster], items, now);
    expect(result).toBeNull();
  });

  it('multiple matching boosters → highest multiplier wins', () => {
    const low = makeBooster({ id: 'b-low', multiplier: 1.5 });
    const high = makeBooster({ id: 'b-high', multiplier: 3 });
    const result = findActiveBoosters([low, high], [makeItem()], now);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('b-high');
    expect(result!.multiplier).toBe(3);
  });

  it('empty filter_ids with "categories" mode → returns null (no match)', () => {
    const booster = makeBooster({ filter_mode: 'category', filter_ids: [] });
    const result = findActiveBoosters([booster], [makeItem()], now);
    expect(result).toBeNull();
  });

  it('empty filter_ids with "items" mode → returns null (no match)', () => {
    const booster = makeBooster({ filter_mode: 'item', filter_ids: [] });
    const result = findActiveBoosters([booster], [makeItem()], now);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// calculateEarnings
// ---------------------------------------------------------------------------

describe('calculateEarnings', () => {
  const now = new Date('2026-06-15T12:00:00Z');

  it('stamps_enabled=false → 0 stamps', () => {
    const config = makeConfig({ stamps_enabled: false, points_enabled: true });
    const items = [makeItem({ subtotal: 100 })];
    const result = calculateEarnings(items, config, [], now);
    expect(result.stamps).toBe(0);
    expect(result.points).toBeGreaterThan(0);
  });

  it('points_enabled=false → 0 points', () => {
    const config = makeConfig({ stamps_enabled: true, points_enabled: false });
    const items = [makeItem({ subtotal: 100 })];
    const result = calculateEarnings(items, config, [], now);
    expect(result.stamps).toBeGreaterThan(0);
    expect(result.points).toBe(0);
  });

  it('no qualifying items → 0 stamps, 0 points', () => {
    const config = makeConfig({
      filter_mode: 'allowlist',
      filtered_item_ids: [],
      filtered_category_ids: [],
    });
    const items = [makeItem()];
    const result = calculateEarnings(items, config, [], now);
    expect(result.stamps).toBe(0);
    expect(result.points).toBe(0);
  });

  it('basic calculation without booster', () => {
    const config = makeConfig({
      stamps_per_order: 2,
      points_per_peso: 0.5,
    });
    const items = [makeItem({ subtotal: 200 })];
    const result = calculateEarnings(items, config, [], now);

    // stamps: floor(2 * 1) = 2 (no booster → multiplier 1)
    expect(result.stamps).toBe(2);
    // points: floor(200 * 0.5 * 1) = 100
    expect(result.points).toBe(100);
    expect(result.booster_id).toBeNull();
    expect(result.booster_multiplier).toBe(1);
    expect(result.qualifying_total).toBe(200);
  });

  it('calculation with booster multiplier', () => {
    const config = makeConfig({
      stamps_per_order: 1,
      points_per_peso: 1,
    });
    const booster = makeBooster({ multiplier: 3 });
    const items = [makeItem({ subtotal: 100 })];
    const result = calculateEarnings(items, config, [booster], now);

    // stamps: floor(1 * 3) = 3
    expect(result.stamps).toBe(3);
    // points: floor(100 * 1 * 3) = 300
    expect(result.points).toBe(300);
    expect(result.booster_id).toBe(booster.id);
    expect(result.booster_multiplier).toBe(3);
  });

  it('floor rounding behavior', () => {
    const config = makeConfig({
      stamps_per_order: 1,
      points_per_peso: 0.3,
    });
    const items = [makeItem({ subtotal: 10 })]; // 10 * 0.3 = 3.0 → 3
    const result = calculateEarnings(items, config, [], now);
    expect(result.points).toBe(3);

    // Now with a subtotal that creates a fractional result
    const items2 = [makeItem({ subtotal: 7 })]; // 7 * 0.3 = 2.1 → floor → 2
    const result2 = calculateEarnings(items2, config, [], now);
    expect(result2.points).toBe(2);
  });

  it('empty items array → 0 stamps, 0 points', () => {
    const config = makeConfig();
    const result = calculateEarnings([], config, [], now);
    expect(result.stamps).toBe(0);
    expect(result.points).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// checkGoalReached
// ---------------------------------------------------------------------------

describe('checkGoalReached', () => {
  it('null reward → false', () => {
    const card = makeCard({ current_stamps: 100, current_points: 100 });
    expect(checkGoalReached(card, null)).toBe(false);
  });

  it('stamps requirement met → true', () => {
    const card = makeCard({ current_stamps: 10, current_points: 0 });
    const goal = makeGoal({ stamps_required: 10, points_required: null });
    expect(checkGoalReached(card, goal)).toBe(true);
  });

  it('points requirement met → true', () => {
    const card = makeCard({ current_stamps: 0, current_points: 500 });
    const goal = makeGoal({ stamps_required: null, points_required: 500 });
    expect(checkGoalReached(card, goal)).toBe(true);
  });

  it('neither met → false', () => {
    const card = makeCard({ current_stamps: 3, current_points: 50 });
    const goal = makeGoal({ stamps_required: 10, points_required: 500 });
    expect(checkGoalReached(card, goal)).toBe(false);
  });

  it('only stamps required and met → true', () => {
    const card = makeCard({ current_stamps: 15, current_points: 0 });
    const goal = makeGoal({ stamps_required: 10, points_required: null });
    expect(checkGoalReached(card, goal)).toBe(true);
  });

  it('only points required and met → true', () => {
    const card = makeCard({ current_stamps: 0, current_points: 1000 });
    const goal = makeGoal({ stamps_required: null, points_required: 500 });
    expect(checkGoalReached(card, goal)).toBe(true);
  });

  it('OR logic: stamps met but points not → still true', () => {
    const card = makeCard({ current_stamps: 10, current_points: 100 });
    const goal = makeGoal({ stamps_required: 10, points_required: 500 });
    expect(checkGoalReached(card, goal)).toBe(true);
  });

  it('OR logic: points met but stamps not → still true', () => {
    const card = makeCard({ current_stamps: 2, current_points: 500 });
    const goal = makeGoal({ stamps_required: 10, points_required: 500 });
    expect(checkGoalReached(card, goal)).toBe(true);
  });

  it('both null requirements → false (neither condition is satisfied)', () => {
    const card = makeCard({ current_stamps: 100, current_points: 100 });
    const goal = makeGoal({ stamps_required: null, points_required: null });
    expect(checkGoalReached(card, goal)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// calculateCarryover
// ---------------------------------------------------------------------------

describe('calculateCarryover', () => {
  it('basic carryover calculation', () => {
    const card = makeCard({ current_stamps: 12, current_points: 600 });
    const goal = makeGoal({ stamps_required: 10, points_required: 500 });
    const result = calculateCarryover(card, goal);
    expect(result.stamps).toBe(2);  // 12 - 10
    expect(result.points).toBe(100); // 600 - 500
  });

  it('null requirements treated as 0', () => {
    const card = makeCard({ current_stamps: 5, current_points: 200 });
    const goal = makeGoal({ stamps_required: null, points_required: null });
    const result = calculateCarryover(card, goal);
    expect(result.stamps).toBe(5);  // 5 - 0
    expect(result.points).toBe(200); // 200 - 0
  });

  it('exact goal reached → 0 carryover', () => {
    const card = makeCard({ current_stamps: 10, current_points: 500 });
    const goal = makeGoal({ stamps_required: 10, points_required: 500 });
    const result = calculateCarryover(card, goal);
    expect(result.stamps).toBe(0);
    expect(result.points).toBe(0);
  });

  it('below goal → negative carryover', () => {
    const card = makeCard({ current_stamps: 3, current_points: 50 });
    const goal = makeGoal({ stamps_required: 10, points_required: 500 });
    const result = calculateCarryover(card, goal);
    expect(result.stamps).toBe(-7);
    expect(result.points).toBe(-450);
  });
});
