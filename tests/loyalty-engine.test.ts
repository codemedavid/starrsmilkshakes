// tests/loyalty-engine.test.ts
import { describe, it, expect } from 'vitest';
import {
  filterQualifyingItems,
  findActiveBoosters,
  calculateEarnings,
  checkGoalReached,
  calculateCarryover,
  checkMilestonesReached,
} from '@/lib/loyalty-engine';
import type {
  LoyaltyConfig,
  LoyaltyBooster,
  LoyaltyOrderItem,
  LoyaltyCard,
  LoyaltyGoal,
  LoyaltyMilestone,
  LoyaltyMilestoneClaim,
} from '@/types/loyalty';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const baseConfig = (overrides: Partial<LoyaltyConfig> = {}): LoyaltyConfig => ({
  id: 'cfg-1',
  stamps_enabled: true,
  points_enabled: true,
  points_per_peso: 1,
  stamps_per_order: 1,
  filter_mode: 'blocklist',
  filtered_category_ids: [],
  filtered_item_ids: [],
  claim_window_days: 30,
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const baseItem = (overrides: Partial<LoyaltyOrderItem> = {}): LoyaltyOrderItem => ({
  menu_item_id: 'item-1',
  category_id: 'cat-1',
  name: 'Classic Shake',
  quantity: 1,
  subtotal: 100,
  ...overrides,
});

const baseBooster = (overrides: Partial<LoyaltyBooster> = {}): LoyaltyBooster => ({
  id: 'boost-1',
  name: 'Double Points',
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
});

const baseCard = (overrides: Partial<LoyaltyCard> = {}): LoyaltyCard => ({
  id: 'card-1',
  customer_id: 'cust-1',
  card_code: 'ABCD1234',
  current_stamps: 0,
  current_points: 0,
  goal_reward_id: null,
  lifetime_stamps: 0,
  lifetime_points: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const baseReward = (overrides: Partial<LoyaltyGoal> = {}): LoyaltyGoal => ({
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
});

const NOW = new Date('2026-06-15T12:00:00Z');

// ─── filterQualifyingItems ────────────────────────────────────────────────────

describe('filterQualifyingItems', () => {
  it('returns empty array when order items are empty', () => {
    expect(filterQualifyingItems([], baseConfig())).toEqual([]);
  });

  describe('blocklist mode', () => {
    it('returns all items when filter lists are empty', () => {
      const items = [baseItem(), baseItem({ menu_item_id: 'item-2', category_id: 'cat-2' })];
      expect(filterQualifyingItems(items, baseConfig())).toHaveLength(2);
    });

    it('excludes an item whose menu_item_id is blocklisted', () => {
      const items = [baseItem(), baseItem({ menu_item_id: 'item-bad' })];
      const cfg = baseConfig({ filtered_item_ids: ['item-bad'] });
      const result = filterQualifyingItems(items, cfg);
      expect(result).toHaveLength(1);
      expect(result[0].menu_item_id).toBe('item-1');
    });

    it('excludes an item whose category_id is blocklisted', () => {
      const items = [baseItem(), baseItem({ category_id: 'cat-bad' })];
      const cfg = baseConfig({ filtered_category_ids: ['cat-bad'] });
      const result = filterQualifyingItems(items, cfg);
      expect(result).toHaveLength(1);
      expect(result[0].menu_item_id).toBe('item-1');
    });

    it('excludes an item that matches both category and item blocklist', () => {
      const badItem = baseItem({ menu_item_id: 'item-bad', category_id: 'cat-bad' });
      const cfg = baseConfig({
        filtered_category_ids: ['cat-bad'],
        filtered_item_ids: ['item-bad'],
      });
      expect(filterQualifyingItems([badItem], cfg)).toEqual([]);
    });

    it('keeps items not in any blocklist', () => {
      const items = [
        baseItem({ menu_item_id: 'item-ok', category_id: 'cat-ok' }),
        baseItem({ menu_item_id: 'item-bad', category_id: 'cat-ok' }),
      ];
      const cfg = baseConfig({ filtered_item_ids: ['item-bad'] });
      const result = filterQualifyingItems(items, cfg);
      expect(result).toHaveLength(1);
      expect(result[0].menu_item_id).toBe('item-ok');
    });
  });

  describe('allowlist mode', () => {
    it('returns empty array when both filter lists are empty', () => {
      const items = [baseItem()];
      const cfg = baseConfig({ filter_mode: 'allowlist' });
      expect(filterQualifyingItems(items, cfg)).toEqual([]);
    });

    it('includes only items whose menu_item_id is in the allowlist', () => {
      const items = [baseItem({ menu_item_id: 'item-1' }), baseItem({ menu_item_id: 'item-2' })];
      const cfg = baseConfig({ filter_mode: 'allowlist', filtered_item_ids: ['item-1'] });
      const result = filterQualifyingItems(items, cfg);
      expect(result).toHaveLength(1);
      expect(result[0].menu_item_id).toBe('item-1');
    });

    it('includes items whose category_id is in the allowlist', () => {
      const items = [baseItem({ category_id: 'cat-allowed' }), baseItem({ category_id: 'cat-other' })];
      const cfg = baseConfig({ filter_mode: 'allowlist', filtered_category_ids: ['cat-allowed'] });
      const result = filterQualifyingItems(items, cfg);
      expect(result).toHaveLength(1);
      expect(result[0].category_id).toBe('cat-allowed');
    });

    it('includes an item matching either allowlist (OR logic)', () => {
      const item = baseItem({ menu_item_id: 'item-1', category_id: 'cat-1' });
      const cfg = baseConfig({
        filter_mode: 'allowlist',
        filtered_item_ids: ['item-1'],
        filtered_category_ids: ['cat-other'],
      });
      expect(filterQualifyingItems([item], cfg)).toHaveLength(1);
    });

    it('excludes items not matching any allowlist', () => {
      const item = baseItem({ menu_item_id: 'item-99', category_id: 'cat-99' });
      const cfg = baseConfig({
        filter_mode: 'allowlist',
        filtered_item_ids: ['item-1'],
        filtered_category_ids: ['cat-1'],
      });
      expect(filterQualifyingItems([item], cfg)).toEqual([]);
    });
  });
});

// ─── findActiveBoosters ───────────────────────────────────────────────────────

describe('findActiveBoosters', () => {
  const items = [baseItem({ menu_item_id: 'item-1', category_id: 'cat-1' })];

  it('returns null when there are no boosters', () => {
    expect(findActiveBoosters([], items, NOW)).toBeNull();
  });

  it('returns null when booster is inactive', () => {
    const booster = baseBooster({ is_active: false });
    expect(findActiveBoosters([booster], items, NOW)).toBeNull();
  });

  it('returns null when date is before starts_at', () => {
    const booster = baseBooster({ starts_at: '2026-07-01T00:00:00Z', ends_at: '2026-12-31T23:59:59Z' });
    expect(findActiveBoosters([booster], items, NOW)).toBeNull();
  });

  it('returns null when date is after ends_at', () => {
    const booster = baseBooster({ starts_at: '2025-01-01T00:00:00Z', ends_at: '2025-12-31T23:59:59Z' });
    expect(findActiveBoosters([booster], items, NOW)).toBeNull();
  });

  it('returns the booster when date is within range', () => {
    const booster = baseBooster();
    const result = findActiveBoosters([booster], items, NOW);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('boost-1');
  });

  it('returns booster with filter_mode=all regardless of items', () => {
    const booster = baseBooster({ filter_mode: 'all' });
    const result = findActiveBoosters([booster], items, NOW);
    expect(result).not.toBeNull();
  });

  it('returns booster when filter_mode=categories and a category matches', () => {
    const booster = baseBooster({ filter_mode: 'category', filter_ids: ['cat-1'] });
    const result = findActiveBoosters([booster], items, NOW);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('boost-1');
  });

  it('returns null when filter_mode=categories and no category matches', () => {
    const booster = baseBooster({ filter_mode: 'category', filter_ids: ['cat-99'] });
    expect(findActiveBoosters([booster], items, NOW)).toBeNull();
  });

  it('returns booster when filter_mode=items and an item matches', () => {
    const booster = baseBooster({ filter_mode: 'item', filter_ids: ['item-1'] });
    const result = findActiveBoosters([booster], items, NOW);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('boost-1');
  });

  it('returns null when filter_mode=items and no item matches', () => {
    const booster = baseBooster({ filter_mode: 'item', filter_ids: ['item-99'] });
    expect(findActiveBoosters([booster], items, NOW)).toBeNull();
  });

  it('returns the booster with the highest multiplier when multiple match', () => {
    const low = baseBooster({ id: 'boost-low', multiplier: 1.5 });
    const high = baseBooster({ id: 'boost-high', multiplier: 3 });
    const mid = baseBooster({ id: 'boost-mid', multiplier: 2 });
    const result = findActiveBoosters([low, high, mid], items, NOW);
    expect(result!.id).toBe('boost-high');
  });

  it('returns null when filter_mode=categories with empty filter_ids', () => {
    const booster = baseBooster({ filter_mode: 'category', filter_ids: [] });
    expect(findActiveBoosters([booster], items, NOW)).toBeNull();
  });

  it('returns null when filter_mode=items with empty filter_ids', () => {
    const booster = baseBooster({ filter_mode: 'item', filter_ids: [] });
    expect(findActiveBoosters([booster], items, NOW)).toBeNull();
  });
});

// ─── calculateEarnings ────────────────────────────────────────────────────────

describe('calculateEarnings', () => {
  it('returns zeros when both stamps and points are disabled', () => {
    const cfg = baseConfig({ stamps_enabled: false, points_enabled: false });
    const result = calculateEarnings([baseItem({ subtotal: 100 })], cfg, [], NOW);
    // stamps and points are 0 due to being disabled;
    // qualifying_total still reflects the filter result (item passes blocklist with empty lists)
    expect(result.stamps).toBe(0);
    expect(result.points).toBe(0);
    expect(result.booster_id).toBeNull();
    expect(result.booster_multiplier).toBe(1);
    expect(result.qualifying_total).toBe(100);
  });

  it('returns zero stamps when stamps_enabled=false', () => {
    const cfg = baseConfig({ stamps_enabled: false });
    const result = calculateEarnings([baseItem({ subtotal: 200 })], cfg, [], NOW);
    expect(result.stamps).toBe(0);
    expect(result.points).toBe(200);
  });

  it('returns zero points when points_enabled=false', () => {
    const cfg = baseConfig({ points_enabled: false });
    const result = calculateEarnings([baseItem({ subtotal: 200 })], cfg, [], NOW);
    expect(result.stamps).toBe(1);
    expect(result.points).toBe(0);
  });

  it('returns 0 stamps when there are no qualifying items', () => {
    const cfg = baseConfig({ filter_mode: 'allowlist' });
    const result = calculateEarnings([baseItem()], cfg, [], NOW);
    expect(result.stamps).toBe(0);
  });

  it('returns 0 points when qualifying_total is 0', () => {
    const cfg = baseConfig({ filter_mode: 'allowlist' });
    const result = calculateEarnings([baseItem()], cfg, [], NOW);
    expect(result.points).toBe(0);
    expect(result.qualifying_total).toBe(0);
  });

  it('returns stamps based on qualifying quantity × stamps_per_order', () => {
    const cfg = baseConfig({ stamps_per_order: 1 });
    const result = calculateEarnings([baseItem({ quantity: 1, subtotal: 999 })], cfg, [], NOW);
    expect(result.stamps).toBe(1);
  });

  it('returns stamps scaled by item quantity', () => {
    const cfg = baseConfig({ stamps_per_order: 1 });
    const result = calculateEarnings([baseItem({ quantity: 3, subtotal: 300 })], cfg, [], NOW);
    expect(result.stamps).toBe(3);
  });

  it('sums quantity across multiple qualifying items', () => {
    const cfg = baseConfig({ stamps_per_order: 1 });
    const items = [
      baseItem({ quantity: 2, subtotal: 200 }),
      baseItem({ menu_item_id: 'item-2', category_id: 'cat-2', quantity: 3, subtotal: 300 }),
    ];
    const result = calculateEarnings(items, cfg, [], NOW);
    expect(result.stamps).toBe(5); // 2 + 3
  });

  it('calculates points as floor(qualifying_total × points_per_peso)', () => {
    const cfg = baseConfig({ points_per_peso: 1.5 });
    const item = baseItem({ subtotal: 100 });
    const result = calculateEarnings([item], cfg, [], NOW);
    expect(result.points).toBe(150); // 100 * 1.5 = 150 (exact)
  });

  it('floors fractional points', () => {
    const cfg = baseConfig({ points_per_peso: 1 });
    const item = baseItem({ subtotal: 99.9 });
    const result = calculateEarnings([item], cfg, [], NOW);
    expect(result.points).toBe(99); // floor(99.9)
  });

  it('uses empty order items → all zeros', () => {
    const result = calculateEarnings([], baseConfig(), [], NOW);
    expect(result).toEqual({
      stamps: 0,
      points: 0,
      booster_id: null,
      booster_multiplier: 1,
      qualifying_total: 0,
    });
  });

  it('applies booster multiplier to stamps', () => {
    const booster = baseBooster({ multiplier: 2 });
    const cfg = baseConfig({ stamps_per_order: 1 });
    const result = calculateEarnings([baseItem()], cfg, [booster], NOW);
    expect(result.stamps).toBe(2);
    expect(result.booster_id).toBe('boost-1');
    expect(result.booster_multiplier).toBe(2);
  });

  it('applies booster multiplier to points', () => {
    const booster = baseBooster({ multiplier: 3 });
    const cfg = baseConfig({ points_per_peso: 1 });
    const result = calculateEarnings([baseItem({ subtotal: 100 })], cfg, [booster], NOW);
    expect(result.points).toBe(300);
  });

  it('floors boosted stamps', () => {
    const booster = baseBooster({ multiplier: 1.5 });
    const cfg = baseConfig({ stamps_per_order: 1 });
    const result = calculateEarnings([baseItem()], cfg, [booster], NOW);
    expect(result.stamps).toBe(1); // floor(1 * 1.5) = 1
  });

  it('floors boosted points', () => {
    const booster = baseBooster({ multiplier: 1.5 });
    const cfg = baseConfig({ points_per_peso: 1 });
    const result = calculateEarnings([baseItem({ subtotal: 99 })], cfg, [booster], NOW);
    expect(result.points).toBe(148); // floor(99 * 1.5) = 148
  });

  it('qualifying_total sums subtotals of only qualifying items', () => {
    const items = [
      baseItem({ menu_item_id: 'item-ok', subtotal: 100 }),
      baseItem({ menu_item_id: 'item-bad', subtotal: 50 }),
    ];
    const cfg = baseConfig({ filtered_item_ids: ['item-bad'] }); // blocklist
    const result = calculateEarnings(items, cfg, [], NOW);
    expect(result.qualifying_total).toBe(100);
  });

  it('no booster → booster_id null, booster_multiplier 1', () => {
    const result = calculateEarnings([baseItem()], baseConfig(), [], NOW);
    expect(result.booster_id).toBeNull();
    expect(result.booster_multiplier).toBe(1);
  });

  it('uses default now when not provided (smoke test)', () => {
    // Just verify it doesn't throw and returns a valid shape
    const result = calculateEarnings([baseItem()], baseConfig(), []);
    expect(result).toHaveProperty('stamps');
    expect(result).toHaveProperty('points');
    expect(result).toHaveProperty('booster_id');
    expect(result).toHaveProperty('booster_multiplier');
    expect(result).toHaveProperty('qualifying_total');
  });
});

// ─── checkGoalReached ────────────────────────────────────────────────────────

describe('checkGoalReached', () => {
  it('returns false when reward is null', () => {
    expect(checkGoalReached(baseCard({ current_stamps: 999 }), null)).toBe(false);
  });

  it('returns false when neither stamps nor points requirement is met', () => {
    const card = baseCard({ current_stamps: 5, current_points: 50 });
    const reward = baseReward({ stamps_required: 10, points_required: 100 });
    expect(checkGoalReached(card, reward)).toBe(false);
  });

  it('returns true when stamps_required is met exactly', () => {
    const card = baseCard({ current_stamps: 10 });
    const reward = baseReward({ stamps_required: 10, points_required: null });
    expect(checkGoalReached(card, reward)).toBe(true);
  });

  it('returns true when stamps exceed the requirement', () => {
    const card = baseCard({ current_stamps: 15 });
    const reward = baseReward({ stamps_required: 10, points_required: null });
    expect(checkGoalReached(card, reward)).toBe(true);
  });

  it('returns true when points_required is met exactly', () => {
    const card = baseCard({ current_points: 100 });
    const reward = baseReward({ stamps_required: null, points_required: 100 });
    expect(checkGoalReached(card, reward)).toBe(true);
  });

  it('returns true when points exceed the requirement', () => {
    const card = baseCard({ current_points: 150 });
    const reward = baseReward({ stamps_required: null, points_required: 100 });
    expect(checkGoalReached(card, reward)).toBe(true);
  });

  it('returns true when stamps met even if points not met (OR logic)', () => {
    const card = baseCard({ current_stamps: 10, current_points: 50 });
    const reward = baseReward({ stamps_required: 10, points_required: 100 });
    expect(checkGoalReached(card, reward)).toBe(true);
  });

  it('returns true when points met even if stamps not met (OR logic)', () => {
    const card = baseCard({ current_stamps: 5, current_points: 100 });
    const reward = baseReward({ stamps_required: 10, points_required: 100 });
    expect(checkGoalReached(card, reward)).toBe(true);
  });

  it('returns false when stamps is one short', () => {
    const card = baseCard({ current_stamps: 9 });
    const reward = baseReward({ stamps_required: 10, points_required: null });
    expect(checkGoalReached(card, reward)).toBe(false);
  });

  it('handles null stamps_required gracefully (not required)', () => {
    const card = baseCard({ current_stamps: 0, current_points: 100 });
    const reward = baseReward({ stamps_required: null, points_required: 100 });
    expect(checkGoalReached(card, reward)).toBe(true);
  });
});

// ─── calculateCarryover ───────────────────────────────────────────────────────

describe('calculateCarryover', () => {
  it('returns correct stamp carryover', () => {
    const card = baseCard({ current_stamps: 12 });
    const reward = baseReward({ stamps_required: 10, points_required: null });
    const result = calculateCarryover(card, reward);
    expect(result.stamps).toBe(2);
  });

  it('returns correct point carryover', () => {
    const card = baseCard({ current_points: 150 });
    const reward = baseReward({ stamps_required: null, points_required: 100 });
    const result = calculateCarryover(card, reward);
    expect(result.points).toBe(50);
  });

  it('treats null stamps_required as 0 (full carryover)', () => {
    const card = baseCard({ current_stamps: 5 });
    const reward = baseReward({ stamps_required: null, points_required: 100 });
    const result = calculateCarryover(card, reward);
    expect(result.stamps).toBe(5); // 5 - 0
  });

  it('treats null points_required as 0 (full carryover)', () => {
    const card = baseCard({ current_points: 75 });
    const reward = baseReward({ stamps_required: 10, points_required: null });
    const result = calculateCarryover(card, reward);
    expect(result.points).toBe(75); // 75 - 0
  });

  it('returns zero carryover when exact requirement met', () => {
    const card = baseCard({ current_stamps: 10, current_points: 100 });
    const reward = baseReward({ stamps_required: 10, points_required: 100 });
    const result = calculateCarryover(card, reward);
    expect(result.stamps).toBe(0);
    expect(result.points).toBe(0);
  });

  it('can return negative carryover (deficit)', () => {
    // Edge case: called before goal reached
    const card = baseCard({ current_stamps: 3, current_points: 0 });
    const reward = baseReward({ stamps_required: 10, points_required: null });
    const result = calculateCarryover(card, reward);
    expect(result.stamps).toBe(-7);
  });
});

// ─── checkMilestonesReached ───────────────────────────────────────────────────

const baseMilestone = (overrides: Partial<LoyaltyMilestone> = {}): LoyaltyMilestone => ({
  id: 'ms-1',
  name: 'Free Sticker',
  description: null,
  image_url: null,
  stamps_required: 5,
  is_active: true,
  sort_order: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('checkMilestonesReached', () => {
  it('returns milestones whose stamps_required <= current_stamps', () => {
    const milestones = [
      baseMilestone({ id: 'ms-1', stamps_required: 3 }),
      baseMilestone({ id: 'ms-2', stamps_required: 5 }),
      baseMilestone({ id: 'ms-3', stamps_required: 10 }),
    ];
    const result = checkMilestonesReached(5, milestones, []);
    expect(result.map((m) => m.id)).toEqual(['ms-1', 'ms-2']);
  });

  it('excludes already claimed milestones', () => {
    const milestones = [
      baseMilestone({ id: 'ms-1', stamps_required: 3 }),
      baseMilestone({ id: 'ms-2', stamps_required: 5 }),
    ];
    const existingClaims: Pick<LoyaltyMilestoneClaim, 'milestone_id'>[] = [
      { milestone_id: 'ms-1' },
    ];
    const result = checkMilestonesReached(5, milestones, existingClaims);
    expect(result.map((m) => m.id)).toEqual(['ms-2']);
  });

  it('returns empty when no milestones crossed', () => {
    const milestones = [baseMilestone({ stamps_required: 10 })];
    expect(checkMilestonesReached(3, milestones, [])).toEqual([]);
  });

  it('returns empty when all crossed milestones already claimed', () => {
    const milestones = [baseMilestone({ id: 'ms-1', stamps_required: 3 })];
    const claims: Pick<LoyaltyMilestoneClaim, 'milestone_id'>[] = [
      { milestone_id: 'ms-1' },
    ];
    expect(checkMilestonesReached(5, milestones, claims)).toEqual([]);
  });

  it('only considers active milestones (inactive filtered before calling)', () => {
    const milestones = [baseMilestone({ stamps_required: 3 })];
    expect(checkMilestonesReached(5, milestones, [])).toHaveLength(1);
  });
});
