-- Super Admins table
CREATE TABLE IF NOT EXISTS super_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Facebook config (super-admin-only)
CREATE TABLE IF NOT EXISTS facebook_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id text NOT NULL,
  page_name text NOT NULL,
  page_access_token text NOT NULL,
  app_id text NOT NULL,
  token_expires_at timestamptz,
  connected_at timestamptz DEFAULT now(),
  connected_by uuid REFERENCES super_admins(id)
);

-- Messenger conversation sessions
CREATE TABLE IF NOT EXISTS messenger_sessions (
  psid text PRIMARY KEY,
  state text NOT NULL DEFAULT 'idle' CHECK (state IN ('idle','browsing_categories','browsing_products','viewing_cart','selecting_variation','selecting_addons','selecting_branch')),
  current_category text,
  selected_branch text,
  current_page integer DEFAULT 0,
  pending_item_id text,
  pending_variation_id text,
  pending_add_ons jsonb DEFAULT '[]'::jsonb,
  cart jsonb DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now()
);

-- Messenger checkout sessions (secure hash linking)
CREATE TABLE IF NOT EXISTS messenger_checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hash text UNIQUE NOT NULL,
  psid text NOT NULL,
  cart jsonb NOT NULL,
  branch_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','expired')),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  order_id text
);

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_hash ON messenger_checkout_sessions(hash);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_status ON messenger_checkout_sessions(status, expires_at);

-- Messenger order links (for status notifications)
CREATE TABLE IF NOT EXISTS messenger_order_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text UNIQUE NOT NULL,
  psid text NOT NULL,
  notify_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_links_order_id ON messenger_order_links(order_id);

-- Add show_in_messenger to menu_items
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS show_in_messenger boolean DEFAULT false;

-- Trigger for messenger_sessions updated_at
CREATE TRIGGER update_messenger_sessions_updated_at
  BEFORE UPDATE ON messenger_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on sensitive tables (service role key bypasses RLS, anon key cannot access)
ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE facebook_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE messenger_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messenger_checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messenger_order_links ENABLE ROW LEVEL SECURITY;
