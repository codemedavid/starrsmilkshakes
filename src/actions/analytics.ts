'use server';

import { requireAdmin } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import type { ItemPerformanceRow, PerformanceFilters, DashboardSummary, DateRange, CategoryBreakdown } from '@/types/analytics';
import { calculateTrends, getCategoryBreakdown, getTopPerformers } from '@/lib/analytics-engine';

type ActionResult = { success: boolean; error?: string; data?: any };

export async function getItemPerformance(filters: PerformanceFilters = {}): Promise<ActionResult> {
  await requireAdmin();

  let query = (supabaseServer.from('order_items') as any)
    .select('menu_item_id, quantity, total_price, cost_price, menu_item_name, order_id, orders!inner(status, created_at), menu_items(name, category, base_price, cost_price)')
    .eq('orders.status', 'completed')
    .not('menu_item_id', 'is', null);

  if (filters.date_from) query = query.gte('orders.created_at', filters.date_from);
  if (filters.date_to) query = query.lte('orders.created_at', filters.date_to);

  const { data, error } = await query;
  if (error) return { success: false, error: 'Failed to fetch performance data' };

  // Aggregate in-memory
  const itemMap = new Map<string, ItemPerformanceRow>();
  for (const row of (data || [])) {
    if (!row.menu_item_id) continue;
    const mi = row.menu_items;
    const existing = itemMap.get(row.menu_item_id);
    if (existing) {
      existing.total_orders++;
      existing.total_quantity += row.quantity;
      existing.total_revenue += Number(row.total_price);
      if (row.cost_price !== null) {
        existing.total_cost = (existing.total_cost ?? 0) + row.quantity * Number(row.cost_price);
      }
    } else {
      itemMap.set(row.menu_item_id, {
        menu_item_id: row.menu_item_id,
        item_name: mi?.name ?? row.menu_item_name,
        category: mi?.category ?? '',
        sell_price: Number(mi?.base_price ?? 0),
        cost_price: mi?.cost_price !== null ? Number(mi.cost_price) : null,
        total_orders: 1, total_quantity: row.quantity,
        total_revenue: Number(row.total_price),
        total_cost: row.cost_price !== null ? row.quantity * Number(row.cost_price) : null,
        gross_profit: null, margin_percent: null,
      });
    }
  }

  // Compute derived fields
  const items: ItemPerformanceRow[] = Array.from(itemMap.values()).map((item) => {
    const gross_profit = item.total_cost !== null ? item.total_revenue - item.total_cost : null;
    const margin_percent = item.total_cost !== null && item.total_revenue > 0
      ? ((item.total_revenue - item.total_cost) / item.total_revenue) * 100 : null;
    return { ...item, gross_profit, margin_percent };
  });

  // Filter and sort
  let filtered = items;
  if (filters.search) {
    const s = filters.search.toLowerCase();
    filtered = filtered.filter((i) => i.item_name.toLowerCase().includes(s));
  }
  if (filters.category) filtered = filtered.filter((i) => i.category === filters.category);

  const sortBy = filters.sort_by ?? 'revenue';
  const sortDir = filters.sort_dir ?? 'desc';
  const sortMap: Record<string, (i: ItemPerformanceRow) => number | null> = {
    revenue: (i) => i.total_revenue, profit: (i) => i.gross_profit,
    quantity: (i) => i.total_quantity, margin: (i) => i.margin_percent,
  };
  const getValue = sortMap[sortBy];
  filtered.sort((a, b) => {
    const va = getValue(a) ?? (sortDir === 'desc' ? -Infinity : Infinity);
    const vb = getValue(b) ?? (sortDir === 'desc' ? -Infinity : Infinity);
    return sortDir === 'desc' ? (vb as number) - (va as number) : (va as number) - (vb as number);
  });

  if (filters.limit) filtered = filtered.slice(0, filters.limit);
  return { success: true, data: filtered };
}

export async function getCategoryPerformance(filters: PerformanceFilters = {}): Promise<ActionResult> {
  const itemsResult = await getItemPerformance(filters);
  if (!itemsResult.success) return itemsResult;
  const breakdown = getCategoryBreakdown(itemsResult.data);
  return { success: true, data: breakdown };
}

export async function getTopItems(
  metric: 'revenue' | 'profit' | 'quantity' | 'margin', limit: number, period: DateRange
): Promise<ActionResult> {
  const itemsResult = await getItemPerformance({ date_from: period.from, date_to: period.to });
  if (!itemsResult.success) return itemsResult;
  const top = getTopPerformers(itemsResult.data, metric, limit);
  return { success: true, data: top };
}

export async function getDashboardSummary(period: DateRange): Promise<ActionResult> {
  await requireAdmin();

  const { data: currentOrders, error: currentError } = await (supabaseServer.from('orders') as any)
    .select('id, total, created_at')
    .eq('status', 'completed')
    .gte('created_at', period.from)
    .lte('created_at', period.to);

  if (currentError) return { success: false, error: 'Failed to fetch orders' };

  // Previous period (same duration, shifted back)
  const fromDate = new Date(period.from);
  const toDate = new Date(period.to);
  const durationMs = toDate.getTime() - fromDate.getTime();
  const prevFrom = new Date(fromDate.getTime() - durationMs).toISOString();
  const prevTo = fromDate.toISOString();

  const { data: prevOrders } = await (supabaseServer.from('orders') as any)
    .select('id, total').eq('status', 'completed')
    .gte('created_at', prevFrom).lte('created_at', prevTo);

  const currentRevenue = (currentOrders || []).reduce((sum: number, o: any) => sum + Number(o.total), 0);
  const prevRevenue = (prevOrders || []).reduce((sum: number, o: any) => sum + Number(o.total), 0);

  // Top item
  const perfResult = await getItemPerformance({ date_from: period.from, date_to: period.to, sort_by: 'revenue', sort_dir: 'desc', limit: 1 });
  const topItem = perfResult.success && perfResult.data?.length > 0
    ? { name: perfResult.data[0].item_name, revenue: perfResult.data[0].total_revenue } : null;

  // Avg margin
  const allPerf = await getItemPerformance({ date_from: period.from, date_to: period.to });
  const withMargin = (allPerf.data || []).filter((i: ItemPerformanceRow) => i.margin_percent !== null);
  const avgMargin = withMargin.length > 0
    ? withMargin.reduce((s: number, i: ItemPerformanceRow) => s + (i.margin_percent ?? 0), 0) / withMargin.length : null;

  const summary: DashboardSummary = {
    total_revenue: currentRevenue, total_orders: (currentOrders || []).length,
    avg_margin_percent: avgMargin, top_item: topItem,
    trends: {
      revenue: calculateTrends(currentRevenue, prevRevenue),
      orders: calculateTrends((currentOrders || []).length, (prevOrders || []).length),
      margin: calculateTrends(avgMargin ?? 0, 0),
    },
  };
  return { success: true, data: summary };
}

export async function refreshPerformanceView(): Promise<ActionResult> {
  await requireAdmin();
  // Refresh item_performance_mv
  const { error } = await (supabaseServer as any).rpc('exec_sql', {
    query: 'REFRESH MATERIALIZED VIEW CONCURRENTLY item_performance_mv',
  });
  if (error) return { success: false, error: 'Failed to refresh view' };
  return { success: true };
}
