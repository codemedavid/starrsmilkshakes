-- supabase/migrations/20260320000003_add_upsell.sql

-- ── 1. Enums ────────────────────────────────────────────────────────────────

CREATE TYPE upsell_phase AS ENUM ('upgrade', 'best_pair', 'interstitial');
CREATE TYPE upsell_trigger_type AS ENUM ('item', 'category', 'cart_total', 'cart_empty_category');
CREATE TYPE upsell_offer_type AS ENUM ('item', 'bundle', 'discount', 'loyalty_nudge');

-- ── 2. Upsell Rules (Phase 1, 3, 4) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS upsell_rules (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  phase                 upsell_phase NOT NULL,
  trigger_type          upsell_trigger_type NOT NULL,
  trigger_item_ids      uuid[] NOT NULL DEFAULT '{}',
  trigger_category_ids  text[] NOT NULL DEFAULT '{}',
  trigger_min_total     decimal(10,2),
  offer_type            upsell_offer_type NOT NULL,
  offer_item_id         uuid REFERENCES menu_items(id) ON DELETE SET NULL,
  offer_bundle_id       uuid REFERENCES bundles(id) ON DELETE SET NULL,
  offer_discount_percent decimal(5,2),
  offer_message         text,
  priority              integer NOT NULL DEFAULT 0,
  is_active             boolean DEFAULT true,
  starts_at             timestamptz,
  ends_at               timestamptz,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  CONSTRAINT upsell_rules_offer_check CHECK (
    (offer_type = 'item' AND offer_item_id IS NOT NULL) OR
    (offer_type = 'bundle' AND offer_bundle_id IS NOT NULL) OR
    (offer_type = 'discount' AND offer_discount_percent IS NOT NULL) OR
    (offer_type = 'loyalty_nudge')
  )
);

-- ── 3. Add-on Suggestions (Phase 2) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS addon_suggestions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id    uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  add_on_id       uuid NOT NULL REFERENCES add_ons(id) ON DELETE CASCADE,
  suggestion_text text,
  sort_order      integer DEFAULT 0,
  is_active       boolean DEFAULT true,
  starts_at       timestamptz,
  ends_at         timestamptz,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (menu_item_id, add_on_id)
);

-- ── 4. Pair Rules (Phase 3) ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pair_rules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_item_id      uuid REFERENCES menu_items(id) ON DELETE SET NULL,
  source_category_id  text REFERENCES categories(id) ON DELETE SET NULL,
  paired_item_id      uuid REFERENCES menu_items(id) ON DELETE SET NULL,
  paired_bundle_id    uuid REFERENCES bundles(id) ON DELETE SET NULL,
  message             text,
  priority            integer NOT NULL DEFAULT 0,
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  CONSTRAINT pair_rules_source_xor CHECK (
    (source_item_id IS NOT NULL) != (source_category_id IS NOT NULL)
  ),
  CONSTRAINT pair_rules_paired_xor CHECK (
    (paired_item_id IS NOT NULL) != (paired_bundle_id IS NOT NULL)
  )
);

-- ── 5. Triggers ─────────────────────────────────────────────────────────────

CREATE TRIGGER update_upsell_rules_updated_at
  BEFORE UPDATE ON upsell_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pair_rules_updated_at
  BEFORE UPDATE ON pair_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 6. Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_upsell_rules_phase_active ON upsell_rules(phase, is_active);
CREATE INDEX IF NOT EXISTS idx_addon_suggestions_item_active ON addon_suggestions(menu_item_id, is_active);
CREATE INDEX IF NOT EXISTS idx_pair_rules_source_item ON pair_rules(source_item_id) WHERE source_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pair_rules_source_category ON pair_rules(source_category_id) WHERE source_category_id IS NOT NULL;

-- ── 7. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE upsell_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read active rules" ON upsell_rules FOR SELECT USING (true);
CREATE POLICY "Admin can manage rules" ON upsell_rules FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE addon_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read suggestions" ON addon_suggestions FOR SELECT USING (true);
CREATE POLICY "Admin can manage suggestions" ON addon_suggestions FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE pair_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read pair rules" ON pair_rules FOR SELECT USING (true);
CREATE POLICY "Admin can manage pair rules" ON pair_rules FOR ALL USING (auth.role() = 'service_role');
