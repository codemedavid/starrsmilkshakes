// tests/analytics-engine.test.ts
import { describe, it, expect } from 'vitest';
import {
  calculateTrends,
  getTopPerformers,
  getCategoryBreakdown,
  calculateAverageOrderValue,
  aggregateItemPerformance,
} from '@/lib/analytics-engine';
import type { ItemPerformanceRow } from '@/types/analytics';

// ---------------------------------------------------------------------------
// Fixture builder
// ---------------------------------------------------------------------------
const makeItem = (overrides: Partial<ItemPerformanceRow> = {}): ItemPerformanceRow => ({
  menu_item_id: 'id-1',
  item_name: 'Test Item',
  category: 'shakes',
  sell_price: 100,
  cost_price: 35,
  total_orders: 10,
  total_quantity: 20,
  total_revenue: 2000,
  total_cost: 700,
  gross_profit: 1300,
  margin_percent: 65,
  ...overrides,
});

// ---------------------------------------------------------------------------
// calculateTrends
// ---------------------------------------------------------------------------
describe('calculateTrends', () => {
  it('calculates 20% growth when going from 100 to 120', () => {
    const result = calculateTrends(120, 100);
    expect(result.growth_percent).toBe(20);
    expect(result.direction).toBe('up');
    expect(result.current).toBe(120);
    expect(result.previous).toBe(100);
  });

  it('calculates -20% decline when going from 100 to 80', () => {
    const result = calculateTrends(80, 100);
    expect(result.growth_percent).toBe(-20);
    expect(result.direction).toBe('down');
  });

  it('returns flat direction when current equals previous', () => {
    const result = calculateTrends(100, 100);
    expect(result.growth_percent).toBe(0);
    expect(result.direction).toBe('flat');
  });

  it('handles zero previous: 0→100 = 100% up', () => {
    const result = calculateTrends(100, 0);
    expect(result.growth_percent).toBe(100);
    expect(result.direction).toBe('up');
  });

  it('handles zero previous with zero current: 0→0 = 0% flat', () => {
    const result = calculateTrends(0, 0);
    expect(result.growth_percent).toBe(0);
    expect(result.direction).toBe('flat');
  });
});

// ---------------------------------------------------------------------------
// getTopPerformers
// ---------------------------------------------------------------------------
describe('getTopPerformers', () => {
  const items: ItemPerformanceRow[] = [
    makeItem({ menu_item_id: 'a', item_name: 'Alpha', total_revenue: 500, gross_profit: 200, margin_percent: 40 }),
    makeItem({ menu_item_id: 'b', item_name: 'Beta', total_revenue: 3000, gross_profit: 1000, margin_percent: 33 }),
    makeItem({ menu_item_id: 'c', item_name: 'Gamma', total_revenue: 1500, gross_profit: 900, margin_percent: 60 }),
    makeItem({ menu_item_id: 'd', item_name: 'Delta', total_revenue: 200, gross_profit: null, margin_percent: null }),
  ];

  it('returns top 2 by revenue', () => {
    const result = getTopPerformers(items, 'revenue', 2);
    expect(result).toHaveLength(2);
    expect(result[0].menu_item_id).toBe('b'); // 3000
    expect(result[1].menu_item_id).toBe('c'); // 1500
  });

  it('returns top 2 by margin, placing null margins last', () => {
    const result = getTopPerformers(items, 'margin', 2);
    expect(result).toHaveLength(2);
    expect(result[0].menu_item_id).toBe('c'); // 60%
    expect(result[1].menu_item_id).toBe('a'); // 40%
    // Delta (null) does not appear in top 2
  });

  it('sorts null margin items to the end of the full list', () => {
    const result = getTopPerformers(items, 'margin', 4);
    expect(result[3].menu_item_id).toBe('d'); // null last
  });
});

