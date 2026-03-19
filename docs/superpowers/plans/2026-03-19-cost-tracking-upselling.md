# Cost Tracking, Bundles & 4-Phase Upselling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add product cost/margin tracking, a bundle/combo system, a 4-phase upselling engine, and a performance analytics dashboard.

**Architecture:** Four independent phases building on each other. Each phase produces working, testable software. Pure business logic engines (no I/O) + server actions (I/O) + admin UI + customer UI. Follows existing loyalty system patterns (loyalty-engine.ts, loyalty-admin.ts, loyalty types, Zod validation, unstable_cache, SSR admin pages).

**Tech Stack:** Next.js 15, Supabase (PostgreSQL), TypeScript, Vitest, Zod, Tailwind CSS, Lucide icons

**Test conventions:** Pure engine tests go in `tests/` (top level). Action tests go in `tests/unit/actions/`. Integration tests go in `tests/integration/`.

**Spec:** `docs/superpowers/specs/2026-03-19-cost-tracking-upselling-design.md`

**Dependencies between phases:**
- Phase 1 (Cost + Analytics): No dependencies
- Phase 2 (Bundles): Depends on Phase 1 (cost_price columns)
- Phase 3 (Upsell Engine + Admin): Depends on Phase 2 (bundles as offer targets)
- Phase 4 (Customer Upsell UI): Depends on Phase 3 (upsell actions)

---

## Phase 1: Cost Tracking & Analytics

### Task 1: Database Migration — Cost Columns

**Files:**
- Create: `supabase/migrations/20260320000000_add_costs_analytics.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260320000000_add_costs_analytics.sql

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

-- ── 3. Bundle performance materialized view ──────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS bundle_performance_mv AS
SELECT
  oi.bundle_id,
  b.name AS bundle_name,
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
JOIN bundles b ON b.id = oi.bundle_id
JOIN orders o ON o.id = oi.order_id
WHERE o.status = 'completed'
  AND oi.bundle_id IS NOT NULL
GROUP BY oi.bundle_id, b.name, b.base_price, b.cost_price;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bundle_performance_mv_bundle ON bundle_performance_mv(bundle_id);
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push` (or apply via Supabase dashboard)
Expected: Migration applies successfully, new columns visible on tables.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260320000000_add_costs_analytics.sql
git commit -m "feat(db): add cost_price columns and item_performance_mv"
```

---

### Task 2: Cost Types

**Files:**
- Create: `src/types/cost.ts`

- [ ] **Step 1: Create the cost types file**

```typescript
// src/types/cost.ts

export interface ItemWithCost {
  id: string;
  name: string;
  category: string;
  base_price: number;
  cost_price: number | null;
  margin: number | null;
  margin_percent: number | null;
}

export interface OrderItemWithCost {
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  cost_price: number | null;
}

export interface ItemWithStats extends ItemWithCost {
  total_orders: number;
  total_quantity: number;
  total_revenue: number;
}

export interface BundleWithCost {
  id: string;
  name: string;
  base_price: number;
  cost_price: number | null;
}

export interface SlotItemWithCost {
  menu_item_id: string;
  cost_price: number | null;
  quantity: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/cost.ts
git commit -m "feat(types): add cost tracking types"
```

---

### Task 3: Cost Engine — Pure Business Logic

**Files:**
- Create: `src/lib/cost-engine.ts`
- Create: `tests/cost-engine.test.ts`

- [ ] **Step 1: Write failing tests for calculateItemMargin**

```typescript
// tests/cost-engine.test.ts
import { describe, it, expect } from 'vitest';
import { calculateItemMargin } from '@/lib/cost-engine';

describe('calculateItemMargin', () => {
  it('returns margin and percent for valid inputs', () => {
    const result = calculateItemMargin(100, 35);
    expect(result.margin).toBe(65);
    expect(result.margin_percent).toBeCloseTo(65);
  });

  it('returns null margin when costPrice is null', () => {
    const result = calculateItemMargin(100, null);
    expect(result.margin).toBeNull();
    expect(result.margin_percent).toBeNull();
  });

  it('handles zero selling price', () => {
    const result = calculateItemMargin(0, 10);
    expect(result.margin).toBe(-10);
    expect(result.margin_percent).toBeNull();
  });

  it('handles cost higher than price (negative margin)', () => {
    const result = calculateItemMargin(50, 80);
    expect(result.margin).toBe(-30);
    expect(result.margin_percent).toBeCloseTo(-60);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cost-engine.test.ts`
Expected: FAIL — `calculateItemMargin` not found

- [ ] **Step 3: Implement calculateItemMargin**

```typescript
// src/lib/cost-engine.ts
// Pure business logic for cost/margin calculations — no I/O, no DB, no network.

import type {
  ItemWithCost,
  ItemWithStats,
  OrderItemWithCost,
  BundleWithCost,
  SlotItemWithCost,
} from '@/types/cost';

/**
 * Calculate margin and margin% for a single item.
 */
export function calculateItemMargin(
  sellingPrice: number,
  costPrice: number | null,
): { margin: number | null; margin_percent: number | null } {
  if (costPrice === null) {
    return { margin: null, margin_percent: null };
  }
  const margin = sellingPrice - costPrice;
  const margin_percent = sellingPrice > 0
    ? (margin / sellingPrice) * 100
    : null;
  return { margin, margin_percent };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cost-engine.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Write failing tests for calculateOrderCost**

Add to `tests/cost-engine.test.ts`:

```typescript
import { calculateOrderCost } from '@/lib/cost-engine';

describe('calculateOrderCost', () => {
  it('calculates totals from order items with costs', () => {
    const items: OrderItemWithCost[] = [
      { menu_item_id: '1', quantity: 2, unit_price: 100, total_price: 200, cost_price: 35 },
      { menu_item_id: '2', quantity: 1, unit_price: 80, total_price: 80, cost_price: 50 },
    ];
    const result = calculateOrderCost(items);
    expect(result.totalRevenue).toBe(280);
    expect(result.totalCost).toBe(120); // (2*35) + (1*50)
    expect(result.totalProfit).toBe(160);
    expect(result.marginPercent).toBeCloseTo(57.14, 1);
  });

  it('skips items with null cost', () => {
    const items: OrderItemWithCost[] = [
      { menu_item_id: '1', quantity: 1, unit_price: 100, total_price: 100, cost_price: 35 },
      { menu_item_id: '2', quantity: 1, unit_price: 80, total_price: 80, cost_price: null },
    ];
    const result = calculateOrderCost(items);
    expect(result.totalRevenue).toBe(180);
    expect(result.totalCost).toBe(35);
    expect(result.totalProfit).toBe(145);
  });

  it('returns zeros for empty array', () => {
    const result = calculateOrderCost([]);
    expect(result.totalRevenue).toBe(0);
    expect(result.totalCost).toBe(0);
    expect(result.totalProfit).toBe(0);
    expect(result.marginPercent).toBe(0);
  });
});
```

- [ ] **Step 6: Implement calculateOrderCost**

Add to `src/lib/cost-engine.ts`:

```typescript
/**
 * Calculate aggregate cost/revenue/profit for an order's items.
 * Items with null cost_price contribute 0 to totalCost.
 */
export function calculateOrderCost(
  orderItems: OrderItemWithCost[],
): { totalCost: number; totalRevenue: number; totalProfit: number; marginPercent: number } {
  if (orderItems.length === 0) {
    return { totalCost: 0, totalRevenue: 0, totalProfit: 0, marginPercent: 0 };
  }

  let totalRevenue = 0;
  let totalCost = 0;

  for (const item of orderItems) {
    totalRevenue += item.total_price;
    if (item.cost_price !== null) {
      totalCost += item.quantity * item.cost_price;
    }
  }

  const totalProfit = totalRevenue - totalCost;
  const marginPercent = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  return { totalCost, totalRevenue, totalProfit, marginPercent };
}
```

- [ ] **Step 7: Run tests, verify pass**

Run: `npx vitest run tests/cost-engine.test.ts`
Expected: All tests PASS

- [ ] **Step 8: Write failing tests for ranking functions**

Add to `tests/cost-engine.test.ts`:

```typescript
import { rankItemsByProfitability, rankItemsByPopularity, identifyLowMarginItems } from '@/lib/cost-engine';

describe('rankItemsByProfitability', () => {
  it('sorts by margin_percent descending, nulls last', () => {
    const items: ItemWithCost[] = [
      { id: '1', name: 'A', category: 'c', base_price: 100, cost_price: 60, margin: 40, margin_percent: 40 },
      { id: '2', name: 'B', category: 'c', base_price: 100, cost_price: 20, margin: 80, margin_percent: 80 },
      { id: '3', name: 'C', category: 'c', base_price: 100, cost_price: null, margin: null, margin_percent: null },
    ];
    const ranked = rankItemsByProfitability(items);
    expect(ranked[0].id).toBe('2');
    expect(ranked[1].id).toBe('1');
    expect(ranked[2].id).toBe('3');
  });
});

describe('rankItemsByPopularity', () => {
  it('sorts by total_quantity descending', () => {
    const items: ItemWithStats[] = [
      { id: '1', name: 'A', category: 'c', base_price: 100, cost_price: 50, margin: 50, margin_percent: 50, total_orders: 5, total_quantity: 10, total_revenue: 1000 },
      { id: '2', name: 'B', category: 'c', base_price: 80, cost_price: 30, margin: 50, margin_percent: 62.5, total_orders: 20, total_quantity: 50, total_revenue: 4000 },
    ];
    const ranked = rankItemsByPopularity(items);
    expect(ranked[0].id).toBe('2');
    expect(ranked[1].id).toBe('1');
  });
});

describe('identifyLowMarginItems', () => {
  it('returns items below threshold', () => {
    const items: ItemWithCost[] = [
      { id: '1', name: 'A', category: 'c', base_price: 100, cost_price: 80, margin: 20, margin_percent: 20 },
      { id: '2', name: 'B', category: 'c', base_price: 100, cost_price: 30, margin: 70, margin_percent: 70 },
      { id: '3', name: 'C', category: 'c', base_price: 100, cost_price: null, margin: null, margin_percent: null },
    ];
    const low = identifyLowMarginItems(items, 40);
    expect(low).toHaveLength(1);
    expect(low[0].id).toBe('1');
  });
});
```

- [ ] **Step 9: Implement ranking functions**

Add to `src/lib/cost-engine.ts`:

```typescript
/**
 * Rank items by margin% descending. Null margins sort last.
 */
export function rankItemsByProfitability(items: ItemWithCost[]): ItemWithCost[] {
  return [...items].sort((a, b) => {
    if (a.margin_percent === null && b.margin_percent === null) return 0;
    if (a.margin_percent === null) return 1;
    if (b.margin_percent === null) return -1;
    return b.margin_percent - a.margin_percent;
  });
}

/**
 * Rank items by total_quantity descending.
 */
export function rankItemsByPopularity(items: ItemWithStats[]): ItemWithStats[] {
  return [...items].sort((a, b) => b.total_quantity - a.total_quantity);
}

/**
 * Return items with margin_percent below the given threshold.
 * Excludes items with null margin (no cost data).
 */
export function identifyLowMarginItems(items: ItemWithCost[], threshold: number): ItemWithCost[] {
  return items.filter(
    (item) => item.margin_percent !== null && item.margin_percent < threshold,
  );
}
```

- [ ] **Step 10: Run all tests, verify pass**

Run: `npx vitest run tests/cost-engine.test.ts`
Expected: All tests PASS

- [ ] **Step 11: Write failing tests for calculateBundleCost**

Add to `tests/cost-engine.test.ts`:

```typescript
import { calculateBundleCost } from '@/lib/cost-engine';
import type { BundleWithCost, SlotItemWithCost } from '@/types/cost';

describe('calculateBundleCost', () => {
  it('calculates total cost, revenue, margin for a valid bundle with costs', () => {
    const bundle: BundleWithCost = { id: 'b1', name: 'Combo A', base_price: 200, cost_price: 30 };
    const slotItems: SlotItemWithCost[] = [
      { menu_item_id: 'i1', cost_price: 20, quantity: 1 },
      { menu_item_id: 'i2', cost_price: 15, quantity: 2 },
    ];
    const result = calculateBundleCost(bundle, slotItems);
    expect(result.totalCost).toBe(80); // 30 + (1*20) + (2*15)
    expect(result.totalRevenue).toBe(200);
    expect(result.margin).toBe(120);
    expect(result.marginPercent).toBeCloseTo(60);
  });

  it('handles null bundle cost_price', () => {
    const bundle: BundleWithCost = { id: 'b1', name: 'Combo B', base_price: 150, cost_price: null };
    const slotItems: SlotItemWithCost[] = [
      { menu_item_id: 'i1', cost_price: 25, quantity: 1 },
    ];
    const result = calculateBundleCost(bundle, slotItems);
    expect(result.totalCost).toBe(25); // 0 + (1*25)
    expect(result.totalRevenue).toBe(150);
    expect(result.margin).toBe(125);
  });

  it('handles empty slot items', () => {
    const bundle: BundleWithCost = { id: 'b1', name: 'Combo C', base_price: 100, cost_price: 40 };
    const result = calculateBundleCost(bundle, []);
    expect(result.totalCost).toBe(40);
    expect(result.totalRevenue).toBe(100);
    expect(result.margin).toBe(60);
    expect(result.marginPercent).toBeCloseTo(60);
  });
});
```

- [ ] **Step 12: Implement calculateBundleCost**

Add to `src/lib/cost-engine.ts`:

```typescript
/**
 * Calculate the total cost, revenue, and margin for a bundle
 * given its selected slot items.
 */
export function calculateBundleCost(
  bundle: BundleWithCost,
  selectedSlotItems: SlotItemWithCost[],
): { totalCost: number; totalRevenue: number; margin: number; marginPercent: number } {
  const bundleRevenue = bundle.base_price;
  let totalCost = bundle.cost_price ?? 0;

  for (const item of selectedSlotItems) {
    if (item.cost_price !== null) {
      totalCost += item.quantity * item.cost_price;
    }
  }

  const margin = bundleRevenue - totalCost;
  const marginPercent = bundleRevenue > 0 ? (margin / bundleRevenue) * 100 : 0;
  return { totalCost, totalRevenue: bundleRevenue, margin, marginPercent };
}
```

- [ ] **Step 13: Run tests, verify pass**

Run: `npx vitest run tests/cost-engine.test.ts`
Expected: All tests PASS

- [ ] **Step 14: Commit**

```bash
git add src/lib/cost-engine.ts tests/cost-engine.test.ts
git commit -m "feat(cost): add cost engine with margin calculations, ranking, and bundle cost"
```

---

### Task 4: Cost Validation Schemas

**Files:**
- Modify: `src/lib/validation.ts`

- [ ] **Step 1: Add optional cost_price field to existing menu item schema**

In `src/lib/validation.ts`, find the existing menu item schema (e.g., `addMenuItemSchema` or `menuItemSchema`) and add an optional `cost_price` field:

```typescript
cost_price: z.number().min(0).nullable().optional(),
```

This allows the menu form (Task 10) to pass `cost_price` when creating or updating items.

- [ ] **Step 2: Add cost validation schemas**

Add to the end of `src/lib/validation.ts`:

```typescript
// ── Cost schemas ─────────────────────────────────────────────
export const updateItemCostSchema = z.object({
  itemId: z.string().uuid(),
  costPrice: z.number().min(0).nullable(),
});

export const updateVariationCostSchema = z.object({
  variationId: z.string().uuid(),
  costPrice: z.number().min(0).nullable(),
});

export const updateAddOnCostSchema = z.object({
  addOnId: z.string().uuid(),
  costPrice: z.number().min(0).nullable(),
});

export const bulkImportCostItemSchema = z.object({
  name: z.string().min(1),
  costPrice: z.number().min(0),
});

export const bulkImportCostsSchema = z.object({
  items: z.array(bulkImportCostItemSchema).min(1),
});
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/validation.ts
git commit -m "feat(validation): add cost_price to menu schema and cost tracking Zod schemas"
```

---

### Task 5: Cost Admin Server Actions

**Files:**
- Create: `src/actions/cost-admin.ts`
- Create: `tests/unit/actions/cost-admin.test.ts`

- [ ] **Step 1: Write failing tests for updateItemCost**

```typescript
// tests/unit/actions/cost-admin.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-guard', () => ({
  checkActionRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  requireAdmin: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

let callQueue: { data: any; error: any }[] = [];
const mockFrom = vi.fn(() => {
  const chain: any = {};
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'gte', 'lte', 'ilike', 'order', 'single', 'maybeSingle']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: any) => resolve(callQueue.shift() ?? { data: null, error: null });
  return chain;
});

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: new Proxy({}, {
    get(_, prop) {
      if (prop === 'from') return mockFrom;
      if (prop === 'rpc') return vi.fn().mockResolvedValue({ data: null, error: null });
      return undefined;
    },
  }),
}));

import { updateItemCost } from '@/actions/cost-admin';

describe('updateItemCost', () => {
  beforeEach(() => {
    callQueue = [];
    vi.clearAllMocks();
  });

  it('updates cost_price on a menu item', async () => {
    callQueue.push({ data: { id: 'item-1', cost_price: 35 }, error: null });
    const result = await updateItemCost({ itemId: 'item-1', costPrice: 35 });
    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('menu_items');
  });

  it('rejects invalid input', async () => {
    const result = await updateItemCost({ itemId: 'not-a-uuid', costPrice: -5 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid');
  });

  it('allows setting cost to null', async () => {
    callQueue.push({ data: { id: 'item-1', cost_price: null }, error: null });
    const result = await updateItemCost({ itemId: '11111111-1111-1111-1111-111111111111', costPrice: null });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/actions/cost-admin.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement cost admin actions**

```typescript
// src/actions/cost-admin.ts
'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAdmin, checkActionRateLimit } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import {
  updateItemCostSchema,
  updateVariationCostSchema,
  updateAddOnCostSchema,
  bulkImportCostsSchema,
} from '@/lib/validation';

type ActionResult = { success: boolean; error?: string; data?: any };
type BulkPreviewMatch = { name: string; menuItemId: string; menuItemName: string; costPrice: number };

export async function updateItemCost(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const parsed = updateItemCostSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const { itemId, costPrice } = parsed.data;
  const { data, error } = await (supabaseServer.from('menu_items') as any)
    .update({ cost_price: costPrice })
    .eq('id', itemId)
    .select()
    .single();

  if (error) return { success: false, error: 'Failed to update cost' };

  revalidateTag('menu-items');
  revalidatePath('/admin/menu');
  return { success: true, data };
}

export async function updateVariationCost(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const parsed = updateVariationCostSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const { variationId, costPrice } = parsed.data;
  const { data, error } = await (supabaseServer.from('variations') as any)
    .update({ cost_price: costPrice })
    .eq('id', variationId)
    .select()
    .single();

  if (error) return { success: false, error: 'Failed to update cost' };

  revalidateTag('menu-items');
  revalidatePath('/admin/menu');
  return { success: true, data };
}

export async function updateAddOnCost(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const parsed = updateAddOnCostSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const { addOnId, costPrice } = parsed.data;
  const { data, error } = await (supabaseServer.from('add_ons') as any)
    .update({ cost_price: costPrice })
    .eq('id', addOnId)
    .select()
    .single();

  if (error) return { success: false, error: 'Failed to update cost' };

  revalidateTag('menu-items');
  revalidatePath('/admin/menu');
  return { success: true, data };
}

/**
 * Preview bulk import — matches input names against menu items
 * and returns the matches + not-found list WITHOUT writing anything.
 */
export async function previewBulkImportCosts(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const parsed = bulkImportCostsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const { items } = parsed.data;

  // Fetch all menu items for matching
  const { data: menuItems, error: fetchError } = await (supabaseServer.from('menu_items') as any)
    .select('id, name');

  if (fetchError || !menuItems) return { success: false, error: 'Failed to fetch menu items' };

  const menuMap = new Map<string, { id: string; name: string }>();
  for (const mi of menuItems) {
    menuMap.set(mi.name.toLowerCase().trim(), { id: mi.id, name: mi.name });
  }

  const matched: { name: string; menuItemId: string; menuItemName: string; costPrice: number }[] = [];
  const notFound: string[] = [];

  for (const item of items) {
    const normalized = item.name.toLowerCase().trim();
    const match = menuMap.get(normalized);

    if (!match) {
      notFound.push(item.name);
    } else {
      matched.push({ name: item.name, menuItemId: match.id, menuItemName: match.name, costPrice: item.costPrice });
    }
  }

  return { success: true, data: { matched, notFound } };
}

/**
 * Apply bulk import — actually writes cost_price for the provided matched items.
 * Should be called after previewBulkImportCosts to confirm.
 */
export async function applyBulkImportCosts(input: { items: { menuItemId: string; costPrice: number }[] }): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  if (!input.items || input.items.length === 0) return { success: false, error: 'No items to import' };

  let updated = 0;

  for (const item of input.items) {
    const { error: updateError } = await (supabaseServer.from('menu_items') as any)
      .update({ cost_price: item.costPrice })
      .eq('id', item.menuItemId);

    if (!updateError) updated++;
  }

  revalidateTag('menu-items');
  revalidatePath('/admin/menu');
  return { success: true, data: { updated } };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run tests/unit/actions/cost-admin.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/cost-admin.ts tests/unit/actions/cost-admin.test.ts
git commit -m "feat(cost): add cost admin server actions with tests"
```

---

### Task 6: Analytics Types

**Files:**
- Create: `src/types/analytics.ts`

- [ ] **Step 1: Create analytics types**

```typescript
// src/types/analytics.ts

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

- [ ] **Step 2: Commit**

```bash
git add src/types/analytics.ts
git commit -m "feat(types): add analytics types"
```

---

### Task 7: Analytics Engine — Pure Business Logic

**Files:**
- Create: `src/lib/analytics-engine.ts`
- Create: `tests/analytics-engine.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/analytics-engine.test.ts
import { describe, it, expect } from 'vitest';
import {
  calculateTrends,
  getTopPerformers,
  getCategoryBreakdown,
  calculateAverageOrderValue,
} from '@/lib/analytics-engine';
import type { ItemPerformanceRow } from '@/types/analytics';

const makeItem = (overrides: Partial<ItemPerformanceRow> = {}): ItemPerformanceRow => ({
  menu_item_id: 'id-1',
  item_name: 'Test Item',
  category: 'shakes',
  sell_price: 100,
  cost_price: 35,
  total_orders: 10,
  total_quantity: 20,
  total_revenue: 2000,
  total_cost: 700,
  gross_profit: 1300,
  margin_percent: 65,
  ...overrides,
});

describe('calculateTrends', () => {
  it('calculates growth from 100 to 120 as 20%', () => {
    const result = calculateTrends(120, 100);
    expect(result.growth_percent).toBeCloseTo(20);
    expect(result.direction).toBe('up');
  });

  it('calculates decline from 100 to 80 as -20%', () => {
    const result = calculateTrends(80, 100);
    expect(result.growth_percent).toBeCloseTo(-20);
    expect(result.direction).toBe('down');
  });

  it('returns flat for equal values', () => {
    const result = calculateTrends(100, 100);
    expect(result.growth_percent).toBe(0);
    expect(result.direction).toBe('flat');
  });

  it('handles zero previous (infinite growth)', () => {
    const result = calculateTrends(100, 0);
    expect(result.growth_percent).toBe(100);
    expect(result.direction).toBe('up');
  });
});

describe('getTopPerformers', () => {
  it('returns top N by revenue', () => {
    const items = [
      makeItem({ menu_item_id: '1', total_revenue: 500 }),
      makeItem({ menu_item_id: '2', total_revenue: 2000 }),
      makeItem({ menu_item_id: '3', total_revenue: 1000 }),
    ];
    const top = getTopPerformers(items, 'revenue', 2);
    expect(top).toHaveLength(2);
    expect(top[0].menu_item_id).toBe('2');
    expect(top[1].menu_item_id).toBe('3');
  });

  it('returns top N by margin', () => {
    const items = [
      makeItem({ menu_item_id: '1', margin_percent: 80 }),
      makeItem({ menu_item_id: '2', margin_percent: 30 }),
      makeItem({ menu_item_id: '3', margin_percent: null }),
    ];
    const top = getTopPerformers(items, 'margin', 2);
    expect(top).toHaveLength(2);
    expect(top[0].menu_item_id).toBe('1');
  });
});

describe('getCategoryBreakdown', () => {
  it('groups items by category', () => {
    const items = [
      makeItem({ category: 'shakes', total_revenue: 1000, gross_profit: 600, total_quantity: 10, margin_percent: 60 }),
      makeItem({ category: 'shakes', total_revenue: 500, gross_profit: 300, total_quantity: 5, margin_percent: 60 }),
      makeItem({ category: 'snacks', total_revenue: 200, gross_profit: 100, total_quantity: 8, margin_percent: 50 }),
    ];
    const breakdown = getCategoryBreakdown(items);
    expect(breakdown).toHaveLength(2);

    const shakes = breakdown.find(b => b.category === 'shakes')!;
    expect(shakes.total_revenue).toBe(1500);
    expect(shakes.total_profit).toBe(900);
    expect(shakes.total_quantity).toBe(15);
    expect(shakes.item_count).toBe(2);
  });
});

describe('calculateAverageOrderValue', () => {
  it('calculates average', () => {
    const orders = [{ total: 100 }, { total: 200 }, { total: 300 }];
    expect(calculateAverageOrderValue(orders)).toBe(200);
  });

  it('returns 0 for empty array', () => {
    expect(calculateAverageOrderValue([])).toBe(0);
  });
});

describe('aggregateItemPerformance', () => {
  it('enriches raw DB rows with gross_profit and margin_percent', () => {
    const { aggregateItemPerformance } = require('@/lib/analytics-engine');
    const rows = [
      { menu_item_id: '1', item_name: 'Shake A', category: 'shakes', sell_price: 100, cost_price: 40, total_orders: 5, total_quantity: 10, total_revenue: 1000, total_cost: 400, gross_profit: null, margin_percent: null },
      { menu_item_id: '2', item_name: 'Shake B', category: 'shakes', sell_price: 80, cost_price: null, total_orders: 3, total_quantity: 6, total_revenue: 480, total_cost: null, gross_profit: null, margin_percent: null },
    ];
    const enriched = aggregateItemPerformance(rows);
    expect(enriched[0].gross_profit).toBe(600);
    expect(enriched[0].margin_percent).toBeCloseTo(60);
    expect(enriched[1].gross_profit).toBeNull();
    expect(enriched[1].margin_percent).toBeNull();
  });

  it('returns empty array for empty input', () => {
    const { aggregateItemPerformance } = require('@/lib/analytics-engine');
    expect(aggregateItemPerformance([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/analytics-engine.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement analytics engine**

```typescript
// src/lib/analytics-engine.ts
// Pure business logic for analytics — no I/O, no DB, no network.

import type {
  ItemPerformanceRow,
  CategoryBreakdown,
  TrendData,
} from '@/types/analytics';

/**
 * Calculate growth trend between two values.
 */
export function calculateTrends(current: number, previous: number): TrendData {
  if (previous === 0) {
    return {
      current,
      previous,
      growth_percent: current > 0 ? 100 : 0,
      direction: current > 0 ? 'up' : 'flat',
    };
  }

  const growth_percent = ((current - previous) / previous) * 100;
  const direction = growth_percent > 0 ? 'up' : growth_percent < 0 ? 'down' : 'flat';

  return { current, previous, growth_percent, direction };
}

/**
 * Return top N items sorted by the given metric.
 */
export function getTopPerformers(
  items: ItemPerformanceRow[],
  metric: 'revenue' | 'profit' | 'quantity' | 'margin',
  limit: number,
): ItemPerformanceRow[] {
  const metricMap: Record<string, (item: ItemPerformanceRow) => number | null> = {
    revenue: (i) => i.total_revenue,
    profit: (i) => i.gross_profit,
    quantity: (i) => i.total_quantity,
    margin: (i) => i.margin_percent,
  };

  const getValue = metricMap[metric];

  return [...items]
    .sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return vb - va;
    })
    .slice(0, limit);
}

/**
 * Group items by category with aggregated stats.
 */
export function getCategoryBreakdown(items: ItemPerformanceRow[]): CategoryBreakdown[] {
  const map = new Map<string, {
    total_revenue: number;
    total_profit: number;
    total_quantity: number;
    margin_sum: number;
    margin_count: number;
    item_count: number;
  }>();

  for (const item of items) {
    const existing = map.get(item.category) ?? {
      total_revenue: 0,
      total_profit: 0,
      total_quantity: 0,
      margin_sum: 0,
      margin_count: 0,
      item_count: 0,
    };

    existing.total_revenue += item.total_revenue;
    existing.total_profit += item.gross_profit ?? 0;
    existing.total_quantity += item.total_quantity;
    if (item.margin_percent !== null) {
      existing.margin_sum += item.margin_percent;
      existing.margin_count++;
    }
    existing.item_count++;

    map.set(item.category, existing);
  }

  return Array.from(map.entries()).map(([category, stats]) => ({
    category,
    total_revenue: stats.total_revenue,
    total_profit: stats.total_profit > 0 ? stats.total_profit : null,
    total_quantity: stats.total_quantity,
    avg_margin_percent: stats.margin_count > 0
      ? stats.margin_sum / stats.margin_count
      : null,
    item_count: stats.item_count,
  }));
}

/**
 * Calculate average order value.
 */
export function calculateAverageOrderValue(orders: { total: number }[]): number {
  if (orders.length === 0) return 0;
  const sum = orders.reduce((acc, o) => acc + o.total, 0);
  return sum / orders.length;
}

/**
 * Enrich raw DB performance rows with computed gross_profit and margin_percent.
 * Takes rows that may have null gross_profit/margin_percent and fills them in
 * based on total_revenue and total_cost.
 */
export function aggregateItemPerformance(rows: ItemPerformanceRow[]): ItemPerformanceRow[] {
  return rows.map((row) => {
    const gross_profit = row.total_cost !== null ? row.total_revenue - row.total_cost : null;
    const margin_percent =
      row.total_cost !== null && row.total_revenue > 0
        ? ((row.total_revenue - row.total_cost) / row.total_revenue) * 100
        : null;
    return { ...row, gross_profit, margin_percent };
  });
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run tests/analytics-engine.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics-engine.ts tests/analytics-engine.test.ts
git commit -m "feat(analytics): add analytics engine with trends and rankings"
```

---

### Task 8: Analytics Server Actions

**Files:**
- Create: `src/actions/analytics.ts`
- Create: `tests/unit/actions/analytics.test.ts`

- [ ] **Step 1: Implement analytics server actions**

```typescript
// src/actions/analytics.ts
'use server';

import { requireAdmin } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import type { ItemPerformanceRow, PerformanceFilters, DashboardSummary, DateRange } from '@/types/analytics';
import { calculateTrends } from '@/lib/analytics-engine';

type ActionResult = { success: boolean; error?: string; data?: any };

export async function getItemPerformance(filters: PerformanceFilters = {}): Promise<ActionResult> {
  await requireAdmin();

  // Query completed orders with optional filters
  let query = (supabaseServer.from('order_items') as any)
    .select(`
      menu_item_id,
      quantity,
      total_price,
      cost_price,
      menu_item_name,
      orders!inner(status, created_at),
      menu_items!inner(name, category, base_price, cost_price)
    `)
    .eq('orders.status', 'completed');

  if (filters.date_from) {
    query = query.gte('orders.created_at', filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte('orders.created_at', filters.date_to);
  }

  const { data, error } = await query;

  if (error) return { success: false, error: 'Failed to fetch performance data' };

  // Aggregate in-memory (since we may not have the materialized view refreshed)
  const itemMap = new Map<string, ItemPerformanceRow>();

  for (const row of (data || [])) {
    if (!row.menu_item_id) continue;
    const mi = row.menu_items;
    const existing = itemMap.get(row.menu_item_id);

    if (existing) {
      existing.total_orders++;
      existing.total_quantity += row.quantity;
      existing.total_revenue += Number(row.total_price);
      if (row.cost_price !== null) {
        existing.total_cost = (existing.total_cost ?? 0) + row.quantity * Number(row.cost_price);
      }
    } else {
      itemMap.set(row.menu_item_id, {
        menu_item_id: row.menu_item_id,
        item_name: mi?.name ?? row.menu_item_name,
        category: mi?.category ?? '',
        sell_price: Number(mi?.base_price ?? 0),
        cost_price: mi?.cost_price !== null ? Number(mi.cost_price) : null,
        total_orders: 1,
        total_quantity: row.quantity,
        total_revenue: Number(row.total_price),
        total_cost: row.cost_price !== null ? row.quantity * Number(row.cost_price) : null,
        gross_profit: null,
        margin_percent: null,
      });
    }
  }

  // Compute derived fields
  const items: ItemPerformanceRow[] = Array.from(itemMap.values()).map((item) => {
    const gross_profit = item.total_cost !== null ? item.total_revenue - item.total_cost : null;
    const margin_percent = item.total_cost !== null && item.total_revenue > 0
      ? ((item.total_revenue - item.total_cost) / item.total_revenue) * 100
      : null;
    return { ...item, gross_profit, margin_percent };
  });

  // Apply search filter
  let filtered = items;
  if (filters.search) {
    const search = filters.search.toLowerCase();
    filtered = filtered.filter((i) => i.item_name.toLowerCase().includes(search));
  }
  if (filters.category) {
    filtered = filtered.filter((i) => i.category === filters.category);
  }

  // Sort
  const sortBy = filters.sort_by ?? 'revenue';
  const sortDir = filters.sort_dir ?? 'desc';
  const sortMap: Record<string, (i: ItemPerformanceRow) => number | null> = {
    revenue: (i) => i.total_revenue,
    profit: (i) => i.gross_profit,
    quantity: (i) => i.total_quantity,
    margin: (i) => i.margin_percent,
  };
  const getValue = sortMap[sortBy];
  filtered.sort((a, b) => {
    const va = getValue(a) ?? (sortDir === 'desc' ? -Infinity : Infinity);
    const vb = getValue(b) ?? (sortDir === 'desc' ? -Infinity : Infinity);
    return sortDir === 'desc' ? (vb as number) - (va as number) : (va as number) - (vb as number);
  });

  if (filters.limit) {
    filtered = filtered.slice(0, filters.limit);
  }

  return { success: true, data: filtered };
}

export async function getDashboardSummary(period: DateRange): Promise<ActionResult> {
  await requireAdmin();

  // Current period orders
  const { data: currentOrders, error: currentError } = await (supabaseServer.from('orders') as any)
    .select('id, total, created_at')
    .eq('status', 'completed')
    .gte('created_at', period.from)
    .lte('created_at', period.to);

  if (currentError) return { success: false, error: 'Failed to fetch orders' };

  // Calculate previous period (same duration, shifted back)
  const fromDate = new Date(period.from);
  const toDate = new Date(period.to);
  const durationMs = toDate.getTime() - fromDate.getTime();
  const prevFrom = new Date(fromDate.getTime() - durationMs).toISOString();
  const prevTo = new Date(fromDate.getTime()).toISOString();

  const { data: prevOrders } = await (supabaseServer.from('orders') as any)
    .select('id, total')
    .eq('status', 'completed')
    .gte('created_at', prevFrom)
    .lte('created_at', prevTo);

  const currentRevenue = (currentOrders || []).reduce((sum: number, o: any) => sum + Number(o.total), 0);
  const prevRevenue = (prevOrders || []).reduce((sum: number, o: any) => sum + Number(o.total), 0);

  // Get top item
  const perfResult = await getItemPerformance({
    date_from: period.from,
    date_to: period.to,
    sort_by: 'revenue',
    sort_dir: 'desc',
    limit: 1,
  });

  const topItem = perfResult.success && perfResult.data?.length > 0
    ? { name: perfResult.data[0].item_name, revenue: perfResult.data[0].total_revenue }
    : null;

  // Avg margin
  const allPerf = await getItemPerformance({
    date_from: period.from,
    date_to: period.to,
  });
  const itemsWithMargin = (allPerf.data || []).filter((i: ItemPerformanceRow) => i.margin_percent !== null);
  const avgMargin = itemsWithMargin.length > 0
    ? itemsWithMargin.reduce((sum: number, i: ItemPerformanceRow) => sum + (i.margin_percent ?? 0), 0) / itemsWithMargin.length
    : null;

  const summary: DashboardSummary = {
    total_revenue: currentRevenue,
    total_orders: (currentOrders || []).length,
    avg_margin_percent: avgMargin,
    top_item: topItem,
    trends: {
      revenue: calculateTrends(currentRevenue, prevRevenue),
      orders: calculateTrends((currentOrders || []).length, (prevOrders || []).length),
      margin: calculateTrends(avgMargin ?? 0, 0), // simplified for now
    },
  };

  return { success: true, data: summary };
}

export async function getCategoryPerformance(filters: PerformanceFilters = {}): Promise<ActionResult> {
  await requireAdmin();

  const itemsResult = await getItemPerformance(filters);
  if (!itemsResult.success) return itemsResult;

  const { getCategoryBreakdown } = await import('@/lib/analytics-engine');
  const breakdown = getCategoryBreakdown(itemsResult.data);

  return { success: true, data: breakdown };
}

export async function getTopItems(
  filters: PerformanceFilters = {},
  metric: 'revenue' | 'profit' | 'quantity' | 'margin' = 'revenue',
  limit: number = 10,
): Promise<ActionResult> {
  await requireAdmin();

  const itemsResult = await getItemPerformance(filters);
  if (!itemsResult.success) return itemsResult;

  const { getTopPerformers } = await import('@/lib/analytics-engine');
  const top = getTopPerformers(itemsResult.data, metric, limit);

  return { success: true, data: top };
}

export async function refreshPerformanceView(): Promise<ActionResult> {
  await requireAdmin();

  // Refresh item performance view
  const { error } = await (supabaseServer as any).rpc('refresh_item_performance_mv');

  if (error) {
    // Fallback: try raw SQL
    const { error: rawError } = await (supabaseServer as any).rpc('exec_sql', {
      query: 'REFRESH MATERIALIZED VIEW CONCURRENTLY item_performance_mv',
    });
    if (rawError) return { success: false, error: 'Failed to refresh item performance view' };
  }

  // Refresh bundle performance view
  const { error: bundleError } = await (supabaseServer as any).rpc('refresh_bundle_performance_mv');

  if (bundleError) {
    const { error: rawBundleError } = await (supabaseServer as any).rpc('exec_sql', {
      query: 'REFRESH MATERIALIZED VIEW CONCURRENTLY bundle_performance_mv',
    });
    if (rawBundleError) return { success: false, error: 'Failed to refresh bundle performance view' };
  }

  return { success: true };
}
```

- [ ] **Step 2: Write analytics action tests**

```typescript
// tests/unit/actions/analytics.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-guard', () => ({
  requireAdmin: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

let callQueue: { data: any; error: any }[] = [];
const mockFrom = vi.fn(() => {
  const chain: any = {};
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'gte', 'lte', 'ilike', 'order', 'single', 'maybeSingle']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: any) => resolve(callQueue.shift() ?? { data: null, error: null });
  return chain;
});

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: new Proxy({}, {
    get(_, prop) {
      if (prop === 'from') return mockFrom;
      if (prop === 'rpc') return vi.fn().mockResolvedValue({ data: null, error: null });
      return undefined;
    },
  }),
}));

