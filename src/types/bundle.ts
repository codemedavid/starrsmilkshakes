// src/types/bundle.ts

import type { MenuItem, Variation, AddOn } from '@/types';

export interface Bundle {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  base_price: number;
  cost_price: number | null;
  category: string;
  discount_price: number | null;
  discount_active: boolean;
  discount_start_date: string | null;
  discount_end_date: string | null;
  available: boolean;
  popular: boolean;
  sort_order: number;
  slots: BundleSlot[];
  created_at: string;
  updated_at: string;
}

export interface BundleSlot {
  id: string;
  bundle_id: string;
  label: string;
  sort_order: number;
  min_selections: number;
  max_selections: number;
  items: BundleSlotItem[];
}

export interface BundleSlotItem {
  id: string;
  slot_id: string;
  menu_item_id: string;
  price_override: number | null;
  sort_order: number;
  menu_item?: MenuItem;
}

export interface SlotSelection {
  slot_id: string;
  selected_items: {
    menu_item_id: string;
    selected_variation?: Variation | null;
    selected_add_ons?: AddOn[];
  }[];
}

export interface BundleCartItem {
  bundle_id: string;
  bundle: Bundle;
  quantity: number;
  slot_selections: SlotSelection[];
  totalPrice: number;
}

export interface BundleSelectionRecord {
  slot_label: string;
  item_name: string;
  item_price: number;
  variation: { name: string; price: number } | null;
  add_ons: { name: string; price: number; quantity?: number }[];
}

export interface SlotItemAvailability {
  slot_id: string;
  available_count: number;
  min_selections: number;
}
