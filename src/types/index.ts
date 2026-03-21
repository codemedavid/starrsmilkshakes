export interface Variation {
  id: string;
  name: string;
  price: number;
  image?: string;
}

export interface AddOn {
  id: string;
  name: string;
  price: number;
  category: string;
  quantity?: number;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  category: string;
  image?: string;
  popular?: boolean;
  available?: boolean;
  variations?: Variation[];
  addOns?: AddOn[];
  // Discount pricing fields
  discountPrice?: number;
  discountStartDate?: string;
  discountEndDate?: string;
  discountActive?: boolean;
  // Computed effective price (calculated in the app)
  effectivePrice?: number;
  isOnDiscount?: boolean;
  show_in_messenger?: boolean;
  // Cost tracking
  costPrice?: number | null;
}

export interface CartItem extends MenuItem {
  quantity: number;
  selectedVariation?: Variation;
  selectedAddOns?: AddOn[];
  totalPrice: number;
  menuItemId?: string; // Original menu item ID before uniqueId assignment
}

export interface OrderData {
  items: CartItem[];
  customerName: string;
  contactNumber: string;
  serviceType: 'dine-in' | 'pickup' | 'delivery';
  address?: string;
  pickupTime?: string;
  // Dine-in specific fields
  partySize?: number;
  dineInTime?: string;
  paymentMethod: 'gcash' | 'maya' | 'bank-transfer';
  referenceNumber?: string;
  total: number;
  notes?: string;
}

export type PaymentMethod = 'gcash' | 'maya' | 'bank-transfer';
export type ServiceType = 'dine-in' | 'pickup' | 'delivery';

// Site Settings Types
export interface SiteSetting {
  id: string;
  value: string;
  type: 'text' | 'image' | 'boolean' | 'number';
  description?: string;
  updated_at: string;
}

export interface SiteSettings {
  site_name: string;
  site_logo: string;
  site_description: string;
  currency: string;
  currency_code: string;
  lalamove_market?: string;
  lalamove_service_type?: string;
  lalamove_sandbox?: string;
  lalamove_api_key?: string;
  lalamove_api_secret?: string;
  lalamove_store_name?: string;
  lalamove_store_phone?: string;
  lalamove_store_address?: string;
  lalamove_store_latitude?: string;
  lalamove_store_longitude?: string;
  meta_pixel_id?: string;
  meta_access_token?: string;
  meta_test_event_code?: string;
  header_scripts?: string;
  ai_faq_enabled?: string;
}

// Order Management Types
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'completed' | 'cancelled';

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  menu_item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  selected_variation: Variation | null;
  selected_add_ons: AddOn[] | null;
  created_at: string;
  bundle_id?: string | null;
  bundle_selections?: import('@/types/bundle').BundleSelectionRecord[] | null;
}

export interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  contact_number: string;
  service_type: ServiceType;
  address: string | null;
  landmark: string | null;
  pickup_time: string | null;
  party_size: number | null;
  dine_in_time: string | null;
  payment_method: string;
  reference_number: string | null;
  status: OrderStatus;
  total: number;
  notes: string | null;
  customer_ip: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  order_items?: OrderItem[];
  delivery_fee?: number | null;
  lalamove_quotation_id?: string | null;
  lalamove_order_id?: string | null;
  lalamove_status?: string | null;
  lalamove_tracking_url?: string | null;
  branch_id?: string | null;
  msession?: string | null;
  customer_id?: string | null;
  messenger_psid?: string | null;
  messenger_name?: string | null;
  linked_customer_name?: string | null;
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  phone: string;
  latitude: string;
  longitude: string;
  is_main: boolean;
  is_active: boolean;
  messenger_username?: string | null; // Facebook page username for this branch's Messenger
  created_at: string;
  updated_at: string;
}

export interface OrderFilters {
  status?: OrderStatus;
  service_type?: ServiceType;
  date_from?: string;
  date_to?: string;
  search?: string; // Search by order number, customer name, or contact
}

export interface OrderStats {
  total_orders: number;
  pending_orders: number;
  today_orders: number;
  today_revenue: number;
  completed_orders: number;
  cancelled_orders: number;
}

export interface RateLimitResponse {
  allowed: boolean;
  cooldown_remaining?: number; // seconds
  message?: string;
}

// Address Autocomplete Types
export interface AddressSuggestion {
  display_name: string;
  place_id: number;
  lat: string;
  lon: string;
  type: string;
  importance?: number;
  address: {
    road?: string;
    house_number?: string;
    suburb?: string;
    village?: string;
    barangay?: string;
    city?: string;
    town?: string;
    municipality?: string;
    state?: string;
    province?: string;
    postcode?: string;
    country?: string;
    neighbourhood?: string;
    quarter?: string;
    amenity?: string;
    shop?: string;
    tourism?: string;
  };
}

// Messenger types
export interface MessengerSession {
  psid: string;
  state: 'idle' | 'browsing_categories' | 'browsing_products' | 'viewing_cart' | 'selecting_variation' | 'selecting_addons' | 'selecting_branch';
  current_category: string | null;
  selected_branch: string | null;
  current_page: number;
  pending_item_id: string | null;
  pending_variation_id: string | null;
  pending_add_ons: string[];
  cart: MessengerCartItem[];
  updated_at: string;
}

export interface MessengerCartItem {
  menu_item_id: string;
  variation_id: string | null;
  add_on_ids: string[];
  quantity: number;
}

export interface MessengerCheckoutSession {
  id: string;
  hash: string;
  psid: string;
  cart: CartItem[];
  branch_id: string | null;
  status: 'pending' | 'completed' | 'expired';
  created_at: string;
  expires_at: string;
  order_id: string | null;
}

export interface MessengerOrderLink {
  id: string;
  order_id: string;
  psid: string;
  notify_enabled: boolean;
  created_at: string;
}

export interface FacebookConfig {
  id: string;
  page_id: string;
  page_name: string;
  page_access_token: string;
  app_id: string;
  token_expires_at: string | null;
  connected_at: string;
  connected_by: string;
}

// ─── Admin entity types ───────────────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

/** Full payment-method row (admin & public). Named AdminPaymentMethod to avoid
 *  collision with the `PaymentMethod` union type used on order forms. */
export interface AdminPaymentMethod {
  id: string;
  name: string;
  account_number: string;
  account_name: string;
  qr_code_url: string;
  active: boolean;
  sort_order: number;
  branch_id: string | null;
  created_at: string;
  updated_at: string;
}

// --- FAQ Types ---

export type FaqActionType = 'text' | 'send_menu' | 'send_branches' | 'connect_human';

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  category: string | null;
  action_type: FaqActionType;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FaqInput {
  id?: string;
  question: string;
  answer: string;
  keywords: string[];
  category?: string;
  action_type?: FaqActionType;
  sort_order?: number;
}

// AI Admin Dashboard types

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  category?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeDocument {
  id: string;
  filename: string;
  file_url: string;
  storage_path: string;
  file_type: 'pdf' | 'txt' | 'md';
  file_size: number;
  chunk_count: number;
  status: 'processing' | 'review' | 'approved' | 'error';
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  section_header?: string;
  is_approved: boolean;
  created_at: string;
}

export interface ChatTrigger {
  id: string;
  name: string;
  patterns: string[];
  match_type: 'exact' | 'contains' | 'regex';
  response: string;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeRow {
  id: string;
  title: string;
  content: string;
  source_table: string;
  source_id: string;
  category?: string;
  status: 'active' | 'synced' | 'inactive' | 'review';
  updated_at: string;
}
