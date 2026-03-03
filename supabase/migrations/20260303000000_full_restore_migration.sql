/*
  ============================================================
  FULL RESTORE MIGRATION - Starr's Famous Shakes
  ============================================================
  This migration recreates the entire database schema and
  restores all production data from backups.
  
  Run this on a FRESH Supabase project to restore everything.
  ============================================================
*/

-- ============================================================
-- 1. HELPER FUNCTIONS
-- ============================================================

-- updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Discount check function
CREATE OR REPLACE FUNCTION is_discount_active(
  discount_active boolean,
  discount_start_date timestamptz,
  discount_end_date timestamptz
)
RETURNS boolean AS $$
BEGIN
  IF NOT discount_active THEN
    RETURN false;
  END IF;
  IF discount_start_date IS NULL AND discount_end_date IS NULL THEN
    RETURN discount_active;
  END IF;
  RETURN (
    (discount_start_date IS NULL OR now() >= discount_start_date) AND
    (discount_end_date IS NULL OR now() <= discount_end_date)
  );
END;
$$ LANGUAGE plpgsql;

-- Effective price function
CREATE OR REPLACE FUNCTION get_effective_price(
  base_price decimal,
  discount_price decimal,
  discount_active boolean,
  discount_start_date timestamptz,
  discount_end_date timestamptz
)
RETURNS decimal AS $$
BEGIN
  IF is_discount_active(discount_active, discount_start_date, discount_end_date) AND discount_price IS NOT NULL THEN
    RETURN discount_price;
  END IF;
  RETURN base_price;
END;
$$ LANGUAGE plpgsql;

-- Order number generator
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS text AS $$
DECLARE
  new_order_number text;
  order_count integer;
BEGIN
  SELECT COUNT(*) INTO order_count
  FROM orders
  WHERE DATE(created_at) = CURRENT_DATE;
  new_order_number := 'ORD-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD((order_count + 1)::text, 4, '0');
  WHILE EXISTS (SELECT 1 FROM orders WHERE order_number = new_order_number) LOOP
    order_count := order_count + 1;
    new_order_number := 'ORD-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD((order_count + 1)::text, 4, '0');
  END LOOP;
  RETURN new_order_number;
END;
$$ LANGUAGE plpgsql;

-- Rate limit function (disabled - always allows)
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_ip_address text,
  p_action_type text,
  p_cooldown_seconds integer DEFAULT 30,
  p_is_admin boolean DEFAULT false
)
RETURNS boolean AS $$
BEGIN
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Cleanup rate limit logs
CREATE OR REPLACE FUNCTION cleanup_rate_limit_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM rate_limit_logs
  WHERE expires_at < now() - interval '1 day';
END;
$$ LANGUAGE plpgsql;

-- Set completed_at trigger function
CREATE OR REPLACE FUNCTION set_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    NEW.completed_at = now();
  ELSIF NEW.status != 'completed' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2. CREATE TABLES
-- ============================================================

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id text PRIMARY KEY,
  name text NOT NULL,
  icon text NOT NULL DEFAULT '☕',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Menu items table
CREATE TABLE IF NOT EXISTS menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL,
  base_price decimal(10,2) NOT NULL,
  category text NOT NULL,
  popular boolean DEFAULT false,
  image_url text,
  available boolean DEFAULT true,
  discount_price decimal(10,2),
  discount_start_date timestamptz,
  discount_end_date timestamptz,
  discount_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT menu_items_category_fkey FOREIGN KEY (category) REFERENCES categories(id)
);

-- Variations table
CREATE TABLE IF NOT EXISTS variations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid REFERENCES menu_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  price decimal(10,2) NOT NULL DEFAULT 0,
  image_url text,
  created_at timestamptz DEFAULT now()
);

-- Add-ons table
CREATE TABLE IF NOT EXISTS add_ons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid REFERENCES menu_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  price decimal(10,2) NOT NULL DEFAULT 0,
  category text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Payment methods table
