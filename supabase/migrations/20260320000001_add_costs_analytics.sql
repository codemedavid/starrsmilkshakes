-- supabase/migrations/20260320000001_add_costs_analytics.sql

-- ── 1. Cost columns on existing tables ──────────────────────────────────────
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS cost_price decimal(10,2);
ALTER TABLE variations ADD COLUMN IF NOT EXISTS cost_price decimal(10,2);
ALTER TABLE add_ons ADD COLUMN IF NOT EXISTS cost_price decimal(10,2);

-- Snapshot cost at order time for accurate historical analytics
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS cost_price decimal(10,2);

-- ── 2. Item performance materialized view ───────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS item_performance_mv AS
SELECT
  oi.menu_item_id,
  mi.name AS item_name,
  mi.category,
  mi.base_price AS sell_price,
  mi.cost_price,
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
JOIN menu_items mi ON mi.id = oi.menu_item_id
JOIN orders o ON o.id = oi.order_id
WHERE o.status = 'completed'
  AND oi.menu_item_id IS NOT NULL
GROUP BY oi.menu_item_id, mi.name, mi.category, mi.base_price, mi.cost_price;

CREATE UNIQUE INDEX IF NOT EXISTS idx_item_performance_mv_item ON item_performance_mv(menu_item_id);

-- bundle_performance_mv is created in the bundles migration (20260320000002)
