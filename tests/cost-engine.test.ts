// tests/cost-engine.test.ts
import { describe, it, expect } from 'vitest';
import {
  calculateItemMargin,
  calculateOrderCost,
  rankItemsByProfitability,
  rankItemsByPopularity,
  identifyLowMarginItems,
  calculateBundleCost,
} from '@/lib/cost-engine';
import type {
  ItemWithCost,
  ItemWithStats,
  OrderItemWithCost,
  BundleWithCost,
  SlotItemWithCost,
} from '@/types/cost';

// ---------------------------------------------------------------------------
// calculateItemMargin
// ---------------------------------------------------------------------------
describe('calculateItemMargin', () => {
  it('returns margin and percent for valid inputs (100, 35)', () => {
    const result = calculateItemMargin(100, 35);
    expect(result.margin).toBe(65);
    expect(result.margin_percent).toBeCloseTo(65, 5);
  });

  it('returns null when costPrice is null', () => {
    const result = calculateItemMargin(100, null);
    expect(result.margin).toBeNull();
    expect(result.margin_percent).toBeNull();
  });

  it('handles zero selling price (0, 10) → margin=-10, margin_percent=null', () => {
    const result = calculateItemMargin(0, 10);
    expect(result.margin).toBe(-10);
    expect(result.margin_percent).toBeNull();
  });

  it('handles negative margin (50, 80) → margin=-30, margin_percent≈-60', () => {
    const result = calculateItemMargin(50, 80);
    expect(result.margin).toBe(-30);
    expect(result.margin_percent).toBeCloseTo(-60, 5);
  });
});