CREATE TABLE IF NOT EXISTS payment_methods (
  id text PRIMARY KEY,
  name text NOT NULL,
  account_number text NOT NULL,
  account_name text NOT NULL,
  qr_code_url text NOT NULL,
  active boolean DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Site settings table
CREATE TABLE IF NOT EXISTS site_settings (
  id text PRIMARY KEY,
  value text NOT NULL,
  type text NOT NULL DEFAULT 'text',
  description text,
  updated_at timestamptz DEFAULT now()
);

-- Branches table
CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  phone text NOT NULL,
  latitude text NOT NULL,
  longitude text NOT NULL,
  is_main boolean DEFAULT false,
  is_active boolean DEFAULT true,
  messenger_username text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON COLUMN branches.messenger_username IS 'Facebook page username for Messenger (e.g., "StarrsFamousShakesMakati"). If null, the default page will be used.';

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE NOT NULL,
  customer_name text NOT NULL,
  contact_number text NOT NULL,
  service_type text NOT NULL CHECK (service_type IN ('dine-in', 'pickup', 'delivery')),
  address text,
  landmark text,
  pickup_time text,
  party_size integer,
  dine_in_time timestamptz,
  payment_method text NOT NULL,
  reference_number text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled')),
  total decimal(10,2) NOT NULL,
  notes text,
  customer_ip text NOT NULL,
  delivery_fee numeric(10,2) DEFAULT 0,
  lalamove_quotation_id text,
  lalamove_order_id text,
  lalamove_status text,
  lalamove_tracking_url text,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Order items table
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES menu_items(id) ON DELETE SET NULL,
  menu_item_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price decimal(10,2) NOT NULL,
  total_price decimal(10,2) NOT NULL,
  selected_variation jsonb,
  selected_add_ons jsonb,
  created_at timestamptz DEFAULT now()
);

-- Rate limit logs table
CREATE TABLE IF NOT EXISTS rate_limit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('order_placement', 'admin_action')),
  timestamp timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);

