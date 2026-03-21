-- supabase/migrations/20260320000002_add_bundles.sql

-- ── 1. Bundle tables ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bundles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  description     text,
  image_url       text,
  base_price      decimal(10,2) NOT NULL,
  cost_price      decimal(10,2),
  category        text NOT NULL REFERENCES categories(id),
  discount_price  decimal(10,2),
  discount_active boolean DEFAULT false,
  discount_start_date timestamptz,
  discount_end_date   timestamptz,
  available       boolean DEFAULT true,
  popular         boolean DEFAULT false,
  sort_order      integer DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bundle_slots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id       uuid NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  label           text NOT NULL,
  sort_order      integer DEFAULT 0,
  min_selections  integer NOT NULL DEFAULT 1,
  max_selections  integer NOT NULL DEFAULT 1,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bundle_slot_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id         uuid NOT NULL REFERENCES bundle_slots(id) ON DELETE CASCADE,
  menu_item_id    uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  price_override  decimal(10,2),
  sort_order      integer DEFAULT 0,
  UNIQUE (slot_id, menu_item_id)
);

-- ── 2. Order items extension for bundles ────────────────────────────────────

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS bundle_id uuid REFERENCES bundles(id) ON DELETE SET NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS bundle_selections jsonb;

-- ── 3. Triggers ─────────────────────────────────────────────────────────────

CREATE TRIGGER update_bundles_updated_at
  BEFORE UPDATE ON bundles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 4. Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_bundles_category ON bundles(category);
CREATE INDEX IF NOT EXISTS idx_bundle_slots_bundle_id ON bundle_slots(bundle_id);
CREATE INDEX IF NOT EXISTS idx_bundle_slot_items_slot_id ON bundle_slot_items(slot_id);

-- ── 5. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE bundles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read bundles" ON bundles FOR SELECT USING (true);
CREATE POLICY "Admin can manage bundles" ON bundles FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE bundle_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read slots" ON bundle_slots FOR SELECT USING (true);
CREATE POLICY "Admin can manage slots" ON bundle_slots FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE bundle_slot_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read slot items" ON bundle_slot_items FOR SELECT USING (true);
CREATE POLICY "Admin can manage slot items" ON bundle_slot_items FOR ALL USING (auth.role() = 'service_role');

-- ── 6. Bundle performance materialized view ─────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS bundle_performance_mv AS
SELECT
  oi.bundle_id,
  COALESCE(b.name, oi.menu_item_name) AS bundle_name,
  b.category,
  b.base_price AS sell_price,
  b.cost_price,
  COUNT(DISTINCT oi.order_id) AS total_orders,
  SUM(oi.quantity) AS total_quantity,
  SUM(oi.total_price) AS total_revenue,
  CASE WHEN SUM(CASE WHEN oi.cost_price IS NOT NULL THEN 1 ELSE 0 END) > 0
    THEN SUM(oi.quantity * COALESCE(oi.cost_price, 0))
    ELSE NULL
  END AS total_cost,
  CASE WHEN SUM(CASE WHEN oi.cost_price IS NOT NULL THEN 1 ELSE 0 END) > 0
       AND SUM(oi.total_price) > 0
    THEN ROUND(
      (SUM(oi.total_price) - SUM(oi.quantity * COALESCE(oi.cost_price, 0)))
      / SUM(oi.total_price) * 100, 2
    )
    ELSE NULL
  END AS margin_percent,
  CASE WHEN SUM(CASE WHEN oi.cost_price IS NOT NULL THEN 1 ELSE 0 END) > 0
    THEN SUM(oi.total_price) - SUM(oi.quantity * COALESCE(oi.cost_price, 0))
    ELSE NULL
  END AS gross_profit
FROM order_items oi
LEFT JOIN bundles b ON b.id = oi.bundle_id
JOIN orders o ON o.id = oi.order_id
WHERE o.status = 'completed'
  AND oi.bundle_selections IS NOT NULL
GROUP BY oi.bundle_id, b.name, oi.menu_item_name, b.category, b.base_price, b.cost_price;

CREATE INDEX IF NOT EXISTS idx_bundle_performance_mv_bundle ON bundle_performance_mv(bundle_id) WHERE bundle_id IS NOT NULL;
