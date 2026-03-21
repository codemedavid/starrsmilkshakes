// src/lib/cost-engine.ts
// Pure business logic for cost/margin calculations — no I/O, no DB, no network.

import type {
  ItemWithCost,
  ItemWithStats,
  OrderItemWithCost,
  BundleWithCost,
  SlotItemWithCost,
} from '@/types/cost';

export function calculateItemMargin(
  sellingPrice: number,
  costPrice: number | null,
): { margin: number | null; margin_percent: number | null } {
  if (costPrice === null) return { margin: null, margin_percent: null };
  const margin = sellingPrice - costPrice;
  const margin_percent = sellingPrice > 0 ? (margin / sellingPrice) * 100 : null;
  return { margin, margin_percent };
}

export function calculateOrderCost(orderItems: OrderItemWithCost[]): {
  totalCost: number;
  totalRevenue: number;
  totalProfit: number;
  marginPercent: number;
} {
  if (orderItems.length === 0) {
    return { totalCost: 0, totalRevenue: 0, totalProfit: 0, marginPercent: 0 };
  }
  let totalRevenue = 0;
  let totalCost = 0;
  for (const item of orderItems) {
    totalRevenue += item.total_price;
    if (item.cost_price !== null) totalCost += item.quantity * item.cost_price;
  }
  const totalProfit = totalRevenue - totalCost;
  const marginPercent = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  return { totalCost, totalRevenue, totalProfit, marginPercent };
}

export function rankItemsByProfitability(items: ItemWithCost[]): ItemWithCost[] {
  return [...items].sort((a, b) => {
    if (a.margin_percent === null && b.margin_percent === null) return 0;
    if (a.margin_percent === null) return 1;
    if (b.margin_percent === null) return -1;
    return b.margin_percent - a.margin_percent;
  });
}

export function rankItemsByPopularity(items: ItemWithStats[]): ItemWithStats[] {
  return [...items].sort((a, b) => b.total_quantity - a.total_quantity);
}

export function identifyLowMarginItems(items: ItemWithCost[], threshold: number): ItemWithCost[] {
  return items.filter(i => i.margin_percent !== null && i.margin_percent < threshold);
}

export function calculateBundleCost(
  bundle: BundleWithCost,
  selectedSlotItems: SlotItemWithCost[],
): { totalCost: number; totalRevenue: number; margin: number; marginPercent: number } {
  const totalRevenue = bundle.base_price;
  let totalCost = bundle.cost_price ?? 0;
  for (const item of selectedSlotItems) {
    if (item.cost_price !== null) totalCost += item.quantity * item.cost_price;
  }
  const margin = totalRevenue - totalCost;
  const marginPercent = totalRevenue > 0 ? (margin / totalRevenue) * 100 : 0;
  return { totalCost, totalRevenue, margin, marginPercent };
}
