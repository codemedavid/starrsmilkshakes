-- Customer link audit table for tracking order-customer linking/unlinking
CREATE TABLE IF NOT EXISTS customer_link_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  customer_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('link', 'unlink')),
  reason text NOT NULL,
  performed_by text NOT NULL,
  admin_type text NOT NULL CHECK (admin_type IN ('admin', 'super_admin')),
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: deny all direct access (service role key bypasses RLS; consistent with other tables)
ALTER TABLE customer_link_audit ENABLE ROW LEVEL SECURITY;

-- Indexes for lookup by order and customer
CREATE INDEX IF NOT EXISTS idx_customer_link_audit_order ON customer_link_audit(order_id);
CREATE INDEX IF NOT EXISTS idx_customer_link_audit_customer ON customer_link_audit(customer_id);
