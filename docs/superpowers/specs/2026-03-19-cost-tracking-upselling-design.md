# Cost Tracking, Bundles & 4-Phase Upselling System

**Date:** 2026-03-19
**Status:** Approved
**Approach:** Modular Domain Architecture (Approach B)

---

## Overview

Add product cost tracking with full margin analysis, a bundle/combo system, a 4-phase upselling engine, and a performance analytics dashboard to Starr's Famous Shakes. Each domain is isolated with its own pure-logic engine, server actions, and UI — following the existing loyalty system pattern.

### Goals

1. Track COGS (cost of goods sold) at item, variation, and add-on level
2. Analyze profitability (margin) and popularity (volume/revenue) per item
3. Create a bundle system where combos are first-class entities with customizable slots
4. Implement 4 upsell phases that guide customers through the ordering flow
5. All functions and units testable separately

---

## 1. Database Schema

### 1A. Cost Tracking — New Columns on Existing Tables

```sql
ALTER TABLE menu_items ADD COLUMN cost_price decimal(10,2);
ALTER TABLE variations ADD COLUMN cost_price decimal(10,2);
ALTER TABLE add_ons ADD COLUMN cost_price decimal(10,2);
```

- `cost_price` is nullable — not every item needs a cost immediately
- Margin is always computed at runtime: `margin = selling_price - cost_price`
- No stored margin columns — single source of truth

### 1B. Bundle System — New Tables

```sql
CREATE TABLE bundles (
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

CREATE TABLE bundle_slots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id       uuid NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  label           text NOT NULL,           -- "Choose your Shake"
  sort_order      integer DEFAULT 0,
  min_selections  integer NOT NULL DEFAULT 1,
  max_selections  integer NOT NULL DEFAULT 1,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE bundle_slot_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id         uuid NOT NULL REFERENCES bundle_slots(id) ON DELETE CASCADE,
  menu_item_id    uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  price_override  decimal(10,2),           -- nullable; replaces item base_price within bundle
  sort_order      integer DEFAULT 0
);
```

