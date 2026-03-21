// src/types/analytics.ts

export interface ItemPerformanceRow {
  menu_item_id: string;
  item_name: string;
  category: string;
  sell_price: number;
  cost_price: number | null;
  total_orders: number;
  total_quantity: number;
  total_revenue: number;
  total_cost: number | null;
  gross_profit: number | null;
  margin_percent: number | null;
}

export interface CategoryBreakdown {
  category: string;
  total_revenue: number;
  total_profit: number | null;
  total_quantity: number;
  avg_margin_percent: number | null;
  item_count: number;
}

export interface DashboardSummary {
  total_revenue: number;
  total_orders: number;
  avg_margin_percent: number | null;
  top_item: { name: string; revenue: number } | null;
  trends: {
    revenue: TrendData;
    orders: TrendData;
    margin: TrendData;
  };
}

export interface TrendData {
  current: number;
  previous: number;
  growth_percent: number;
  direction: 'up' | 'down' | 'flat';
}

export interface PerformanceFilters {
  date_from?: string;
  date_to?: string;
  category?: string;
  sort_by?: 'revenue' | 'profit' | 'quantity' | 'margin';
  sort_dir?: 'asc' | 'desc';
  search?: string;
  limit?: number;
}

export type DateRange = {
  from: string;
  to: string;
};
