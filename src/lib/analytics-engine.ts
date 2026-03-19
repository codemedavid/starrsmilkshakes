// src/lib/analytics-engine.ts
// Pure business logic for analytics — no I/O, no DB, no network.

import type { ItemPerformanceRow, CategoryBreakdown, TrendData } from '@/types/analytics';

export function calculateTrends(current: number, previous: number): TrendData {
  if (previous === 0) {
    return {
      current,
      previous,
      growth_percent: current > 0 ? 100 : 0,
      direction: current > 0 ? 'up' : 'flat',
    };
  }
  const growth_percent = ((current - previous) / previous) * 100;
  const direction = growth_percent > 0 ? 'up' : growth_percent < 0 ? 'down' : 'flat';
  return { current, previous, growth_percent, direction };
}

export function getTopPerformers(
  items: ItemPerformanceRow[],
  metric: 'revenue' | 'profit' | 'quantity' | 'margin',
  limit: number,
): ItemPerformanceRow[] {
  const metricMap: Record<string, (i: ItemPerformanceRow) => number | null> = {
    revenue: (i) => i.total_revenue,
    profit: (i) => i.gross_profit,
    quantity: (i) => i.total_quantity,
    margin: (i) => i.margin_percent,
  };
  const getValue = metricMap[metric];
  return [...items]
    .sort((a, b) => {
      const va = getValue(a), vb = getValue(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return vb - va;
    })
    .slice(0, limit);
}

export function getCategoryBreakdown(items: ItemPerformanceRow[]): CategoryBreakdown[] {
  const map = new Map<
    string,
    {
      total_revenue: number;
      total_profit: number;
      total_quantity: number;
      margin_sum: number;
      margin_count: number;
      item_count: number;
    }
  >();

  for (const item of items) {
    const e = map.get(item.category) ?? {
      total_revenue: 0,
      total_profit: 0,
      total_quantity: 0,
      margin_sum: 0,
      margin_count: 0,
      item_count: 0,
    };
    e.total_revenue += item.total_revenue;
    e.total_profit += item.gross_profit ?? 0;
    e.total_quantity += item.total_quantity;
    if (item.margin_percent !== null) {
      e.margin_sum += item.margin_percent;
      e.margin_count++;
    }
    e.item_count++;
    map.set(item.category, e);
  }

  return Array.from(map.entries()).map(([category, s]) => ({
    category,
    total_revenue: s.total_revenue,
    total_profit: s.total_profit > 0 ? s.total_profit : null,
    total_quantity: s.total_quantity,
    avg_margin_percent: s.margin_count > 0 ? s.margin_sum / s.margin_count : null,
    item_count: s.item_count,
  }));
}

export function calculateAverageOrderValue(orders: { total: number }[]): number {
  if (orders.length === 0) return 0;
  return orders.reduce((acc, o) => acc + o.total, 0) / orders.length;
}

export interface RawPerformanceRow {
  menu_item_id: string;
  quantity: number;
  total_price: number;
  cost_price: number | null;
  name: string;
  category: string;
  base_price: number;
  order_id: string;
}

export function aggregateItemPerformance(rows: RawPerformanceRow[]): ItemPerformanceRow[] {
  const map = new Map<
    string,
    {
      orderIds: Set<string>;
      totalQty: number;
      totalRevenue: number;
      totalCost: number;
      hasCost: boolean;
      name: string;
      category: string;
      basePrice: number;
      costPrice: number | null;
    }
  >();

  for (const row of rows) {
    const e = map.get(row.menu_item_id) ?? {
      orderIds: new Set<string>(),
      totalQty: 0,
      totalRevenue: 0,
      totalCost: 0,
      hasCost: false,
      name: row.name,
      category: row.category,
      basePrice: row.base_price,
      costPrice: row.cost_price,
    };
    e.orderIds.add(row.order_id);
    e.totalQty += row.quantity;
    e.totalRevenue += row.total_price;
    if (row.cost_price !== null) {
      e.totalCost += row.quantity * row.cost_price;
      e.hasCost = true;
    }
    map.set(row.menu_item_id, e);
  }

  return Array.from(map.entries()).map(([id, e]) => {
    const totalCost = e.hasCost ? e.totalCost : null;
    const grossProfit = totalCost !== null ? e.totalRevenue - totalCost : null;
    const marginPercent =
      totalCost !== null && e.totalRevenue > 0
        ? (grossProfit! / e.totalRevenue) * 100
        : null;
    return {
      menu_item_id: id,
      item_name: e.name,
      category: e.category,
      sell_price: e.basePrice,
      cost_price: e.costPrice,
      total_orders: e.orderIds.size,
      total_quantity: e.totalQty,
      total_revenue: e.totalRevenue,
      total_cost: totalCost,
      gross_profit: grossProfit,
      margin_percent: marginPercent,
    };
  });
}