import { getItemPerformance, refreshPerformanceView } from '@/actions/analytics';

describe('getItemPerformance', () => {
  beforeEach(() => {
    callQueue = [];
    vi.clearAllMocks();
  });

  it('returns aggregated performance data', async () => {
    callQueue.push({
      data: [
        { menu_item_id: 'i1', quantity: 2, total_price: 200, cost_price: 30, menu_item_name: 'Shake A', menu_items: { name: 'Shake A', category: 'shakes', base_price: 100, cost_price: 30 }, orders: { status: 'completed', created_at: '2026-03-01' } },
      ],
      error: null,
    });
    const result = await getItemPerformance({});
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].item_name).toBe('Shake A');
  });

  it('returns empty data when no orders', async () => {
    callQueue.push({ data: [], error: null });
    const result = await getItemPerformance({});
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(0);
  });
});

describe('refreshPerformanceView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success when rpc succeeds', async () => {
    const result = await refreshPerformanceView();
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests, verify pass**

Run: `npx vitest run tests/unit/actions/analytics.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/actions/analytics.ts tests/unit/actions/analytics.test.ts
git commit -m "feat(analytics): add analytics server actions with category/top-items and tests"
```

---

### Task 9: Snapshot Cost on Order Creation

**Files:**
- Modify: `app/api/orders/route.ts` — Add cost_price snapshot when creating order items

- [ ] **Step 1: Read the current order creation route to understand the insertion logic**

Read: `app/api/orders/route.ts` — find where `order_items` are inserted

- [ ] **Step 2: Add cost_price to the order_items insertion**

In the section where order_items are built from the cart, add a lookup for `cost_price` from the menu item and include it in the insert:

```typescript
// When building order_items from cart, for each item:
// Add cost_price from the menu item lookup
cost_price: menuItem?.cost_price ?? null,
```

This ensures every order_item has a snapshot of the cost at order time.

- [ ] **Step 3: Update existing order tests to verify cost_price is snapshotted**

Find existing order creation tests (e.g., in `tests/integration/` or `tests/unit/`) and add assertions that verify `cost_price` is included in the order_items insert payload. If no order tests exist yet, add a focused test:

```typescript
// In the relevant order test file:
it('snapshots cost_price from menu item onto order_item', async () => {
  // Setup: create a menu item with cost_price set
  // Action: create an order referencing that menu item
  // Assert: the resulting order_item row includes the correct cost_price
});
```

- [ ] **Step 4: Commit**

```bash
git add app/api/orders/route.ts
git commit -m "feat(cost): snapshot cost_price on order_items at order creation"
```

---

### Task 10: Cost Columns in Menu Admin Page

**Files:**
- Modify: `app/admin/menu/MenuContent.tsx` — Add cost/margin columns to menu item list
- Modify: `src/components/admin/MenuItemForm.tsx` — Add cost fields to the form

- [ ] **Step 1: Read MenuContent.tsx to understand the current item list structure**

Read: `app/admin/menu/MenuContent.tsx`

- [ ] **Step 2: Add Cost and Margin columns to the menu item list**

In the item list/table, add two new columns after the price column:
- "Cost" — shows `cost_price` or "—" if null
- "Margin" — shows computed margin% with color coding:
  - Green text for >60%
  - Yellow/amber text for 40-60%
  - Red text for <40%
  - Gray "—" for no cost data

Use `calculateItemMargin` from `@/lib/cost-engine` for the computation.

- [ ] **Step 3: Add cost fields to MenuItemForm**

In `src/components/admin/MenuItemForm.tsx`:
- Add a `costPrice` state field (nullable number as string)
- Add a "Cost Price" input field after the base_price field
- In the variations section, add a `cost_price` field per variation draft
- In the add-ons section, add a `cost_price` field per add-on draft
- Wire the cost fields to the `addMenuItem` / `updateMenuItem` actions

- [ ] **Step 4: Update menu actions to accept cost fields**

Modify `src/actions/menu.ts` to include `cost_price` in the `addMenuItem` and `updateMenuItem` payloads, and pass through to the Supabase insert/update. The `cost_price` field was already added as optional to the menu item schema in Task 4 (Step 1), so the form can now pass it through validation.

- [ ] **Step 5: Test manually — check the admin menu page shows cost/margin columns**

Run dev server and verify:
- Menu items show cost and margin columns
- Editing a menu item shows cost fields for item, variations, add-ons
- Saving a cost value persists and displays correctly

- [ ] **Step 6: Commit**

```bash
git add app/admin/menu/MenuContent.tsx src/components/admin/MenuItemForm.tsx src/actions/menu.ts
git commit -m "feat(cost): add cost/margin columns to menu admin page and form"
```

---

### Task 11: Bulk Import Costs UI

**Files:**
- Create: `src/components/admin/BulkCostImport.tsx`
- Modify: `app/admin/menu/MenuContent.tsx` — Add import button

- [ ] **Step 1: Create the BulkCostImport modal component**

```typescript
// src/components/admin/BulkCostImport.tsx
'use client';

import { useState } from 'react';
import { Loader2, Upload, X, Check, AlertTriangle, Eye } from 'lucide-react';
import { previewBulkImportCosts, applyBulkImportCosts } from '@/actions/cost-admin';

interface BulkCostImportProps {
  onClose: () => void;
}

interface CostEntry {
  name: string;
  costPrice: number;
}

interface PreviewMatch {
  name: string;
  menuItemId: string;
  menuItemName: string;
  costPrice: number;
}

type Step = 'input' | 'preview' | 'done';

export default function BulkCostImport({ onClose }: BulkCostImportProps) {
  const [entries, setEntries] = useState<CostEntry[]>([]);
  const [step, setStep] = useState<Step>('input');
  const [submitting, setSubmitting] = useState(false);
  const [matched, setMatched] = useState<PreviewMatch[]>([]);
  const [notFound, setNotFound] = useState<string[]>([]);
  const [updatedCount, setUpdatedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handlePaste = (text: string) => {
    // Parse tab-separated or comma-separated: "Name\tCost" per line
    const lines = text.trim().split('\n');
    const parsed: CostEntry[] = [];
    for (const line of lines) {
      const parts = line.split(/[\t,]/).map((s) => s.trim());
      if (parts.length >= 2) {
        const name = parts[0];
        const cost = parseFloat(parts[1]);
        if (name && !isNaN(cost) && cost >= 0) {
          parsed.push({ name, costPrice: Math.round(cost * 100) / 100 });
        }
      }
    }
    setEntries(parsed);
  };

  const handlePreview = async () => {
    if (entries.length === 0) return;
    setSubmitting(true);
    setError(null);

    const res = await previewBulkImportCosts({ items: entries });
    if (res.success) {
      setMatched(res.data.matched);
      setNotFound(res.data.notFound);
      setStep('preview');
    } else {
      setError(res.error ?? 'Preview failed');
    }
    setSubmitting(false);
  };

  const handleApply = async () => {
    if (matched.length === 0) return;
    setSubmitting(true);
    setError(null);

    const res = await applyBulkImportCosts({
      items: matched.map((m) => ({ menuItemId: m.menuItemId, costPrice: m.costPrice })),
    });
    if (res.success) {
      setUpdatedCount(res.data.updated);
      setStep('done');
    } else {
      setError(res.error ?? 'Import failed');
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Bulk Import Costs</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 'input' && (
          <>
            <p className="text-sm text-gray-600 mb-3">
              Paste tab-separated data (Item Name → Cost) from your spreadsheet.
              One item per line.
            </p>
            <textarea
              className="w-full h-40 border rounded-lg p-3 text-sm font-mono"
              placeholder="BELGIAN FRIES&#9;36.58&#10;CROSSTRAX FRIES&#9;39.68"
              onChange={(e) => handlePaste(e.target.value)}
            />

            {entries.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium mb-2">{entries.length} items parsed:</p>
                <div className="max-h-40 overflow-y-auto border rounded p-2 text-sm">
                  {entries.map((e, i) => (
                    <div key={i} className="flex justify-between py-0.5">
                      <span>{e.name}</span>
                      <span className="text-gray-500">₱{e.costPrice.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-red-600 text-sm mt-2">{error}</p>}

            <div className="flex gap-2 mt-4">
              <button
                onClick={handlePreview}
                disabled={entries.length === 0 || submitting}
                className="flex-1 bg-black text-white rounded-lg py-2 px-4 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                Preview Matches
              </button>
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                Cancel
              </button>
            </div>
          </>
        )}

        {step === 'preview' && (
          <>
            {matched.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center gap-2 text-green-700 mb-2">
                  <Check className="w-4 h-4" />
                  <span className="text-sm font-medium">{matched.length} items matched:</span>
                </div>
                <div className="max-h-40 overflow-y-auto border rounded p-2 text-sm">
                  {matched.map((m, i) => (
                    <div key={i} className="flex justify-between py-0.5">
                      <span>{m.menuItemName}</span>
                      <span className="text-gray-500">₱{m.costPrice.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {notFound.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center gap-2 text-amber-700 mb-1">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-medium">{notFound.length} items not matched:</span>
                </div>
                <div className="max-h-32 overflow-y-auto border rounded p-2 text-sm text-gray-600">
                  {notFound.map((name, i) => (
                    <div key={i}>{name}</div>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-red-600 text-sm mt-2">{error}</p>}

            <div className="flex gap-2 mt-4">
              <button
                onClick={handleApply}
                disabled={matched.length === 0 || submitting}
                className="flex-1 bg-black text-white rounded-lg py-2 px-4 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Apply {matched.length} Updates
              </button>
              <button onClick={() => setStep('input')} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                Back
              </button>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <div className="flex items-center gap-2 text-green-700 mb-3">
              <Check className="w-5 h-5" />
              <span className="font-medium">{updatedCount} items updated</span>
            </div>

            <button
              onClick={onClose}
              className="mt-4 w-full bg-black text-white rounded-lg py-2 px-4 text-sm font-medium"
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add "Bulk Import" button to MenuContent.tsx**

Add a state `showBulkImport` and render `<BulkCostImport />` when true. Add the button near the top of the page next to the "Add Item" button.

- [ ] **Step 3: Test manually**

Run dev server, go to `/admin/menu`, click "Bulk Import Costs", paste spreadsheet data, verify matching and import works.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/BulkCostImport.tsx app/admin/menu/MenuContent.tsx
git commit -m "feat(cost): add bulk cost import modal to menu admin"
```

---

### Task 12: Analytics Admin Page

**Files:**
- Create: `app/admin/analytics/page.tsx`
- Create: `src/components/admin/AnalyticsDashboard.tsx`
- Create: `src/components/admin/AnalyticsItemTable.tsx`
- Create: `src/components/admin/AnalyticsCategoryChart.tsx`
- Modify: `src/components/admin/Sidebar.tsx` — Add Analytics nav item

- [ ] **Step 1: Add Analytics to sidebar navigation**

In `src/components/admin/Sidebar.tsx`, add to `navItems` array:

```typescript
{ label: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
```

Import `BarChart3` from `lucide-react`.

- [ ] **Step 2: Create the Analytics admin page (SSR)**

```typescript
// app/admin/analytics/page.tsx
import { requireAdmin } from '@/lib/admin-guard';
import AnalyticsDashboard from '@/components/admin/AnalyticsDashboard';

export default async function AnalyticsPage() {
  await requireAdmin();
  return <AnalyticsDashboard />;
}
```

- [ ] **Step 3: Create AnalyticsDashboard component**

```typescript
// src/components/admin/AnalyticsDashboard.tsx
'use client';

import { useState, useEffect } from 'react';
import { Loader2, TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react';
import { getDashboardSummary, getItemPerformance, refreshPerformanceView } from '@/actions/analytics';
import AnalyticsItemTable from './AnalyticsItemTable';
import type { DashboardSummary, ItemPerformanceRow, PerformanceFilters } from '@/types/analytics';

type PeriodKey = 'today' | '7d' | '30d';

function getPeriodRange(key: PeriodKey): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  const from = new Date(now);

  switch (key) {
    case 'today':
      from.setHours(0, 0, 0, 0);
      break;
    case '7d':
      from.setDate(from.getDate() - 7);
      break;
    case '30d':
      from.setDate(from.getDate() - 30);
      break;
  }

  return { from: from.toISOString(), to };
}

function TrendIcon({ direction }: { direction: 'up' | 'down' | 'flat' }) {
  if (direction === 'up') return <TrendingUp className="w-4 h-4 text-green-600" />;
  if (direction === 'down') return <TrendingDown className="w-4 h-4 text-red-600" />;
  return <Minus className="w-4 h-4 text-gray-400" />;
}

export default function AnalyticsDashboard() {
  const [period, setPeriod] = useState<PeriodKey>('30d');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [items, setItems] = useState<ItemPerformanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const range = getPeriodRange(period);

    const [summaryRes, itemsRes] = await Promise.all([
      getDashboardSummary(range),
      getItemPerformance({ date_from: range.from, date_to: range.to }),
    ]);

    if (summaryRes.success) setSummary(summaryRes.data);
    if (itemsRes.success) setItems(itemsRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [period]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshPerformanceView();
    await fetchData();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 rounded-lg p-1">
            {(['today', '7d', '30d'] as PeriodKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  period === key ? 'bg-white shadow-sm font-medium' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {key === 'today' ? 'Today' : key === '7d' ? '7 Days' : '30 Days'}
              </button>
            ))}
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border p-4">
            <p className="text-sm text-gray-500">Revenue</p>
            <p className="text-2xl font-bold mt-1">₱{summary.total_revenue.toLocaleString()}</p>
            <div className="flex items-center gap-1 mt-1">
              <TrendIcon direction={summary.trends.revenue.direction} />
              <span className="text-xs text-gray-500">
                {Math.abs(summary.trends.revenue.growth_percent).toFixed(0)}%
              </span>
            </div>
          </div>

          <div className="bg-white rounded-xl border p-4">
            <p className="text-sm text-gray-500">Orders</p>
            <p className="text-2xl font-bold mt-1">{summary.total_orders}</p>
            <div className="flex items-center gap-1 mt-1">
              <TrendIcon direction={summary.trends.orders.direction} />
              <span className="text-xs text-gray-500">
                {Math.abs(summary.trends.orders.growth_percent).toFixed(0)}%
              </span>
            </div>
          </div>

          <div className="bg-white rounded-xl border p-4">
            <p className="text-sm text-gray-500">Avg Margin</p>
            <p className="text-2xl font-bold mt-1">
              {summary.avg_margin_percent !== null
                ? `${summary.avg_margin_percent.toFixed(1)}%`
                : '—'}
            </p>
          </div>

          <div className="bg-white rounded-xl border p-4">
            <p className="text-sm text-gray-500">Top Item</p>
            <p className="text-lg font-bold mt-1 truncate">
              {summary.top_item?.name ?? '—'}
            </p>
            {summary.top_item && (
              <p className="text-xs text-gray-500">₱{summary.top_item.revenue.toLocaleString()}</p>
            )}
          </div>
        </div>
      )}

      {/* Item Performance Table */}
      <AnalyticsItemTable items={items} />
    </div>
  );
}
```

- [ ] **Step 4: Create AnalyticsItemTable component**

```typescript
// src/components/admin/AnalyticsItemTable.tsx
'use client';

import { useState, useMemo } from 'react';
import { Search, ArrowUpDown } from 'lucide-react';
import type { ItemPerformanceRow } from '@/types/analytics';

interface AnalyticsItemTableProps {
  items: ItemPerformanceRow[];
}

function MarginBadge({ percent }: { percent: number | null }) {
  if (percent === null) return <span className="text-gray-400">—</span>;
  const color =
    percent > 60 ? 'text-green-700 bg-green-50' :
    percent > 40 ? 'text-amber-700 bg-amber-50' :
    'text-red-700 bg-red-50';
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {percent.toFixed(1)}%
    </span>
  );
}

type SortKey = 'item_name' | 'total_revenue' | 'total_quantity' | 'margin_percent' | 'gross_profit';

export default function AnalyticsItemTable({ items }: AnalyticsItemTableProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('total_revenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const filtered = useMemo(() => {
    let result = items;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter((i) => i.item_name.toLowerCase().includes(s));
    }
    return [...result].sort((a, b) => {
      const va = (a as any)[sortKey] ?? -Infinity;
      const vb = (b as any)[sortKey] ?? -Infinity;
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }, [items, search, sortKey, sortDir]);

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <th
      className="px-3 py-2 text-left text-xs font-medium text-gray-500 cursor-pointer hover:text-gray-700 select-none"
      onClick={() => toggleSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className="w-3 h-3" />
      </div>
    </th>
  );

  return (
    <div className="bg-white rounded-xl border">
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm outline-none flex-1"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <SortHeader label="Item" field="item_name" />
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Category</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Sell</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Cost</th>
              <SortHeader label="Margin" field="margin_percent" />
              <SortHeader label="Qty Sold" field="total_quantity" />
              <SortHeader label="Revenue" field="total_revenue" />
              <SortHeader label="Profit" field="gross_profit" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((item) => (
              <tr key={item.menu_item_id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium">{item.item_name}</td>
                <td className="px-3 py-2 text-gray-500">{item.category}</td>
                <td className="px-3 py-2 text-right">₱{item.sell_price.toFixed(0)}</td>
                <td className="px-3 py-2 text-right">
                  {item.cost_price !== null ? `₱${item.cost_price.toFixed(0)}` : '—'}
                </td>
                <td className="px-3 py-2">
                  <MarginBadge percent={item.margin_percent} />
                </td>
                <td className="px-3 py-2 text-right">{item.total_quantity}</td>
                <td className="px-3 py-2 text-right">₱{item.total_revenue.toLocaleString()}</td>
                <td className="px-3 py-2 text-right">
                  {item.gross_profit !== null
                    ? `₱${item.gross_profit.toLocaleString()}`
                    : '—'}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-gray-400">
                  No items found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create AnalyticsCategoryChart component**

A simple horizontal bar chart using Tailwind CSS (no chart library needed). Uses `div` bars with proportional widths.

```typescript
// src/components/admin/AnalyticsCategoryChart.tsx
'use client';

import type { CategoryBreakdown } from '@/types/analytics';

interface AnalyticsCategoryChartProps {
  categories: CategoryBreakdown[];
}

export default function AnalyticsCategoryChart({ categories }: AnalyticsCategoryChartProps) {
  if (categories.length === 0) {
    return (
      <div className="bg-white rounded-xl border p-6 text-center text-gray-400">
        No category data available
      </div>
    );
  }

  const maxRevenue = Math.max(...categories.map((c) => c.total_revenue));

  return (
    <div className="bg-white rounded-xl border">
      <div className="p-4 border-b">
        <h3 className="text-sm font-semibold text-gray-700">Revenue by Category</h3>
      </div>
      <div className="p-4 space-y-3">
        {categories
          .sort((a, b) => b.total_revenue - a.total_revenue)
          .map((cat) => {
            const widthPercent = maxRevenue > 0 ? (cat.total_revenue / maxRevenue) * 100 : 0;
            return (
              <div key={cat.category}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium capitalize">{cat.category}</span>
                  <div className="flex items-center gap-3 text-gray-500">
                    <span>{cat.item_count} items</span>
                    <span className="font-medium text-gray-900">
                      ₱{cat.total_revenue.toLocaleString()}
                    </span>
                    {cat.avg_margin_percent !== null && (
                      <span
                        className={
                          cat.avg_margin_percent > 60
                            ? 'text-green-600'
                            : cat.avg_margin_percent > 40
                            ? 'text-amber-600'
                            : 'text-red-600'
                        }
                      >
                        {cat.avg_margin_percent.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-black rounded-full transition-all duration-300"
                    style={{ width: `${widthPercent}%` }}
                  />
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Update AnalyticsDashboard to render AnalyticsCategoryChart**

In `src/components/admin/AnalyticsDashboard.tsx`:
- Import `AnalyticsCategoryChart` and `getCategoryPerformance` from `@/actions/analytics`
- Add state: `const [categories, setCategories] = useState<CategoryBreakdown[]>([]);`
- In `fetchData`, add a call to `getCategoryPerformance` alongside the existing fetches and set the categories state
- Render `<AnalyticsCategoryChart categories={categories} />` below the `<AnalyticsItemTable>` component

- [ ] **Step 7: Test manually**

Run dev server, navigate to `/admin/analytics`, verify:
- KPI cards load with data
- Period selector changes data
- Item table is searchable and sortable
- Category bar chart renders with proportional widths
- Margin badges show correct colors
- Empty state renders

- [ ] **Step 8: Commit**

```bash
git add app/admin/analytics/page.tsx src/components/admin/AnalyticsDashboard.tsx src/components/admin/AnalyticsItemTable.tsx src/components/admin/AnalyticsCategoryChart.tsx src/components/admin/Sidebar.tsx
git commit -m "feat(analytics): add analytics admin dashboard with KPI cards, item table, and category chart"
```

---


## Phase 2: Bundle System

### Task 13: Bundle Database Migration

**Files:**
- Create: `supabase/migrations/20260320000001_add_bundles.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260320000001_add_bundles.sql

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
```

- [ ] **Step 2: Apply migration and commit**

```bash
git add supabase/migrations/20260320000001_add_bundles.sql
git commit -m "feat(db): add bundle tables with RLS and indexes"
```

---

### Task 14: Bundle Types

**Files:**
- Create: `src/types/bundle.ts`

- [ ] **Step 1: Create the bundle types file**

```typescript
// src/types/bundle.ts

import type { MenuItem, Variation, AddOn } from '@/types';

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

/** Customer's selection for a single slot when ordering a bundle. */
export interface SlotSelection {
  slot_id: string;
  selected_items: {
    menu_item_id: string;
    selected_variation?: Variation | null;
    selected_add_ons?: AddOn[];
  }[];
}

/** Shape of a bundle item stored in the cart. */
export interface BundleCartItem {
  bundleId: string;
  bundleName: string;
  bundleImage?: string;
  quantity: number;
  slotSelections: SlotSelection[];
  /** Total price computed by calculateBundlePrice */
  totalPrice: number;
  /** Unique key for dedup in cart */
  cartKey: string;
}

/** JSONB payload stored in order_items.bundle_selections. */
export interface BundleSelectionRecord {
  slot_label: string;
  item_name: string;
  item_price: number;
  variation: { name: string; price: number } | null;
  add_ons: { name: string; price: number }[];
}

/** Availability info per slot for isBundleAvailable. */
export interface SlotItemAvailability {
  slot_id: string;
  min_selections: number;
  available_count: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/bundle.ts
git commit -m "feat(types): add bundle types"
```

---

### Task 15: Bundle Engine — Pure Business Logic

**Files:**
- Create: `src/lib/bundle-engine.ts`
- Create: `tests/bundle-engine.test.ts`

- [ ] **Step 1: Write tests for all bundle engine functions**

```typescript
// tests/bundle-engine.test.ts
import { describe, it, expect } from 'vitest';
import {
  validateBundleSelections,
  getBundleEffectivePrice,
  calculateBundlePrice,
  calculateBundleSavings,
  isBundleAvailable,
} from '@/lib/bundle-engine';
import type { Bundle, BundleSlot, BundleSlotItem, SlotSelection, SlotItemAvailability } from '@/types/bundle';

// ── Fixture builders ──────────────────────────────────────────

const makeSlotItem = (overrides: Partial<BundleSlotItem> = {}): BundleSlotItem => ({
  id: 'si-1',
  slot_id: 'slot-1',
  menu_item_id: 'mi-1',
  price_override: null,
  sort_order: 0,
  menu_item: {
    id: 'mi-1',
    name: 'Chocolate Shake',
    description: '',
    basePrice: 120,
    category: 'shakes',
    available: true,
  },
  ...overrides,
});

const makeSlot = (overrides: Partial<BundleSlot> = {}): BundleSlot => ({
  id: 'slot-1',
  bundle_id: 'bundle-1',
  label: 'Choose your Shake',
  sort_order: 0,
  min_selections: 1,
  max_selections: 1,
  items: [
    makeSlotItem(),
    makeSlotItem({ id: 'si-2', menu_item_id: 'mi-2', menu_item: { id: 'mi-2', name: 'Vanilla Shake', description: '', basePrice: 100, category: 'shakes' } }),
  ],
  ...overrides,
});

const makeBundle = (overrides: Partial<Bundle> = {}): Bundle => ({
  id: 'bundle-1',
  name: 'Classic Combo',
  description: 'Shake + Snack',
  image_url: null,
  base_price: 199,
  cost_price: 80,
  category: 'combos',
  discount_price: 179,
  discount_active: false,
  discount_start_date: null,
  discount_end_date: null,
  available: true,
  popular: false,
  sort_order: 0,
  slots: [
    makeSlot(),
    makeSlot({
      id: 'slot-2',
      label: 'Choose your Snack',
      items: [
        makeSlotItem({ id: 'si-3', slot_id: 'slot-2', menu_item_id: 'mi-3', menu_item: { id: 'mi-3', name: 'Belgian Fries', description: '', basePrice: 89, category: 'snacks' } }),
      ],
    }),
  ],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

// ── validateBundleSelections ──────────────────────────────────

describe('validateBundleSelections', () => {
  it('returns valid for correct selections', () => {
    const bundle = makeBundle();
    const selections: SlotSelection[] = [
      { slot_id: 'slot-1', selected_items: [{ menu_item_id: 'mi-1' }] },
      { slot_id: 'slot-2', selected_items: [{ menu_item_id: 'mi-3' }] },
    ];
    const result = validateBundleSelections(bundle, selections);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when a required slot has no selection', () => {
    const bundle = makeBundle();
    const selections: SlotSelection[] = [
      { slot_id: 'slot-1', selected_items: [{ menu_item_id: 'mi-1' }] },
      // slot-2 missing
    ];
    const result = validateBundleSelections(bundle, selections);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Choose your Snack');
  });

  it('fails when too many items selected for a slot', () => {
    const bundle = makeBundle();
    const selections: SlotSelection[] = [
      { slot_id: 'slot-1', selected_items: [{ menu_item_id: 'mi-1' }, { menu_item_id: 'mi-2' }] },
      { slot_id: 'slot-2', selected_items: [{ menu_item_id: 'mi-3' }] },
    ];
    const result = validateBundleSelections(bundle, selections);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('max');
  });

  it('fails when selected item is not eligible for the slot', () => {
    const bundle = makeBundle();
    const selections: SlotSelection[] = [
      { slot_id: 'slot-1', selected_items: [{ menu_item_id: 'mi-999' }] },
      { slot_id: 'slot-2', selected_items: [{ menu_item_id: 'mi-3' }] },
    ];
    const result = validateBundleSelections(bundle, selections);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('not eligible');
  });

  it('passes with optional slot (min_selections=0) left empty', () => {
    const bundle = makeBundle({
      slots: [
        makeSlot(),
        makeSlot({ id: 'slot-2', label: 'Optional Extra', min_selections: 0, max_selections: 2, items: [makeSlotItem({ id: 'si-3', slot_id: 'slot-2', menu_item_id: 'mi-3' })] }),
      ],
    });
    const selections: SlotSelection[] = [
      { slot_id: 'slot-1', selected_items: [{ menu_item_id: 'mi-1' }] },
    ];
    const result = validateBundleSelections(bundle, selections);
    expect(result.valid).toBe(true);
  });
});

// ── getBundleEffectivePrice ───────────────────────────────────

describe('getBundleEffectivePrice', () => {
  it('returns base_price when discount is not active', () => {
    const bundle = makeBundle({ discount_active: false });
    expect(getBundleEffectivePrice(bundle, new Date())).toBe(199);
  });

  it('returns discount_price when discount is active and within date range', () => {
    const now = new Date('2026-06-15T12:00:00Z');
    const bundle = makeBundle({
      discount_active: true,
      discount_price: 179,
      discount_start_date: '2026-06-01T00:00:00Z',
      discount_end_date: '2026-06-30T00:00:00Z',
    });
    expect(getBundleEffectivePrice(bundle, now)).toBe(179);
  });

  it('returns base_price when discount is active but outside date range', () => {
    const now = new Date('2026-07-15T12:00:00Z');
    const bundle = makeBundle({
      discount_active: true,
      discount_price: 179,
      discount_start_date: '2026-06-01T00:00:00Z',
      discount_end_date: '2026-06-30T00:00:00Z',
    });
    expect(getBundleEffectivePrice(bundle, now)).toBe(199);
  });

  it('returns discount_price when active with no date bounds', () => {
    const bundle = makeBundle({
      discount_active: true,
      discount_price: 179,
      discount_start_date: null,
      discount_end_date: null,
    });
    expect(getBundleEffectivePrice(bundle, new Date())).toBe(179);
  });

  it('returns base_price when discount_price is null even if active', () => {
    const bundle = makeBundle({
      discount_active: true,
      discount_price: null,
    });
    expect(getBundleEffectivePrice(bundle, new Date())).toBe(199);
  });
});

// ── calculateBundlePrice ──────────────────────────────────────

describe('calculateBundlePrice', () => {
  it('returns effective price with no extras', () => {
    const bundle = makeBundle();
    const selections: SlotSelection[] = [
      { slot_id: 'slot-1', selected_items: [{ menu_item_id: 'mi-1' }] },
      { slot_id: 'slot-2', selected_items: [{ menu_item_id: 'mi-3' }] },
    ];
    const result = calculateBundlePrice(bundle, selections, new Date());
    expect(result.effectivePrice).toBe(199);
    expect(result.addOnsTotal).toBe(0);
    expect(result.variationsExtra).toBe(0);
    expect(result.total).toBe(199);
  });

  it('adds variation and add-on prices on top of bundle price', () => {
    const bundle = makeBundle();
    const selections: SlotSelection[] = [
      {
        slot_id: 'slot-1',
        selected_items: [{
          menu_item_id: 'mi-1',
          selected_variation: { id: 'v-1', name: 'Large', price: 20 },
          selected_add_ons: [{ id: 'ao-1', name: 'Whipped Cream', price: 15, category: 'toppings' }],
        }],
      },
      { slot_id: 'slot-2', selected_items: [{ menu_item_id: 'mi-3' }] },
    ];
    const result = calculateBundlePrice(bundle, selections, new Date());
    expect(result.effectivePrice).toBe(199);
    expect(result.variationsExtra).toBe(20);
    expect(result.addOnsTotal).toBe(15);
    expect(result.total).toBe(234);
  });
});

// ── calculateBundleSavings ────────────────────────────────────

describe('calculateBundleSavings', () => {
  it('computes savings vs buying items individually', () => {
    const bundle = makeBundle({ base_price: 199 });
    const selections: SlotSelection[] = [
      { slot_id: 'slot-1', selected_items: [{ menu_item_id: 'mi-1' }] },
      { slot_id: 'slot-2', selected_items: [{ menu_item_id: 'mi-3' }] },
    ];
    // mi-1 = 120, mi-3 = 89 => individual = 209
    const result = calculateBundleSavings(bundle, selections);
    expect(result.individualTotal).toBe(209);
    expect(result.bundleTotal).toBe(199);
    expect(result.savings).toBe(10);
    expect(result.savingsPercent).toBeCloseTo(4.78, 1);
  });

  it('returns zero savings when bundle costs more', () => {
    const bundle = makeBundle({ base_price: 250 });
    const selections: SlotSelection[] = [
      { slot_id: 'slot-1', selected_items: [{ menu_item_id: 'mi-1' }] },
      { slot_id: 'slot-2', selected_items: [{ menu_item_id: 'mi-3' }] },
    ];
    const result = calculateBundleSavings(bundle, selections);
    expect(result.savings).toBe(0);
    expect(result.savingsPercent).toBe(0);
  });

  it('uses price_override when set', () => {
    const bundle = makeBundle({
      base_price: 150,
      slots: [
        makeSlot({ items: [makeSlotItem({ price_override: 80 })] }),
        makeSlot({
          id: 'slot-2',
          label: 'Choose your Snack',
          items: [makeSlotItem({ id: 'si-3', slot_id: 'slot-2', menu_item_id: 'mi-3', price_override: 60, menu_item: { id: 'mi-3', name: 'Belgian Fries', description: '', basePrice: 89, category: 'snacks' } })],
        }),
      ],
    });
    const selections: SlotSelection[] = [
      { slot_id: 'slot-1', selected_items: [{ menu_item_id: 'mi-1' }] },
      { slot_id: 'slot-2', selected_items: [{ menu_item_id: 'mi-3' }] },
    ];
    // Individual prices: 80 (override) + 60 (override) = 140, bundle = 150
    // But savings is based on menu_item base prices: 120 + 89 = 209 vs 150
    const result = calculateBundleSavings(bundle, selections);
    expect(result.individualTotal).toBe(209);
    expect(result.bundleTotal).toBe(150);
    expect(result.savings).toBe(59);
  });
});

// ── isBundleAvailable ─────────────────────────────────────────

describe('isBundleAvailable', () => {
  it('returns true when bundle is available and slots have enough items', () => {
    const bundle = makeBundle();
    const availability: SlotItemAvailability[] = [
      { slot_id: 'slot-1', min_selections: 1, available_count: 2 },
      { slot_id: 'slot-2', min_selections: 1, available_count: 1 },
    ];
    expect(isBundleAvailable(bundle, availability)).toBe(true);
  });

  it('returns false when bundle is marked unavailable', () => {
    const bundle = makeBundle({ available: false });
    const availability: SlotItemAvailability[] = [
      { slot_id: 'slot-1', min_selections: 1, available_count: 2 },
      { slot_id: 'slot-2', min_selections: 1, available_count: 1 },
    ];
    expect(isBundleAvailable(bundle, availability)).toBe(false);
  });

  it('returns false when a slot has fewer available items than min_selections', () => {
    const bundle = makeBundle();
    const availability: SlotItemAvailability[] = [
      { slot_id: 'slot-1', min_selections: 1, available_count: 0 },
      { slot_id: 'slot-2', min_selections: 1, available_count: 1 },
    ];
    expect(isBundleAvailable(bundle, availability)).toBe(false);
  });
});
```

- [ ] **Step 2: Implement all bundle engine functions**

```typescript
// src/lib/bundle-engine.ts
// Pure business logic for the bundle system — no I/O, no DB, no network.

import type {
  Bundle,
  SlotSelection,
  SlotItemAvailability,
} from '@/types/bundle';

/**
 * Validate that slot selections satisfy the bundle's requirements.
 */
export function validateBundleSelections(
  bundle: Bundle,
  slotSelections: SlotSelection[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const selectionMap = new Map(slotSelections.map((s) => [s.slot_id, s]));

  for (const slot of bundle.slots) {
    const selection = selectionMap.get(slot.id);
    const count = selection?.selected_items.length ?? 0;

    if (count < slot.min_selections) {
      errors.push(
        `Slot "${slot.label}" requires at least ${slot.min_selections} selection(s), got ${count}`,
      );
      continue;
    }

    if (count > slot.max_selections) {
      errors.push(
        `Slot "${slot.label}" allows max ${slot.max_selections} selection(s), got ${count}`,
      );
      continue;
    }

    if (selection) {
      const eligibleIds = new Set(slot.items.map((i) => i.menu_item_id));
      for (const selected of selection.selected_items) {
        if (!eligibleIds.has(selected.menu_item_id)) {
          errors.push(
            `Item "${selected.menu_item_id}" is not eligible for slot "${slot.label}"`,
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Get the effective price for a bundle (discount-aware).
 * Same logic as getEffectiveBasePrice for menu items.
 */
export function getBundleEffectivePrice(bundle: Bundle, now: Date): number {
  if (
    !bundle.discount_active ||
    bundle.discount_price === null
  ) {
    return bundle.base_price;
  }

  const start = bundle.discount_start_date ? new Date(bundle.discount_start_date) : null;
  const end = bundle.discount_end_date ? new Date(bundle.discount_end_date) : null;

  const inRange =
    (!start || now >= start) &&
    (!end || now <= end);

  return inRange ? bundle.discount_price : bundle.base_price;
}

/**
 * Calculate the total price for a bundle order including add-ons and variations.
 */
export function calculateBundlePrice(
  bundle: Bundle,
  slotSelections: SlotSelection[],
  now: Date,
): { effectivePrice: number; addOnsTotal: number; variationsExtra: number; total: number } {
  const effectivePrice = getBundleEffectivePrice(bundle, now);
  let addOnsTotal = 0;
  let variationsExtra = 0;

  for (const selection of slotSelections) {
    for (const item of selection.selected_items) {
      if (item.selected_variation) {
        variationsExtra += item.selected_variation.price;
      }
      if (item.selected_add_ons) {
        for (const addOn of item.selected_add_ons) {
          addOnsTotal += addOn.price * (addOn.quantity ?? 1);
        }
      }
    }
  }

  return {
    effectivePrice,
    addOnsTotal,
    variationsExtra,
    total: effectivePrice + addOnsTotal + variationsExtra,
  };
}

/**
 * Calculate savings vs buying items individually.
 * Individual prices use the menu item's basePrice (not price_override).
 */
export function calculateBundleSavings(
  bundle: Bundle,
  slotSelections: SlotSelection[],
): { individualTotal: number; bundleTotal: number; savings: number; savingsPercent: number } {
  let individualTotal = 0;
  const selectionMap = new Map(slotSelections.map((s) => [s.slot_id, s]));

  for (const slot of bundle.slots) {
    const selection = selectionMap.get(slot.id);
    if (!selection) continue;

    for (const selectedItem of selection.selected_items) {
      const slotItem = slot.items.find((i) => i.menu_item_id === selectedItem.menu_item_id);
      // Use the menu item's real base price for individual comparison
      const itemPrice = slotItem?.menu_item?.basePrice ?? 0;
      individualTotal += itemPrice;
    }
  }

  const bundleTotal = bundle.base_price;
  const rawSavings = individualTotal - bundleTotal;
  const savings = rawSavings > 0 ? rawSavings : 0;
  const savingsPercent = savings > 0 && individualTotal > 0
    ? (savings / individualTotal) * 100
    : 0;

  return { individualTotal, bundleTotal, savings, savingsPercent };
}

/**
 * Check if a bundle is orderable given current item availability.
 */
export function isBundleAvailable(
  bundle: Bundle,
  slotItems: SlotItemAvailability[],
): boolean {
  if (!bundle.available) return false;

  for (const slot of slotItems) {
    if (slot.available_count < slot.min_selections) {
      return false;
    }
  }

  return true;
}
```

- [ ] **Step 3: Run tests, verify pass**

Run: `npx vitest run tests/bundle-engine.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/bundle-engine.ts tests/bundle-engine.test.ts
git commit -m "feat(bundle): add bundle engine with validation and pricing"
```

---

### Task 16: Bundle Validation Schemas

**Files:**
- Modify: `src/lib/validation.ts`

- [ ] **Step 1: Add bundle Zod schemas**

Add to the end of `src/lib/validation.ts`:

```typescript
// ─── Bundle schemas ──────────────────────────────────────────────────────────

const bundleSlotItemSchema = z.object({
  menu_item_id: uuidSchema,
  price_override: z.number().min(0).nullable().optional(),
  sort_order: z.number().int().nonnegative().optional().default(0),
});

const bundleSlotSchema = z.object({
  label: sanitized.pipe(z.string().min(1, 'Slot label is required').max(100)),
  sort_order: z.number().int().nonnegative().optional().default(0),
  min_selections: z.number().int().min(0).max(10).default(1),
  max_selections: z.number().int().min(1).max(10).default(1),
  items: z.array(bundleSlotItemSchema).min(1, 'Each slot needs at least one item'),
}).refine(
  (data) => data.max_selections >= data.min_selections,
  { message: 'max_selections must be >= min_selections', path: ['max_selections'] },
);

export const createBundleSchema = z.object({
  name: sanitized.pipe(z.string().min(1, 'Bundle name is required').max(200)),
  description: sanitized.pipe(z.string().max(500)).nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  base_price: z.number().positive('Price must be greater than zero'),
  cost_price: z.number().min(0).nullable().optional(),
  category: z.string().min(1, 'Category is required'),
  discount_price: z.number().nonnegative().nullable().optional(),
  discount_active: z.boolean().optional().default(false),
  discount_start_date: z.string().nullable().optional(),
  discount_end_date: z.string().nullable().optional(),
  available: z.boolean().optional().default(true),
  popular: z.boolean().optional().default(false),
  sort_order: z.number().int().nonnegative().optional().default(0),
  slots: z.array(bundleSlotSchema).min(1, 'Bundle needs at least one slot'),
});

export type CreateBundleInput = z.infer<typeof createBundleSchema>;

export const updateBundleSchema = createBundleSchema.extend({
  id: uuidSchema,
});

export type UpdateBundleInput = z.infer<typeof updateBundleSchema>;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/validation.ts
git commit -m "feat(validation): add bundle Zod schemas with nested slot validation"
```

---

### Task 17: Bundle Admin Server Actions

**Files:**
- Create: `src/actions/bundle-admin.ts`
- Create: `tests/unit/actions/bundle-admin.test.ts`

- [ ] **Step 1: Write tests for bundle admin actions**

```typescript
// tests/unit/actions/bundle-admin.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-guard', () => ({
  checkActionRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  requireAdmin: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

let callQueue: { data: any; error: any }[] = [];
const mockFrom = vi.fn(() => {
  const chain: any = {};
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'gte', 'lte', 'ilike', 'order', 'single', 'maybeSingle']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: any) => resolve(callQueue.shift() ?? { data: null, error: null });
  return chain;
});

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: new Proxy({}, {
    get(_, prop) {
      if (prop === 'from') return mockFrom;
      if (prop === 'rpc') return vi.fn().mockResolvedValue({ data: null, error: null });
      return undefined;
    },
  }),
}));

import { createBundle, updateBundle, deleteBundle, toggleBundleAvailability } from '@/actions/bundle-admin';

describe('createBundle', () => {
  beforeEach(() => {
    callQueue = [];
    vi.clearAllMocks();
  });

  it('creates a bundle with slots and slot items', async () => {
    // Insert bundle
    callQueue.push({ data: { id: 'bundle-1' }, error: null });
    // Insert slots
    callQueue.push({ data: [{ id: 'slot-1' }], error: null });
    // Insert slot items
    callQueue.push({ data: [{ id: 'si-1' }], error: null });

    const result = await createBundle({
      name: 'Combo A',
      base_price: 199,
      category: 'combos',
      slots: [{
        label: 'Pick a Shake',
        min_selections: 1,
        max_selections: 1,
        items: [{ menu_item_id: '11111111-1111-1111-1111-111111111111' }],
      }],
    });
    expect(result.success).toBe(true);
    expect(result.data?.id).toBe('bundle-1');
  });

  it('rejects invalid input (missing name)', async () => {
    const result = await createBundle({
      base_price: 199,
      category: 'combos',
      slots: [],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid');
  });

  it('rejects bundle with no slots', async () => {
    const result = await createBundle({
      name: 'Empty Bundle',
      base_price: 199,
      category: 'combos',
      slots: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('deleteBundle', () => {
  beforeEach(() => {
    callQueue = [];
    vi.clearAllMocks();
  });

  it('deletes a bundle by id', async () => {
    callQueue.push({ data: null, error: null });
    const result = await deleteBundle('11111111-1111-1111-1111-111111111111');
    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('bundles');
  });

  it('rejects invalid uuid', async () => {
    const result = await deleteBundle('not-a-uuid');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid');
  });
});

describe('toggleBundleAvailability', () => {
  beforeEach(() => {
    callQueue = [];
    vi.clearAllMocks();
  });

  it('fetches current state then toggles', async () => {
    // Fetch current
    callQueue.push({ data: { id: 'b-1', available: true }, error: null });
    // Update
    callQueue.push({ data: { id: 'b-1', available: false }, error: null });

    const result = await toggleBundleAvailability('11111111-1111-1111-1111-111111111111');
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Implement bundle admin actions**

```typescript
// src/actions/bundle-admin.ts
'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAdmin, checkActionRateLimit } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import { createBundleSchema, updateBundleSchema, uuidSchema } from '@/lib/validation';

type ActionResult = { success: boolean; error?: string; data?: any };

// ─── createBundle ────────────────────────────────────────────────────────────

export async function createBundle(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const parsed = createBundleSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input: ' + parsed.error.issues.map((i) => i.message).join(', ') };

  const { slots, ...bundleData } = parsed.data;

  // 1. Insert bundle
  const { data: bundle, error: bundleError } = await (supabaseServer.from('bundles') as any)
    .insert(bundleData)
    .select('id')
    .single();

  if (bundleError || !bundle) return { success: false, error: 'Failed to create bundle' };

  // 2. Insert slots
  const slotRows = slots.map((slot, idx) => ({
    bundle_id: bundle.id,
    label: slot.label,
    sort_order: slot.sort_order ?? idx,
    min_selections: slot.min_selections,
    max_selections: slot.max_selections,
  }));

  const { data: insertedSlots, error: slotsError } = await (supabaseServer.from('bundle_slots') as any)
    .insert(slotRows)
    .select('id');

  if (slotsError || !insertedSlots) return { success: false, error: 'Failed to create bundle slots' };

  // 3. Insert slot items
  const slotItemRows: any[] = [];
  for (let i = 0; i < slots.length; i++) {
    const slotId = insertedSlots[i]?.id;
    if (!slotId) continue;
    for (const item of slots[i].items) {
      slotItemRows.push({
        slot_id: slotId,
        menu_item_id: item.menu_item_id,
        price_override: item.price_override ?? null,
        sort_order: item.sort_order ?? 0,
      });
    }
  }

  if (slotItemRows.length > 0) {
    const { error: itemsError } = await (supabaseServer.from('bundle_slot_items') as any)
      .insert(slotItemRows);
    if (itemsError) return { success: false, error: 'Failed to create slot items' };
  }

  revalidateTag('bundles');
  revalidatePath('/admin/bundles');
  return { success: true, data: { id: bundle.id } };
}

// ─── updateBundle ────────────────────────────────────────────────────────────

export async function updateBundle(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const parsed = updateBundleSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input: ' + parsed.error.issues.map((i) => i.message).join(', ') };

  const { id, slots, ...bundleData } = parsed.data;

  // 1. Update bundle row
  const { error: bundleError } = await (supabaseServer.from('bundles') as any)
    .update(bundleData)
    .eq('id', id);

  if (bundleError) return { success: false, error: 'Failed to update bundle' };

  // 2. Delete old slots (cascade deletes slot_items)
  await (supabaseServer.from('bundle_slots') as any)
    .delete()
    .eq('bundle_id', id);

  // 3. Re-insert slots + slot_items (same as create)
  const slotRows = slots.map((slot, idx) => ({
    bundle_id: id,
    label: slot.label,
    sort_order: slot.sort_order ?? idx,
    min_selections: slot.min_selections,
    max_selections: slot.max_selections,
  }));

  const { data: insertedSlots, error: slotsError } = await (supabaseServer.from('bundle_slots') as any)
    .insert(slotRows)
    .select('id');

  if (slotsError || !insertedSlots) return { success: false, error: 'Failed to recreate bundle slots' };

  const slotItemRows: any[] = [];
  for (let i = 0; i < slots.length; i++) {
    const slotId = insertedSlots[i]?.id;
    if (!slotId) continue;
    for (const item of slots[i].items) {
      slotItemRows.push({
        slot_id: slotId,
        menu_item_id: item.menu_item_id,
        price_override: item.price_override ?? null,
        sort_order: item.sort_order ?? 0,
      });
    }
  }

  if (slotItemRows.length > 0) {
    const { error: itemsError } = await (supabaseServer.from('bundle_slot_items') as any)
      .insert(slotItemRows);
    if (itemsError) return { success: false, error: 'Failed to recreate slot items' };
  }

  revalidateTag('bundles');
  revalidatePath('/admin/bundles');
  return { success: true };
}

// ─── deleteBundle ────────────────────────────────────────────────────────────

export async function deleteBundle(id: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { success: false, error: 'Invalid bundle ID' };

  const { error } = await (supabaseServer.from('bundles') as any)
    .delete()
    .eq('id', parsed.data);

  if (error) return { success: false, error: 'Failed to delete bundle' };

  revalidateTag('bundles');
  revalidatePath('/admin/bundles');
  return { success: true };
}

// ─── toggleBundleAvailability ────────────────────────────────────────────────

export async function toggleBundleAvailability(id: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { success: false, error: 'Invalid bundle ID' };

  const { data: current, error: fetchError } = await (supabaseServer.from('bundles') as any)
    .select('id, available')
    .eq('id', parsed.data)
    .single();

  if (fetchError || !current) return { success: false, error: 'Bundle not found' };

  const { data, error } = await (supabaseServer.from('bundles') as any)
    .update({ available: !current.available })
    .eq('id', parsed.data)
    .select()
    .single();

  if (error) return { success: false, error: 'Failed to toggle availability' };

  revalidateTag('bundles');
  revalidatePath('/admin/bundles');
  return { success: true, data };
}
```

- [ ] **Step 3: Run tests, verify pass**

Run: `npx vitest run tests/unit/actions/bundle-admin.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/actions/bundle-admin.ts tests/unit/actions/bundle-admin.test.ts
git commit -m "feat(bundle): add bundle admin server actions with tests"
```

---

### Task 18: Bundle Admin UI

**Files:**
- Create: `app/admin/bundles/page.tsx`
- Create: `src/components/admin/BundleList.tsx`
- Create: `src/components/admin/BundleForm.tsx`
- Modify: `src/components/admin/Sidebar.tsx` — Add Bundles nav item
- Modify: `src/lib/cached-queries.ts` — Add cached bundle queries

- [ ] **Step 1: Add Bundles to sidebar navigation**

In `src/components/admin/Sidebar.tsx`, add to `navItems` array:

```typescript
{ label: 'Bundles', href: '/admin/bundles', icon: Package },
```

Import `Package` from `lucide-react`.

- [ ] **Step 2: Add cached queries for bundles**

Add to `src/lib/cached-queries.ts`:

```typescript
// ── Bundles (with slots and slot items joined) ───────────────
export const getCachedBundles = unstable_cache(
  async () => {
    const { data } = await (supabaseServer.from('bundles') as any)
      .select(`
        *,
        bundle_slots (
          *,
          bundle_slot_items (
            *,
            menu_items (id, name, base_price, category, image)
          )
        )
      `)
      .order('sort_order', { ascending: true });
    return (data || []).map((b: any) => ({
      ...b,
      base_price: Number(b.base_price),
      cost_price: b.cost_price !== null ? Number(b.cost_price) : null,
      discount_price: b.discount_price !== null ? Number(b.discount_price) : null,
      slots: (b.bundle_slots || [])
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((s: any) => ({
          ...s,
          items: (s.bundle_slot_items || [])
            .sort((a: any, b: any) => a.sort_order - b.sort_order)
            .map((si: any) => ({
              ...si,
              price_override: si.price_override !== null ? Number(si.price_override) : null,
              menu_item: si.menu_items ? {
                id: si.menu_items.id,
                name: si.menu_items.name,
                basePrice: Number(si.menu_items.base_price),
                category: si.menu_items.category,
                image: si.menu_items.image,
                description: '',
              } : undefined,
            })),
        })),
    }));
  },
  ['admin-bundles'],
  { revalidate: 300, tags: ['bundles'] }
);
```

- [ ] **Step 3: Create the Bundles admin page (SSR)**

```typescript
// app/admin/bundles/page.tsx
import { requireAdmin } from '@/lib/admin-guard';
import { getCachedBundles, getCachedCategories, getCachedMenuItems } from '@/lib/cached-queries';
import BundleList from '@/components/admin/BundleList';

export default async function BundlesPage() {
  await requireAdmin();
  const [bundles, categories, menuItems] = await Promise.all([
    getCachedBundles(),
    getCachedCategories(),
    getCachedMenuItems(),
  ]);
  return (
    <BundleList
      initialBundles={bundles}
      categories={categories}
      menuItems={menuItems}
    />
  );
}
```

- [ ] **Step 4: Create BundleList component**

```typescript
// src/components/admin/BundleList.tsx
'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Package } from 'lucide-react';
import type { Bundle } from '@/types/bundle';
import { deleteBundle, toggleBundleAvailability } from '@/actions/bundle-admin';
import { calculateItemMargin } from '@/lib/cost-engine';
import BundleForm from './BundleForm';

interface PickOption { id: string; name: string; }

interface Props {
  initialBundles: Bundle[];
  categories: PickOption[];
  menuItems: any[];
}

export default function BundleList({ initialBundles, categories, menuItems }: Props) {
  const [bundles, setBundles] = useState<Bundle[]>(initialBundles);
  const [showForm, setShowForm] = useState(false);
  const [editingBundle, setEditingBundle] = useState<Bundle | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this bundle? This cannot be undone.')) return;
    setDeleting(id);
    const res = await deleteBundle(id);
    if (res.success) {
      setBundles((prev) => prev.filter((b) => b.id !== id));
    }
    setDeleting(null);
  };

  const handleToggle = async (id: string) => {
    const res = await toggleBundleAvailability(id);
    if (res.success) {
      setBundles((prev) =>
        prev.map((b) => (b.id === id ? { ...b, available: !b.available } : b)),
      );
    }
  };

  const handleSaved = () => {
    setShowForm(false);
    setEditingBundle(null);
    // Page will revalidate via server action tags
    window.location.reload();
  };

  const marginBadge = (base: number, cost: number | null) => {
    const { margin_percent } = calculateItemMargin(base, cost);
    if (margin_percent === null) return <span className="text-gray-400 text-xs">--</span>;
    const color =
      margin_percent > 60 ? 'text-green-700 bg-green-50' :
      margin_percent > 40 ? 'text-amber-700 bg-amber-50' :
      'text-red-700 bg-red-50';
    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>{margin_percent.toFixed(1)}%</span>;
  };

  if (showForm || editingBundle) {
    return (
      <BundleForm
        bundle={editingBundle}
        categories={categories}
        menuItems={menuItems}
        onCancel={() => { setShowForm(false); setEditingBundle(null); }}
        onSaved={handleSaved}
      />
    );
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-playfair font-semibold text-stone-800">Bundles</h1>
          <p className="text-sm text-stone-500 mt-1">Manage combo bundles and their slot configurations</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-black text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800"
        >
          <Plus className="w-4 h-4" /> New Bundle
        </button>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Name</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Category</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">Price</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">Cost</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Margin</th>
              <th className="px-4 py-3 text-center font-medium text-gray-500">Slots</th>
              <th className="px-4 py-3 text-center font-medium text-gray-500">Available</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {bundles.map((bundle) => (
              <tr key={bundle.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-gray-400" />
                    {bundle.name}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500">{bundle.category}</td>
                <td className="px-4 py-3 text-right">₱{bundle.base_price.toFixed(0)}</td>
                <td className="px-4 py-3 text-right">
                  {bundle.cost_price !== null ? `₱${bundle.cost_price.toFixed(0)}` : '—'}
                </td>
                <td className="px-4 py-3">{marginBadge(bundle.base_price, bundle.cost_price)}</td>
                <td className="px-4 py-3 text-center">{bundle.slots.length}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => handleToggle(bundle.id)}
                    className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${
                      bundle.available ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                      bundle.available ? 'translate-x-4 ml-0.5' : 'translate-x-0.5'
                    }`} />
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => setEditingBundle(bundle)}
                      className="p-1.5 hover:bg-gray-100 rounded"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4 text-gray-500" />
                    </button>
                    <button
                      onClick={() => handleDelete(bundle.id)}
                      disabled={deleting === bundle.id}
                      className="p-1.5 hover:bg-red-50 rounded"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {bundles.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                  No bundles yet. Create your first combo bundle.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create BundleForm component**

```typescript
// src/components/admin/BundleForm.tsx
'use client';

import { useState } from 'react';
import { ArrowLeft, Plus, X, GripVertical, Loader2, Search } from 'lucide-react';
import type { Bundle, BundleSlot } from '@/types/bundle';
import { createBundle, updateBundle } from '@/actions/bundle-admin';

interface PickOption { id: string; name: string; }

interface SlotDraft {
  label: string;
  min_selections: number;
  max_selections: number;
  items: { menu_item_id: string; price_override: number | null; name?: string }[];
}

interface Props {
  bundle: Bundle | null;
  categories: PickOption[];
  menuItems: any[];
  onCancel: () => void;
  onSaved: () => void;
}

export default function BundleForm({ bundle, categories, menuItems, onCancel, onSaved }: Props) {
  const isEdit = !!bundle;

  // Basic info
  const [name, setName] = useState(bundle?.name ?? '');
  const [description, setDescription] = useState(bundle?.description ?? '');
  const [basePrice, setBasePrice] = useState(bundle?.base_price?.toString() ?? '');
  const [costPrice, setCostPrice] = useState(bundle?.cost_price?.toString() ?? '');
  const [category, setCategory] = useState(bundle?.category ?? '');
  const [imageUrl, setImageUrl] = useState(bundle?.image_url ?? '');
  const [popular, setPopular] = useState(bundle?.popular ?? false);

  // Discount
  const [discountPrice, setDiscountPrice] = useState(bundle?.discount_price?.toString() ?? '');
  const [discountActive, setDiscountActive] = useState(bundle?.discount_active ?? false);
  const [discountStart, setDiscountStart] = useState(bundle?.discount_start_date ?? '');
  const [discountEnd, setDiscountEnd] = useState(bundle?.discount_end_date ?? '');

  // Slots
  const [slots, setSlots] = useState<SlotDraft[]>(
    bundle?.slots.map((s) => ({
      label: s.label,
      min_selections: s.min_selections,
      max_selections: s.max_selections,
      items: s.items.map((si) => ({
        menu_item_id: si.menu_item_id,
        price_override: si.price_override,
        name: si.menu_item?.name,
      })),
    })) ?? [{ label: '', min_selections: 1, max_selections: 1, items: [] }],
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Item search state per slot
  const [searchTerms, setSearchTerms] = useState<Record<number, string>>({});

  const addSlot = () => {
    setSlots([...slots, { label: '', min_selections: 1, max_selections: 1, items: [] }]);
  };

  const removeSlot = (idx: number) => {
    setSlots(slots.filter((_, i) => i !== idx));
  };

  const updateSlot = (idx: number, field: keyof SlotDraft, value: any) => {
    setSlots(slots.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const addItemToSlot = (slotIdx: number, item: any) => {
    const slot = slots[slotIdx];
    if (slot.items.some((i) => i.menu_item_id === item.id)) return; // already added
    updateSlot(slotIdx, 'items', [
      ...slot.items,
      { menu_item_id: item.id, price_override: null, name: item.name },
    ]);
  };

  const removeItemFromSlot = (slotIdx: number, menuItemId: string) => {
    const slot = slots[slotIdx];
    updateSlot(slotIdx, 'items', slot.items.filter((i) => i.menu_item_id !== menuItemId));
  };

  const setItemPriceOverride = (slotIdx: number, menuItemId: string, value: string) => {
    const slot = slots[slotIdx];
    updateSlot(slotIdx, 'items', slot.items.map((i) =>
      i.menu_item_id === menuItemId
        ? { ...i, price_override: value === '' ? null : parseFloat(value) }
        : i,
    ));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);

    const payload = {
      ...(isEdit ? { id: bundle!.id } : {}),
      name,
      description: description || null,
      image_url: imageUrl || null,
      base_price: parseFloat(basePrice),
      cost_price: costPrice ? parseFloat(costPrice) : null,
      category,
      discount_price: discountPrice ? parseFloat(discountPrice) : null,
      discount_active: discountActive,
      discount_start_date: discountStart || null,
      discount_end_date: discountEnd || null,
      popular,
      slots: slots.map((s, idx) => ({
        label: s.label,
        sort_order: idx,
        min_selections: s.min_selections,
        max_selections: s.max_selections,
        items: s.items.map((item, iIdx) => ({
          menu_item_id: item.menu_item_id,
          price_override: item.price_override,
          sort_order: iIdx,
        })),
      })),
    };

    const res = isEdit ? await updateBundle(payload) : await createBundle(payload);

    if (res.success) {
      onSaved();
    } else {
      setError(res.error ?? 'Failed to save bundle');
    }
    setSubmitting(false);
  };

  const filteredMenuItems = (slotIdx: number) => {
    const term = (searchTerms[slotIdx] ?? '').toLowerCase();
    if (!term) return menuItems.slice(0, 20);
    return menuItems.filter((mi: any) => mi.name.toLowerCase().includes(term));
  };

  return (
    <div className="p-6 max-w-4xl">
      <button onClick={onCancel} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Bundles
      </button>

      <h1 className="text-2xl font-playfair font-semibold text-stone-800 mb-6">
        {isEdit ? 'Edit Bundle' : 'New Bundle'}
      </h1>

      <div className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <h2 className="font-medium text-stone-700">Basic Info</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Name *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Classic Combo" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Category *</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">Select...</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Base Price *</label>
              <input type="number" value={basePrice} onChange={(e) => setBasePrice(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="199" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Cost Price</label>
              <input type="number" value={costPrice} onChange={(e) => setCostPrice(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="80" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Image URL</label>
              <input type="text" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        </div>

        {/* Discount */}
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-stone-700">Discount</h2>
            <button onClick={() => setDiscountActive(!discountActive)}
              className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${discountActive ? 'bg-green-500' : 'bg-gray-300'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${discountActive ? 'translate-x-4 ml-0.5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          {discountActive && (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Discount Price</label>
                <input type="number" value={discountPrice} onChange={(e) => setDiscountPrice(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Start Date</label>
                <input type="datetime-local" value={discountStart} onChange={(e) => setDiscountStart(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">End Date</label>
                <input type="datetime-local" value={discountEnd} onChange={(e) => setDiscountEnd(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
          )}
        </div>

        {/* Slots */}
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-stone-700">Slots</h2>
            <button onClick={addSlot}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
              <Plus className="w-4 h-4" /> Add Slot
            </button>
          </div>

          {slots.map((slot, slotIdx) => (
            <div key={slotIdx} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <GripVertical className="w-4 h-4 text-gray-300" />
                <div className="flex-1 grid grid-cols-3 gap-3">
                  <input type="text" value={slot.label} onChange={(e) => updateSlot(slotIdx, 'label', e.target.value)}
                    placeholder="Slot label (e.g. Choose your Shake)" className="border rounded px-2 py-1.5 text-sm" />
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 whitespace-nowrap">Min:</label>
                    <input type="number" value={slot.min_selections} onChange={(e) => updateSlot(slotIdx, 'min_selections', parseInt(e.target.value) || 0)}
                      className="w-16 border rounded px-2 py-1.5 text-sm" min={0} />
                    <label className="text-xs text-gray-500 whitespace-nowrap">Max:</label>
                    <input type="number" value={slot.max_selections} onChange={(e) => updateSlot(slotIdx, 'max_selections', parseInt(e.target.value) || 1)}
                      className="w-16 border rounded px-2 py-1.5 text-sm" min={1} />
                  </div>
                </div>
                <button onClick={() => removeSlot(slotIdx)} className="p-1 hover:bg-red-50 rounded" title="Remove slot">
                  <X className="w-4 h-4 text-red-400" />
                </button>
              </div>

              {/* Selected items */}
              {slot.items.length > 0 && (
                <div className="space-y-1 ml-7">
                  {slot.items.map((item) => (
                    <div key={item.menu_item_id} className="flex items-center gap-2 text-sm py-1">
                      <span className="flex-1">{item.name || item.menu_item_id}</span>
                      <input
                        type="number"
                        placeholder="Price override"
                        value={item.price_override ?? ''}
                        onChange={(e) => setItemPriceOverride(slotIdx, item.menu_item_id, e.target.value)}
                        className="w-28 border rounded px-2 py-1 text-xs"
                      />
                      <button onClick={() => removeItemFromSlot(slotIdx, item.menu_item_id)} className="p-0.5 hover:bg-red-50 rounded">
                        <X className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Item search */}
              <div className="ml-7">
                <div className="flex items-center gap-2 border rounded px-2 py-1.5">
                  <Search className="w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search items to add..."
                    value={searchTerms[slotIdx] ?? ''}
                    onChange={(e) => setSearchTerms({ ...searchTerms, [slotIdx]: e.target.value })}
                    className="text-sm outline-none flex-1"
                  />
                </div>
                {(searchTerms[slotIdx] ?? '').length > 0 && (
                  <div className="mt-1 max-h-32 overflow-y-auto border rounded text-sm">
                    {filteredMenuItems(slotIdx).map((mi: any) => (
                      <button
                        key={mi.id}
                        onClick={() => addItemToSlot(slotIdx, mi)}
                        className="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex justify-between"
                      >
                        <span>{mi.name}</span>
                        <span className="text-gray-400">₱{mi.basePrice ?? mi.base_price}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Submit */}
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 bg-black text-white rounded-lg py-2.5 px-4 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'Update Bundle' : 'Create Bundle'}
          </button>
          <button onClick={onCancel} className="px-6 py-2.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg border">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Test manually, commit**

```bash
git add app/admin/bundles/page.tsx src/components/admin/BundleList.tsx src/components/admin/BundleForm.tsx src/components/admin/Sidebar.tsx src/lib/cached-queries.ts
git commit -m "feat(bundle): add bundle admin page with list and form"
```

---

### Task 19a: BundleCustomizer Component (Customer-Facing)

**Files:**
- Create: `src/components/BundleCustomizer.tsx`

- [ ] **Step 1: Create the BundleCustomizer component**

```typescript
// src/components/BundleCustomizer.tsx
'use client';

import { useState, useMemo } from 'react';
import { X, Check, ChevronDown, ChevronUp, ShoppingCart } from 'lucide-react';
import type { Bundle, BundleSlot, SlotSelection } from '@/types/bundle';
import type { Variation, AddOn } from '@/types';
import { calculateBundlePrice, calculateBundleSavings, validateBundleSelections } from '@/lib/bundle-engine';

interface Props {
  bundle: Bundle;
  onAddToCart: (bundle: Bundle, selections: SlotSelection[], total: number) => void;
  onClose: () => void;
}

interface SlotState {
  selectedItems: {
    menu_item_id: string;
    selected_variation?: Variation | null;
    selected_add_ons?: AddOn[];
  }[];
  expandedItemId: string | null;
}

export default function BundleCustomizer({ bundle, onAddToCart, onClose }: Props) {
  const [slotStates, setSlotStates] = useState<Record<string, SlotState>>(
    Object.fromEntries(bundle.slots.map((s) => [s.id, { selectedItems: [], expandedItemId: null }])),
  );

  const selections: SlotSelection[] = useMemo(() =>
    bundle.slots.map((slot) => ({
      slot_id: slot.id,
      selected_items: slotStates[slot.id]?.selectedItems ?? [],
    })),
    [bundle.slots, slotStates],
  );

  const validation = useMemo(() => validateBundleSelections(bundle, selections), [bundle, selections]);
  const pricing = useMemo(() => calculateBundlePrice(bundle, selections, new Date()), [bundle, selections]);
  const savings = useMemo(() => calculateBundleSavings(bundle, selections), [bundle, selections]);

  const toggleItem = (slot: BundleSlot, menuItemId: string) => {
    setSlotStates((prev) => {
      const state = prev[slot.id];
      const isSelected = state.selectedItems.some((i) => i.menu_item_id === menuItemId);

      let newItems;
      if (isSelected) {
        newItems = state.selectedItems.filter((i) => i.menu_item_id !== menuItemId);
      } else if (state.selectedItems.length < slot.max_selections) {
        newItems = [...state.selectedItems, { menu_item_id: menuItemId }];
      } else if (slot.max_selections === 1) {
        newItems = [{ menu_item_id: menuItemId }];
      } else {
        return prev;
      }

      return { ...prev, [slot.id]: { ...state, selectedItems: newItems, expandedItemId: isSelected ? null : menuItemId } };
    });
  };

  const setVariation = (slotId: string, menuItemId: string, variation: Variation | null) => {
    setSlotStates((prev) => {
      const state = prev[slotId];
      return {
        ...prev,
        [slotId]: {
          ...state,
          selectedItems: state.selectedItems.map((i) =>
            i.menu_item_id === menuItemId ? { ...i, selected_variation: variation } : i,
          ),
        },
      };
    });
  };

  const toggleAddOn = (slotId: string, menuItemId: string, addOn: AddOn) => {
    setSlotStates((prev) => {
      const state = prev[slotId];
      return {
        ...prev,
        [slotId]: {
          ...state,
          selectedItems: state.selectedItems.map((i) => {
            if (i.menu_item_id !== menuItemId) return i;
            const existing = i.selected_add_ons ?? [];
            const has = existing.some((a) => a.id === addOn.id);
            return {
              ...i,
              selected_add_ons: has
                ? existing.filter((a) => a.id !== addOn.id)
                : [...existing, addOn],
            };
          }),
        },
      };
    });
  };

  const handleAdd = () => {
    if (!validation.valid) return;
    onAddToCart(bundle, selections, pricing.total);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="bg-white w-full max-w-lg max-h-[90vh] rounded-t-2xl sm:rounded-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-semibold">{bundle.name}</h2>
            {bundle.description && <p className="text-sm text-gray-500">{bundle.description}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Slots */}
        <div className="p-5 space-y-6">
          {bundle.slots.map((slot) => {
            const state = slotStates[slot.id];
            const selectedCount = state.selectedItems.length;

            return (
              <div key={slot.id}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-stone-700">{slot.label}</h3>
                  <span className="text-xs text-gray-400">
                    {selectedCount}/{slot.max_selections} selected
                    {slot.min_selections > 0 && ` (min ${slot.min_selections})`}
                  </span>
                </div>

                <div className="space-y-2">
                  {slot.items.map((slotItem) => {
                    const mi = slotItem.menu_item;
                    if (!mi) return null;
                    const isSelected = state.selectedItems.some((i) => i.menu_item_id === slotItem.menu_item_id);
                    const isExpanded = state.expandedItemId === slotItem.menu_item_id && isSelected;
                    const selectedItem = state.selectedItems.find((i) => i.menu_item_id === slotItem.menu_item_id);

                    return (
                      <div key={slotItem.id} className={`border rounded-lg overflow-hidden ${isSelected ? 'border-green-500 bg-green-50/30' : ''}`}>
                        <button
                          onClick={() => toggleItem(slot, slotItem.menu_item_id)}
                          className="w-full flex items-center gap-3 p-3 text-left"
                        >
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          {mi.image && <img src={mi.image} alt="" className="w-10 h-10 rounded-lg object-cover" />}
                          <div className="flex-1">
                            <span className="text-sm font-medium">{mi.name}</span>
                          </div>
                          <span className="text-sm text-gray-500">
                            {slotItem.price_override !== null ? `₱${slotItem.price_override}` : 'Included'}
                          </span>
                          {isSelected && mi.variations && mi.variations.length > 0 && (
                            isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />
                          )}
                        </button>

                        {/* Variation / Add-on customization */}
                        {isExpanded && selectedItem && (
                          <div className="px-3 pb-3 space-y-3 border-t bg-gray-50/50">
                            {mi.variations && mi.variations.length > 0 && (
                              <div className="pt-2">
                                <p className="text-xs font-medium text-gray-500 mb-1.5">Size</p>
                                <div className="flex gap-2 flex-wrap">
                                  {mi.variations.map((v) => (
                                    <button
                                      key={v.id}
                                      onClick={() => setVariation(slot.id, mi.id, selectedItem.selected_variation?.id === v.id ? null : v)}
                                      className={`px-3 py-1 rounded-full text-xs border ${
                                        selectedItem.selected_variation?.id === v.id
                                          ? 'bg-black text-white border-black'
                                          : 'border-gray-300 hover:border-gray-400'
                                      }`}
                                    >
                                      {v.name} {v.price > 0 && `+₱${v.price}`}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {mi.addOns && mi.addOns.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-gray-500 mb-1.5">Add-ons</p>
                                <div className="flex gap-2 flex-wrap">
                                  {mi.addOns.map((ao) => {
                                    const isAdded = selectedItem.selected_add_ons?.some((a) => a.id === ao.id);
                                    return (
                                      <button
                                        key={ao.id}
                                        onClick={() => toggleAddOn(slot.id, mi.id, ao)}
                                        className={`px-3 py-1 rounded-full text-xs border ${
                                          isAdded ? 'bg-black text-white border-black' : 'border-gray-300 hover:border-gray-400'
                                        }`}
                                      >
                                        {ao.name} +₱{ao.price}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t px-5 py-4 space-y-2">
          {savings.savings > 0 && (
            <p className="text-center text-sm text-green-700 font-medium">
              You save ₱{savings.savings.toFixed(0)} ({savings.savingsPercent.toFixed(0)}%)
            </p>
          )}
          <button
            onClick={handleAdd}
            disabled={!validation.valid}
            className="w-full bg-black text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <ShoppingCart className="w-4 h-4" />
            Add to Cart — ₱{pricing.total.toFixed(0)}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/BundleCustomizer.tsx
git commit -m "feat(bundle): add customer-facing BundleCustomizer component"
```

---

### Task 19b: Cart & Menu Integration for Bundles

**Files:**
- Modify: `src/contexts/CartContext.tsx` — Add bundle cart support
- Modify: `src/components/Menu.tsx` — Show bundles alongside menu items

- [ ] **Step 1: Update CartContext to handle bundle items**

In `src/contexts/CartContext.tsx`, add bundle support:

```typescript
// Add to CartContextType interface:
addBundleToCart: (bundle: Bundle, selections: SlotSelection[], total: number) => void;

// Add to CartProvider:
// Import at top:
// import type { Bundle, SlotSelection, BundleCartItem } from '@/types/bundle';

// Add state for bundle items alongside regular items, OR extend CartItem.
// Simplest approach: add optional bundle fields to cart items.
// The addBundleToCart function creates a cart entry with:
const addBundleToCart = useCallback((bundle: Bundle, selections: SlotSelection[], total: number) => {
  const cartKey = `bundle-${bundle.id}-${Date.now()}`;

  fpixel.trackAddToCart(total, 'PHP', bundle.name, bundle.id);

  setCartItems((prev) => [
    ...prev,
    {
      id: cartKey,
      name: bundle.name,
      description: bundle.description ?? '',
      basePrice: bundle.base_price,
      category: bundle.category,
      image: bundle.image_url ?? undefined,
      quantity: 1,
      totalPrice: total,
      menuItemId: undefined,
      // Bundle-specific fields
      bundleId: bundle.id,
      bundleSelections: selections,
    } as any,
  ]);
}, []);
```

Also update the CartContextType and Provider value to include `addBundleToCart`.

- [ ] **Step 2: Update Menu.tsx to show bundles**

In `src/components/Menu.tsx`, accept bundles as a prop and render them alongside menu items. Clicking a bundle opens `BundleCustomizer`.

Add to MenuProps:
```typescript
bundles?: Bundle[];
```

In the category sections, render bundles that match the active category as cards with an "Order Bundle" button. When clicked, show `<BundleCustomizer />`.

- [ ] **Step 3: Pass bundles to Menu from the page that renders it**

Fetch bundles in the page that renders Menu (e.g., the home page or order page) and pass them down.

- [ ] **Step 4: Test manually — add a bundle to cart, verify it appears in cart display**

- [ ] **Step 5: Commit**

```bash
git add src/contexts/CartContext.tsx src/components/Menu.tsx
git commit -m "feat(bundle): integrate bundles into cart context and menu display"
```

---

### Task 19c: Order API Bundle Support

**Files:**
- Modify: `app/api/orders/route.ts` — Handle bundle items in order creation

- [ ] **Step 1: Update order creation to handle bundle items**

In the `POST` handler of `app/api/orders/route.ts`, add bundle handling:

```typescript
// Add imports at top:
// import { validateBundleSelections, calculateBundlePrice } from '@/lib/bundle-engine';
// import type { SlotSelection, BundleSelectionRecord } from '@/types/bundle';

// In buildOrderItemsFromCart (or after it), detect bundle items:
// A bundle cart item has a bundleId field instead of menuItemId.

// Add a new function:
const buildBundleOrderItem = async (item: any) => {
  const bundleId = item.bundleId;
  if (!bundleId) return null;

  // Fetch bundle with slots
  const { data: bundle, error } = await (supabaseServer.from('bundles') as any)
    .select(`
      *,
      bundle_slots (*, bundle_slot_items (*, menu_items (id, name, base_price, cost_price, variations (*), add_ons (*))))
    `)
    .eq('id', bundleId)
    .single();

  if (error || !bundle) throw new Error('Bundle not found or unavailable');
  if (!bundle.available) throw new Error('Bundle is no longer available');

  // Map DB shape to type shape
  const mappedBundle = {
    ...bundle,
    base_price: Number(bundle.base_price),
    cost_price: bundle.cost_price !== null ? Number(bundle.cost_price) : null,
    discount_price: bundle.discount_price !== null ? Number(bundle.discount_price) : null,
    slots: (bundle.bundle_slots || []).map((s: any) => ({
      ...s,
      items: (s.bundle_slot_items || []).map((si: any) => ({
        ...si,
        price_override: si.price_override !== null ? Number(si.price_override) : null,
        menu_item: si.menu_items ? {
          id: si.menu_items.id,
          name: si.menu_items.name,
          basePrice: Number(si.menu_items.base_price),
          description: '',
          category: '',
        } : undefined,
      })),
    })),
  };

  const selections: SlotSelection[] = item.bundleSelections || [];

  // Server-side validation
  const validation = validateBundleSelections(mappedBundle, selections);
  if (!validation.valid) throw new Error('Invalid bundle selections: ' + validation.errors.join(', '));

  // Server-side price computation (prevents price manipulation)
  const pricing = calculateBundlePrice(mappedBundle, selections, new Date());

  const quantity = Number(item.quantity) || 1;

  // Build bundle_selections JSONB
  const bundleSelectionsJson: BundleSelectionRecord[] = [];
  for (const sel of selections) {
    const slot = mappedBundle.slots.find((s: any) => s.id === sel.slot_id);
    for (const si of sel.selected_items) {
      const slotItem = slot?.items.find((i: any) => i.menu_item_id === si.menu_item_id);
      bundleSelectionsJson.push({
        slot_label: slot?.label ?? '',
        item_name: slotItem?.menu_item?.name ?? '',
        item_price: slotItem?.price_override ?? 0,
        variation: si.selected_variation ? { name: si.selected_variation.name, price: si.selected_variation.price } : null,
        add_ons: (si.selected_add_ons ?? []).map((a) => ({ name: a.name, price: a.price })),
      });
    }
  }

  return {
    menu_item_id: null,
    menu_item_name: mappedBundle.name,
    quantity,
    unit_price: pricing.total,
    total_price: pricing.total * quantity,
    selected_variation: null,
    selected_add_ons: null,
    cost_price: mappedBundle.cost_price,
    bundle_id: bundleId,
    bundle_selections: bundleSelectionsJson,
  };
};
```

Then in the POST handler, partition cart items into regular and bundle items:

```typescript
const regularItems = cartItems.filter((item: any) => !item.bundleId);
const bundleItems = cartItems.filter((item: any) => item.bundleId);

const regularOrderItems = buildOrderItemsFromCart(regularItems, menuItemsById);
const bundleOrderItems = await Promise.all(bundleItems.map(buildBundleOrderItem));

const allOrderItems = [...regularOrderItems, ...bundleOrderItems.filter(Boolean)];
```

- [ ] **Step 2: Test manually — order a bundle end-to-end, verify order_items in DB**

- [ ] **Step 3: Commit**

```bash
git add app/api/orders/route.ts
git commit -m "feat(bundle): add bundle validation and pricing to order API"
```

---

### Task 19d: Bundle Order Display in Admin

**Files:**
- Modify: `src/components/admin/OrderDetail.tsx` (or the component that renders order item details)

- [ ] **Step 1: Show bundle details in order view**

When rendering order items, detect if `bundle_selections` is present. If so, render the bundle name and a nested list of slot selections showing: slot label, item name, variation, and add-ons.

```typescript
// Inside the order item rendering:
{item.bundle_selections && (
  <div className="mt-2 ml-4 space-y-1">
    {(item.bundle_selections as BundleSelectionRecord[]).map((sel, idx) => (
      <div key={idx} className="text-xs text-gray-500">
        <span className="font-medium">{sel.slot_label}:</span>{' '}
        {sel.item_name}
        {sel.variation && ` (${sel.variation.name} +₱${sel.variation.price})`}
        {sel.add_ons.length > 0 && ` + ${sel.add_ons.map(a => a.name).join(', ')}`}
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 2: Test manually, commit**

```bash
git add src/components/admin/OrderDetail.tsx
git commit -m "feat(bundle): show bundle selections in admin order detail view"
```

---

## Phase 3: Upsell Engine & Admin

### Task 20: Upsell Database Migration

**Files:**
- Create: `supabase/migrations/20260320000002_add_upsell.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260320000002_add_upsell.sql

-- ── 1. Enums ─────────────────────────────────────────────────────────────────

CREATE TYPE upsell_phase AS ENUM ('upgrade', 'best_pair', 'interstitial');
CREATE TYPE upsell_trigger_type AS ENUM ('item', 'category', 'cart_total', 'cart_empty_category');
CREATE TYPE upsell_offer_type AS ENUM ('item', 'bundle', 'discount', 'loyalty_nudge');

-- ── 2. Upsell rules ─────────────────────────────────────────────────────────

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

-- ── 3. Add-on suggestions ───────────────────────────────────────────────────

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

-- ── 4. Pair rules ───────────────────────────────────────────────────────────

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
```

- [ ] **Step 2: Apply and commit**

```bash
git add supabase/migrations/20260320000002_add_upsell.sql
git commit -m "feat(db): add upsell tables with RLS, indexes, and constraints"
```

---

### Task 21: Upsell Types

**Files:**
- Create: `src/types/upsell.ts`

- [ ] **Step 1: Create the upsell types file**

```typescript
// src/types/upsell.ts

import type { MenuItem } from '@/types';
import type { Bundle } from '@/types/bundle';
import type { AddOn } from '@/types';

export type UpsellPhase = 'upgrade' | 'best_pair' | 'interstitial';
export type UpsellTriggerType = 'item' | 'category' | 'cart_total' | 'cart_empty_category';
export type UpsellOfferType = 'item' | 'bundle' | 'discount' | 'loyalty_nudge';

export interface UpsellRule {
  id: string;
  name: string;
  phase: UpsellPhase;
  trigger_type: UpsellTriggerType;
  trigger_item_ids: string[];
  trigger_category_ids: string[];
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
  offer_item?: MenuItem;
  offer_bundle?: Bundle;
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
  starts_at: string | null;
  ends_at: string | null;
  add_on?: AddOn;
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
  paired_item?: MenuItem;
  paired_bundle?: Bundle;
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

/** Lightweight cart item shape used by the upsell engine. */
export interface UpsellCartItem {
  menu_item_id: string;
  category: string;
  base_price: number;
  quantity: number;
  bundle_id?: string | null;
}

/** Cart shape used for interstitial matching. */
export interface UpsellCart {
  items: UpsellCartItem[];
  total: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/upsell.ts
git commit -m "feat(types): add upsell types"
```

---

### Task 22: Upsell Engine — Pure Business Logic

**Files:**
- Create: `src/lib/upsell-engine.ts`
- Create: `tests/upsell-engine.test.ts`

- [ ] **Step 1: Write tests for all upsell engine functions**

```typescript
// tests/upsell-engine.test.ts
import { describe, it, expect } from 'vitest';
import {
  filterActiveRules,
  prioritizeOffers,
  shouldShowLoyaltyNudge,
  matchUpgradeOffers,
  suggestAddOns,
  matchPairOffers,
  matchInterstitialOffers,
} from '@/lib/upsell-engine';
import type { UpsellRule, AddonSuggestion, PairRule, UpsellCartItem, UpsellCart } from '@/types/upsell';
import type { LoyaltyCard, LoyaltyConfig, LoyaltyReward } from '@/types/loyalty';

// ── Fixture builders ──────────────────────────────────────────

const makeRule = (overrides: Partial<UpsellRule> = {}): UpsellRule => ({
  id: 'rule-1',
  name: 'Test Rule',
  phase: 'upgrade',
  trigger_type: 'item',
  trigger_item_ids: ['mi-1'],
  trigger_category_ids: [],
  trigger_min_total: null,
  offer_type: 'item',
  offer_item_id: 'mi-2',
  offer_bundle_id: null,
  offer_discount_percent: null,
  offer_message: 'Upgrade!',
  priority: 10,
  is_active: true,
  starts_at: null,
  ends_at: null,
  offer_item: { id: 'mi-2', name: 'Premium Shake', description: '', basePrice: 180, category: 'shakes' },
  ...overrides,
});

const makeCartItem = (overrides: Partial<UpsellCartItem> = {}): UpsellCartItem => ({
  menu_item_id: 'mi-1',
  category: 'shakes',
  base_price: 120,
  quantity: 1,
  ...overrides,
});

const makeSuggestion = (overrides: Partial<AddonSuggestion> = {}): AddonSuggestion => ({
  id: 'sug-1',
  menu_item_id: 'mi-1',
  add_on_id: 'ao-1',
  suggestion_text: 'Most customers add this!',
  sort_order: 0,
  is_active: true,
  starts_at: null,
  ends_at: null,
  add_on: { id: 'ao-1', name: 'Whipped Cream', price: 15, category: 'toppings' },
  ...overrides,
});

const makePairRule = (overrides: Partial<PairRule> = {}): PairRule => ({
  id: 'pair-1',
  source_item_id: 'mi-1',
  source_category_id: null,
  paired_item_id: 'mi-5',
  paired_bundle_id: null,
  message: 'Goes great together!',
  priority: 5,
  is_active: true,
  paired_item: { id: 'mi-5', name: 'Belgian Fries', description: '', basePrice: 89, category: 'snacks' },
  ...overrides,
});

const NOW = new Date('2026-06-15T12:00:00Z');

// ── filterActiveRules ─────────────────────────────────────────

describe('filterActiveRules', () => {
  it('keeps active rules with no date bounds', () => {
    const rules = [makeRule()];
    expect(filterActiveRules(rules, NOW)).toHaveLength(1);
  });

  it('excludes inactive rules', () => {
    const rules = [makeRule({ is_active: false })];
    expect(filterActiveRules(rules, NOW)).toHaveLength(0);
  });

  it('excludes expired rules', () => {
    const rules = [makeRule({ ends_at: '2026-01-01T00:00:00Z' })];
    expect(filterActiveRules(rules, NOW)).toHaveLength(0);
  });

  it('excludes not-yet-started rules', () => {
    const rules = [makeRule({ starts_at: '2026-12-01T00:00:00Z' })];
    expect(filterActiveRules(rules, NOW)).toHaveLength(0);
  });

  it('keeps rules within date range', () => {
    const rules = [makeRule({ starts_at: '2026-06-01T00:00:00Z', ends_at: '2026-06-30T00:00:00Z' })];
    expect(filterActiveRules(rules, NOW)).toHaveLength(1);
  });
});

// ── prioritizeOffers ──────────────────────────────────────────

describe('prioritizeOffers', () => {
  it('sorts by priority descending and limits count', () => {
    const offers = [
      { priority: 5, name: 'low' },
      { priority: 20, name: 'high' },
      { priority: 10, name: 'mid' },
    ];
    const result = prioritizeOffers(offers, 2);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('high');
    expect(result[1].name).toBe('mid');
  });

  it('returns all if fewer than maxCount', () => {
    const offers = [{ priority: 1, name: 'only' }];
    expect(prioritizeOffers(offers, 5)).toHaveLength(1);
  });
});

// ── shouldShowLoyaltyNudge ────────────────────────────────────

describe('shouldShowLoyaltyNudge', () => {
  const config: LoyaltyConfig = {
    id: 'cfg-1',
    stamps_enabled: true,
    points_enabled: true,
    points_per_peso: 0.1,
    stamps_per_order: 1,
    filter_mode: 'blocklist',
    filtered_category_ids: [],
    filtered_item_ids: [],
    claim_window_days: 7,
    updated_at: '2026-01-01',
  };

  const card: LoyaltyCard = {
    id: 'card-1',
    customer_id: 'cust-1',
    card_code: 'ABC123',
    current_stamps: 8,
    current_points: 200,
    goal_reward_id: 'reward-1',
    lifetime_stamps: 50,
    lifetime_points: 1000,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };

  const reward: LoyaltyReward = {
    id: 'reward-1',
    name: 'Free Shake',
    description: null,
    image_url: null,
    stamps_required: 10,
    points_required: null,
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };

  it('shows nudge when close to stamp goal', () => {
    const result = shouldShowLoyaltyNudge(card, config, reward);
    expect(result.show).toBe(true);
    expect(result.stampsAway).toBe(2);
    expect(result.message).toContain('2');
  });

  it('does not show when stamps are not enabled', () => {
    const result = shouldShowLoyaltyNudge(card, { ...config, stamps_enabled: false }, reward);
    // Points-based nudge may still show if points_required is set
    expect(result.show).toBe(false);
  });

  it('does not show when no goal reward', () => {
    const result = shouldShowLoyaltyNudge(card, config, null);
    expect(result.show).toBe(false);
  });
});

// ── matchUpgradeOffers ────────────────────────────────────────

describe('matchUpgradeOffers', () => {
  it('matches item trigger against cart contents', () => {
    const rules = [makeRule({ phase: 'upgrade', trigger_type: 'item', trigger_item_ids: ['mi-1'] })];
    const cart = [makeCartItem({ menu_item_id: 'mi-1' })];
    const offers = matchUpgradeOffers(cart, rules, NOW);
    expect(offers).toHaveLength(1);
    expect(offers[0].rule.id).toBe('rule-1');
  });

  it('matches category trigger', () => {
    const rules = [makeRule({ phase: 'upgrade', trigger_type: 'category', trigger_category_ids: ['shakes'] })];
    const cart = [makeCartItem({ category: 'shakes' })];
    const offers = matchUpgradeOffers(cart, rules, NOW);
    expect(offers).toHaveLength(1);
  });

  it('returns empty when no match', () => {
    const rules = [makeRule({ phase: 'upgrade', trigger_type: 'item', trigger_item_ids: ['mi-99'] })];
    const cart = [makeCartItem({ menu_item_id: 'mi-1' })];
    expect(matchUpgradeOffers(cart, rules, NOW)).toHaveLength(0);
  });

  it('excludes inactive rules', () => {
    const rules = [makeRule({ is_active: false })];
    const cart = [makeCartItem()];
    expect(matchUpgradeOffers(cart, rules, NOW)).toHaveLength(0);
  });

  it('returns max 3 offers sorted by priority', () => {
    const rules = Array.from({ length: 5 }, (_, i) =>
      makeRule({ id: `rule-${i}`, priority: i * 10, trigger_type: 'item', trigger_item_ids: ['mi-1'] }),
    );
    const cart = [makeCartItem()];
    const offers = matchUpgradeOffers(cart, rules, NOW);
    expect(offers).toHaveLength(3);
    expect(offers[0].rule.priority).toBe(40);
  });
});

// ── suggestAddOns ─────────────────────────────────────────────

describe('suggestAddOns', () => {
  it('returns active suggestions for the given item sorted by sort_order', () => {
    const suggestions = [
      makeSuggestion({ sort_order: 2 }),
      makeSuggestion({ id: 'sug-2', add_on_id: 'ao-2', sort_order: 1, add_on: { id: 'ao-2', name: 'Sprinkles', price: 10, category: 'toppings' } }),
    ];
    const result = suggestAddOns('mi-1', suggestions, NOW);
    expect(result).toHaveLength(2);
    expect(result[0].add_on_id).toBe('ao-2'); // sort_order 1 first
  });

  it('excludes inactive suggestions', () => {
    const suggestions = [makeSuggestion({ is_active: false })];
    expect(suggestAddOns('mi-1', suggestions, NOW)).toHaveLength(0);
  });

  it('excludes expired suggestions', () => {
    const suggestions = [makeSuggestion({ ends_at: '2026-01-01T00:00:00Z' })];
    expect(suggestAddOns('mi-1', suggestions, NOW)).toHaveLength(0);
  });

  it('returns empty for different menu item', () => {
    const suggestions = [makeSuggestion({ menu_item_id: 'mi-99' })];
    expect(suggestAddOns('mi-1', suggestions, NOW)).toHaveLength(0);
  });
});

// ── matchPairOffers ───────────────────────────────────────────

describe('matchPairOffers', () => {
  it('matches source item against cart', () => {
    const rules = [makePairRule({ source_item_id: 'mi-1' })];
    const cart = [makeCartItem({ menu_item_id: 'mi-1' })];
    const offers = matchPairOffers(cart, rules, NOW);
    expect(offers).toHaveLength(1);
    expect(offers[0].item?.id).toBe('mi-5');
  });

  it('matches source category against cart', () => {
    const rules = [makePairRule({ source_item_id: null, source_category_id: 'shakes' })];
    const cart = [makeCartItem({ category: 'shakes' })];
    const offers = matchPairOffers(cart, rules, NOW);
    expect(offers).toHaveLength(1);
  });

  it('excludes items already in cart', () => {
    const rules = [makePairRule({ paired_item_id: 'mi-1' })]; // same as cart item
    const cart = [makeCartItem({ menu_item_id: 'mi-1' })];
    const offers = matchPairOffers(cart, rules, NOW);
    expect(offers).toHaveLength(0);
  });

  it('skips rules with null paired target', () => {
    const rules = [makePairRule({ paired_item_id: null, paired_bundle_id: null, paired_item: undefined })];
    const cart = [makeCartItem()];
    const offers = matchPairOffers(cart, rules, NOW);
    expect(offers).toHaveLength(0);
  });

  it('returns max 4 offers', () => {
    const rules = Array.from({ length: 6 }, (_, i) =>
      makePairRule({ id: `pair-${i}`, priority: i, paired_item_id: `mi-${i + 10}`, paired_item: { id: `mi-${i + 10}`, name: `Item ${i}`, description: '', basePrice: 50, category: 'snacks' } }),
    );
    const cart = [makeCartItem()];
    expect(matchPairOffers(cart, rules, NOW)).toHaveLength(4);
  });
});

// ── matchInterstitialOffers ───────────────────────────────────

describe('matchInterstitialOffers', () => {
  it('returns single highest-priority item offer', () => {
    const rules = [
      makeRule({ id: 'r1', phase: 'interstitial', trigger_type: 'cart_total', trigger_min_total: 100, priority: 5 }),
      makeRule({ id: 'r2', phase: 'interstitial', trigger_type: 'cart_total', trigger_min_total: 100, priority: 20 }),
    ];
    const cart: UpsellCart = { items: [makeCartItem()], total: 200 };
    const result = matchInterstitialOffers(cart, rules, null, null, NOW);
    expect(result).not.toBeNull();
    expect(result!.rule.id).toBe('r2');
  });

  it('returns null when no rules match', () => {
    const rules = [makeRule({ phase: 'interstitial', trigger_type: 'cart_total', trigger_min_total: 999 })];
    const cart: UpsellCart = { items: [], total: 50 };
    expect(matchInterstitialOffers(cart, rules, null, null, NOW)).toBeNull();
  });

  it('returns loyalty nudge when card is close to goal', () => {
    const rules = [makeRule({
      phase: 'interstitial',
      trigger_type: 'cart_total',
      trigger_min_total: 0,
      offer_type: 'loyalty_nudge',
      offer_item_id: null,
    })];
    const cart: UpsellCart = { items: [makeCartItem()], total: 120 };
    const card: LoyaltyCard = {
      id: 'card-1', customer_id: 'c1', card_code: 'X', current_stamps: 9, current_points: 0,
      goal_reward_id: 'r1', lifetime_stamps: 9, lifetime_points: 0, created_at: '', updated_at: '',
    };
    const config: LoyaltyConfig = {
      id: 'cfg', stamps_enabled: true, points_enabled: false, points_per_peso: 0, stamps_per_order: 1,
      filter_mode: 'blocklist', filtered_category_ids: [], filtered_item_ids: [], claim_window_days: 7, updated_at: '',
    };
    // Note: matchInterstitialOffers needs goalReward passed via config lookup
    // For this test we verify the loyalty_nudge type is returned
    const result = matchInterstitialOffers(cart, rules, card, config, NOW);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('loyalty_nudge');
  });
});
```

- [ ] **Step 2: Implement all upsell engine functions**

```typescript
// src/lib/upsell-engine.ts
// Pure business logic for the upsell system — no I/O, no DB, no network.

import type {
  UpsellRule,
  UpsellOffer,
  AddonSuggestion,
  PairRule,
  PairOffer,
  InterstitialOffer,
  UpsellCartItem,
  UpsellCart,
} from '@/types/upsell';
import type { LoyaltyCard, LoyaltyConfig, LoyaltyReward } from '@/types/loyalty';

// ── Shared helpers ────────────────────────────────────────────

/**
 * Filter rules/suggestions to only those that are active and within date range.
 */
export function filterActiveRules<T extends { is_active: boolean; starts_at?: string | null; ends_at?: string | null }>(
  rules: T[],
  now: Date,
): T[] {
  return rules.filter((rule) => {
    if (!rule.is_active) return false;
    if (rule.starts_at && new Date(rule.starts_at) > now) return false;
    if (rule.ends_at && new Date(rule.ends_at) < now) return false;
    return true;
  });
}

/**
 * Sort by priority descending and return at most maxCount.
 */
export function prioritizeOffers<T extends { priority: number }>(
  offers: T[],
  maxCount: number,
): T[] {
  return [...offers]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, maxCount);
}

/**
 * Check if a loyalty nudge should be shown.
 */
export function shouldShowLoyaltyNudge(
  card: LoyaltyCard,
  config: LoyaltyConfig,
  goalReward: LoyaltyReward | null,
): { show: boolean; message: string; stampsAway: number | null; pointsAway: number | null } {
  if (!goalReward) return { show: false, message: '', stampsAway: null, pointsAway: null };

  let stampsAway: number | null = null;
  let pointsAway: number | null = null;

  if (config.stamps_enabled && goalReward.stamps_required !== null) {
    stampsAway = goalReward.stamps_required - card.current_stamps;
  }

  if (config.points_enabled && goalReward.points_required !== null) {
    pointsAway = goalReward.points_required - card.current_points;
  }

  // Show if within 3 stamps or 50 points of goal
  const closeByStamps = stampsAway !== null && stampsAway > 0 && stampsAway <= 3;
  const closeByPoints = pointsAway !== null && pointsAway > 0 && pointsAway <= 50;

  if (!closeByStamps && !closeByPoints) {
    return { show: false, message: '', stampsAway, pointsAway };
  }

  let message = '';
  if (closeByStamps) {
    message = `You're just ${stampsAway} stamp${stampsAway === 1 ? '' : 's'} away from ${goalReward.name}!`;
  } else if (closeByPoints) {
    message = `You're just ${pointsAway} points away from ${goalReward.name}!`;
  }

  return { show: true, message, stampsAway, pointsAway };
}

// ── Trigger matching helpers ──────────────────────────────────

function matchesTrigger(rule: UpsellRule, cartItems: UpsellCartItem[], cartTotal: number): boolean {
  switch (rule.trigger_type) {
    case 'item':
      return cartItems.some((ci) => rule.trigger_item_ids.includes(ci.menu_item_id));
    case 'category':
      return cartItems.some((ci) => rule.trigger_category_ids.includes(ci.category));
    case 'cart_total':
      return rule.trigger_min_total !== null && cartTotal >= rule.trigger_min_total;
    case 'cart_empty_category':
      return rule.trigger_category_ids.length > 0 &&
        rule.trigger_category_ids.every((cat) => !cartItems.some((ci) => ci.category === cat));
    default:
      return false;
  }
}

// ── Phase 1: Upgrade ──────────────────────────────────────────

/**
 * Match upgrade offers against cart contents.
 * Returns max 3 offers sorted by priority.
 */
export function matchUpgradeOffers(
  cartItems: UpsellCartItem[],
  rules: UpsellRule[],
  now: Date,
): UpsellOffer[] {
  const active = filterActiveRules(
    rules.filter((r) => r.phase === 'upgrade'),
    now,
  );

  const cartTotal = cartItems.reduce((sum, ci) => sum + ci.base_price * ci.quantity, 0);

  const matched: UpsellOffer[] = active
    .filter((rule) => matchesTrigger(rule, cartItems, cartTotal))
    .filter((rule) => {
      // Skip rules with null offer targets
      if (rule.offer_type === 'item' && !rule.offer_item_id) return false;
      if (rule.offer_type === 'bundle' && !rule.offer_bundle_id) return false;
      return true;
    })
    .map((rule) => ({
      rule,
      savings: null,
      display_price: rule.offer_item?.basePrice ?? 0,
    }));

  return prioritizeOffers(matched, 3);
}

// ── Phase 2: Add-on suggestions ───────────────────────────────

/**
 * Filter and sort add-on suggestions for a specific menu item.
 */
export function suggestAddOns(
  menuItemId: string,
  suggestions: AddonSuggestion[],
  now: Date,
): AddonSuggestion[] {
  return filterActiveRules(suggestions, now)
    .filter((s) => s.menu_item_id === menuItemId)
    .sort((a, b) => a.sort_order - b.sort_order);
}

// ── Phase 3: Best pair ────────────────────────────────────────

/**
 * Match pair rules against cart contents.
 * Excludes paired items already in cart. Returns max 4.
 */
export function matchPairOffers(
  cartItems: UpsellCartItem[],
  pairRules: PairRule[],
  now: Date,
): PairOffer[] {
  const active = filterActiveRules(
    pairRules.filter((r) => r.is_active),
    now,
  );

  const cartItemIds = new Set(cartItems.map((ci) => ci.menu_item_id));
  const cartCategories = new Set(cartItems.map((ci) => ci.category));

  const matched: PairOffer[] = active
    .filter((rule) => {
      // Check source matches cart
      if (rule.source_item_id && !cartItemIds.has(rule.source_item_id)) return false;
      if (rule.source_category_id && !cartCategories.has(rule.source_category_id)) return false;
      if (!rule.source_item_id && !rule.source_category_id) return false;
      return true;
    })
    .filter((rule) => {
      // Exclude paired items already in cart
      if (rule.paired_item_id && cartItemIds.has(rule.paired_item_id)) return false;
      // Skip rules with null targets (deleted items)
      if (!rule.paired_item_id && !rule.paired_bundle_id) return false;
      if (rule.paired_item_id && !rule.paired_item) return false;
      return true;
    })
    .map((rule) => ({
      rule,
      item: rule.paired_item ?? null,
      bundle: rule.paired_bundle ?? null,
    }));

  return prioritizeOffers(matched, 4);
}

// ── Phase 4: Checkout interstitial ────────────────────────────

/**
 * Match a single interstitial offer (highest priority).
 */
export function matchInterstitialOffers(
  cart: UpsellCart,
  rules: UpsellRule[],
  loyaltyCard: LoyaltyCard | null,
  loyaltyConfig: LoyaltyConfig | null,
  now: Date,
): InterstitialOffer | null {
  const active = filterActiveRules(
    rules.filter((r) => r.phase === 'interstitial'),
    now,
  );

  const sorted = [...active].sort((a, b) => b.priority - a.priority);

  for (const rule of sorted) {
    if (!matchesTrigger(rule, cart.items, cart.total)) continue;

    // Loyalty nudge: check card state
    if (rule.offer_type === 'loyalty_nudge') {
      if (!loyaltyCard || !loyaltyConfig) continue;
      // The loyalty nudge is always eligible if matched — actual nudge data is computed at render time
      return {
        rule,
        type: 'loyalty_nudge',
        item: null,
        bundle: null,
        discounted_price: null,
        loyalty_message: rule.offer_message,
      };
    }

    // Item offer
    if (rule.offer_type === 'item' && rule.offer_item) {
      return {
        rule,
        type: 'item',
        item: rule.offer_item,
        bundle: null,
        discounted_price: null,
        loyalty_message: null,
      };
    }

    // Bundle offer
    if (rule.offer_type === 'bundle' && rule.offer_bundle) {
      return {
        rule,
        type: 'bundle',
        item: null,
        bundle: rule.offer_bundle,
        discounted_price: null,
        loyalty_message: null,
      };
    }

    // Discount offer
    if (rule.offer_type === 'discount' && rule.offer_item && rule.offer_discount_percent) {
      const discounted = rule.offer_item.basePrice * (1 - rule.offer_discount_percent / 100);
      return {
        rule,
        type: 'discount',
        item: rule.offer_item,
        bundle: null,
        discounted_price: Math.round(discounted * 100) / 100,
        loyalty_message: null,
      };
    }
  }

  return null;
}
```

- [ ] **Step 3: Run tests, verify pass**

Run: `npx vitest run tests/upsell-engine.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/upsell-engine.ts tests/upsell-engine.test.ts
git commit -m "feat(upsell): add upsell engine with all 4 phase matchers"
```

---

### Task 23: Upsell Validation Schemas

**Files:**
- Modify: `src/lib/validation.ts`

- [ ] **Step 1: Add upsell Zod schemas**

Add to the end of `src/lib/validation.ts`:

```typescript
// ─── Upsell Rule schemas ─────────────────────────────────────────────────────

export const upsellRuleSchema = z.object({
  name: sanitized.pipe(z.string().min(1, 'Rule name is required').max(200)),
  phase: z.enum(['upgrade', 'best_pair', 'interstitial']),
  trigger_type: z.enum(['item', 'category', 'cart_total', 'cart_empty_category']),
  trigger_item_ids: z.array(uuidSchema).default([]),
  trigger_category_ids: z.array(z.string().min(1)).default([]),
  trigger_min_total: z.number().min(0).nullable().optional(),
  offer_type: z.enum(['item', 'bundle', 'discount', 'loyalty_nudge']),
  offer_item_id: uuidSchema.nullable().optional(),
  offer_bundle_id: uuidSchema.nullable().optional(),
  offer_discount_percent: z.number().min(1).max(100).nullable().optional(),
  offer_message: sanitized.pipe(z.string().max(500)).nullable().optional(),
  priority: z.number().int().min(0).max(999).default(0),
  is_active: z.boolean().optional().default(true),
  starts_at: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
});

export type UpsellRuleInput = z.infer<typeof upsellRuleSchema>;

// ─── Add-on Suggestion schemas ───────────────────────────────────────────────

export const addonSuggestionInputSchema = z.object({
  add_on_id: uuidSchema,
  suggestion_text: sanitized.pipe(z.string().max(200)).nullable().optional(),
  sort_order: z.number().int().nonnegative().default(0),
  is_active: z.boolean().optional().default(true),
  starts_at: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
});

export const setAddonSuggestionsSchema = z.object({
  menu_item_id: uuidSchema,
  suggestions: z.array(addonSuggestionInputSchema),
});

export type SetAddonSuggestionsInput = z.infer<typeof setAddonSuggestionsSchema>;

// ─── Pair Rule schemas ───────────────────────────────────────────────────────

export const pairRuleSchema = z.object({
  source_item_id: uuidSchema.nullable().optional(),
  source_category_id: z.string().min(1).nullable().optional(),
  paired_item_id: uuidSchema.nullable().optional(),
  paired_bundle_id: uuidSchema.nullable().optional(),
  message: sanitized.pipe(z.string().max(500)).nullable().optional(),
  priority: z.number().int().min(0).max(999).default(0),
  is_active: z.boolean().optional().default(true),
}).refine(
  (data) => (data.source_item_id != null) !== (data.source_category_id != null),
  { message: 'Exactly one of source_item_id or source_category_id must be set', path: ['source_item_id'] },
).refine(
  (data) => (data.paired_item_id != null) !== (data.paired_bundle_id != null),
  { message: 'Exactly one of paired_item_id or paired_bundle_id must be set', path: ['paired_item_id'] },
);

export type PairRuleInput = z.infer<typeof pairRuleSchema>;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/validation.ts
git commit -m "feat(validation): add upsell, addon suggestion, and pair rule Zod schemas"
```

---

### Task 24: Upsell Admin Server Actions

**Files:**
- Create: `src/actions/upsell-admin.ts`
- Create: `tests/unit/actions/upsell-admin.test.ts`

- [ ] **Step 1: Write tests for upsell admin actions**

```typescript
// tests/unit/actions/upsell-admin.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-guard', () => ({
  checkActionRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  requireAdmin: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

let callQueue: { data: any; error: any }[] = [];
const mockFrom = vi.fn(() => {
  const chain: any = {};
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'gte', 'lte', 'ilike', 'order', 'single', 'maybeSingle']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: any) => resolve(callQueue.shift() ?? { data: null, error: null });
  return chain;
});

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: new Proxy({}, {
    get(_, prop) {
      if (prop === 'from') return mockFrom;
      if (prop === 'rpc') return vi.fn().mockResolvedValue({ data: null, error: null });
      return undefined;
    },
  }),
}));

import {
  createUpsellRule,
  updateUpsellRule,
  deleteUpsellRule,
  toggleUpsellRule,
  setAddonSuggestions,
  createPairRule,
  updatePairRule,
  deletePairRule,
} from '@/actions/upsell-admin';

describe('createUpsellRule', () => {
  beforeEach(() => { callQueue = []; vi.clearAllMocks(); });

  it('creates an upsell rule', async () => {
    callQueue.push({ data: { id: 'rule-1' }, error: null });
    const result = await createUpsellRule({
      name: 'Upgrade Shake',
      phase: 'upgrade',
      trigger_type: 'item',
      trigger_item_ids: ['11111111-1111-1111-1111-111111111111'],
      offer_type: 'item',
      offer_item_id: '22222222-2222-2222-2222-222222222222',
      priority: 10,
    });
    expect(result.success).toBe(true);
    expect(result.data?.id).toBe('rule-1');
  });

  it('rejects invalid input', async () => {
    const result = await createUpsellRule({ name: '' });
    expect(result.success).toBe(false);
  });
});

describe('deleteUpsellRule', () => {
  beforeEach(() => { callQueue = []; vi.clearAllMocks(); });

  it('deletes by id', async () => {
    callQueue.push({ data: null, error: null });
    const result = await deleteUpsellRule('11111111-1111-1111-1111-111111111111');
    expect(result.success).toBe(true);
  });
});

describe('toggleUpsellRule', () => {
  beforeEach(() => { callQueue = []; vi.clearAllMocks(); });

  it('toggles active state', async () => {
    callQueue.push({ data: { id: 'r1', is_active: true }, error: null });
    callQueue.push({ data: { id: 'r1', is_active: false }, error: null });
    const result = await toggleUpsellRule('11111111-1111-1111-1111-111111111111');
    expect(result.success).toBe(true);
  });
});

describe('setAddonSuggestions', () => {
  beforeEach(() => { callQueue = []; vi.clearAllMocks(); });

  it('replaces suggestions for a menu item', async () => {
    // Delete existing
    callQueue.push({ data: null, error: null });
    // Insert new
    callQueue.push({ data: [{ id: 'sug-1' }], error: null });
    const result = await setAddonSuggestions({
      menu_item_id: '11111111-1111-1111-1111-111111111111',
      suggestions: [{ add_on_id: '22222222-2222-2222-2222-222222222222', suggestion_text: 'Try this!' }],
    });
    expect(result.success).toBe(true);
  });
});

describe('createPairRule', () => {
  beforeEach(() => { callQueue = []; vi.clearAllMocks(); });

  it('creates a pair rule', async () => {
    callQueue.push({ data: { id: 'pair-1' }, error: null });
    const result = await createPairRule({
      source_item_id: '11111111-1111-1111-1111-111111111111',
      paired_item_id: '22222222-2222-2222-2222-222222222222',
      message: 'Great combo!',
      priority: 5,
    });
    expect(result.success).toBe(true);
  });

  it('rejects when both source fields set', async () => {
    const result = await createPairRule({
      source_item_id: '11111111-1111-1111-1111-111111111111',
      source_category_id: 'shakes',
      paired_item_id: '22222222-2222-2222-2222-222222222222',
    });
    expect(result.success).toBe(false);
  });
});

describe('deletePairRule', () => {
  beforeEach(() => { callQueue = []; vi.clearAllMocks(); });

  it('deletes by id', async () => {
    callQueue.push({ data: null, error: null });
    const result = await deletePairRule('11111111-1111-1111-1111-111111111111');
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Implement upsell admin actions**

```typescript
// src/actions/upsell-admin.ts
'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAdmin, checkActionRateLimit } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import {
  upsellRuleSchema,
  setAddonSuggestionsSchema,
  pairRuleSchema,
  uuidSchema,
} from '@/lib/validation';

type ActionResult = { success: boolean; error?: string; data?: any };

// ─── Upsell Rules ────────────────────────────────────────────────────────────

export async function createUpsellRule(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const parsed = upsellRuleSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input: ' + parsed.error.issues.map((i) => i.message).join(', ') };

  const { data, error } = await (supabaseServer.from('upsell_rules') as any)
    .insert(parsed.data)
    .select('id')
    .single();

  if (error) return { success: false, error: 'Failed to create upsell rule' };

  revalidateTag('upsell-rules');
  revalidatePath('/admin/upsell');
  return { success: true, data };
}

export async function updateUpsellRule(id: unknown, input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) return { success: false, error: 'Invalid rule ID' };

  const parsed = upsellRuleSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input: ' + parsed.error.issues.map((i) => i.message).join(', ') };

  const { data, error } = await (supabaseServer.from('upsell_rules') as any)
    .update(parsed.data)
    .eq('id', parsedId.data)
    .select()
    .single();

  if (error) return { success: false, error: 'Failed to update upsell rule' };

  revalidateTag('upsell-rules');
  revalidatePath('/admin/upsell');
  return { success: true, data };
}

export async function deleteUpsellRule(id: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { success: false, error: 'Invalid rule ID' };

  const { error } = await (supabaseServer.from('upsell_rules') as any)
    .delete()
    .eq('id', parsed.data);

  if (error) return { success: false, error: 'Failed to delete upsell rule' };

  revalidateTag('upsell-rules');
  revalidatePath('/admin/upsell');
  return { success: true };
}

export async function toggleUpsellRule(id: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { success: false, error: 'Invalid rule ID' };

  const { data: current, error: fetchError } = await (supabaseServer.from('upsell_rules') as any)
    .select('id, is_active')
    .eq('id', parsed.data)
    .single();

  if (fetchError || !current) return { success: false, error: 'Rule not found' };

  const { data, error } = await (supabaseServer.from('upsell_rules') as any)
    .update({ is_active: !current.is_active })
    .eq('id', parsed.data)
    .select()
    .single();

  if (error) return { success: false, error: 'Failed to toggle rule' };

  revalidateTag('upsell-rules');
  revalidatePath('/admin/upsell');
  return { success: true, data };
}

// ─── Add-on Suggestions ──────────────────────────────────────────────────────

export async function setAddonSuggestions(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const parsed = setAddonSuggestionsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input: ' + parsed.error.issues.map((i) => i.message).join(', ') };

  const { menu_item_id, suggestions } = parsed.data;

  // Delete existing suggestions for this item
  await (supabaseServer.from('addon_suggestions') as any)
    .delete()
    .eq('menu_item_id', menu_item_id);

  // Insert new ones
  if (suggestions.length > 0) {
    const rows = suggestions.map((s) => ({
      menu_item_id,
      add_on_id: s.add_on_id,
      suggestion_text: s.suggestion_text ?? null,
      sort_order: s.sort_order ?? 0,
      is_active: s.is_active ?? true,
      starts_at: s.starts_at ?? null,
      ends_at: s.ends_at ?? null,
    }));

    const { error } = await (supabaseServer.from('addon_suggestions') as any)
      .insert(rows);

    if (error) return { success: false, error: 'Failed to save suggestions' };
  }

  revalidateTag('addon-suggestions');
  revalidatePath('/admin/upsell');
  return { success: true };
}

// ─── Pair Rules ──────────────────────────────────────────────────────────────

export async function createPairRule(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const parsed = pairRuleSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input: ' + parsed.error.issues.map((i) => i.message).join(', ') };

  const { data, error } = await (supabaseServer.from('pair_rules') as any)
    .insert(parsed.data)
    .select('id')
    .single();

  if (error) return { success: false, error: 'Failed to create pair rule' };

  revalidateTag('pair-rules');
  revalidatePath('/admin/upsell');
  return { success: true, data };
}

export async function updatePairRule(id: unknown, input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) return { success: false, error: 'Invalid pair rule ID' };

  const parsed = pairRuleSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input: ' + parsed.error.issues.map((i) => i.message).join(', ') };

  const { data, error } = await (supabaseServer.from('pair_rules') as any)
    .update(parsed.data)
    .eq('id', parsedId.data)
    .select()
    .single();

  if (error) return { success: false, error: 'Failed to update pair rule' };

  revalidateTag('pair-rules');
  revalidatePath('/admin/upsell');
  return { success: true, data };
}

export async function deletePairRule(id: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { success: false, error: 'Invalid pair rule ID' };

  const { error } = await (supabaseServer.from('pair_rules') as any)
    .delete()
    .eq('id', parsed.data);

  if (error) return { success: false, error: 'Failed to delete pair rule' };

  revalidateTag('pair-rules');
  revalidatePath('/admin/upsell');
  return { success: true };
}
```

- [ ] **Step 3: Run tests, verify pass**

Run: `npx vitest run tests/unit/actions/upsell-admin.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/actions/upsell-admin.ts tests/unit/actions/upsell-admin.test.ts
git commit -m "feat(upsell): add upsell admin server actions with tests"
```

---

### Task 25: Customer-Facing Upsell Server Actions

**Files:**
- Create: `src/actions/upsell.ts`

- [ ] **Step 1: Implement customer-facing upsell actions**

```typescript
// src/actions/upsell.ts
'use server';

import { supabaseServer } from '@/lib/supabase-server';
import {
  matchUpgradeOffers,
  suggestAddOns,
  matchPairOffers,
  matchInterstitialOffers,
} from '@/lib/upsell-engine';
import type { UpsellOffer, AddonSuggestion, PairOffer, InterstitialOffer, UpsellCartItem, UpsellCart } from '@/types/upsell';
import type { LoyaltyCard, LoyaltyConfig } from '@/types/loyalty';

/**
 * Get upgrade offers for the given cart items.
 * Called when customer clicks "Proceed to Checkout".
 */
export async function getUpgradeOffers(
  cartItems: UpsellCartItem[],
): Promise<UpsellOffer[]> {
  const { data: rules } = await (supabaseServer.from('upsell_rules') as any)
    .select(`
      *,
      menu_items:offer_item_id (id, name, base_price, category, image),
      bundles:offer_bundle_id (id, name, base_price, image_url, category)
    `)
    .eq('phase', 'upgrade')
    .eq('is_active', true);

  if (!rules || rules.length === 0) return [];

  const mapped = rules.map((r: any) => ({
    ...r,
    trigger_min_total: r.trigger_min_total !== null ? Number(r.trigger_min_total) : null,
    offer_item: r.menu_items ? {
      id: r.menu_items.id,
      name: r.menu_items.name,
      basePrice: Number(r.menu_items.base_price),
      description: '',
      category: r.menu_items.category,
      image: r.menu_items.image,
    } : undefined,
    offer_bundle: r.bundles ? {
      ...r.bundles,
      base_price: Number(r.bundles.base_price),
      slots: [],
    } : undefined,
  }));

  return matchUpgradeOffers(cartItems, mapped, new Date());
}

/**
 * Get add-on suggestions for a specific menu item.
 * Called when customer opens item customization.
 */
export async function getAddonSuggestions(
  menuItemId: string,
): Promise<AddonSuggestion[]> {
  const { data: suggestions } = await (supabaseServer.from('addon_suggestions') as any)
    .select(`
      *,
      add_ons:add_on_id (id, name, price, category)
    `)
    .eq('menu_item_id', menuItemId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (!suggestions || suggestions.length === 0) return [];

  const mapped: AddonSuggestion[] = suggestions.map((s: any) => ({
    ...s,
    add_on: s.add_ons ? {
      id: s.add_ons.id,
      name: s.add_ons.name,
      price: Number(s.add_ons.price),
      category: s.add_ons.category,
    } : undefined,
  }));

  return suggestAddOns(menuItemId, mapped, new Date());
}

/**
 * Get pair suggestions for items in the cart.
 * Called after upgrade screen in the checkout flow.
 */
export async function getPairSuggestions(
  cartItems: UpsellCartItem[],
): Promise<PairOffer[]> {
  const { data: rules } = await (supabaseServer.from('pair_rules') as any)
    .select(`
      *,
      paired_menu_items:paired_item_id (id, name, base_price, category, image),
      paired_bundles:paired_bundle_id (id, name, base_price, image_url, category)
    `)
    .eq('is_active', true);

  if (!rules || rules.length === 0) return [];

  const mapped = rules.map((r: any) => ({
    ...r,
    paired_item: r.paired_menu_items ? {
      id: r.paired_menu_items.id,
      name: r.paired_menu_items.name,
      basePrice: Number(r.paired_menu_items.base_price),
      description: '',
      category: r.paired_menu_items.category,
      image: r.paired_menu_items.image,
    } : undefined,
    paired_bundle: r.paired_bundles ? {
      ...r.paired_bundles,
      base_price: Number(r.paired_bundles.base_price),
      slots: [],
    } : undefined,
  }));

  return matchPairOffers(cartItems, mapped, new Date());
}

/**
 * Get interstitial offer for checkout.
 * Called before final "Place Order".
 */
export async function getInterstitialOffer(
  cart: UpsellCart,
  loyaltyCardId?: string,
): Promise<InterstitialOffer | null> {
  const { data: rules } = await (supabaseServer.from('upsell_rules') as any)
    .select(`
      *,
      menu_items:offer_item_id (id, name, base_price, category, image),
      bundles:offer_bundle_id (id, name, base_price, image_url, category)
    `)
    .eq('phase', 'interstitial')
    .eq('is_active', true);

  if (!rules || rules.length === 0) return null;

  const mapped = rules.map((r: any) => ({
    ...r,
    trigger_min_total: r.trigger_min_total !== null ? Number(r.trigger_min_total) : null,
    offer_discount_percent: r.offer_discount_percent !== null ? Number(r.offer_discount_percent) : null,
    offer_item: r.menu_items ? {
      id: r.menu_items.id,
      name: r.menu_items.name,
      basePrice: Number(r.menu_items.base_price),
      description: '',
      category: r.menu_items.category,
      image: r.menu_items.image,
    } : undefined,
    offer_bundle: r.bundles ? {
      ...r.bundles,
      base_price: Number(r.bundles.base_price),
      slots: [],
    } : undefined,
  }));

  let loyaltyCard: LoyaltyCard | null = null;
  let loyaltyConfig: LoyaltyConfig | null = null;

  if (loyaltyCardId) {
    const { data: card } = await (supabaseServer.from('loyalty_cards') as any)
      .select('*')
      .eq('id', loyaltyCardId)
      .single();
    loyaltyCard = card ?? null;

    const { data: config } = await (supabaseServer.from('loyalty_config') as any)
      .select('*')
      .limit(1)
      .single();
    loyaltyConfig = config ?? null;
  }

  return matchInterstitialOffers(cart, mapped, loyaltyCard, loyaltyConfig, new Date());
}
```

- [ ] **Step 2: Commit**

```bash
git add src/actions/upsell.ts
git commit -m "feat(upsell): add customer-facing upsell server actions"
```

---

### Task 26a: Upsell Admin UI — SSR Page + Upgrades + Add-ons Tabs

**Files:**
- Create: `app/admin/upsell/page.tsx`
- Create: `src/components/admin/UpsellContent.tsx`
- Create: `src/components/admin/UpsellUpgradesTab.tsx`
- Create: `src/components/admin/UpsellAddonsTab.tsx`
- Modify: `src/components/admin/Sidebar.tsx` — Add Upsell nav item
- Modify: `src/lib/cached-queries.ts` — Add cached upsell queries

- [ ] **Step 1: Add Upsell to sidebar navigation**

In `src/components/admin/Sidebar.tsx`, add:

```typescript
{ label: 'Upsell', href: '/admin/upsell', icon: Zap },
```

Import `Zap` from `lucide-react`.

- [ ] **Step 2: Add cached queries for upsell data**

Add to `src/lib/cached-queries.ts`:

```typescript
// ── Upsell Rules ─────────────────────────────────────────────
export const getCachedUpsellRules = unstable_cache(
  async () => {
    const { data } = await (supabaseServer.from('upsell_rules') as any)
      .select(`
        *,
        menu_items:offer_item_id (id, name, base_price),
        bundles:offer_bundle_id (id, name, base_price)
      `)
      .order('priority', { ascending: false });
    return (data || []).map((r: any) => ({
      ...r,
      trigger_min_total: r.trigger_min_total !== null ? Number(r.trigger_min_total) : null,
      offer_discount_percent: r.offer_discount_percent !== null ? Number(r.offer_discount_percent) : null,
      offer_item: r.menu_items ? { id: r.menu_items.id, name: r.menu_items.name, basePrice: Number(r.menu_items.base_price), description: '', category: '' } : undefined,
      offer_bundle: r.bundles ? { id: r.bundles.id, name: r.bundles.name, base_price: Number(r.bundles.base_price), slots: [] } : undefined,
    }));
  },
  ['admin-upsell-rules'],
  { revalidate: 300, tags: ['upsell-rules'] }
);

// ── Add-on Suggestions ───────────────────────────────────────
export const getCachedAddonSuggestions = unstable_cache(
  async () => {
    const { data } = await (supabaseServer.from('addon_suggestions') as any)
      .select('*, add_ons:add_on_id (id, name, price, category)')
      .order('sort_order', { ascending: true });
    return (data || []).map((s: any) => ({
      ...s,
      add_on: s.add_ons ? { id: s.add_ons.id, name: s.add_ons.name, price: Number(s.add_ons.price), category: s.add_ons.category } : undefined,
    }));
  },
  ['admin-addon-suggestions'],
  { revalidate: 300, tags: ['addon-suggestions'] }
);

// ── Pair Rules ───────────────────────────────────────────────
export const getCachedPairRules = unstable_cache(
  async () => {
    const { data } = await (supabaseServer.from('pair_rules') as any)
      .select(`
        *,
        source_menu_items:source_item_id (id, name),
        paired_menu_items:paired_item_id (id, name, base_price),
        paired_bundles:paired_bundle_id (id, name, base_price)
      `)
      .order('priority', { ascending: false });
    return (data || []).map((r: any) => ({
      ...r,
      source_item: r.source_menu_items ?? undefined,
      paired_item: r.paired_menu_items ? { ...r.paired_menu_items, basePrice: Number(r.paired_menu_items.base_price), description: '', category: '' } : undefined,
      paired_bundle: r.paired_bundles ? { ...r.paired_bundles, base_price: Number(r.paired_bundles.base_price), slots: [] } : undefined,
    }));
  },
  ['admin-pair-rules'],
  { revalidate: 300, tags: ['pair-rules'] }
);

// ── Add-ons (for suggestion picker) ──────────────────────────
export const getCachedAddOns = unstable_cache(
  async () => {
    const { data } = await (supabaseServer.from('add_ons') as any)
      .select('id, name, price, category')
      .order('name', { ascending: true });
    return (data || []).map((a: any) => ({ ...a, price: Number(a.price) }));
  },
  ['admin-add-ons'],
  { revalidate: 300, tags: ['menu'] }
);
```

- [ ] **Step 3: Create SSR page**

```typescript
// app/admin/upsell/page.tsx
import { requireAdmin } from '@/lib/admin-guard';
import {
  getCachedUpsellRules,
  getCachedAddonSuggestions,
  getCachedPairRules,
  getCachedMenuItems,
  getCachedCategories,
  getCachedBundles,
  getCachedAddOns,
} from '@/lib/cached-queries';
import UpsellContent from '@/components/admin/UpsellContent';

export default async function UpsellPage() {
  await requireAdmin();
  const [rules, suggestions, pairRules, menuItems, categories, bundles, addOns] = await Promise.all([
    getCachedUpsellRules(),
    getCachedAddonSuggestions(),
    getCachedPairRules(),
    getCachedMenuItems(),
    getCachedCategories(),
    getCachedBundles(),
    getCachedAddOns(),
  ]);

  return (
    <UpsellContent
      initialRules={rules}
      initialSuggestions={suggestions}
      initialPairRules={pairRules}
      menuItems={menuItems}
      categories={categories}
      bundles={bundles}
      addOns={addOns}
    />
  );
}
```

- [ ] **Step 4: Create UpsellContent tab container**

```typescript
// src/components/admin/UpsellContent.tsx
'use client';

import { useState } from 'react';
import type { UpsellRule, AddonSuggestion, PairRule } from '@/types/upsell';
import type { Bundle } from '@/types/bundle';
import UpsellUpgradesTab from './UpsellUpgradesTab';
import UpsellAddonsTab from './UpsellAddonsTab';
import UpsellPairsTab from './UpsellPairsTab';
import UpsellInterstitialsTab from './UpsellInterstitialsTab';

interface PickOption { id: string; name: string; }

interface Props {
  initialRules: UpsellRule[];
  initialSuggestions: AddonSuggestion[];
  initialPairRules: PairRule[];
  menuItems: any[];
  categories: PickOption[];
  bundles: Bundle[];
  addOns: { id: string; name: string; price: number; category: string }[];
}

const tabs = ['Upgrades', 'Add-on Hints', 'Best Pairs', 'Interstitials'] as const;
type Tab = typeof tabs[number];

export default function UpsellContent({
  initialRules, initialSuggestions, initialPairRules,
  menuItems, categories, bundles, addOns,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('Upgrades');

  const upgradeRules = initialRules.filter((r) => r.phase === 'upgrade');
  const interstitialRules = initialRules.filter((r) => r.phase === 'interstitial');

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-playfair font-semibold text-stone-800">Upsell Configuration</h1>
        <p className="text-sm text-stone-500 mt-1">Configure upgrade offers, add-on suggestions, pair rules, and checkout interstitials</p>
      </div>

      <div className="flex gap-0 border-b border-[#E8E3DA] mb-6">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-nunito font-medium transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-[#3D8A80] text-[#3D8A80]'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Upgrades' && (
        <UpsellUpgradesTab rules={upgradeRules} menuItems={menuItems} categories={categories} bundles={bundles} />
      )}
      {activeTab === 'Add-on Hints' && (
        <UpsellAddonsTab suggestions={initialSuggestions} menuItems={menuItems} addOns={addOns} />
      )}
      {activeTab === 'Best Pairs' && (
        <UpsellPairsTab pairRules={initialPairRules} menuItems={menuItems} categories={categories} bundles={bundles} />
      )}
      {activeTab === 'Interstitials' && (
        <UpsellInterstitialsTab rules={interstitialRules} menuItems={menuItems} categories={categories} bundles={bundles} />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create UpsellUpgradesTab**

```typescript
// src/components/admin/UpsellUpgradesTab.tsx
'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import type { UpsellRule } from '@/types/upsell';
import type { Bundle } from '@/types/bundle';
import { createUpsellRule, updateUpsellRule, deleteUpsellRule, toggleUpsellRule } from '@/actions/upsell-admin';

interface PickOption { id: string; name: string; }

interface Props {
  rules: UpsellRule[];
  menuItems: any[];
  categories: PickOption[];
  bundles: Bundle[];
}

export default function UpsellUpgradesTab({ rules: initialRules, menuItems, categories, bundles }: Props) {
  const [rules, setRules] = useState(initialRules);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<UpsellRule | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState<string>('item');
  const [triggerItemIds, setTriggerItemIds] = useState<string[]>([]);
  const [triggerCategoryIds, setTriggerCategoryIds] = useState<string[]>([]);
  const [triggerMinTotal, setTriggerMinTotal] = useState('');
  const [offerType, setOfferType] = useState<string>('item');
  const [offerItemId, setOfferItemId] = useState('');
  const [offerBundleId, setOfferBundleId] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const [priority, setPriority] = useState('0');

  const resetForm = () => {
    setName(''); setTriggerType('item'); setTriggerItemIds([]); setTriggerCategoryIds([]);
    setTriggerMinTotal(''); setOfferType('item'); setOfferItemId(''); setOfferBundleId('');
    setOfferMessage(''); setPriority('0'); setEditingRule(null); setShowForm(false);
  };

  const openEdit = (rule: UpsellRule) => {
    setEditingRule(rule);
    setName(rule.name);
    setTriggerType(rule.trigger_type);
    setTriggerItemIds(rule.trigger_item_ids);
    setTriggerCategoryIds(rule.trigger_category_ids);
    setTriggerMinTotal(rule.trigger_min_total?.toString() ?? '');
    setOfferType(rule.offer_type);
    setOfferItemId(rule.offer_item_id ?? '');
    setOfferBundleId(rule.offer_bundle_id ?? '');
    setOfferMessage(rule.offer_message ?? '');
    setPriority(rule.priority.toString());
    setShowForm(true);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const payload = {
      name,
      phase: 'upgrade' as const,
      trigger_type: triggerType,
      trigger_item_ids: triggerItemIds,
      trigger_category_ids: triggerCategoryIds,
      trigger_min_total: triggerMinTotal ? parseFloat(triggerMinTotal) : null,
      offer_type: offerType,
      offer_item_id: offerType === 'item' ? offerItemId || null : null,
      offer_bundle_id: offerType === 'bundle' ? offerBundleId || null : null,
      offer_message: offerMessage || null,
      priority: parseInt(priority) || 0,
    };

    const res = editingRule
      ? await updateUpsellRule(editingRule.id, payload)
      : await createUpsellRule(payload);

    if (res.success) {
      resetForm();
      window.location.reload();
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this rule?')) return;
    const res = await deleteUpsellRule(id);
    if (res.success) setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const handleToggle = async (id: string) => {
    const res = await toggleUpsellRule(id);
    if (res.success) setRules((prev) => prev.map((r) => r.id === id ? { ...r, is_active: !r.is_active } : r));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-black text-white rounded-lg px-4 py-2 text-sm font-medium">
          <Plus className="w-4 h-4" /> New Upgrade Rule
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <h3 className="font-medium">{editingRule ? 'Edit' : 'New'} Upgrade Rule</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Name *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Priority</label>
              <input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Trigger Type</label>
              <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="item">Specific Item</option>
                <option value="category">Category</option>
                <option value="cart_total">Cart Total</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {triggerType === 'item' ? 'Trigger Items' : triggerType === 'category' ? 'Trigger Categories' : 'Min Cart Total'}
              </label>
              {triggerType === 'item' && (
                <select multiple value={triggerItemIds} onChange={(e) => setTriggerItemIds(Array.from(e.target.selectedOptions, o => o.value))} className="w-full border rounded-lg px-3 py-2 text-sm h-24">
                  {menuItems.map((mi: any) => <option key={mi.id} value={mi.id}>{mi.name}</option>)}
                </select>
              )}
              {triggerType === 'category' && (
                <select multiple value={triggerCategoryIds} onChange={(e) => setTriggerCategoryIds(Array.from(e.target.selectedOptions, o => o.value))} className="w-full border rounded-lg px-3 py-2 text-sm h-24">
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              {triggerType === 'cart_total' && (
                <input type="number" value={triggerMinTotal} onChange={(e) => setTriggerMinTotal(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Minimum total" />
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Offer Type</label>
              <select value={offerType} onChange={(e) => setOfferType(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="item">Menu Item</option>
                <option value="bundle">Bundle</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">{offerType === 'item' ? 'Offer Item' : 'Offer Bundle'}</label>
              {offerType === 'item' ? (
                <select value={offerItemId} onChange={(e) => setOfferItemId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Select...</option>
                  {menuItems.map((mi: any) => <option key={mi.id} value={mi.id}>{mi.name}</option>)}
                </select>
              ) : (
                <select value={offerBundleId} onChange={(e) => setOfferBundleId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Select...</option>
                  {bundles.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Message</label>
            <input type="text" value={offerMessage} onChange={(e) => setOfferMessage(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Upgrade your order!" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSubmit} disabled={submitting} className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 flex items-center gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />} {editingRule ? 'Update' : 'Create'}
            </button>
            <button onClick={resetForm} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {/* Rules list */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Name</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Trigger</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Offer</th>
              <th className="px-4 py-3 text-center font-medium text-gray-500">Priority</th>
              <th className="px-4 py-3 text-center font-medium text-gray-500">Active</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rules.map((rule) => (
              <tr key={rule.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{rule.name}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {rule.trigger_type === 'item' && `Items: ${rule.trigger_item_ids.length}`}
                  {rule.trigger_type === 'category' && `Categories: ${rule.trigger_category_ids.join(', ')}`}
                  {rule.trigger_type === 'cart_total' && `Cart >= ₱${rule.trigger_min_total}`}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {rule.offer_type}: {rule.offer_item?.name ?? rule.offer_bundle?.name ?? '—'}
                </td>
                <td className="px-4 py-3 text-center">{rule.priority}</td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => handleToggle(rule.id)} className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${rule.is_active ? 'bg-green-500' : 'bg-gray-300'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${rule.is_active ? 'translate-x-4 ml-0.5' : 'translate-x-0.5'}`} />
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(rule)} className="p-1.5 hover:bg-gray-100 rounded"><Pencil className="w-4 h-4 text-gray-500" /></button>
                  <button onClick={() => handleDelete(rule.id)} className="p-1.5 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-500" /></button>
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No upgrade rules yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create UpsellAddonsTab**

```typescript
// src/components/admin/UpsellAddonsTab.tsx
'use client';

import { useState } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';
import type { AddonSuggestion } from '@/types/upsell';
import { setAddonSuggestions } from '@/actions/upsell-admin';

interface Props {
  suggestions: AddonSuggestion[];
  menuItems: any[];
  addOns: { id: string; name: string; price: number; category: string }[];
}

export default function UpsellAddonsTab({ suggestions: initialSuggestions, menuItems, addOns }: Props) {
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [submitting, setSubmitting] = useState(false);
  const [newAddOnId, setNewAddOnId] = useState('');
  const [newText, setNewText] = useState('');

  const itemSuggestions = suggestions.filter((s) => s.menu_item_id === selectedItemId);

  const handleAdd = () => {
    if (!selectedItemId || !newAddOnId) return;
    if (itemSuggestions.some((s) => s.add_on_id === newAddOnId)) return;
    const addOn = addOns.find((a) => a.id === newAddOnId);
    setSuggestions((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        menu_item_id: selectedItemId,
        add_on_id: newAddOnId,
        suggestion_text: newText || null,
        sort_order: itemSuggestions.length,
        is_active: true,
        starts_at: null,
        ends_at: null,
        add_on: addOn,
      },
    ]);
    setNewAddOnId('');
    setNewText('');
  };

  const handleRemove = (addOnId: string) => {
    setSuggestions((prev) => prev.filter((s) => !(s.menu_item_id === selectedItemId && s.add_on_id === addOnId)));
  };

  const handleSave = async () => {
    if (!selectedItemId) return;
    setSubmitting(true);
    const payload = {
      menu_item_id: selectedItemId,
      suggestions: itemSuggestions.map((s, idx) => ({
        add_on_id: s.add_on_id,
        suggestion_text: s.suggestion_text,
        sort_order: idx,
        is_active: s.is_active,
      })),
    };
    const res = await setAddonSuggestions(payload);
    if (res.success) {
      window.location.reload();
    }
    setSubmitting(false);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border p-5 space-y-4">
        <h3 className="font-medium">Configure Add-on Suggestions by Item</h3>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Select Menu Item</label>
          <select value={selectedItemId} onChange={(e) => setSelectedItemId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="">Choose an item...</option>
            {menuItems.map((mi: any) => <option key={mi.id} value={mi.id}>{mi.name}</option>)}
          </select>
        </div>

        {selectedItemId && (
          <>
            <div className="space-y-2">
              {itemSuggestions.map((sug) => (
                <div key={sug.add_on_id} className="flex items-center gap-3 py-2 px-3 bg-gray-50 rounded-lg">
                  <span className="flex-1 text-sm font-medium">{sug.add_on?.name ?? sug.add_on_id}</span>
                  <span className="text-xs text-gray-500">{sug.suggestion_text ?? '—'}</span>
                  <button onClick={() => handleRemove(sug.add_on_id)} className="p-1 hover:bg-red-50 rounded">
                    <X className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
              ))}
              {itemSuggestions.length === 0 && (
                <p className="text-sm text-gray-400 py-4 text-center">No suggestions for this item yet.</p>
              )}
            </div>

            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Add-on</label>
                <select value={newAddOnId} onChange={(e) => setNewAddOnId(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
                  <option value="">Select add-on...</option>
                  {addOns.filter((a) => !itemSuggestions.some((s) => s.add_on_id === a.id)).map((a) => (
                    <option key={a.id} value={a.id}>{a.name} (₱{a.price})</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Suggestion Text</label>
                <input type="text" value={newText} onChange={(e) => setNewText(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" placeholder="Most customers add this!" />
              </div>
              <button onClick={handleAdd} disabled={!newAddOnId} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-sm disabled:opacity-50">
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <button onClick={handleSave} disabled={submitting} className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 flex items-center gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Save Suggestions
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add app/admin/upsell/page.tsx src/components/admin/UpsellContent.tsx src/components/admin/UpsellUpgradesTab.tsx src/components/admin/UpsellAddonsTab.tsx src/components/admin/Sidebar.tsx src/lib/cached-queries.ts
git commit -m "feat(upsell): add upsell admin page with upgrades and add-ons tabs"
```

---

### Task 26b: Upsell Admin UI — Pairs + Interstitials Tabs

**Files:**
- Create: `src/components/admin/UpsellPairsTab.tsx`
- Create: `src/components/admin/UpsellInterstitialsTab.tsx`

- [ ] **Step 1: Create UpsellPairsTab**

```typescript
// src/components/admin/UpsellPairsTab.tsx
'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import type { PairRule } from '@/types/upsell';
import type { Bundle } from '@/types/bundle';
import { createPairRule, updatePairRule, deletePairRule } from '@/actions/upsell-admin';

interface PickOption { id: string; name: string; }

interface Props {
  pairRules: PairRule[];
  menuItems: any[];
  categories: PickOption[];
  bundles: Bundle[];
}

export default function UpsellPairsTab({ pairRules: initialRules, menuItems, categories, bundles }: Props) {
  const [rules, setRules] = useState(initialRules);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<PairRule | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [sourceType, setSourceType] = useState<'item' | 'category'>('item');
  const [sourceItemId, setSourceItemId] = useState('');
  const [sourceCategoryId, setSourceCategoryId] = useState('');
  const [pairedType, setPairedType] = useState<'item' | 'bundle'>('item');
  const [pairedItemId, setPairedItemId] = useState('');
  const [pairedBundleId, setPairedBundleId] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState('0');

  const resetForm = () => {
    setSourceType('item'); setSourceItemId(''); setSourceCategoryId('');
    setPairedType('item'); setPairedItemId(''); setPairedBundleId('');
    setMessage(''); setPriority('0'); setEditingRule(null); setShowForm(false);
  };

  const openEdit = (rule: PairRule) => {
    setEditingRule(rule);
    setSourceType(rule.source_item_id ? 'item' : 'category');
    setSourceItemId(rule.source_item_id ?? '');
    setSourceCategoryId(rule.source_category_id ?? '');
    setPairedType(rule.paired_item_id ? 'item' : 'bundle');
    setPairedItemId(rule.paired_item_id ?? '');
    setPairedBundleId(rule.paired_bundle_id ?? '');
    setMessage(rule.message ?? '');
    setPriority(rule.priority.toString());
    setShowForm(true);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const payload = {
      source_item_id: sourceType === 'item' ? sourceItemId || null : null,
      source_category_id: sourceType === 'category' ? sourceCategoryId || null : null,
      paired_item_id: pairedType === 'item' ? pairedItemId || null : null,
      paired_bundle_id: pairedType === 'bundle' ? pairedBundleId || null : null,
      message: message || null,
      priority: parseInt(priority) || 0,
    };
    const res = editingRule
      ? await updatePairRule(editingRule.id, payload)
      : await createPairRule(payload);
    if (res.success) { resetForm(); window.location.reload(); }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this pair rule?')) return;
    const res = await deletePairRule(id);
    if (res.success) setRules((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-black text-white rounded-lg px-4 py-2 text-sm font-medium">
          <Plus className="w-4 h-4" /> New Pair Rule
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <h3 className="font-medium">{editingRule ? 'Edit' : 'New'} Pair Rule</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Source Type</label>
              <select value={sourceType} onChange={(e) => setSourceType(e.target.value as any)} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="item">Item</option>
                <option value="category">Category</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">{sourceType === 'item' ? 'Source Item' : 'Source Category'}</label>
              {sourceType === 'item' ? (
                <select value={sourceItemId} onChange={(e) => setSourceItemId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Select...</option>
                  {menuItems.map((mi: any) => <option key={mi.id} value={mi.id}>{mi.name}</option>)}
                </select>
              ) : (
                <select value={sourceCategoryId} onChange={(e) => setSourceCategoryId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Select...</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Paired Type</label>
              <select value={pairedType} onChange={(e) => setPairedType(e.target.value as any)} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="item">Item</option>
                <option value="bundle">Bundle</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">{pairedType === 'item' ? 'Paired Item' : 'Paired Bundle'}</label>
              {pairedType === 'item' ? (
                <select value={pairedItemId} onChange={(e) => setPairedItemId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Select...</option>
                  {menuItems.map((mi: any) => <option key={mi.id} value={mi.id}>{mi.name}</option>)}
                </select>
              ) : (
                <select value={pairedBundleId} onChange={(e) => setPairedBundleId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Select...</option>
                  {bundles.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Message</label>
              <input type="text" value={message} onChange={(e) => setMessage(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Goes great together!" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Priority</label>
              <input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSubmit} disabled={submitting} className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 flex items-center gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />} {editingRule ? 'Update' : 'Create'}
            </button>
            <button onClick={resetForm} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Source</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Paired With</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Message</th>
              <th className="px-4 py-3 text-center font-medium text-gray-500">Priority</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rules.map((rule) => (
              <tr key={rule.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-xs">
                  {(rule as any).source_item?.name ?? rule.source_category_id ?? '—'}
                </td>
                <td className="px-4 py-3 text-xs">{rule.paired_item?.name ?? rule.paired_bundle?.name ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{rule.message ?? '—'}</td>
                <td className="px-4 py-3 text-center">{rule.priority}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(rule)} className="p-1.5 hover:bg-gray-100 rounded"><Pencil className="w-4 h-4 text-gray-500" /></button>
                  <button onClick={() => handleDelete(rule.id)} className="p-1.5 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-500" /></button>
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">No pair rules yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create UpsellInterstitialsTab**

```typescript
// src/components/admin/UpsellInterstitialsTab.tsx
'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import type { UpsellRule } from '@/types/upsell';
import type { Bundle } from '@/types/bundle';
import { createUpsellRule, updateUpsellRule, deleteUpsellRule, toggleUpsellRule } from '@/actions/upsell-admin';

interface PickOption { id: string; name: string; }

interface Props {
  rules: UpsellRule[];
  menuItems: any[];
  categories: PickOption[];
  bundles: Bundle[];
}

export default function UpsellInterstitialsTab({ rules: initialRules, menuItems, categories, bundles }: Props) {
  const [rules, setRules] = useState(initialRules);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<UpsellRule | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState<string>('cart_total');
  const [triggerMinTotal, setTriggerMinTotal] = useState('');
  const [triggerCategoryIds, setTriggerCategoryIds] = useState<string[]>([]);
  const [offerType, setOfferType] = useState<string>('item');
  const [offerItemId, setOfferItemId] = useState('');
  const [offerBundleId, setOfferBundleId] = useState('');
  const [offerDiscountPercent, setOfferDiscountPercent] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const [priority, setPriority] = useState('0');

  const resetForm = () => {
    setName(''); setTriggerType('cart_total'); setTriggerMinTotal(''); setTriggerCategoryIds([]);
    setOfferType('item'); setOfferItemId(''); setOfferBundleId(''); setOfferDiscountPercent('');
    setOfferMessage(''); setPriority('0'); setEditingRule(null); setShowForm(false);
  };

  const openEdit = (rule: UpsellRule) => {
    setEditingRule(rule);
    setName(rule.name);
    setTriggerType(rule.trigger_type);
    setTriggerMinTotal(rule.trigger_min_total?.toString() ?? '');
    setTriggerCategoryIds(rule.trigger_category_ids);
    setOfferType(rule.offer_type);
    setOfferItemId(rule.offer_item_id ?? '');
    setOfferBundleId(rule.offer_bundle_id ?? '');
    setOfferDiscountPercent(rule.offer_discount_percent?.toString() ?? '');
    setOfferMessage(rule.offer_message ?? '');
    setPriority(rule.priority.toString());
    setShowForm(true);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const payload = {
      name,
      phase: 'interstitial' as const,
      trigger_type: triggerType,
      trigger_item_ids: [] as string[],
      trigger_category_ids: triggerCategoryIds,
      trigger_min_total: triggerMinTotal ? parseFloat(triggerMinTotal) : null,
      offer_type: offerType,
      offer_item_id: ['item', 'discount'].includes(offerType) ? offerItemId || null : null,
      offer_bundle_id: offerType === 'bundle' ? offerBundleId || null : null,
      offer_discount_percent: offerType === 'discount' ? parseFloat(offerDiscountPercent) || null : null,
      offer_message: offerMessage || null,
      priority: parseInt(priority) || 0,
    };
    const res = editingRule
      ? await updateUpsellRule(editingRule.id, payload)
      : await createUpsellRule(payload);
    if (res.success) { resetForm(); window.location.reload(); }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this rule?')) return;
    const res = await deleteUpsellRule(id);
    if (res.success) setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const handleToggle = async (id: string) => {
    const res = await toggleUpsellRule(id);
    if (res.success) setRules((prev) => prev.map((r) => r.id === id ? { ...r, is_active: !r.is_active } : r));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-black text-white rounded-lg px-4 py-2 text-sm font-medium">
          <Plus className="w-4 h-4" /> New Interstitial Rule
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <h3 className="font-medium">{editingRule ? 'Edit' : 'New'} Interstitial Rule</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Name *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Priority</label>
              <input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Trigger</label>
              <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="cart_total">Cart Total</option>
                <option value="cart_empty_category">Missing Category</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {triggerType === 'cart_total' ? 'Min Cart Total' : 'Categories'}
              </label>
              {triggerType === 'cart_total' ? (
                <input type="number" value={triggerMinTotal} onChange={(e) => setTriggerMinTotal(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
              ) : (
                <select multiple value={triggerCategoryIds} onChange={(e) => setTriggerCategoryIds(Array.from(e.target.selectedOptions, o => o.value))} className="w-full border rounded-lg px-3 py-2 text-sm h-24">
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Offer Type</label>
              <select value={offerType} onChange={(e) => setOfferType(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="item">Item</option>
                <option value="bundle">Bundle</option>
                <option value="discount">Discount</option>
                <option value="loyalty_nudge">Loyalty Nudge</option>
              </select>
            </div>
            <div>
              {offerType === 'item' && (
                <>
                  <label className="block text-sm text-gray-600 mb-1">Offer Item</label>
                  <select value={offerItemId} onChange={(e) => setOfferItemId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">Select...</option>
                    {menuItems.map((mi: any) => <option key={mi.id} value={mi.id}>{mi.name}</option>)}
                  </select>
                </>
              )}
              {offerType === 'bundle' && (
                <>
                  <label className="block text-sm text-gray-600 mb-1">Offer Bundle</label>
                  <select value={offerBundleId} onChange={(e) => setOfferBundleId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">Select...</option>
                    {bundles.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </>
              )}
              {offerType === 'discount' && (
                <>
                  <label className="block text-sm text-gray-600 mb-1">Discount Item + %</label>
                  <div className="flex gap-2">
                    <select value={offerItemId} onChange={(e) => setOfferItemId(e.target.value)} className="flex-1 border rounded-lg px-3 py-2 text-sm">
                      <option value="">Select...</option>
                      {menuItems.map((mi: any) => <option key={mi.id} value={mi.id}>{mi.name}</option>)}
                    </select>
                    <input type="number" value={offerDiscountPercent} onChange={(e) => setOfferDiscountPercent(e.target.value)} className="w-20 border rounded-lg px-2 py-2 text-sm" placeholder="%" />
                  </div>
                </>
              )}
              {offerType === 'loyalty_nudge' && (
                <p className="text-sm text-gray-500 mt-6">No item/bundle needed. The nudge message is shown based on customer loyalty card state.</p>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Message</label>
            <input type="text" value={offerMessage} onChange={(e) => setOfferMessage(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Last chance to add..." />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSubmit} disabled={submitting} className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 flex items-center gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />} {editingRule ? 'Update' : 'Create'}
            </button>
            <button onClick={resetForm} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Name</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Trigger</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Offer</th>
              <th className="px-4 py-3 text-center font-medium text-gray-500">Priority</th>
              <th className="px-4 py-3 text-center font-medium text-gray-500">Active</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rules.map((rule) => (
              <tr key={rule.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{rule.name}</td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {rule.trigger_type === 'cart_total' && `Cart >= ₱${rule.trigger_min_total}`}
                  {rule.trigger_type === 'cart_empty_category' && `Missing: ${rule.trigger_category_ids.join(', ')}`}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{rule.offer_type}: {rule.offer_item?.name ?? rule.offer_bundle?.name ?? rule.offer_message ?? '—'}</td>
                <td className="px-4 py-3 text-center">{rule.priority}</td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => handleToggle(rule.id)} className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${rule.is_active ? 'bg-green-500' : 'bg-gray-300'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${rule.is_active ? 'translate-x-4 ml-0.5' : 'translate-x-0.5'}`} />
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(rule)} className="p-1.5 hover:bg-gray-100 rounded"><Pencil className="w-4 h-4 text-gray-500" /></button>
                  <button onClick={() => handleDelete(rule.id)} className="p-1.5 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-500" /></button>
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No interstitial rules yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Test manually, commit**

```bash
git add src/components/admin/UpsellPairsTab.tsx src/components/admin/UpsellInterstitialsTab.tsx
git commit -m "feat(upsell): add pairs and interstitials admin tabs"
```

---

## Phase 4: Customer Upsell UI

### Task 27: Upgrade Screen (Phase 1)

**Files:**
- Create: `src/components/UpgradeScreen.tsx`

- [ ] **Step 1: Create UpgradeScreen component**

```typescript
// src/components/UpgradeScreen.tsx
'use client';

import { useState } from 'react';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import type { UpsellOffer } from '@/types/upsell';
import type { Bundle, SlotSelection } from '@/types/bundle';
import BundleCustomizer from './BundleCustomizer';

interface Props {
  offers: UpsellOffer[];
  onAcceptItem: (itemId: string) => void;
  onAcceptBundle: (bundle: Bundle, selections: SlotSelection[], total: number) => void;
  onSkip: () => void;
}

export default function UpgradeScreen({ offers, onAcceptItem, onAcceptBundle, onSkip }: Props) {
  const [customizingBundle, setCustomizingBundle] = useState<Bundle | null>(null);

  if (customizingBundle) {
    return (
      <BundleCustomizer
        bundle={customizingBundle}
        onAddToCart={(bundle, selections, total) => {
          onAcceptBundle(bundle, selections, total);
          setCustomizingBundle(null);
        }}
        onClose={() => setCustomizingBundle(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 px-4 py-8 max-w-lg mx-auto w-full">
        <div className="text-center mb-6">
          <Sparkles className="w-8 h-8 text-amber-500 mx-auto mb-2" />
          <h2 className="text-xl font-semibold">Upgrade your order?</h2>
          <p className="text-sm text-gray-500 mt-1">We found some great upgrades for you</p>
        </div>

        <div className="space-y-3">
          {offers.map((offer) => {
            const rule = offer.rule;
            const isBundle = rule.offer_type === 'bundle' && rule.offer_bundle;
            const isItem = rule.offer_type === 'item' && rule.offer_item;
            const name = isBundle ? rule.offer_bundle!.name : isItem ? rule.offer_item!.name : '';
            const price = isBundle ? rule.offer_bundle!.base_price : isItem ? rule.offer_item!.basePrice : 0;
            const image = isBundle ? rule.offer_bundle!.image_url : isItem ? rule.offer_item!.image : undefined;

            return (
              <div key={rule.id} className="bg-white rounded-xl border overflow-hidden">
                <div className="flex items-center gap-4 p-4">
                  {image && (
                    <img src={image} alt={name} className="w-16 h-16 rounded-lg object-cover" />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm">{name}</h3>
                    {rule.offer_message && (
                      <p className="text-xs text-gray-500 mt-0.5">{rule.offer_message}</p>
                    )}
                    <p className="text-sm font-semibold mt-1">₱{price.toFixed(0)}</p>
                    {offer.savings !== null && offer.savings > 0 && (
                      <span className="inline-block bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full mt-1">
                        Save ₱{offer.savings.toFixed(0)}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (isBundle && rule.offer_bundle) {
                        setCustomizingBundle(rule.offer_bundle as Bundle);
                      } else if (isItem && rule.offer_item_id) {
                        onAcceptItem(rule.offer_item_id);
                      }
                    }}
                    className="bg-black text-white rounded-lg px-4 py-2 text-xs font-medium whitespace-nowrap flex items-center gap-1"
                  >
                    Upgrade <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={onSkip}
          className="w-full text-center py-4 text-sm text-gray-500 hover:text-gray-700 mt-6"
        >
          No thanks, continue to checkout
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Integrate into checkout flow**

In `src/components/Checkout.tsx`, add an upsell step before the details step:

```typescript
// Add to step type: 'upgrades' | 'pairs' | 'details' | 'payment'
// On mount or when entering checkout, call getUpgradeOffers(cartItems).
// If offers exist, show UpgradeScreen. If not, skip to 'details'.
// On accept, add item/bundle to cart and proceed.
// On skip, proceed to next step.
```

- [ ] **Step 3: Test manually, commit**

```bash
git add src/components/UpgradeScreen.tsx src/components/Checkout.tsx
git commit -m "feat(upsell): add Phase 1 upgrade screen in checkout flow"
```

---

### Task 28: Add-on Suggestions (Phase 2)

**Files:**
- Modify: `src/components/MenuItemCard.tsx` — Add suggested add-ons

- [ ] **Step 1: Fetch and display addon suggestions in item customization**

```typescript
// In MenuItemCard.tsx, inside the customization modal section:
// Add state:
const [suggestedAddOns, setSuggestedAddOns] = useState<AddonSuggestion[]>([]);

// Fetch on customization open:
// import { getAddonSuggestions } from '@/actions/upsell';
// import type { AddonSuggestion } from '@/types/upsell';

useEffect(() => {
  if (showCustomization && item.id) {
    getAddonSuggestions(item.id).then(setSuggestedAddOns);
  }
}, [showCustomization, item.id]);

// In the add-ons section of the customization modal, render suggested add-ons first:
{suggestedAddOns.length > 0 && (
  <div className="mb-3">
    <p className="text-xs font-medium text-gray-500 mb-2">Recommended</p>
    {suggestedAddOns.map((sug) => {
      const addOn = sug.add_on;
      if (!addOn) return null;
      const isSelected = selectedAddOns.some((a) => a.id === addOn.id);
      return (
        <button
          key={sug.id}
          onClick={() => {
            if (isSelected) {
              setSelectedAddOns((prev) => prev.filter((a) => a.id !== addOn.id));
            } else {
              setSelectedAddOns((prev) => [...prev, { ...addOn, quantity: 1 }]);
            }
          }}
          className={`flex items-center gap-2 w-full p-2 rounded-lg text-sm text-left mb-1 ${
            isSelected ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'
          }`}
        >
          <span className="flex-1">
            {addOn.name}
            {sug.suggestion_text && (
              <span className="text-xs text-amber-600 ml-2">{sug.suggestion_text}</span>
            )}
          </span>
          <span className="text-xs font-medium">+₱{addOn.price}</span>
        </button>
      );
    })}
  </div>
)}
```

- [ ] **Step 2: Test manually, commit**

```bash
git add src/components/MenuItemCard.tsx
git commit -m "feat(upsell): add Phase 2 add-on suggestions in customization"
```

---

### Task 29: Best Pair Screen (Phase 3)

**Files:**
- Create: `src/components/BestPairScreen.tsx`

- [ ] **Step 1: Create BestPairScreen component**

```typescript
// src/components/BestPairScreen.tsx
'use client';

import { ShoppingCart, ArrowRight } from 'lucide-react';
import type { PairOffer } from '@/types/upsell';
import type { MenuItem } from '@/types';

interface Props {
  offers: PairOffer[];
  onAddItem: (item: MenuItem) => void;
  onSkip: () => void;
}

export default function BestPairScreen({ offers, onAddItem, onSkip }: Props) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 px-4 py-8 max-w-lg mx-auto w-full">
        <div className="text-center mb-6">
          <h2 className="text-xl font-semibold">Complete your order</h2>
          <p className="text-sm text-gray-500 mt-1">These go great with your picks</p>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
          {offers.map((offer) => {
            const item = offer.item;
            const bundle = offer.bundle;
            const name = item?.name ?? bundle?.name ?? '';
            const price = item?.basePrice ?? bundle?.base_price ?? 0;
            const image = item?.image ?? bundle?.image_url;
            const msg = offer.rule.message;

            return (
              <div key={offer.rule.id} className="bg-white rounded-xl border min-w-[200px] snap-start flex-shrink-0 overflow-hidden">
                {image && (
                  <img src={image} alt={name} className="w-full h-28 object-cover" />
                )}
                <div className="p-3">
                  <h3 className="font-medium text-sm">{name}</h3>
                  {msg && <p className="text-xs text-gray-500 mt-0.5">{msg}</p>}
                  <p className="text-sm font-semibold mt-1">₱{price.toFixed(0)}</p>
                  <button
                    onClick={() => {
                      if (item) onAddItem(item);
                      // Bundle add would need BundleCustomizer — simplified to item add for now
                    }}
                    className="w-full mt-2 bg-black text-white rounded-lg py-1.5 text-xs font-medium flex items-center justify-center gap-1"
                  >
                    <ShoppingCart className="w-3.5 h-3.5" /> Add
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={onSkip}
          className="w-full text-center py-4 text-sm text-gray-500 hover:text-gray-700 mt-6"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Integrate after upgrade screen in checkout flow**

In `src/components/Checkout.tsx`, add a `pairs` step between `upgrades` and `details`. Call `getPairSuggestions(cartItems)`. If suggestions exist, show BestPairScreen. If not, skip.

- [ ] **Step 3: Test manually, commit**

```bash
git add src/components/BestPairScreen.tsx src/components/Checkout.tsx
git commit -m "feat(upsell): add Phase 3 best pair screen in checkout flow"
```

---

### Task 30: Checkout Interstitial (Phase 4)

**Files:**
- Create: `src/components/CheckoutInterstitial.tsx`

- [ ] **Step 1: Create CheckoutInterstitial modal component**

```typescript
// src/components/CheckoutInterstitial.tsx
'use client';

import { X, Gift, Heart } from 'lucide-react';
import type { InterstitialOffer } from '@/types/upsell';
import type { MenuItem } from '@/types';

interface Props {
  offer: InterstitialOffer;
  onAcceptItem: (item: MenuItem) => void;
  onDismiss: () => void;
}

export default function CheckoutInterstitial({ offer, onAcceptItem, onDismiss }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="bg-white w-full max-w-sm rounded-t-2xl sm:rounded-2xl p-6 relative">
        <button onClick={onDismiss} className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded-full">
          <X className="w-5 h-5" />
        </button>

        {/* Item offer */}
        {offer.type === 'item' && offer.item && (
          <div className="text-center">
            {offer.item.image && (
              <img src={offer.item.image} alt={offer.item.name} className="w-24 h-24 rounded-xl object-cover mx-auto mb-3" />
            )}
            <h3 className="text-lg font-semibold">{offer.rule.offer_message ?? `Add ${offer.item.name}?`}</h3>
            <p className="text-2xl font-bold mt-2">₱{offer.item.basePrice.toFixed(0)}</p>
            <button
              onClick={() => onAcceptItem(offer.item!)}
              className="w-full bg-black text-white rounded-xl py-3 text-sm font-semibold mt-4"
            >
              Add to Order
            </button>
          </div>
        )}

        {/* Discount offer */}
        {offer.type === 'discount' && offer.item && offer.discounted_price !== null && (
          <div className="text-center">
            <Gift className="w-10 h-10 text-amber-500 mx-auto mb-2" />
            {offer.item.image && (
              <img src={offer.item.image} alt={offer.item.name} className="w-24 h-24 rounded-xl object-cover mx-auto mb-3" />
            )}
            <h3 className="text-lg font-semibold">{offer.rule.offer_message ?? `Special offer!`}</h3>
            <div className="mt-2">
              <span className="text-gray-400 line-through text-sm">₱{offer.item.basePrice.toFixed(0)}</span>
              <span className="text-2xl font-bold ml-2">₱{offer.discounted_price.toFixed(0)}</span>
              <span className="ml-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                {offer.rule.offer_discount_percent}% off
              </span>
            </div>
            <button
              onClick={() => onAcceptItem(offer.item!)}
              className="w-full bg-black text-white rounded-xl py-3 text-sm font-semibold mt-4"
            >
              Add for ₱{offer.discounted_price.toFixed(0)}
            </button>
          </div>
        )}

        {/* Loyalty nudge */}
        {offer.type === 'loyalty_nudge' && (
          <div className="text-center">
            <Heart className="w-10 h-10 text-pink-500 mx-auto mb-2" />
            <h3 className="text-lg font-semibold">{offer.loyalty_message ?? offer.rule.offer_message ?? 'Almost there!'}</h3>
            <p className="text-sm text-gray-500 mt-2">Add one more item to get closer to your reward</p>
            <button
              onClick={onDismiss}
              className="w-full bg-black text-white rounded-xl py-3 text-sm font-semibold mt-4"
            >
              Browse Menu
            </button>
          </div>
        )}

        <button
          onClick={onDismiss}
          className="w-full text-center py-3 text-sm text-gray-500 hover:text-gray-700 mt-2"
        >
          No thanks, place my order
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Integrate before final "Place Order"**

In `src/components/Checkout.tsx`, before submitting the order, call `getInterstitialOffer(cart, loyaltyCardId)`. If an offer exists, show CheckoutInterstitial. On accept, add item to cart and update total. On dismiss, proceed to place order.

- [ ] **Step 3: Test manually, commit**

```bash
git add src/components/CheckoutInterstitial.tsx src/components/Checkout.tsx
git commit -m "feat(upsell): add Phase 4 checkout interstitial modal"
```

---

### Task 31: Order Confirmation Bundle Display

**Files:**
- Modify: Order confirmation / success component (the component that shows after order is placed)

- [ ] **Step 1: Show bundle details in order confirmation**

When displaying order items in the confirmation view, detect bundle items (those with `bundle_selections`) and render:
- Bundle name
- Nested list of slot selections with item name, variation, and add-ons

Use the same pattern as Task 19d but in the customer-facing context.

- [ ] **Step 2: Commit**

```bash
git add src/components/OrderConfirmation.tsx
git commit -m "feat(bundle): show bundle details in order confirmation"
```

---

### Task 32: Comprehensive Testing

**Files:**
- Create: `tests/bundle-engine.test.ts` (already exists from Task 15, verify)
- Create: `tests/upsell-engine.test.ts` (already exists from Task 22, verify)
- Create: `tests/integration/upsell-flow.test.ts`
- Create: `tests/unit/components/upsell-ui.test.ts`

- [ ] **Step 1: Write integration tests for upsell engine + actions**

```typescript
// tests/integration/upsell-flow.test.ts
import { describe, it, expect } from 'vitest';
import {
  matchUpgradeOffers,
  suggestAddOns,
  matchPairOffers,
  matchInterstitialOffers,
  filterActiveRules,
} from '@/lib/upsell-engine';
import {
  validateBundleSelections,
  calculateBundlePrice,
} from '@/lib/bundle-engine';
import type { UpsellRule, UpsellCart, UpsellCartItem } from '@/types/upsell';
import type { Bundle, SlotSelection } from '@/types/bundle';

describe('Full upsell flow (engine-level)', () => {
  const NOW = new Date('2026-06-15T12:00:00Z');

  it('complete flow: upgrade -> pair -> interstitial', () => {
    // Setup cart
    const cartItems: UpsellCartItem[] = [
      { menu_item_id: 'shake-1', category: 'shakes', base_price: 120, quantity: 1 },
    ];
    const cart: UpsellCart = { items: cartItems, total: 120 };

    // Upgrade rules
    const upgradeRules: UpsellRule[] = [{
      id: 'ur-1', name: 'Upgrade to combo', phase: 'upgrade',
      trigger_type: 'category', trigger_item_ids: [], trigger_category_ids: ['shakes'],
      trigger_min_total: null, offer_type: 'bundle', offer_item_id: null,
      offer_bundle_id: 'combo-1', offer_discount_percent: null,
      offer_message: 'Get a combo!', priority: 10, is_active: true,
      starts_at: null, ends_at: null,
      offer_bundle: { id: 'combo-1', name: 'Shake Combo', base_price: 199, slots: [] } as any,
    }];

    const upgrades = matchUpgradeOffers(cartItems, upgradeRules, NOW);
    expect(upgrades).toHaveLength(1);
    expect(upgrades[0].rule.offer_bundle?.name).toBe('Shake Combo');

    // Pair rules (after potential upgrade)
    const pairRules = [{
      id: 'pr-1', source_item_id: null, source_category_id: 'shakes',
      paired_item_id: 'fries-1', paired_bundle_id: null,
      message: 'Add fries!', priority: 5, is_active: true,
      starts_at: null, ends_at: null,
      paired_item: { id: 'fries-1', name: 'Belgian Fries', basePrice: 89, description: '', category: 'snacks' },
    }];

    const pairs = matchPairOffers(cartItems, pairRules as any, NOW);
    expect(pairs).toHaveLength(1);

    // Interstitial
    const interstitialRules: UpsellRule[] = [{
      id: 'ir-1', name: 'Last chance', phase: 'interstitial',
      trigger_type: 'cart_total', trigger_item_ids: [], trigger_category_ids: [],
      trigger_min_total: 100, offer_type: 'item', offer_item_id: 'cookie-1',
      offer_bundle_id: null, offer_discount_percent: null,
      offer_message: 'Add a cookie!', priority: 5, is_active: true,
      starts_at: null, ends_at: null,
      offer_item: { id: 'cookie-1', name: 'Cookie', basePrice: 49, description: '', category: 'snacks' },
    }];

    const interstitial = matchInterstitialOffers(cart, interstitialRules, null, null, NOW);
    expect(interstitial).not.toBeNull();
    expect(interstitial!.item?.name).toBe('Cookie');
  });

  it('skips all upsell screens when no rules match', () => {
    const cartItems: UpsellCartItem[] = [
      { menu_item_id: 'item-99', category: 'desserts', base_price: 50, quantity: 1 },
    ];
    const cart: UpsellCart = { items: cartItems, total: 50 };

    // Rules that don't match this cart
    const upgradeRules: UpsellRule[] = [{
      id: 'ur-1', name: 'Shake upgrade', phase: 'upgrade',
      trigger_type: 'item', trigger_item_ids: ['shake-1'], trigger_category_ids: [],
      trigger_min_total: null, offer_type: 'item', offer_item_id: 'shake-2',
      offer_bundle_id: null, offer_discount_percent: null,
      offer_message: '', priority: 10, is_active: true, starts_at: null, ends_at: null,
      offer_item: { id: 'shake-2', name: 'Premium', basePrice: 180, description: '', category: 'shakes' },
    }];

    expect(matchUpgradeOffers(cartItems, upgradeRules, NOW)).toHaveLength(0);
    expect(matchInterstitialOffers(cart, [], null, null, NOW)).toBeNull();
  });

  it('expired rules are excluded from all phases', () => {
    const expiredRule: UpsellRule = {
      id: 'exp-1', name: 'Expired', phase: 'upgrade',
      trigger_type: 'item', trigger_item_ids: ['mi-1'], trigger_category_ids: [],
      trigger_min_total: null, offer_type: 'item', offer_item_id: 'mi-2',
      offer_bundle_id: null, offer_discount_percent: null,
      offer_message: '', priority: 10, is_active: true,
      starts_at: '2025-01-01T00:00:00Z', ends_at: '2025-12-31T23:59:59Z',
    };

    expect(filterActiveRules([expiredRule], NOW)).toHaveLength(0);
  });
});

describe('Bundle validation in order flow', () => {
  it('validates bundle selections before order creation', () => {
    const bundle: Bundle = {
      id: 'b1', name: 'Combo', description: null, image_url: null,
      base_price: 199, cost_price: 80, category: 'combos',
      discount_price: null, discount_active: false,
      discount_start_date: null, discount_end_date: null,
      available: true, popular: false, sort_order: 0,
      created_at: '', updated_at: '',
      slots: [{
        id: 's1', bundle_id: 'b1', label: 'Shake', sort_order: 0,
        min_selections: 1, max_selections: 1,
        items: [{ id: 'si1', slot_id: 's1', menu_item_id: 'mi-1', price_override: null, sort_order: 0,
          menu_item: { id: 'mi-1', name: 'Choco', description: '', basePrice: 120, category: 'shakes' } }],
      }],
    };

    const validSelections: SlotSelection[] = [
      { slot_id: 's1', selected_items: [{ menu_item_id: 'mi-1' }] },
    ];

    const result = validateBundleSelections(bundle, validSelections);
    expect(result.valid).toBe(true);

    const pricing = calculateBundlePrice(bundle, validSelections, new Date());
    expect(pricing.total).toBe(199);
  });
});
```

- [ ] **Step 2: Write UI component tests**

```typescript
// tests/unit/components/upsell-ui.test.ts
import { describe, it, expect, vi } from 'vitest';

// Test the pure logic parts of upsell UI (no rendering, just data flow assertions)

describe('UpgradeScreen behavior', () => {
  it('shows max 3 offers from engine output', () => {
    // matchUpgradeOffers already limits to 3 via prioritizeOffers
    // This test verifies the contract
    const { prioritizeOffers } = require('@/lib/upsell-engine');
    const offers = Array.from({ length: 5 }, (_, i) => ({ priority: i, name: `offer-${i}` }));
    const result = prioritizeOffers(offers, 3);
    expect(result).toHaveLength(3);
    expect(result[0].priority).toBe(4); // highest first
  });
});

describe('BestPairScreen behavior', () => {
  it('shows max 4 pair offers', () => {
    const { prioritizeOffers } = require('@/lib/upsell-engine');
    const offers = Array.from({ length: 6 }, (_, i) => ({ priority: i, name: `pair-${i}` }));
    const result = prioritizeOffers(offers, 4);
    expect(result).toHaveLength(4);
  });
});

describe('CheckoutInterstitial behavior', () => {
  it('returns null for empty cart with high min total', () => {
    const { matchInterstitialOffers } = require('@/lib/upsell-engine');
    const rules = [{
      id: 'r1', name: 'Big spender', phase: 'interstitial',
      trigger_type: 'cart_total', trigger_item_ids: [], trigger_category_ids: [],
      trigger_min_total: 500, offer_type: 'item', offer_item_id: 'mi-1',
      offer_bundle_id: null, offer_discount_percent: null,
      offer_message: '', priority: 5, is_active: true,
      starts_at: null, ends_at: null,
      offer_item: { id: 'mi-1', name: 'Item', basePrice: 100, description: '', category: '' },
    }];

    const result = matchInterstitialOffers(
      { items: [], total: 50 },
      rules,
      null, null, new Date(),
    );
    expect(result).toBeNull();
  });
});

describe('Empty states', () => {
  it('no offers returns empty arrays', () => {
    const { matchUpgradeOffers, matchPairOffers, suggestAddOns } = require('@/lib/upsell-engine');
    const now = new Date();
    expect(matchUpgradeOffers([], [], now)).toHaveLength(0);
    expect(matchPairOffers([], [], now)).toHaveLength(0);
    expect(suggestAddOns('mi-1', [], now)).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add tests/integration/upsell-flow.test.ts tests/unit/components/upsell-ui.test.ts
git commit -m "test(upsell): add integration, API, and UI component tests"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| 1: Cost + Analytics | Tasks 1-12 | Cost columns, cost engine, analytics engine, admin dashboard |
| 2: Bundles | Tasks 13-19d | Bundle tables, bundle engine, admin CRUD, customer customizer, cart/menu integration, order API support, admin order display |
| 3: Upsell Engine + Admin | Tasks 20-26b | Upsell tables, 4-phase engine, validation schemas, admin/customer actions, 4-tab admin UI |
| 4: Customer Upsell UI | Tasks 27-32 | Upgrade screen, add-on suggestions, best pair screen, checkout interstitial, order confirmation bundles, comprehensive tests |

Each phase produces working, testable software independently. Phase 1 can ship alone as a cost tracking + analytics feature.
