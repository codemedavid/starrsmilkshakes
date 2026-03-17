// src/types/customer.ts

export type CustomerSource = 'messenger' | 'manual';
export type TagType = 'auto' | 'manual';
export type AutoTagLabel = 'VIP' | 'Loyal' | 'New' | 'At Risk';

export interface FavoriteItem {
  id: string | null;   // null for legacy order_items rows where menu_item_id is null
  name: string;
  count: number;
}

export interface CustomerTag {
  id: string;
  customer_id: string;
  tag: string;
  tag_type: TagType;
  created_at: string;
}

/** Full customer row as returned by the DB */
export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  messenger_psid: string | null;
  messenger_name: string | null;
  source: CustomerSource;
  notes: string | null;
  // cached stats
  total_spent: number;
  order_count: number;
  avg_order_value: number;
  last_order_at: string | null;
  favorite_items: FavoriteItem[] | null;
  preferred_service_type: string | null;
  preferred_branch_id: string | null;
  avg_order_interval_days: number | null;
  created_at: string;
  updated_at: string;
}

/** Used in list views — includes computed auto_tags and manual_tags */
export interface CustomerSummary extends Customer {
  auto_tags: AutoTagLabel[];
  manual_tags: CustomerTag[];
}

/** Full profile — includes order history */
export interface CustomerProfile extends CustomerSummary {
  recent_orders: CustomerOrder[];
}

export interface CustomerOrder {
  id: string;
  order_number: string;
  total: number;
  status: string;
  service_type: string;
  created_at: string;
}

export interface CreateCustomerInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export interface UpdateCustomerInput {
  name?: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export interface CustomerFilters {
  search?: string;
  tag?: string;
  sort?: 'last_order_at' | 'total_spent' | 'order_count' | 'name' | 'created_at';
  page?: number;
  limit?: number;
}