// ---------------------------------------------------------------------------
// getCategoryBreakdown
// ---------------------------------------------------------------------------
describe('getCategoryBreakdown', () => {
  it('groups items by category and aggregates values correctly', () => {
    const items: ItemPerformanceRow[] = [
      makeItem({ menu_item_id: 'a', category: 'shakes', total_revenue: 1000, gross_profit: 400, total_quantity: 10, margin_percent: 40 }),
      makeItem({ menu_item_id: 'b', category: 'shakes', total_revenue: 500, gross_profit: 200, total_quantity: 5, margin_percent: 40 }),
      makeItem({ menu_item_id: 'c', category: 'extras', total_revenue: 300, gross_profit: 150, total_quantity: 15, margin_percent: 50 }),
    ];

    const result = getCategoryBreakdown(items);
    const shakes = result.find((r) => r.category === 'shakes')!;
    const extras = result.find((r) => r.category === 'extras')!;

    expect(shakes).toBeDefined();
    expect(shakes.total_revenue).toBe(1500);
    expect(shakes.total_profit).toBe(600);
    expect(shakes.total_quantity).toBe(15);
    expect(shakes.item_count).toBe(2);
    expect(shakes.avg_margin_percent).toBe(40);

    expect(extras).toBeDefined();
    expect(extras.total_revenue).toBe(300);
    expect(extras.total_profit).toBe(150);
    expect(extras.total_quantity).toBe(15);
    expect(extras.item_count).toBe(1);
    expect(extras.avg_margin_percent).toBe(50);
  });

  it('sets avg_margin_percent to null when all margins are null', () => {
    const items: ItemPerformanceRow[] = [
      makeItem({ menu_item_id: 'x', category: 'no-cost', margin_percent: null, gross_profit: null }),
    ];
    const result = getCategoryBreakdown(items);
    expect(result[0].avg_margin_percent).toBeNull();
  });

  it('sets total_profit to null when profit is zero (no cost data)', () => {
    const items: ItemPerformanceRow[] = [
      makeItem({ menu_item_id: 'x', category: 'no-cost', gross_profit: null, margin_percent: null }),
    ];
    const result = getCategoryBreakdown(items);
    expect(result[0].total_profit).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// calculateAverageOrderValue
// ---------------------------------------------------------------------------
describe('calculateAverageOrderValue', () => {
  it('calculates the average of order totals', () => {
    const orders = [{ total: 100 }, { total: 200 }, { total: 300 }];
    expect(calculateAverageOrderValue(orders)).toBe(200);
  });

  it('returns 0 for an empty array', () => {
    expect(calculateAverageOrderValue([])).toBe(0);
  });

  it('returns the single value for a one-item array', () => {
    expect(calculateAverageOrderValue([{ total: 42 }])).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// aggregateItemPerformance
// ---------------------------------------------------------------------------
describe('aggregateItemPerformance', () => {
  it('groups raw rows by menu_item_id and computes aggregates', () => {
    const rows = [
      { menu_item_id: 'item-1', order_id: 'ord-1', quantity: 2, total_price: 200, cost_price: 40, name: 'Shake A', category: 'shakes', base_price: 100 },
      { menu_item_id: 'item-1', order_id: 'ord-2', quantity: 1, total_price: 100, cost_price: 40, name: 'Shake A', category: 'shakes', base_price: 100 },
      { menu_item_id: 'item-2', order_id: 'ord-1', quantity: 3, total_price: 150, cost_price: 20, name: 'Extra B', category: 'extras', base_price: 50 },
    ];

    const result = aggregateItemPerformance(rows);
    expect(result).toHaveLength(2);

    const itemA = result.find((r) => r.menu_item_id === 'item-1')!;
    expect(itemA.total_orders).toBe(2);       // 2 distinct order_ids
    expect(itemA.total_quantity).toBe(3);      // 2 + 1
    expect(itemA.total_revenue).toBe(300);     // 200 + 100
    expect(itemA.total_cost).toBe(120);        // (2*40) + (1*40)
    expect(itemA.gross_profit).toBe(180);      // 300 - 120
    expect(itemA.margin_percent).toBeCloseTo(60); // 180/300 * 100

    const itemB = result.find((r) => r.menu_item_id === 'item-2')!;
    expect(itemB.total_orders).toBe(1);
    expect(itemB.total_quantity).toBe(3);
    expect(itemB.total_revenue).toBe(150);
    expect(itemB.total_cost).toBe(60);         // 3 * 20
    expect(itemB.gross_profit).toBe(90);       // 150 - 60
  });

  it('sets cost/profit/margin to null when cost_price is null', () => {
    const rows = [
      { menu_item_id: 'item-3', order_id: 'ord-1', quantity: 1, total_price: 100, cost_price: null, name: 'Unknown', category: 'shakes', base_price: 100 },
    ];
    const result = aggregateItemPerformance(rows);
    const item = result[0];
    expect(item.total_cost).toBeNull();
    expect(item.gross_profit).toBeNull();
    expect(item.margin_percent).toBeNull();
  });

  it('counts distinct order_ids correctly for repeated orders', () => {
    const rows = [
      { menu_item_id: 'item-1', order_id: 'ord-A', quantity: 1, total_price: 50, cost_price: 10, name: 'Item', category: 'shakes', base_price: 50 },
      { menu_item_id: 'item-1', order_id: 'ord-A', quantity: 1, total_price: 50, cost_price: 10, name: 'Item', category: 'shakes', base_price: 50 },
      { menu_item_id: 'item-1', order_id: 'ord-B', quantity: 1, total_price: 50, cost_price: 10, name: 'Item', category: 'shakes', base_price: 50 },
    ];
    const result = aggregateItemPerformance(rows);
    expect(result[0].total_orders).toBe(2); // ord-A and ord-B
  });

  it('returns empty array for empty input', () => {
    expect(aggregateItemPerformance([])).toEqual([]);
  });
});
