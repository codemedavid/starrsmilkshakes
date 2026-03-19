// src/types/cost.ts

export interface ItemWithCost {
  id: string;
  name: string;
  category: string;
  base_price: number;
  cost_price: number | null;
  margin: number | null;
  margin_percent: number | null;
}

export interface OrderItemWithCost {
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  cost_price: number | null;
}

export interface ItemWithStats extends ItemWithCost {
  total_orders: number;
  total_quantity: number;
  total_revenue: number;
}

export interface BundleWithCost {
  id: string;
  name: string;
  base_price: number;
  cost_price: number | null;
}

export interface SlotItemWithCost {
  menu_item_id: string;
  cost_price: number | null;
  quantity: number;
}