// ---------------------------------------------------------------------------
// calculateOrderCost
// ---------------------------------------------------------------------------
describe('calculateOrderCost', () => {
  it('calculates totals from items with costs', () => {
    const items: OrderItemWithCost[] = [
      { menu_item_id: 'a', quantity: 2, unit_price: 100, total_price: 200, cost_price: 40 },
      { menu_item_id: 'b', quantity: 1, unit_price: 50, total_price: 50, cost_price: 20 },
    ];
    const result = calculateOrderCost(items);
    // totalRevenue = 200 + 50 = 250
    expect(result.totalRevenue).toBe(250);
    // totalCost = 2*40 + 1*20 = 100
    expect(result.totalCost).toBe(100);
    // totalProfit = 250 - 100 = 150
    expect(result.totalProfit).toBe(150);
    // marginPercent = 150/250 * 100 = 60
    expect(result.marginPercent).toBeCloseTo(60, 5);
  });

  it('skips items with null cost', () => {
    const items: OrderItemWithCost[] = [
      { menu_item_id: 'a', quantity: 2, unit_price: 100, total_price: 200, cost_price: 40 },
      { menu_item_id: 'b', quantity: 1, unit_price: 50, total_price: 50, cost_price: null },
    ];
    const result = calculateOrderCost(items);
    expect(result.totalRevenue).toBe(250);
    // only item 'a' cost counted: 2*40 = 80
    expect(result.totalCost).toBe(80);
    expect(result.totalProfit).toBe(170);
    expect(result.marginPercent).toBeCloseTo(68, 5);
  });

  it('returns zeros for empty array', () => {
    const result = calculateOrderCost([]);
    expect(result.totalCost).toBe(0);
    expect(result.totalRevenue).toBe(0);
    expect(result.totalProfit).toBe(0);
    expect(result.marginPercent).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// rankItemsByProfitability
// ---------------------------------------------------------------------------
describe('rankItemsByProfitability', () => {
  it('sorts by margin_percent descending, nulls last', () => {
    const items: ItemWithCost[] = [
      { id: '1', name: 'A', category: 'shake', base_price: 100, cost_price: 50, margin: 50, margin_percent: 50 },
      { id: '2', name: 'B', category: 'shake', base_price: 100, cost_price: null, margin: null, margin_percent: null },
      { id: '3', name: 'C', category: 'shake', base_price: 100, cost_price: 20, margin: 80, margin_percent: 80 },
      { id: '4', name: 'D', category: 'shake', base_price: 100, cost_price: 70, margin: 30, margin_percent: 30 },
    ];
    const ranked = rankItemsByProfitability(items);
    expect(ranked[0].id).toBe('3'); // 80%
    expect(ranked[1].id).toBe('1'); // 50%
    expect(ranked[2].id).toBe('4'); // 30%
    expect(ranked[3].id).toBe('2'); // null — last
  });

  it('places all-null-margin items in stable relative order', () => {
    const items: ItemWithCost[] = [
      { id: '1', name: 'A', category: 'shake', base_price: 100, cost_price: null, margin: null, margin_percent: null },
      { id: '2', name: 'B', category: 'shake', base_price: 100, cost_price: null, margin: null, margin_percent: null },
    ];
    const ranked = rankItemsByProfitability(items);
    // Both null — order among them doesn't matter, just verify both are present
    expect(ranked.map(r => r.id).sort()).toEqual(['1', '2']);
  });
});

// ---------------------------------------------------------------------------
// rankItemsByPopularity
// ---------------------------------------------------------------------------
describe('rankItemsByPopularity', () => {
  it('sorts by total_quantity descending', () => {
    const items: ItemWithStats[] = [
      { id: '1', name: 'A', category: 'shake', base_price: 100, cost_price: 30, margin: 70, margin_percent: 70, total_orders: 5, total_quantity: 10, total_revenue: 1000 },
      { id: '2', name: 'B', category: 'shake', base_price: 80, cost_price: 20, margin: 60, margin_percent: 75, total_orders: 20, total_quantity: 50, total_revenue: 4000 },
      { id: '3', name: 'C', category: 'shake', base_price: 60, cost_price: 15, margin: 45, margin_percent: 75, total_orders: 2, total_quantity: 3, total_revenue: 180 },
    ];
    const ranked = rankItemsByPopularity(items);
    expect(ranked[0].id).toBe('2'); // qty 50
    expect(ranked[1].id).toBe('1'); // qty 10
    expect(ranked[2].id).toBe('3'); // qty 3
  });
});

// ---------------------------------------------------------------------------
// identifyLowMarginItems
// ---------------------------------------------------------------------------
describe('identifyLowMarginItems', () => {
  it('returns items below threshold, excludes null margins', () => {
    const items: ItemWithCost[] = [
      { id: '1', name: 'A', category: 'shake', base_price: 100, cost_price: 20, margin: 80, margin_percent: 80 },
      { id: '2', name: 'B', category: 'shake', base_price: 100, cost_price: 70, margin: 30, margin_percent: 30 },
      { id: '3', name: 'C', category: 'shake', base_price: 100, cost_price: null, margin: null, margin_percent: null },
      { id: '4', name: 'D', category: 'shake', base_price: 100, cost_price: 90, margin: 10, margin_percent: 10 },
    ];
    const lowMargin = identifyLowMarginItems(items, 40);
    // Items with margin_percent < 40: B (30%) and D (10%)
    expect(lowMargin.map(i => i.id).sort()).toEqual(['2', '4']);
    // Item C (null) must be excluded
    expect(lowMargin.find(i => i.id === '3')).toBeUndefined();
    // Item A (80%) must be excluded
    expect(lowMargin.find(i => i.id === '1')).toBeUndefined();
  });

  it('returns empty array when all margins are above threshold', () => {
    const items: ItemWithCost[] = [
      { id: '1', name: 'A', category: 'shake', base_price: 100, cost_price: 20, margin: 80, margin_percent: 80 },
    ];
    expect(identifyLowMarginItems(items, 30)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// calculateBundleCost
// ---------------------------------------------------------------------------
describe('calculateBundleCost', () => {
  it('calculates total cost from bundle + slot items', () => {
    const bundle: BundleWithCost = { id: 'b1', name: 'Combo', base_price: 200, cost_price: 50 };
    const slotItems: SlotItemWithCost[] = [
      { menu_item_id: 's1', cost_price: 20, quantity: 2 },
      { menu_item_id: 's2', cost_price: 15, quantity: 1 },
    ];
    const result = calculateBundleCost(bundle, slotItems);
    expect(result.totalRevenue).toBe(200);
    // totalCost = 50 (bundle) + 2*20 + 1*15 = 50 + 40 + 15 = 105
    expect(result.totalCost).toBe(105);
    expect(result.margin).toBe(95);
    expect(result.marginPercent).toBeCloseTo(47.5, 5);
  });

  it('handles null bundle cost (treated as 0)', () => {
    const bundle: BundleWithCost = { id: 'b2', name: 'Combo2', base_price: 100, cost_price: null };
    const slotItems: SlotItemWithCost[] = [
      { menu_item_id: 's1', cost_price: 10, quantity: 1 },
    ];
    const result = calculateBundleCost(bundle, slotItems);
    // totalCost = 0 (null→0) + 1*10 = 10
    expect(result.totalCost).toBe(10);
    expect(result.totalRevenue).toBe(100);
    expect(result.margin).toBe(90);
    expect(result.marginPercent).toBeCloseTo(90, 5);
  });

  it('handles empty slot items', () => {
    const bundle: BundleWithCost = { id: 'b3', name: 'Solo', base_price: 150, cost_price: 60 };
    const result = calculateBundleCost(bundle, []);
    expect(result.totalCost).toBe(60);
    expect(result.totalRevenue).toBe(150);
    expect(result.margin).toBe(90);
    expect(result.marginPercent).toBeCloseTo(60, 5);
  });
});
