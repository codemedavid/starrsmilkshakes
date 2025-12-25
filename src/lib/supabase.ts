import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy initialization to avoid build-time errors when env vars aren't available
let _supabase: SupabaseClient | null = null;

/**
 * Get the Supabase client with anon key
 * Uses lazy initialization to prevent build failures
 */
function getSupabase(): SupabaseClient {
  if (_supabase) {
    return _supabase;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  _supabase = createClient(supabaseUrl, supabaseAnonKey);
  return _supabase;
}

/**
 * Supabase client with anon key
 * This is a proxy that lazily initializes the client on first access
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    const client = getSupabase();
    const value = (client as any)[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  }
});

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string;
          name: string;
          icon: string;
          sort_order: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          icon: string;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          icon?: string;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      menu_items: {
        Row: {
          id: string;
          name: string;
          description: string;
          base_price: number;
          category: string;
          popular: boolean;
          available: boolean;
          image_url: string | null;
          discount_price: number | null;
          discount_start_date: string | null;
          discount_end_date: string | null;
          discount_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description: string;
          base_price: number;
          category: string;
          popular?: boolean;
          available?: boolean;
          image_url?: string | null;
          discount_price?: number | null;
          discount_start_date?: string | null;
          discount_end_date?: string | null;
          discount_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string;
          base_price?: number;
          category?: string;
          popular?: boolean;
          available?: boolean;
          image_url?: string | null;
          discount_price?: number | null;
          discount_start_date?: string | null;
          discount_end_date?: string | null;
          discount_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      variations: {
        Row: {
          id: string;
          menu_item_id: string;
          name: string;
          price: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          menu_item_id: string;
          name: string;
          price: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          menu_item_id?: string;
          name?: string;
          price?: number;
          created_at?: string;
        };
      };
      add_ons: {
        Row: {
          id: string;
          menu_item_id: string;
          name: string;
          price: number;
          category: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          menu_item_id: string;
          name: string;
          price: number;
          category: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          menu_item_id?: string;
          name?: string;
          price?: number;
          category?: string;
          created_at?: string;
        };
      };
      payment_methods: {
        Row: {
          id: string;
          name: string;
          account_number: string;
          account_name: string;
          qr_code_url: string;
          active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          account_number: string;
          account_name: string;
          qr_code_url: string;
          active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          account_number?: string;
          account_name?: string;
          qr_code_url?: string;
          active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      site_settings: {
        Row: {
          id: string;
          value: string;
          type: string;
          description: string | null;
          updated_at: string;
        };
        Insert: {
          id: string;
          value: string;
          type?: string;
          description?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          value?: string;
          type?: string;
          description?: string | null;
          updated_at?: string;
        };
      };
      orders: {
        Row: {
          id: string;
          order_number: string;
          customer_name: string;
          contact_number: string;
          service_type: string;
          address: string | null;
          landmark: string | null;
          pickup_time: string | null;
          party_size: number | null;
          dine_in_time: string | null;
          payment_method: string;
          reference_number: string | null;
          status: string;
          total: number;
          notes: string | null;
          customer_ip: string; // Stored as text, can be IP address or session identifier
          created_at: string;
          updated_at: string;
          completed_at: string | null;
          delivery_fee: number | null;
          lalamove_quotation_id: string | null;
          lalamove_order_id: string | null;
          lalamove_status: string | null;
          lalamove_tracking_url: string | null;
        };
        Insert: {
          id?: string;
          order_number: string;
          customer_name: string;
          contact_number: string;
          service_type: string;
          address?: string | null;
          landmark?: string | null;
          pickup_time?: string | null;
          party_size?: number | null;
          dine_in_time?: string | null;
          payment_method: string;
          reference_number?: string | null;
          status?: string;
          total: number;
          notes?: string | null;
          customer_ip: string; // Stored as text, can be IP address or session identifier
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
          delivery_fee?: number | null;
          lalamove_quotation_id?: string | null;
          lalamove_order_id?: string | null;
          lalamove_status?: string | null;
          lalamove_tracking_url?: string | null;
        };
        Update: {
          id?: string;
          order_number?: string;
          customer_name?: string;
          contact_number?: string;
          service_type?: string;
          address?: string | null;
          landmark?: string | null;
          pickup_time?: string | null;
          party_size?: number | null;
          dine_in_time?: string | null;
          payment_method?: string;
          reference_number?: string | null;
          status?: string;
          total?: number;
          notes?: string | null;
          customer_ip?: string;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
          delivery_fee?: number | null;
          lalamove_quotation_id?: string | null;
          lalamove_order_id?: string | null;
          lalamove_status?: string | null;
          lalamove_tracking_url?: string | null;
        };
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          menu_item_id: string | null;
          menu_item_name: string;
          quantity: number;
          unit_price: number;
          total_price: number;
          selected_variation: any | null;
          selected_add_ons: any | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          menu_item_id?: string | null;
          menu_item_name: string;
          quantity: number;
          unit_price: number;
          total_price: number;
          selected_variation?: any | null;
          selected_add_ons?: any | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          menu_item_id?: string | null;
          menu_item_name?: string;
          quantity?: number;
          unit_price?: number;
          total_price?: number;
          selected_variation?: any | null;
          selected_add_ons?: any | null;
          created_at?: string;
        };
      };
      rate_limit_logs: {
        Row: {
          id: string;
          ip_address: string;
          action_type: string;
          timestamp: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          ip_address: string;
          action_type: string;
          timestamp?: string;
          expires_at: string;
        };
        Update: {
          id?: string;
          ip_address?: string;
          action_type?: string;
          timestamp?: string;
          expires_at?: string;
        };
      };
    };
  };
};