**Key design decisions:**
- Bundles are a separate entity from `menu_items` — no `item_type` discrimination
- `bundle_slot_items` references `menu_items`, so selected items retain their own variations and add-ons
- `price_override` allows bundle-specific pricing per slot item (nullable = use item's own price)
- Bundles have their own discount mechanism (same pattern as menu_items)

### 1C. Upsell System — New Tables

```sql
CREATE TYPE upsell_phase AS ENUM ('upgrade', 'best_pair', 'interstitial');
CREATE TYPE upsell_trigger_type AS ENUM ('item', 'category', 'cart_total', 'cart_empty_category');
CREATE TYPE upsell_offer_type AS ENUM ('item', 'bundle', 'discount', 'loyalty_nudge');

CREATE TABLE upsell_rules (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  phase                 upsell_phase NOT NULL,
  trigger_type          upsell_trigger_type NOT NULL,
  trigger_ids           uuid[] NOT NULL DEFAULT '{}',
  trigger_min_total     decimal(10,2),          -- for cart_total triggers
  offer_type            upsell_offer_type NOT NULL,
  offer_item_id         uuid REFERENCES menu_items(id) ON DELETE CASCADE,
  offer_bundle_id       uuid REFERENCES bundles(id) ON DELETE CASCADE,
  offer_discount_percent decimal(5,2),
  offer_message         text,
  priority              integer NOT NULL DEFAULT 0,
  is_active             boolean DEFAULT true,
  starts_at             timestamptz,
  ends_at               timestamptz,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE TABLE addon_suggestions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id    uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  add_on_id       uuid NOT NULL REFERENCES add_ons(id) ON DELETE CASCADE,
  suggestion_text text,                    -- "Most customers add this!"
  sort_order      integer DEFAULT 0,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE pair_rules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_item_id      uuid REFERENCES menu_items(id) ON DELETE CASCADE,
  source_category_id  text REFERENCES categories(id) ON DELETE CASCADE,
  paired_item_id      uuid REFERENCES menu_items(id) ON DELETE CASCADE,
  paired_bundle_id    uuid REFERENCES bundles(id) ON DELETE CASCADE,
  message             text,                -- "Goes great with your shake!"
  priority            integer NOT NULL DEFAULT 0,
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  CONSTRAINT pair_rules_source_check CHECK (
    source_item_id IS NOT NULL OR source_category_id IS NOT NULL
  ),
  CONSTRAINT pair_rules_paired_check CHECK (
    paired_item_id IS NOT NULL OR paired_bundle_id IS NOT NULL
  )
);
```

### 1D. Analytics — Materialized View

```sql
CREATE MATERIALIZED VIEW item_performance_mv AS
SELECT
  oi.menu_item_id,
  mi.name AS item_name,
  mi.category,
  mi.base_price AS sell_price,
  mi.cost_price,
  COUNT(DISTINCT oi.order_id) AS total_orders,
  SUM(oi.quantity) AS total_quantity,
  SUM(oi.total_price) AS total_revenue,
  CASE WHEN mi.cost_price IS NOT NULL
    THEN SUM(oi.quantity * mi.cost_price)
    ELSE NULL
  END AS total_cost,
  CASE WHEN mi.cost_price IS NOT NULL AND SUM(oi.total_price) > 0
    THEN ROUND(
      (SUM(oi.total_price) - SUM(oi.quantity * mi.cost_price)) / SUM(oi.total_price) * 100, 2
    )
    ELSE NULL
  END AS margin_percent
FROM order_items oi
JOIN menu_items mi ON mi.id = oi.menu_item_id
JOIN orders o ON o.id = oi.order_id
WHERE o.status = 'completed'
GROUP BY oi.menu_item_id, mi.name, mi.category, mi.base_price, mi.cost_price;

CREATE UNIQUE INDEX idx_item_performance_mv_item ON item_performance_mv(menu_item_id);
```

Refreshed on demand via `REFRESH MATERIALIZED VIEW CONCURRENTLY item_performance_mv`.

---

## 2. Pure Business Logic Engines

All engines are pure function modules — no I/O, no DB, no React. Located in `src/lib/`.

### 2A. Cost Engine (`src/lib/cost-engine.ts`)

```typescript
calculateItemMargin(sellingPrice: number, costPrice: number | null)
  → { margin: number | null, marginPercent: number | null }

calculateOrderCost(orderItems: OrderItemWithCost[])
  → { totalCost: number, totalRevenue: number, totalProfit: number, marginPercent: number }

rankItemsByProfitability(items: ItemWithCost[])
  → ItemWithCost[]  // sorted by margin% descending

rankItemsByPopularity(items: ItemWithStats[])
  → ItemWithStats[]  // sorted by total_quantity descending

identifyLowMarginItems(items: ItemWithCost[], threshold: number)
  → ItemWithCost[]  // items below margin% threshold

calculateBundleCost(bundle: BundleWithCost, selectedSlotItems: SlotItemWithCost[])
  → { totalCost: number, totalRevenue: number, margin: number, marginPercent: number }
```

### 2B. Bundle Engine (`src/lib/bundle-engine.ts`)

```typescript
validateBundleSelections(bundle: Bundle, slotSelections: SlotSelection[])
  → { valid: boolean, errors: string[] }
  // Checks: min/max selections per slot, all required slots filled, items valid for slot

calculateBundlePrice(bundle: Bundle, slotSelections: SlotSelection[])
  → { basePrice: number, addOnsTotal: number, variationsExtra: number, total: number }
  // basePrice = bundle.base_price; add-ons/variations from selected items add on top

calculateBundleSavings(bundle: Bundle, slotSelections: SlotSelection[])
  → { individualTotal: number, bundleTotal: number, savings: number, savingsPercent: number }
  // Compares buying items individually vs. the bundle price

isBundleAvailable(bundle: Bundle, slotItems: SlotItemAvailability[])
  → boolean
  // True if bundle is available AND at least min_selections items available per slot
```

### 2C. Upsell Engine (`src/lib/upsell-engine.ts`)

```typescript
// Phase 1: Upgrade
matchUpgradeOffers(cartItems: CartItem[], rules: UpsellRule[], now: Date)
  → UpsellOffer[]
  // Matches rules where phase='upgrade' and trigger matches cart contents

// Phase 2: Add-on suggestions
suggestAddOns(menuItemId: string, suggestions: AddonSuggestion[])
  → AddonSuggestion[]
  // Filters active, sorted by sort_order

// Phase 3: Best pair
matchPairOffers(cartItems: CartItem[], pairRules: PairRule[])
  → PairOffer[]
  // Matches source_item_id or source_category_id against cart, excludes items already in cart

// Phase 4: Checkout interstitial
matchInterstitialOffers(cart: Cart, rules: UpsellRule[], loyaltyCard: LoyaltyCard | null, loyaltyConfig: LoyaltyConfig | null, now: Date)
  → InterstitialOffer | null
  // Returns single highest-priority match; loyalty_nudge checks card state

// Shared
filterActiveRules<T extends { is_active: boolean, starts_at?: string | null, ends_at?: string | null }>(rules: T[], now: Date)
  → T[]

prioritizeOffers<T extends { priority: number }>(offers: T[], maxCount: number)
  → T[]

shouldShowLoyaltyNudge(card: LoyaltyCard, config: LoyaltyConfig, goalReward: LoyaltyReward | null)
  → { show: boolean, message: string, stampsAway: number | null, pointsAway: number | null }
```

### 2D. Analytics Engine (`src/lib/analytics-engine.ts`)

```typescript
aggregateItemPerformance(items: RawItemPerformance[])
  → ItemPerformanceRow[]
  // Enriches with computed fields: margin, profit, rank

calculateTrends(current: number, previous: number)
  → { growthPercent: number, direction: 'up' | 'down' | 'flat' }

getTopPerformers(items: ItemPerformanceRow[], metric: 'revenue' | 'profit' | 'quantity' | 'margin', limit: number)
  → ItemPerformanceRow[]

getCategoryBreakdown(items: ItemPerformanceRow[])
  → CategoryBreakdown[]
  // Grouped by category: total revenue, total profit, total quantity, avg margin%

calculateAverageOrderValue(orders: { total: number }[])
  → number
```

---

## 3. Server Actions (I/O Layer)

All actions use Zod validation and cache tags for revalidation. Located in `src/actions/`.

### 3A. Cost Admin (`src/actions/cost-admin.ts`)

```typescript
updateItemCost(itemId: string, costPrice: number | null): Promise<void>
updateVariationCost(variationId: string, costPrice: number | null): Promise<void>
updateAddOnCost(addOnId: string, costPrice: number | null): Promise<void>
bulkImportCosts(items: { name: string, costPrice: number }[]): Promise<{ updated: number, notFound: string[] }>
```

### 3B. Bundle Admin (`src/actions/bundle-admin.ts`)

```typescript
createBundle(input: CreateBundleInput): Promise<{ id: string }>
  // Creates bundle + slots + slot_items in single transaction

updateBundle(id: string, input: UpdateBundleInput): Promise<void>
  // Deletes old slots/items, inserts new (same pattern as updateMenuItem)

deleteBundle(id: string): Promise<void>
toggleBundleAvailability(id: string): Promise<void>
```

### 3C. Upsell Admin (`src/actions/upsell-admin.ts`)

```typescript
// Upsell rules (Phase 1, 3, 4)
createUpsellRule(input: CreateUpsellRuleInput): Promise<{ id: string }>
updateUpsellRule(id: string, input: UpdateUpsellRuleInput): Promise<void>
deleteUpsellRule(id: string): Promise<void>
toggleUpsellRule(id: string): Promise<void>

// Add-on suggestions (Phase 2)
setAddonSuggestions(menuItemId: string, suggestions: AddonSuggestionInput[]): Promise<void>

// Pair rules (Phase 3)
createPairRule(input: CreatePairRuleInput): Promise<{ id: string }>
updatePairRule(id: string, input: UpdatePairRuleInput): Promise<void>
deletePairRule(id: string): Promise<void>
```

### 3D. Analytics (`src/actions/analytics.ts`)

```typescript
getItemPerformance(filters: PerformanceFilters): Promise<ItemPerformanceRow[]>
getCategoryPerformance(filters: PerformanceFilters): Promise<CategoryBreakdown[]>
getTopItems(metric: string, limit: number, period: DateRange): Promise<ItemPerformanceRow[]>
getDashboardSummary(period: DateRange): Promise<DashboardSummary>
refreshPerformanceView(): Promise<void>
```

### 3E. Customer Upsell (`src/actions/upsell.ts`)

```typescript
getUpgradeOffers(cartItems: CartItemInput[]): Promise<UpsellOffer[]>
getAddonSuggestions(menuItemId: string): Promise<AddonSuggestion[]>
getPairSuggestions(cartItems: CartItemInput[]): Promise<PairOffer[]>
getInterstitialOffers(cart: CartInput, loyaltyCardId?: string): Promise<InterstitialOffer | null>
```

---

## 4. Admin UI

### 4A. Cost Management — Embedded in Menu Page

**No new admin tab.** Cost data is added inline to the existing menu management:

- **Menu item list**: New "Cost" and "Margin" columns
  - Cost shows `cost_price` or "—" if unset
  - Margin shows computed percentage with color coding:
    - Green: >60%
    - Yellow: 40–60%
    - Red: <40%
    - Gray: no cost data
- **MenuItemForm extension**: New cost fields:
  - `cost_price` field on the item itself
  - `cost_price` field per variation (in variations section)
  - `cost_price` field per add-on (in add-ons section)
- **"Bulk Import Costs" button**: Top of menu page
  - Opens modal with name-matching import
  - Shows preview of matches before applying
  - Reports unmatched items

### 4B. Bundles — New Admin Tab (`/admin/bundles`)

**Route:** `app/admin/bundles/page.tsx`
**Components:** `src/components/admin/BundleList.tsx`, `BundleForm.tsx`

**Bundle list view:**
- Table: name, base price, cost, margin%, slots count, category, available toggle
- Create/edit/delete actions

**Bundle form (create/edit):**
- Basic info: name, description, image upload, base_price, cost_price, category
- Discount section: discount_price, active toggle, date range
- **Slot editor:**
  - Add/remove/reorder slots (drag or up/down arrows)
  - Per slot: label, min_selections, max_selections
  - Per slot: item picker — searchable multi-select of menu_items, filterable by category
  - Per slot item: optional price_override field
- Save creates/updates bundle + all slots + slot items in one action

### 4C. Upsell — New Admin Tab (`/admin/upsell`)

**Route:** `app/admin/upsell/page.tsx`
**Components:** `src/components/admin/UpsellUpgradesTab.tsx`, `UpsellAddonsTab.tsx`, `UpsellPairsTab.tsx`, `UpsellInterstitialsTab.tsx`

Four sub-tabs:

**Upgrades Tab (Phase 1):**
- Rule list: name, trigger summary, offer summary, priority, active toggle, date range
- Rule form: trigger type + trigger items/categories, offer type (item or bundle picker), message, priority, date range

**Add-on Suggestions Tab (Phase 2):**
- Item selector at top (pick which menu item to configure)
- Suggestion list for selected item: add-on name, suggestion text, sort order, active toggle
- Add/remove suggestions per item

**Best Pairs Tab (Phase 3):**
- Pair rule list: source item/category → paired item/bundle, message, priority, active toggle
- Pair rule form: source picker (item or category), paired picker (item or bundle), message, priority

**Interstitials Tab (Phase 4):**
- Rule list: same structure as Upgrades but phase='interstitial'
- Rule form: same fields, with offer types including 'loyalty_nudge'
- For loyalty_nudge: no item/bundle picker needed, just the message template

### 4D. Analytics — New Admin Tab (`/admin/analytics`)

**Route:** `app/admin/analytics/page.tsx`
**Components:** `src/components/admin/AnalyticsDashboard.tsx`, `AnalyticsItemTable.tsx`, `AnalyticsCategoryChart.tsx`

**Layout:**

1. **Period selector**: Today, 7 days, 30 days, custom range
2. **KPI cards row** (4 cards):
   - Total Revenue (with trend arrow vs previous period)
   - Average Margin %
   - Top Item (by revenue)
   - Total Orders
3. **Item Performance Table**:
   - Columns: Item, Category, Sell Price, Cost, Margin%, Qty Sold, Revenue, Profit
   - Sortable by any column
   - Search by item name
   - Filter by category
   - Color-coded margin cells (same green/yellow/red scheme)
4. **Category Breakdown**:
   - Horizontal bar chart: revenue per category
   - Secondary bars: profit per category
5. **Refresh button**: Triggers `refreshPerformanceView()` for latest data

---

## 5. Customer-Facing UI

### 5A. Order Flow (Updated)

```
Browse Menu → Add Item
  → [Phase 2: Suggested add-ons in customization modal — natural, not a new screen]
  → Cart
  → "Proceed to Checkout"
  → [Phase 1: Upgrade Screen — shows if upgrade rules match]
  → [Phase 3: Best Pair Screen — shows if pair rules match]
  → Checkout (service type → payment)
  → [Phase 4: Interstitial Modal — shows if interstitial rules match]
  → Place Order
```

**Key rule:** Phases only show if rules match. No empty upsell screens. Flow skips silently to the next step.

### 5B. Phase 1 — Upgrade Screen

**Route:** Not a new route — rendered as a step in the checkout flow (managed by cart/checkout state).

**Layout:**
- Headline: "Upgrade your order?"
- Matched offers as cards (max 3, highest priority):
  - Bundle/item image
  - Name and description
  - Price with savings badge ("Save ₱X!")
  - "Upgrade for +₱X" button
- Accepting a bundle upgrade → opens bundle customizer inline
- **"No thanks, continue"** link at bottom — prominent, never hidden
- Skip entire screen if no matches

### 5C. Phase 2 — Add-on Suggestions (Natural)

**Not a dedicated screen.** Integrated into the existing item customization modal.

- Suggested add-ons appear at the top of the add-ons section
- Visual indicator: "Popular" or "Recommended" badge, or custom `suggestion_text`
- Same tap-to-add interaction as regular add-ons
- No interruption, no modal, no popup

### 5D. Phase 3 — Best Pair Screen

**Layout:**
- Headline: "Complete your order" or "Goes great together"
- Horizontal scrollable cards (max 4):
  - Item/bundle image
  - Name and price
  - Admin-configured message
  - "Add to cart" button
- Added items go to cart at regular price
- **"Skip"** link — prominent
- Skip entire screen if no matches

### 5E. Phase 4 — Checkout Interstitial

**Layout:** Sheet/modal overlay on checkout page, after payment selection.

- Single offer (highest priority match)
- Render varies by `offer_type`:
  - **Item**: Image + "Add [item] for just ₱X!" + one-tap add button
  - **Discount**: Image + strikethrough original price + "Add for only ₱Y (X% off)!" + add button
  - **Loyalty nudge**: Loyalty icon + "You're X stamps away from [reward]! Add one more item" + browse menu link
- **"No thanks, place my order"** button — always visible and prominent
- If customer adds item, modal closes and cart/total updates
- Skip if no matches

### 5F. Bundle Customizer Component

**Shared component** used in:
1. Menu browsing (ordering a bundle directly)
2. Phase 1 upgrade (accepting a bundle upgrade offer)

**Layout:**
- Step-by-step or scrollable all-in-one (slot-by-slot):
  - Slot label ("Choose your Shake")
  - Eligible items as grid/list
  - Selecting an item reveals its variations and add-ons
  - Selection count indicator (e.g., "1 of 1 selected")
- Running total at bottom
- Savings badge if applicable
- "Add to Cart" / "Confirm Upgrade" button when all required slots filled

---

## 6. TypeScript Types

Located in `src/types/`.

### 6A. Cost Types (`src/types/cost.ts`)

```typescript
export interface ItemWithCost {
  id: string;
  name: string;
  category: string;
  base_price: number;
  cost_price: number | null;
  margin: number | null;         // computed
  margin_percent: number | null; // computed
}

export interface OrderItemWithCost {
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  cost_price: number | null;
}
```

### 6B. Bundle Types (`src/types/bundle.ts`)

```typescript
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
  menu_item?: MenuItem;  // joined
}

export interface SlotSelection {
  slot_id: string;
  selected_items: {
    menu_item_id: string;
    selected_variation?: Variation | null;
    selected_add_ons?: AddOn[];
  }[];
}
```

### 6C. Upsell Types (`src/types/upsell.ts`)

```typescript
export type UpsellPhase = 'upgrade' | 'best_pair' | 'interstitial';
export type UpsellTriggerType = 'item' | 'category' | 'cart_total' | 'cart_empty_category';
export type UpsellOfferType = 'item' | 'bundle' | 'discount' | 'loyalty_nudge';

export interface UpsellRule {
  id: string;
  name: string;
  phase: UpsellPhase;
  trigger_type: UpsellTriggerType;
  trigger_ids: string[];
  trigger_min_total: number | null;
  offer_type: UpsellOfferType;
  offer_item_id: string | null;
  offer_bundle_id: string | null;
  offer_discount_percent: number | null;
  offer_message: string | null;
  priority: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  offer_item?: MenuItem;    // joined
  offer_bundle?: Bundle;    // joined
}

export interface UpsellOffer {
  rule: UpsellRule;
  savings: number | null;
  display_price: number;
}

export interface AddonSuggestion {
  id: string;
  menu_item_id: string;
  add_on_id: string;
  suggestion_text: string | null;
  sort_order: number;
  is_active: boolean;
  add_on?: AddOn;  // joined
}

export interface PairRule {
  id: string;
  source_item_id: string | null;
  source_category_id: string | null;
  paired_item_id: string | null;
  paired_bundle_id: string | null;
  message: string | null;
  priority: number;
  is_active: boolean;
  paired_item?: MenuItem;   // joined
  paired_bundle?: Bundle;   // joined
}

export interface PairOffer {
  rule: PairRule;
  item: MenuItem | null;
  bundle: Bundle | null;
}

export interface InterstitialOffer {
  rule: UpsellRule;
  type: UpsellOfferType;
  item: MenuItem | null;
  bundle: Bundle | null;
  discounted_price: number | null;
  loyalty_message: string | null;
}
```

### 6D. Analytics Types (`src/types/analytics.ts`)

```typescript
export interface ItemPerformanceRow {
  menu_item_id: string;
  item_name: string;
  category: string;
  sell_price: number;
  cost_price: number | null;
  total_orders: number;
  total_quantity: number;
  total_revenue: number;
  total_cost: number | null;
  gross_profit: number | null;
  margin_percent: number | null;
}

export interface CategoryBreakdown {
  category: string;
  total_revenue: number;
  total_profit: number | null;
  total_quantity: number;
  avg_margin_percent: number | null;
  item_count: number;
}

export interface DashboardSummary {
  total_revenue: number;
  total_orders: number;
  avg_margin_percent: number | null;
  top_item: { name: string; revenue: number } | null;
  trends: {
    revenue: TrendData;
    orders: TrendData;
    margin: TrendData;
  };
}

export interface TrendData {
  current: number;
  previous: number;
  growth_percent: number;
  direction: 'up' | 'down' | 'flat';
}

export interface PerformanceFilters {
  date_from?: string;
  date_to?: string;
  category?: string;
  sort_by?: 'revenue' | 'profit' | 'quantity' | 'margin';
  sort_dir?: 'asc' | 'desc';
  search?: string;
  limit?: number;
}

export type DateRange = {
  from: string;
  to: string;
};
```

---

## 7. File Structure

```
src/
├── lib/
│   ├── cost-engine.ts          # Pure margin/profitability calculations
│   ├── bundle-engine.ts        # Pure bundle validation/pricing
│   ├── upsell-engine.ts        # Pure upsell rule matching
│   └── analytics-engine.ts     # Pure aggregation/ranking
├── actions/
│   ├── cost-admin.ts           # Cost CRUD server actions
│   ├── bundle-admin.ts         # Bundle CRUD server actions
│   ├── upsell-admin.ts         # Upsell rule CRUD server actions
│   ├── upsell.ts               # Customer-facing upsell server actions
│   └── analytics.ts            # Analytics query server actions
├── types/
│   ├── cost.ts                 # Cost-related types
│   ├── bundle.ts               # Bundle types
│   ├── upsell.ts               # Upsell types
│   └── analytics.ts            # Analytics types
└── components/
    ├── admin/
    │   ├── BundleList.tsx           # Bundle list table
    │   ├── BundleForm.tsx           # Bundle create/edit form with slot editor
    │   ├── UpsellUpgradesTab.tsx    # Phase 1 admin config
    │   ├── UpsellAddonsTab.tsx      # Phase 2 admin config
    │   ├── UpsellPairsTab.tsx       # Phase 3 admin config
    │   ├── UpsellInterstitialsTab.tsx # Phase 4 admin config
    │   ├── AnalyticsDashboard.tsx   # KPI cards + period selector
    │   ├── AnalyticsItemTable.tsx   # Item performance table
    │   └── AnalyticsCategoryChart.tsx # Category breakdown chart
    ├── BundleCustomizer.tsx     # Customer-facing bundle slot picker
    ├── UpgradeScreen.tsx        # Phase 1 upgrade offers screen
    ├── BestPairScreen.tsx       # Phase 3 pairing suggestions screen
    └── CheckoutInterstitial.tsx # Phase 4 checkout modal

app/
├── admin/
│   ├── bundles/
│   │   └── page.tsx            # Bundle management admin page
│   ├── upsell/
│   │   └── page.tsx            # Upsell config admin page (4 sub-tabs)
│   └── analytics/
│       └── page.tsx            # Analytics dashboard admin page

supabase/
└── migrations/
    └── 2026XXXX_add_costs_bundles_upsell.sql  # Single migration file
```

---

## 8. Testing Strategy

### 8A. Unit Tests (Pure Engines)

| Test file | Covers | Example assertions |
|-----------|--------|-------------------|
| `cost-engine.test.ts` | Margin calc, rankings, thresholds | "₱100 sell / ₱35 cost = 65% margin", "null cost → null margin" |
| `bundle-engine.test.ts` | Validation, pricing, savings | "empty required slot → invalid", "savings = individual - bundle price" |
| `upsell-engine.test.ts` | Rule matching, priority, filtering | "category trigger matches cart item", "expired rule excluded", "max 3 returned" |
| `analytics-engine.test.ts` | Aggregations, trends, rankings | "top 5 by revenue", "growth % from 100→120 = 20%" |

No mocks, no DB. Pure input → output.

### 8B. Integration Tests (Actions + DB)

| Test file | Covers |
|-----------|--------|
| `cost-admin.integration.test.ts` | Set cost, bulk import, read-back with margin |
| `bundle-admin.integration.test.ts` | Create with slots, update slots, cascade delete |
| `upsell-admin.integration.test.ts` | CRUD rules per phase, toggle, date filtering |
| `analytics.integration.test.ts` | View refresh, filtered queries, category breakdown |
| `upsell.integration.test.ts` | Get offers for cart, empty cart → no offers |

Hit real Supabase test instance.

### 8C. API Tests

- Zod validation rejects invalid inputs (bad types, missing required fields)
- Correct cache tag invalidation on mutations
- Error responses for non-existent IDs

### 8D. System / Acceptance Tests

End-to-end flows:
1. "Customer adds item → upgrade screen shows matching offer → accepts bundle → customizes slots → pair screen shows → adds pair → interstitial shows → places order → order items correct"
2. "Admin imports costs → menu page shows margins → analytics dashboard reflects data"
3. "Admin creates bundle with 3 slots → customer orders → order_items records all selections with correct prices"
4. "No matching rules → all upsell screens skipped, customer goes straight to checkout"
5. "Expired rule not shown even if it would match"

### 8E. UI Component Tests

- Bundle customizer renders correct slots and items
- Upgrade screen shows/hides based on matched offers
- Interstitial handles all offer types (item, discount, loyalty nudge)
- Analytics table sorts, filters, searches correctly
- Empty states render properly (no cost data, no orders, no rules)

---

## 9. Data Migration

### Initial Cost Import

The spreadsheet data maps to existing menu items by name:

**Snacks** (14 items): Direct name match to `menu_items` where `category = 'snacks'`
**Milkshakes** (61 items across 5 sub-categories): Match by name to `menu_items` in shake categories

The `bulkImportCosts` action handles this:
1. Accept array of `{ name, costPrice }` pairs
2. Fuzzy-match against `menu_items.name` (case-insensitive, trimmed)
3. Return `{ updated, notFound[] }` for admin review

Variation and add-on costs will be set manually by admin after initial import (since spreadsheets only have base item costs).

---

## 10. Order Storage for Bundles

When a bundle is ordered, `order_items` stores it as:

```jsonb
-- order_items row for a bundle order
{
  menu_item_id: null,                    -- bundles aren't menu_items
  menu_item_name: "Classic Combo",       -- bundle name
  quantity: 1,
  unit_price: 199.00,                    -- bundle base_price
  total_price: 219.00,                   -- base + add-ons/variations
  selected_variation: null,
  selected_add_ons: null,
  bundle_id: "uuid",                     -- NEW: reference to bundle
  bundle_selections: [                   -- NEW: JSONB of slot selections
    {
      slot_label: "Choose your Shake",
      item_name: "Chocolate",
      item_price: 0,                     -- 0 if included in bundle price
      variation: { name: "Large", price: 20 },
      add_ons: [{ name: "Whipped Cream", price: 15 }]
    },
    {
      slot_label: "Choose your Snack",
      item_name: "Belgian Fries",
      item_price: 0,
      variation: null,
      add_ons: [{ name: "Cheese Dip", price: 10 }]
    }
  ]
}
```

This requires two new columns on `order_items`:
```sql
ALTER TABLE order_items ADD COLUMN bundle_id uuid REFERENCES bundles(id) ON DELETE SET NULL;
ALTER TABLE order_items ADD COLUMN bundle_selections jsonb;
```