-- ============================================================
-- 3. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_menu_items_discount_active ON menu_items(discount_active);
CREATE INDEX IF NOT EXISTS idx_menu_items_discount_dates ON menu_items(discount_start_date, discount_end_date);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_ip_created ON orders(customer_ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_logs_ip_timestamp ON rate_limit_logs(ip_address, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limit_logs_expires ON rate_limit_logs(expires_at);
CREATE INDEX IF NOT EXISTS idx_orders_status_created_at ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_service_type_created ON orders(service_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_search ON orders USING gin(
  to_tsvector('english', customer_name || ' ' || COALESCE(contact_number, '') || ' ' || COALESCE(order_number, ''))
);
CREATE INDEX IF NOT EXISTS idx_orders_date_status ON orders(created_at DESC, status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id_created ON order_items(order_id, created_at DESC);

-- ============================================================
-- 4. TRIGGERS
-- ============================================================

CREATE TRIGGER update_menu_items_updated_at
  BEFORE UPDATE ON menu_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_methods_updated_at
  BEFORE UPDATE ON payment_methods
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_site_settings_updated_at
  BEFORE UPDATE ON site_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_branches_updated_at
  BEFORE UPDATE ON branches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_orders_completed_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION set_completed_at();

-- ============================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE add_ons ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_logs ENABLE ROW LEVEL SECURITY;

-- Categories policies
CREATE POLICY "Anyone can read categories" ON categories FOR SELECT TO public USING (active = true);
CREATE POLICY "Authenticated users can manage categories" ON categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Menu items policies
CREATE POLICY "Anyone can read menu items" ON menu_items FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated users can manage menu items" ON menu_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Variations policies
CREATE POLICY "Anyone can read variations" ON variations FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated users can manage variations" ON variations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add-ons policies
CREATE POLICY "Anyone can read add-ons" ON add_ons FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated users can manage add-ons" ON add_ons FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Payment methods policies
CREATE POLICY "Anyone can read active payment methods" ON payment_methods FOR SELECT TO public USING (active = true);
CREATE POLICY "Authenticated users can manage payment methods" ON payment_methods FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Site settings policies
CREATE POLICY "Restrict sensitive settings to authenticated" ON site_settings FOR SELECT USING (
  (auth.role() = 'authenticated')
  OR
  (auth.role() = 'anon' AND id NOT IN ('meta_access_token', 'lalamove_api_key', 'lalamove_api_secret'))
);
CREATE POLICY "Authenticated can update settings" ON site_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Branches policies
CREATE POLICY "Public can view active branches" ON branches FOR SELECT TO public USING (is_active = true);
CREATE POLICY "Authenticated users can manage branches" ON branches FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Orders policies
CREATE POLICY "Anyone can create orders" ON orders FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public can read orders by order number or contact" ON orders FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated users can manage orders" ON orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Order items policies
CREATE POLICY "Anyone can create order items" ON order_items FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public can read order items" ON order_items FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated users can manage order items" ON order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Rate limit logs policies
CREATE POLICY "Authenticated users can read rate limit logs" ON rate_limit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can create rate limit logs" ON rate_limit_logs FOR INSERT TO public WITH CHECK (true);

-- ============================================================
-- 6. STORAGE (Cloudinary)
-- ============================================================
-- NOTE: Images are stored on Cloudinary (cloud_name: dns9deszp)
-- No Supabase Storage bucket is needed. Image URLs in the database
-- will point to res.cloudinary.com after re-uploading via admin panel.

-- ============================================================
-- 7. REALTIME
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;

-- ============================================================
-- 8. RESTORE BACKUP DATA
-- ============================================================

-- 8a. Categories (from backup)
INSERT INTO "public"."categories" ("id", "name", "icon", "sort_order", "active", "created_at", "updated_at") VALUES ('bake-shake', 'Bake & Shake', '🍰', '2', 'true', '2025-11-23 04:11:43.092611+00', '2025-11-23 04:11:43.092611+00'), ('drunken', 'Drunken Starrs', '🍹', '4', 'true', '2025-11-23 04:11:43.092611+00', '2025-11-23 04:11:43.092611+00'), ('munchies', 'Starr''s Munchies', '🍟', '7', 'true', '2025-11-23 04:11:43.092611+00', '2025-12-10 08:30:12.769259+00'), ('oreo-series', 'Oreo Series', '⚫⚪⚫', '6', 'true', '2025-12-10 08:38:34.487823+00', '2025-12-10 08:39:41.537304+00'), ('shakes', 'Famous Shakes', '🥤', '1', 'true', '2025-11-23 04:11:43.092611+00', '2025-12-13 05:25:33.73723+00'), ('vip', 'Starr''s V.I.P.', '⭐', '3', 'true', '2025-11-23 04:11:43.092611+00', '2025-11-23 04:11:43.092611+00'), ('yogurt', 'Also Starring (Yogurt)', '🍓', '5', 'true', '2025-11-23 04:11:43.092611+00', '2025-11-23 04:11:43.092611+00') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order, active = EXCLUDED.active, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at;

-- 8b. Menu items (from backup)
INSERT INTO "public"."menu_items" ("id", "name", "description", "base_price", "category", "popular", "image_url", "created_at", "updated_at", "available", "discount_price", "discount_start_date", "discount_end_date", "discount_active") VALUES ('046cb9f7-5a28-47cd-b413-5e9ab6257e05', 'Oreo Mallows', 'Oreo Mallows', '165.00', 'oreo-series', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765356125303-cixgn49cm4u.jpg', '2025-12-10 08:42:11.881788+00', '2025-12-10 08:42:11.881788+00', 'true', null, null, null, 'false'), ('0eedc79d-d482-45eb-bfdf-8c590e5db903', 'Banana Cookie Dough & Caramel Fudge (Yogurt)', 'Yogurt shake with banana, cookie dough, and caramel fudge', '175.00', 'yogurt', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1763875553691-wel6bxv48.jpg', '2025-11-23 04:11:43.092611+00', '2026-01-17 05:51:12.453879+00', 'true', null, null, null, 'false'), ('1225b3b0-778a-4189-bcb4-22a2e350af3c', 'Mozzarella Poppers', 'Crispy mozzarella cheese poppers', '105.00', 'munchies', 'true', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1763875992034-ul278i2wfa.jpg', '2025-11-23 04:11:43.092611+00', '2026-01-17 05:44:00.351378+00', 'true', null, null, null, 'false'), ('14584714-9b2a-459e-b5b7-a9749096e353', 'Choco Banana Split', 'Classic banana split flavors in shake form', '150.00', 'vip', 'true', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765353619012-j0b7joexj5.jpg', '2025-11-23 04:11:43.092611+00', '2026-01-17 06:03:37.253008+00', 'true', null, null, null, 'false'), ('1a75db06-e74e-4b61-b638-ac30c296efe2', 'Belgian Fries', 'Crispy golden Belgian-style fries', '80.00', 'munchies', 'true', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1763875864520-l51gejohet.jpg', '2025-11-23 04:11:43.092611+00', '2026-01-17 05:55:22.60796+00', 'true', null, null, null, 'false'), ('201102e8-b0f4-4bcf-b1d5-190d6bfc9d8f', 'Stuffed Oreo Cookie Dough', 'Stuffed Oreo Cookie Dough', '150.00', 'oreo-series', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765356289473-tqdumjvsgv.png', '2025-12-10 08:44:56.467761+00', '2026-01-17 06:15:42.927514+00', 'true', null, null, null, 'false'), ('256634ed-bf3a-4c19-a537-0b25aea6ad6e', 'Chocolate', 'Chocolate', '125.00', 'shakes', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765604360127-n4zcoc80xy.jpg', '2025-12-13 05:39:25.377368+00', '2026-01-17 06:10:41.448768+00', 'true', null, null, null, 'false'), ('25aff19e-8d8b-46f5-b61a-1be6bb04b34f', 'Mixed Berry Banana (Yogurt)', 'Yogurt shake with mixed berries and banana', '175.00', 'yogurt', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1763875650085-8ggnql1letx.jpg', '2025-11-23 04:11:43.092611+00', '2026-01-17 05:52:12.303293+00', 'true', null, null, null, 'false'), ('29fcf695-2ee6-4e86-9c5c-b9acae02cbc8', 'Drunken Caramel', 'Caramel shake with a boozy twist', '150.00', 'drunken', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765523983693-2lqj9hape1b.jpg', '2025-11-23 04:11:43.092611+00', '2026-01-17 06:06:25.545866+00', 'true', null, null, null, 'false'), ('333bd9ac-3971-43cd-a418-ad3aadc025c2', 'Cookies N'' Cream', 'Cookies N'' Cream', '125.00', 'shakes', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765605637500-q3l3u4kink.jpg', '2025-12-13 06:00:44.825434+00', '2026-01-17 06:11:45.647378+00', 'true', null, null, null, 'false'), ('3344f1a8-56b8-4159-9db1-29292f68d1e5', 'Vanilla', 'Vanilla', '125.00', 'shakes', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765605858199-irry715lhdm.jpg', '2025-12-13 06:04:23.271899+00', '2026-01-17 06:12:47.627791+00', 'true', null, null, null, 'false'), ('37b2acf0-a36d-4ac7-9720-a5d0ad32a81c', 'Mini Corndogs', 'Bite-sized corndogs perfect for snacking', '95.00', 'munchies', 'true', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765351089062-ihbf76ksxy.jpg', '2025-11-23 04:11:43.092611+00', '2026-01-17 05:57:01.019493+00', 'true', null, null, null, 'false'), ('38834357-0838-4c23-bead-711e70109808', 'Latte Mudslide', 'Coffee latte shake with mudslide flavors', '150.00', 'drunken', 'true', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765524009919-v1myuam41jg.jpg', '2025-11-23 04:11:43.092611+00', '2026-01-17 06:06:49.067051+00', 'true', null, null, null, 'false'), ('39eb9e45-ddbd-46a6-87b7-a7a3d4bb149d', 'Basket Corndog', '5 pcs Mini Corndog', '145.00', 'munchies', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765350792478-ao6afpfadkl.jpeg', '2025-12-10 07:13:19.583254+00', '2026-01-17 06:07:53.585526+00', 'true', null, null, null, 'false'), ('3a75dd49-b487-4f28-9fb1-4bac20ff8abe', 'Oreo Cheesecake', 'Oreo cookies blended with creamy cheesecake shake', '150.00', 'bake-shake', 'true', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765354844804-zcy7o3zpyc.jpg', '2025-11-23 04:11:43.092611+00', '2026-01-17 06:07:36.660451+00', 'true', null, null, null, 'false'), ('45008c07-bdb8-4523-b7e7-2c0f5e2774ad', 'Munch Box (Assorted)', 'Assorted munchies box with a variety of snacks', '190.00', 'munchies', 'true', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1763876147472-ue0v5g3ej68.png', '2025-11-23 04:11:43.092611+00', '2025-11-23 05:35:52.565008+00', 'true', null, null, null, 'false'), ('491ab68a-6f2b-4cf9-80d8-3fbfbc101fc8', 'Mint Choco Chip', 'Mint Choco Chip', '185.00', 'oreo-series', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765356070048-dugnwixci66.jpg', '2025-12-10 08:41:15.674034+00', '2025-12-10 08:41:15.674034+00', 'true', null, null, null, 'false'), ('4e031a18-ccf3-4979-91a6-d006b15d2197', 'Onion Rings', 'Golden crispy onion rings', '80.00', 'munchies', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1763876005416-x8g4s3s0cm.jpg', '2025-11-23 04:11:43.092611+00', '2026-01-17 05:56:30.337816+00', 'true', null, null, null, 'false'), ('509b420f-556c-47e2-941b-3f9cc11bb03e', 'PB, Banana, Caramel', 'Peanut butter, banana, and caramel shake', '150.00', 'vip', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765354025863-wd0ew1vp25r.jpg', '2025-11-23 04:11:43.092611+00', '2026-01-17 06:04:55.725529+00', 'true', null, null, null, 'false'), ('5dfee557-e209-481f-afba-3616cf4f1a9e', 'Oreo Oreo Pancake', 'Oreo Oreo Pancake', '165.00', 'oreo-series', 'true', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765356182984-ba5lkmk26dw.jpg', '2025-12-10 08:43:09.212407+00', '2025-12-10 08:43:09.212407+00', 'true', null, null, null, 'false'), ('69be7941-5a31-4cd5-a2ea-7c3068d69ff3', 'Strawberry Cheesecake (Yogurt)', 'Yogurt-based strawberry cheesecake shake', '175.00', 'yogurt', 'true', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1763875633181-g7yx9a0uel.jpg', '2025-11-23 04:11:43.092611+00', '2026-01-17 05:52:54.761786+00', 'true', null, null, null, 'false'), ('6e2b951a-f7b0-4674-ab2f-842321dabf07', 'Caramel', 'Caramel', '125.00', 'shakes', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765605444738-bm73eo2aphg.jpg', '2025-12-13 05:57:34.404701+00', '2026-01-17 06:11:00.161418+00', 'true', null, null, null, 'false'), ('769de4c8-57df-46b9-93d2-1fc50682cda2', 'Cherry Amaretto (Yogurt)', 'Yogurt-based cherry amaretto shake', '175.00', 'yogurt', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1763875616474-7fksakyqwmc.jpg', '2025-11-23 04:11:43.092611+00', '2026-01-17 05:51:58.684334+00', 'true', null, null, null, 'false'), ('7ce0b7df-549d-4c36-8faa-256e575d3631', 'Crosstrax Fries', 'Crisscross cut seasoned fries', '80.00', 'munchies', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1763875934934-h0sl6pf4xgf.jpg', '2025-11-23 04:11:43.092611+00', '2026-01-17 06:01:43.291117+00', 'true', null, null, null, 'false'), ('82ca9b4c-0817-463c-80ac-2f5be2fe00e3', 'Reese''s Overload', 'Peanut butter and chocolate overload shake', '150.00', 'vip', 'true', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765353596864-7g4st6nvcmw.jpg', '2025-11-23 04:11:43.092611+00', '2026-01-17 06:02:13.23002+00', 'true', null, null, null, 'false'), ('922f3d69-9edb-4f5a-96b5-346340315660', 'Mixed Berries & Banana', 'Mixed berries with fresh banana shake', '150.00', 'vip', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765353911668-u7tnr4jpzfm.jpg', '2025-11-23 04:11:43.092611+00', '2026-01-17 06:07:24.416077+00', 'true', null, null, null, 'false'), ('a3047993-8a0f-4283-94c3-75744f166153', 'Latte', 'Latte', '125.00', 'shakes', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765605678335-5e1d3ub9moh.jpg', '2025-12-13 06:01:23.301853+00', '2026-01-17 06:11:57.474761+00', 'true', null, null, null, 'false'), ('a5a5d33e-32ef-4fc9-957d-1dbf57aa1399', 'Vanilla Blue Heaven', 'Vanilla shake with blueberry flavors', '150.00', 'vip', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765353981127-zfs5w6j17am.jpg', '2025-11-23 04:11:43.092611+00', '2026-01-17 06:04:42.542838+00', 'true', null, null, null, 'false'), ('a6ea84ae-8f84-4d85-9495-48880ad3b17a', 'Cherry', 'Cherry', '125.00', 'shakes', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765605505484-zsykpsw8l5.jpg', '2025-12-13 05:59:09.952716+00', '2026-01-17 06:11:29.275211+00', 'true', null, null, null, 'false'), ('ab438678-b9c3-4b46-b59c-a46956c8808b', 'Chix Fries', 'Crispy chicken fries', '105.00', 'munchies', 'true', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1763875917836-tkozl5i3epa.jpg', '2025-11-23 04:11:43.092611+00', '2026-01-17 05:54:30.128155+00', 'true', null, null, null, 'false'), ('b2d3912d-ec17-4a8b-9f57-77218b343d2d', 'Cherry Amaretto', 'Cherry shake with amaretto flavor', '150.00', 'drunken', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765524026981-ce7mk3727fi.jpg', '2025-11-23 04:11:43.092611+00', '2026-01-17 06:07:00.608271+00', 'true', null, null, null, 'false'), ('b498ce57-c9cb-4456-8808-c7af44c130d0', 'Strawberry', 'Strawberry', '125.00', 'shakes', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765605792552-qfbx0c58y2.jpg', '2025-12-13 06:03:17.938704+00', '2026-01-17 06:12:22.648778+00', 'true', null, null, null, 'false'), ('c1022b2b-cea2-42b1-807e-228b35614d1b', 'Bubblegum', 'Fun and fruity bubblegum flavored shake', '150.00', 'vip', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765353513115-x44gble3c1.jpg', '2025-11-23 04:11:43.092611+00', '2026-01-17 05:43:45.197417+00', 'true', null, null, null, 'false'), ('c238b71c-cfdb-40e8-a5d6-e71240e53c3f', 'Mixberry And Peach (Yogurt)', 'Mixberry And Peach (Yogurt)', '175.00', 'yogurt', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765525065007-6cssubnheq4.jpg', '2025-12-12 07:38:00.085424+00', '2026-01-17 05:53:22.73449+00', 'true', null, null, null, 'false'), ('c91f4c59-376d-479e-81b1-f674d9434b06', 'Cherry Choco Mint', 'Cherry, chocolate, and mint combination shake', '150.00', 'vip', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765353821142-2fye3dib2lw.jpg', '2025-11-23 04:11:43.092611+00', '2026-01-17 06:04:13.986654+00', 'true', null, null, null, 'false'), ('ce8bb18d-fd2c-4cd8-8b21-999dc5f5d09d', 'Pistachio Milkshake', 'Pistachio Milkshake', '185.00', 'vip', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765526837768-wdei25y7ppc.png', '2025-12-12 07:42:05.935176+00', '2026-01-17 05:53:45.299757+00', 'true', null, null, null, 'false'), ('d0968bd5-3c99-4d58-a741-b505dcfb6363', 'Banana', 'banana', '125.00', 'shakes', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765604304885-e0ummsiwyh9.jpg', '2025-12-13 05:38:32.741227+00', '2026-01-17 06:10:30.100042+00', 'true', null, null, null, 'false'), ('d23130e0-f8ff-47f4-b9f3-d9d587600381', 'Mixberry', 'Mixberry', '125.00', 'shakes', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765605717846-iw4ckl60sgq.jpg', '2025-12-13 06:02:03.392881+00', '2026-01-17 06:12:10.744539+00', 'true', null, null, null, 'false'), ('d2cd8194-a844-42cf-b82b-f47a26c2055f', 'Red Velvet Oreo ', 'Red Velvet Oreo', '165.00', 'oreo-series', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765356228610-kh7yxq1r74.jpg', '2025-12-10 08:43:52.795348+00', '2025-12-10 08:43:52.795348+00', 'true', null, null, null, 'false'), ('d675c915-978a-4961-81df-92fc133eb7e1', 'Toffee Banoffee', 'Rich toffee and banana shake with banoffee pie flavors', '150.00', 'bake-shake', 'true', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765354894451-ngi4mq2ktib.jpg', '2025-11-23 04:11:43.092611+00', '2026-01-17 06:06:04.660196+00', 'true', null, null, null, 'false'), ('d890fe14-a1be-44c6-b69d-9afb32702290', 'Bourbon Candied Wallnuts', 'Bourbon Candied Wallnuts', '150.00', 'drunken', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765524660164-jlvxtsglw.jpg', '2025-12-12 07:31:41.916363+00', '2026-01-17 06:10:00.214439+00', 'true', null, null, null, 'false'), ('d907eddd-7605-44d0-93dd-945a6b3e0530', 'Bucket Corndog', 'Bucket Corndog', '580.00', 'munchies', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765350975334-ncevfud44oj.jpg', '2025-12-10 07:16:34.299766+00', '2026-01-17 06:08:26.730317+00', 'true', null, null, null, 'false'), ('dac7fc20-20fd-4979-9eea-c5aebd8aa937', 'Vanilla with Graham & Granola Crumbs (Yogurt)', 'Vanilla yogurt shake with graham and granola', '175.00', 'yogurt', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1763875601724-0py0yxaukcxa.jpg', '2025-11-23 04:11:43.092611+00', '2026-01-17 05:51:38.024961+00', 'true', null, null, null, 'false'), ('ea5ad41e-3299-48ba-a590-6e0c5e1a5dde', 'Caramel Cookie Dough', 'Caramel shake with cookie dough chunks', '150.00', 'bake-shake', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765354769882-knlh6o7j9jo.jpg', '2025-11-23 04:11:43.092611+00', '2026-01-17 06:05:13.295715+00', 'true', null, null, null, 'false'), ('ec7e5e57-4ffd-41b1-bc99-006173aa6567', 'Crunchy Cookie Butter', 'Cookie crumble shake with crunchy texture', '150.00', 'bake-shake', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765354812479-nhet25zx9r.jpg', '2025-11-23 04:11:43.092611+00', '2026-01-17 06:05:40.902322+00', 'true', null, null, null, 'false'), ('f2ef3a5f-af37-4f59-921f-d95a29dc2974', 'Strawberry Cheesecake', 'Creamy strawberry cheesecake shake with real cheesecake pieces', '150.00', 'bake-shake', 'true', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1763875466380-uksi6zaibyi.jpg', '2025-11-23 04:11:43.092611+00', '2026-01-17 05:46:35.80036+00', 'true', null, null, null, 'false'), ('fc9c9254-9ba3-4f93-b777-2b55bc9bcfdd', 'Toffee', 'Toffee', '125.00', 'shakes', 'false', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765605825111-rx1zii2x47.jpg', '2025-12-13 06:03:48.495524+00', '2026-01-17 06:12:36.716503+00', 'true', null, null, null, 'false') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, base_price = EXCLUDED.base_price, category = EXCLUDED.category, popular = EXCLUDED.popular, image_url = EXCLUDED.image_url, available = EXCLUDED.available, discount_price = EXCLUDED.discount_price, discount_active = EXCLUDED.discount_active, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at;

-- 8c. Payment methods (from backup)
INSERT INTO "public"."payment_methods" ("id", "name", "account_number", "account_name", "qr_code_url", "active", "sort_order", "created_at", "updated_at") VALUES ('bank-transfer', 'RCBC KATIPUNAN', 'Account: 0193-14243-5', 'KATHERINE DEL CASTILLO', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765348180014-f4xwkvkvfw.png', 'true', '5', '2025-11-23 04:02:12.423082+00', '2025-12-10 06:38:05.904219+00'), ('bpi-holy-spirit', 'BPI HOLY SPIRIT', '6715-0230-81', 'KATHERINE N DEL CASTILLO', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765348829711-6n6akfjjzhx.png', 'true', '4', '2025-12-10 06:40:41.822579+00', '2025-12-10 06:40:41.822579+00'), ('bpi-melting-pot', 'BPI MELTING POT', '1990-0201-47', 'KATHERINE N DEL CASTILLO', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765348324657-wqxzr3gtb1s.png', 'true', '6', '2025-12-10 06:32:07.623365+00', '2025-12-10 06:37:49.903231+00'), ('gcash', 'GCash Melting Pot', '09XX XXX XXXX', 'M&C Bakehouse', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765347675722-xoyok1kjawg.jpg', 'true', '1', '2025-11-23 04:02:12.423082+00', '2025-12-10 06:21:55.030215+00'), ('gcash-holy-spirit', 'GCASH HOLY SPIRIT', '09XXXXXXX', 'STARRS HOLY SPIRIT', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765348744044-kpp1qwliix.jpg', 'true', '3', '2025-12-10 06:39:18.480981+00', '2025-12-10 06:39:18.480981+00'), ('gcash-katipunan', 'GCASH KATIPUNAN', '09XXXXXXXX', 'STARRS KATIPUNAN', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1765348474194-bn8a2ndyknr.jpg', 'true', '2', '2025-12-10 06:35:04.107194+00', '2025-12-10 06:35:04.107194+00') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, account_number = EXCLUDED.account_number, account_name = EXCLUDED.account_name, qr_code_url = EXCLUDED.qr_code_url, active = EXCLUDED.active, sort_order = EXCLUDED.sort_order, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at;

-- 8d. Branches (from backup)
INSERT INTO "public"."branches" ("id", "name", "address", "phone", "latitude", "longitude", "is_main", "is_active", "created_at", "updated_at", "messenger_username") VALUES ('602eec36-a856-4f93-bdc4-c1ff2027a633', 'STARRS HOLY SPIRIT', 'Holy Spirit, 2nd District, Quezon City, Eastern Manila District, Metro Manila, Philippines', '09457926631', '14.683399512385357', '121.07834635391308', 'false', 'true', '2025-12-16 07:07:10.196325+00', '2025-12-16 08:07:07.206812+00', null), ('7beadfbf-3201-4880-a6da-dd5c3f92e862', 'STARRS MELTING POT', 'PH 1 BLK 1 LOT 2 OMEGA STREET, OMEGA STREET CIUDAD VERDE FAIRVIEW, QUEZON CITY', '09454302017', '14.697216937762157', '121.06638764206487', 'false', 'true', '2025-12-10 15:04:29.306298+00', '2025-12-16 09:00:52.994319+00', null), ('ce3f66ed-6b83-4b85-ad7a-f8c0c8082cac', 'STARRS KATIPUNAN', '41 THE XAVIER RESIDENCES, 888 ESTEABAN ABADA ST., LOYOLA HEIGHTS, QUEZON CITY', '09155838651', '14.6363993', '121.0728366', 'true', 'true', '2025-12-10 15:03:53.983916+00', '2025-12-16 06:55:24.047852+00', null) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, address = EXCLUDED.address, phone = EXCLUDED.phone, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, is_main = EXCLUDED.is_main, is_active = EXCLUDED.is_active, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at, messenger_username = EXCLUDED.messenger_username;

-- 8e. Site settings (from backup)
INSERT INTO "public"."site_settings" ("id", "value", "type", "description", "updated_at") VALUES
('currency', 'PHP', 'text', 'Currency symbol for prices', '2026-01-24 05:50:06.632412+00'),
('currency_code', 'PHP', 'text', 'Currency code for payments', '2026-01-24 05:50:06.449897+00'),
('header_scripts', '', 'text', 'Custom scripts for page head', '2026-01-24 05:50:06.917787+00'),
('lalamove_api_key', '', 'text', 'Lalamove API Key', '2026-01-24 05:50:06.627673+00'),
('lalamove_api_secret', '', 'text', 'Lalamove API Secret', '2026-01-24 05:50:06.604174+00'),
('lalamove_enabled', 'true', 'boolean', 'Enable/disable Lalamove delivery integration', '2025-11-27 17:45:38.833971+00'),
('lalamove_market', 'PH', 'text', 'Lalamove market code (e.g., PH for Philippines)', '2026-01-24 05:50:06.898695+00'),
('lalamove_pickup_address', '', 'text', 'Restaurant pickup address for Lalamove', '2025-11-27 17:45:38.839135+00'),
('lalamove_pickup_contact_name', '', 'text', 'Contact person name for pickup', '2025-11-27 17:45:38.907407+00'),
('lalamove_pickup_contact_phone', '', 'text', 'Contact phone number for pickup', '2025-11-27 17:45:38.907297+00'),
('lalamove_pickup_latitude', '', 'text', 'Pickup location latitude', '2025-11-27 17:45:38.833558+00'),
('lalamove_pickup_longitude', '', 'text', 'Pickup location longitude', '2025-11-27 17:45:38.906274+00'),
('lalamove_sandbox', 'true', 'text', 'Toggle sandbox mode for Lalamove API calls', '2026-01-24 05:50:06.622558+00'),
('lalamove_service_type', 'MOTORCYCLE', 'text', 'Lalamove service type used for delivery orders', '2026-01-24 05:50:06.440888+00'),
('lalamove_store_address', '', 'text', 'Pickup address for Lalamove quotes', '2026-01-24 05:50:06.731011+00'),
('lalamove_store_latitude', '', 'text', 'Latitude for the pickup location', '2026-01-24 05:50:06.74869+00'),
('lalamove_store_longitude', '', 'text', 'Longitude for the pickup location', '2026-01-24 05:50:06.777683+00'),
('lalamove_store_name', '', 'text', 'Name shown to Lalamove for pickup', '2026-01-24 05:50:06.607235+00'),
('lalamove_store_phone', '', 'text', 'Phone number for Lalamove pickup contact', '2026-01-24 05:50:06.594156+00'),
('meta_access_token', '', 'text', 'Facebook Conversions API access token', '2026-01-24 05:50:06.760636+00'),
('meta_pixel_id', '', 'text', 'Facebook Meta Pixel ID for tracking', '2026-01-24 05:50:06.762506+00'),
('meta_test_event_code', '', 'text', 'Test event code for Conversions API debugging (e.g., TEST1689)', '2026-01-24 05:50:06.765333+00'),
('site_description', 'Welcome to Starr''s Famous Shakes - Your perfect shake destination', 'text', 'Short description of the cafe', '2026-01-24 05:50:06.831304+00'),
('site_logo', 'https://inwazthpsqmjdgqihxuq.supabase.co/storage/v1/object/public/menu-images/1763872030659-4j6yuydykrm.jpg', 'image', 'The logo image URL for the site', '2026-01-24 05:50:06.896786+00'),
('site_name', 'Starrs', 'text', 'The name of the cafe/restaurant', '2026-01-24 05:50:06.507931+00')
ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, type = EXCLUDED.type, description = EXCLUDED.description, updated_at = EXCLUDED.updated_at;

-- ============================================================
-- DONE! All tables, policies, functions, triggers, indexes,
-- realtime, and backup data have been restored.
-- Images are now stored on Cloudinary (not Supabase Storage).
-- ============================================================
