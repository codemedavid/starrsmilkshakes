# Upsell Flow Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the upsell flow so pair suggestions match only the just-added item, upgrade-accept skips product detail, and pair items with customization navigate to their product detail page.

**Architecture:** URL query param approach (`?source=pair`) for pair recursion prevention. Pure helper additions for customization detection. UpsellOverlay gains local `addedPairIds` state for inline pair adds. No database, engine, or admin changes.

**Tech Stack:** Next.js 15, TypeScript, Vitest, React context, Supabase PostgREST joins

**Spec:** `docs/superpowers/specs/2026-03-20-upsell-flow-fix-design.md`

**Test conventions:** Pure helper tests in `tests/upsell-helpers.test.ts`. Flow/integration tests in `tests/upsell-flow.test.ts`. Run: `npx vitest run tests/<file> --reporter=verbose`.

---

## File Structure

```
Modified:
  src/lib/upsell-helpers.ts              — Add itemNeedsCustomization + normalizeMenuItemWithRelations
  src/actions/upsell.ts                   — Join variations/add_ons in getPairSuggestions query
  src/components/BestPairScreen.tsx        — Add onNavigateToProduct prop; per-item customization check
  src/components/UpsellOverlay.tsx         — Track addedPairIds; handle pair navigate + inline add
  src/components/MenuItemCard.tsx          — Upgrade accept → showPair → menu; skip product detail
  app/product/[id]/page.tsx               — Pass only newItem to showPair; check source=pair
  tests/upsell-helpers.test.ts            — Add tests for new helpers
  tests/upsell-flow.test.ts              — Add tests for new flow behaviors
```

---

## Task 1: Add `itemNeedsCustomization` Helper + Tests

**Files:**
- Modify: `src/lib/upsell-helpers.ts`
- Modify: `tests/upsell-helpers.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/upsell-helpers.test.ts`:

```typescript
import { itemNeedsCustomization } from '@/lib/upsell-helpers';

// ─── itemNeedsCustomization ──────────────────────────────────────────────────

describe('itemNeedsCustomization', () => {
  it('returns true when item has variations', () => {
    const item = makeMenuItem({ variations: [{ id: 'v1', name: 'Large', price: 20 }] });
    expect(itemNeedsCustomization(item)).toBe(true);
  });

  it('returns true when item has addOns', () => {
    const item = makeMenuItem({ addOns: [{ id: 'a1', name: 'Whip', price: 15, category: 'toppings' }] });
    expect(itemNeedsCustomization(item)).toBe(true);
  });

  it('returns true when item has both variations and addOns', () => {
    const item = makeMenuItem({
      variations: [{ id: 'v1', name: 'Large', price: 20 }],
      addOns: [{ id: 'a1', name: 'Whip', price: 15, category: 'toppings' }],
    });
    expect(itemNeedsCustomization(item)).toBe(true);
  });

  it('returns false when item has no variations or addOns', () => {
    const item = makeMenuItem();
    expect(itemNeedsCustomization(item)).toBe(false);
  });

  it('returns false when variations is empty array', () => {
    const item = makeMenuItem({ variations: [] });
    expect(itemNeedsCustomization(item)).toBe(false);
  });

  it('returns false when addOns is empty array', () => {
    const item = makeMenuItem({ addOns: [] });
    expect(itemNeedsCustomization(item)).toBe(false);
  });

  it('returns false when variations and addOns are undefined', () => {
    const item = makeMenuItem({ variations: undefined, addOns: undefined });
    expect(itemNeedsCustomization(item)).toBe(false);
  });
});
```

Note: `makeMenuItem` is already defined in `upsell-flow.test.ts` but not in `upsell-helpers.test.ts`. The `upsell-helpers.test.ts` file uses `makeCartItem` instead. Add a minimal `makeMenuItem` helper at the top of the file:

```typescript
function makeMenuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'menu-item-1',
    name: 'Chocolate Shake',
    description: 'Rich chocolate shake',
    basePrice: 150,
    category: 'shakes',
    ...overrides,
  };
}
```

Also add the `MenuItem` import if not already present (check existing imports — `CartItem` is imported but `MenuItem` may need adding).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/upsell-helpers.test.ts --reporter=verbose`
Expected: FAIL — `itemNeedsCustomization` is not exported from `@/lib/upsell-helpers`

- [ ] **Step 3: Implement `itemNeedsCustomization`**

Add to `src/lib/upsell-helpers.ts`:

```typescript
/**
 * Check if a menu item requires customization (has variations or add-ons).
 * Items with variations/add-ons should navigate to product detail for customization
 * rather than being added to cart directly from the pair screen.
 */
export function itemNeedsCustomization(item: MenuItem): boolean {
  const hasVariations = Array.isArray(item.variations) && item.variations.length > 0;
  const hasAddOns = Array.isArray(item.addOns) && item.addOns.length > 0;
  return hasVariations || hasAddOns;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/upsell-helpers.test.ts --reporter=verbose`
Expected: All `itemNeedsCustomization` tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/upsell-helpers.ts tests/upsell-helpers.test.ts
git commit -m "feat(upsell): add itemNeedsCustomization helper with tests"
```

---

## Task 2: Add `normalizeMenuItemWithRelations` Helper + Tests

**Files:**
- Modify: `src/lib/upsell-helpers.ts`
- Modify: `tests/upsell-helpers.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/upsell-helpers.test.ts`:

```typescript
import { normalizeMenuItemWithRelations } from '@/lib/upsell-helpers';

describe('normalizeMenuItemWithRelations', () => {
  it('normalizes base fields like normalizeMenuItem', () => {
    const raw = {
      id: 'item-1',
      name: 'Chocolate Shake',
      description: 'Rich chocolate',
      base_price: 150,
      image_url: 'https://example.com/img.jpg',
      category: 'shakes',
      popular: true,
      available: true,
      cost_price: 50,
    };
    const result = normalizeMenuItemWithRelations(raw);
    expect(result.basePrice).toBe(150);
    expect(result.image).toBe('https://example.com/img.jpg');
    expect(result.costPrice).toBe(50);
  });

  it('maps nested variations array', () => {
    const raw = {
      id: 'item-1',
      name: 'Test',
      base_price: 100,
      category: 'shakes',
      variations: [
        { id: 'v1', name: 'Large', price: 20 },
        { id: 'v2', name: 'Small', price: 0 },
      ],
    };
    const result = normalizeMenuItemWithRelations(raw);
    expect(result.variations).toHaveLength(2);
    expect(result.variations![0].name).toBe('Large');
    expect(result.variations![0].price).toBe(20);
  });

  it('maps nested add_ons (snake_case) to addOns (camelCase)', () => {
    const raw = {
      id: 'item-1',
      name: 'Test',
      base_price: 100,
      category: 'shakes',
      add_ons: [
        { id: 'a1', name: 'Whip', price: 15, category: 'toppings' },
      ],
    };
    const result = normalizeMenuItemWithRelations(raw);
    expect(result.addOns).toHaveLength(1);
    expect(result.addOns![0].name).toBe('Whip');
    expect(result.addOns![0].category).toBe('toppings');
  });

  it('returns undefined for variations/addOns when not present', () => {
    const raw = {
      id: 'item-1',
      name: 'Test',
      base_price: 100,
      category: 'shakes',
    };
    const result = normalizeMenuItemWithRelations(raw);
    expect(result.variations).toBeUndefined();
    expect(result.addOns).toBeUndefined();
  });

  it('returns null for null input', () => {
    expect(normalizeMenuItemWithRelations(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/upsell-helpers.test.ts --reporter=verbose`
Expected: FAIL — `normalizeMenuItemWithRelations` is not exported

- [ ] **Step 3: Implement `normalizeMenuItemWithRelations`**

Add to `src/lib/upsell-helpers.ts`:

```typescript
/**
 * Like normalizeMenuItem but also maps nested variations and add_ons.
 * Used by getPairSuggestions where paired items need variation/add-on data
 * so BestPairScreen can determine if customization is needed.
 *
 * Variation fields (id, name, price) and AddOn fields (id, name, price, category)
 * match Supabase columns directly — no nested transformation needed.
 */
export function normalizeMenuItemWithRelations(raw: any): MenuItem {
  if (!raw) return raw;
  const base = normalizeMenuItem(raw);
  return {
    ...base,
    variations: Array.isArray(raw.variations) ? raw.variations : undefined,
    addOns: Array.isArray(raw.add_ons) ? raw.add_ons : undefined,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/upsell-helpers.test.ts --reporter=verbose`
Expected: All `normalizeMenuItemWithRelations` tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/upsell-helpers.ts tests/upsell-helpers.test.ts
git commit -m "feat(upsell): add normalizeMenuItemWithRelations helper with tests"
```

---

## Task 3: Update `getPairSuggestions` Server Action to Join Variations/Add-ons

**Files:**
- Modify: `src/actions/upsell.ts`

- [ ] **Step 1: Update the Supabase query in `getPairSuggestions`**

In `src/actions/upsell.ts`, find the `getPairSuggestions` function. Change the `.select()` call and the normalization:

**Current** (line ~61):
```typescript
const { data: rules, error } = await (supabaseServer.from('pair_rules') as any)
  .select('*, paired_item:menu_items!paired_item_id(*), paired_bundle:bundles!paired_bundle_id(*)')
  .eq('is_active', true);
```

**Replace with:**
```typescript
const { data: rules, error } = await (supabaseServer.from('pair_rules') as any)
  .select('*, paired_item:menu_items!paired_item_id(*, variations(*), add_ons(*)), paired_bundle:bundles!paired_bundle_id(*)')
  .eq('is_active', true);
```

**Current normalization** (line ~68):
```typescript
const mapped = (rules || []).map((r: any) => ({
  ...r,
  paired_item: r.paired_item ? normalizeMenuItem(r.paired_item) : null,
  paired_bundle: r.paired_bundle ?? null,
}));
```

**Replace with:**
```typescript
const mapped = (rules || []).map((r: any) => ({
  ...r,
  paired_item: r.paired_item ? normalizeMenuItemWithRelations(r.paired_item) : null,
  paired_bundle: r.paired_bundle ?? null,
}));
```

Also update the import at the top of the file:

**Current:**
```typescript
import { normalizeMenuItem } from '@/lib/upsell-helpers';
```

**Replace with:**
```typescript
import { normalizeMenuItem, normalizeMenuItemWithRelations } from '@/lib/upsell-helpers';
```

- [ ] **Step 2: Write a test for the FK hint query**

Add to `tests/upsell-flow.test.ts`, in the existing `getPairSuggestions` describe block (or create one). The existing test file already mocks `supabaseServer`. Add a test that verifies the select string includes `variations(*)` and `add_ons(*)`:

```typescript
describe('getPairSuggestions query includes relations', () => {
  it('selects variations and add_ons on paired items', async () => {
    const { getPairSuggestions } = await import('@/actions/upsell');

    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    (supabaseServer.from as Mock).mockReturnValue({ select: selectMock });

    await getPairSuggestions([makeUpsellCartItem()]);

    expect(selectMock).toHaveBeenCalledWith(
      expect.stringContaining('variations(*)'),
    );
    expect(selectMock).toHaveBeenCalledWith(
      expect.stringContaining('add_ons(*)'),
    );
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run tests/upsell-flow.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/actions/upsell.ts tests/upsell-flow.test.ts
git commit -m "feat(upsell): join variations/add_ons in getPairSuggestions query"
```

---

## Task 4: Update `BestPairScreen` — Add `onNavigateToProduct` Prop

**Files:**
- Modify: `src/components/BestPairScreen.tsx`

- [ ] **Step 1: Add new prop to interface**

In `src/components/BestPairScreen.tsx`, update the props interface:

**Current** (line ~12):
```typescript
interface BestPairScreenProps {
  offers: PairOffer[];
  onAddItem: (itemId: string) => void;
  onSkip: () => void;
  asModal?: boolean;
}
```

**Replace with:**
```typescript
interface BestPairScreenProps {
  offers: PairOffer[];
  onAddItem: (itemId: string) => void;
  onNavigateToProduct: (itemId: string) => void;
  onSkip: () => void;
  asModal?: boolean;
}
```

- [ ] **Step 2: Add `itemNeedsCustomization` import**

Add at top of file:
```typescript
import { itemNeedsCustomization } from '@/lib/upsell-helpers';
```

- [ ] **Step 3: Update component signature and button logic**

Update the component function signature to destructure the new prop:

```typescript
export default function BestPairScreen({ offers, onAddItem, onNavigateToProduct, onSkip, asModal }: BestPairScreenProps) {
```

Inside the `offers.slice(0, 4).map(...)` callback, replace the existing button's `onClick`:

**Current** (approximately line ~153-154):
```typescript
onClick={() => itemId && onAddItem(itemId)}
```

**Replace with:**
```typescript
onClick={() => {
  if (!itemId) return;
  const needsCustomization = offer.bundle
    ? true
    : offer.item
      ? itemNeedsCustomization(offer.item)
      : false;
  if (needsCustomization) {
    onNavigateToProduct(itemId);
  } else {
    onAddItem(itemId);
  }
}}
```

- [ ] **Step 4: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

If there are errors about missing `onNavigateToProduct` in other files that use `BestPairScreen`, that's expected — we'll fix those in Task 5 (UpsellOverlay). For now, confirm the component itself compiles.

- [ ] **Step 5: Commit**

```bash
git add src/components/BestPairScreen.tsx
git commit -m "feat(upsell): add onNavigateToProduct to BestPairScreen for customizable pair items"
```

---

## Task 5: Update `UpsellOverlay` — Pair Inline Adds + Navigate

**Files:**
- Modify: `src/components/UpsellOverlay.tsx`

- [ ] **Step 1: Add imports**

Add at top of file:
```typescript
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
```

(`useState` and `useEffect` may already be imported if `useUpsell` or `useCartContext` use them — check existing imports and add only what's missing.)

- [ ] **Step 2: Add `addedPairIds` state and router**

Inside the `UpsellOverlay` function, before the early returns, add:

```typescript
const router = useRouter();
const [addedPairIds, setAddedPairIds] = useState<Set<string>>(new Set());

// Reset when a new pair upsell is shown
useEffect(() => {
  if (activeUpsell?.type === 'pair') {
    setAddedPairIds(new Set());
  }
}, [activeUpsell?.type]);
```

- [ ] **Step 3: Update the pair modal section**

Find the pair modal block (current code starts around line ~63). Replace the entire pair modal block:

**Current:**
```typescript
// Pair modal
if (activeUpsell.type === 'pair' && activeUpsell.pairOffers) {
  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center">
      <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-xl">
        <BestPairScreen
          asModal
          offers={activeUpsell.pairOffers}
          onAddItem={(itemId: string) => {
            const offer = activeUpsell.pairOffers!.find(
              (o) => o.rule.paired_item_id === itemId || o.rule.paired_bundle_id === itemId,
            );
            if (offer?.item) {
              cart.addToCart(offer.item as MenuItem);
            } else if (offer?.bundle) {
              cart.addBundleToCart(offer.bundle, [], offer.bundle.base_price);
            }
            resolveUpsell('accepted');
          }}
          onSkip={() => resolveUpsell('skipped')}
        />
      </div>
    </div>
  );
}
```

**Replace with:**
```typescript
// Pair modal
if (activeUpsell.type === 'pair' && activeUpsell.pairOffers) {
  const filteredOffers = activeUpsell.pairOffers.filter(
    (o) => !addedPairIds.has(o.rule.id),
  );

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center">
      <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-xl">
        <BestPairScreen
          asModal
          offers={filteredOffers}
          onAddItem={(itemId: string) => {
            // Simple item — add to cart inline, stay on pair screen
            const offer = activeUpsell.pairOffers!.find(
              (o) => o.rule.paired_item_id === itemId || o.rule.paired_bundle_id === itemId,
            );
            if (offer?.item) {
              cart.addToCart(offer.item as MenuItem);
            }
            // Mark as added so it's filtered out on next render
            if (offer) {
              setAddedPairIds((prev) => new Set(prev).add(offer.rule.id));
            }
          }}
          onNavigateToProduct={(itemId: string) => {
            // Item/bundle needs customization — close pair screen, navigate
            const offer = activeUpsell.pairOffers!.find(
              (o) => o.rule.paired_item_id === itemId || o.rule.paired_bundle_id === itemId,
            );
            resolveUpsell('accepted');
            if (offer?.bundle) {
              router.push(`/bundle/${itemId}?source=pair`);
            } else {
              router.push(`/product/${itemId}?source=pair`);
            }
          }}
          onSkip={() => resolveUpsell('skipped')}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors (or only pre-existing ones unrelated to this change)

- [ ] **Step 5: Commit**

```bash
git add src/components/UpsellOverlay.tsx
git commit -m "feat(upsell): UpsellOverlay tracks inline pair adds and navigates for customizable items"
```

---

## Task 6: Update `MenuItemCard` — Upgrade Accept → Pair → Menu

**Files:**
- Modify: `src/components/MenuItemCard.tsx`

- [ ] **Step 1: Add `showPair` to useUpsell destructuring**

**Current** (line ~25):
```typescript
const { showUpgrade } = useUpsell();
```

**Replace with:**
```typescript
const { showUpgrade, showPair } = useUpsell();
```

- [ ] **Step 2: Add the UpsellCartItem import**

Add at top of file:
```typescript
import type { UpsellCartItem } from '@/types/upsell';
```

- [ ] **Step 3: Update the card onClick handler**

**Current** (lines ~136-142):
```typescript
onClick={!item.available ? undefined : async () => {
  if (navigating) return;
  setNavigating(true);
  await showUpgrade(item.id, item.category, item.effectivePrice || item.basePrice);
  router.push(`/product/${item.id}`);
  setNavigating(false);
}}
```

**Replace with:**
```typescript
onClick={!item.available ? undefined : async () => {
  if (navigating) return;
  setNavigating(true);

  const result = await showUpgrade(item.id, item.category, item.effectivePrice || item.basePrice);

  if (result === 'accepted') {
    // Upgrade was accepted and added to cart by the overlay.
    // Show pair suggestions using the original item's category context,
    // then go back to menu.
    const upgradeItem: UpsellCartItem = {
      menu_item_id: item.id,
      category: item.category,
      quantity: 1,
      unit_price: item.effectivePrice || item.basePrice,
    };
    await showPair([upgradeItem]);
    setNavigating(false);
    router.push('/');
  } else {
    // No upgrade or skipped — go to product detail for customization
    router.push(`/product/${item.id}`);
    setNavigating(false);
  }
}}
```

- [ ] **Step 4: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/components/MenuItemCard.tsx
git commit -m "fix(upsell): upgrade accept skips product detail, shows pairs, returns to menu"
```

---

## Task 7: Update Product Detail Page — Single Item Pairs + source=pair Guard

**Files:**
- Modify: `app/product/[id]/page.tsx`

- [ ] **Step 1: Add `useSearchParams` import**

The file already imports from `next/navigation`. Add `useSearchParams`:

**Current:**
```typescript
import { useRouter } from 'next/navigation';
```

**Replace with:**
```typescript
import { useRouter, useSearchParams } from 'next/navigation';
```

- [ ] **Step 2: Add `fromPair` detection**

Inside the component function, after the existing `useRouter()` and `useUpsell()` calls, add:

```typescript
const searchParams = useSearchParams();
const fromPair = searchParams.get('source') === 'pair';
```

- [ ] **Step 3: Update `handleAddToCart` — pass only new item to showPair + source=pair guard**

Find the `handleAddToCart` function (starts around line ~159). Replace the pair suggestion section:

**Current** (approximately lines 173-189):
```typescript
// Show pair suggestions via UpsellContext
setCheckingPairs(true);
try {
  const existingUpsellItems = mapCartItemsToUpsell(cart.cartItems);
  const newItem: UpsellCartItem = {
    menu_item_id: product.id,
    category: product.category,
    quantity: quantity,
    unit_price: calculatePrice(),
  };
  await showPair([...existingUpsellItems, newItem]);
} catch {
  // Ignore pair errors
}

setCheckingPairs(false);
router.push('/');
```

**Replace with:**
```typescript
if (fromPair) {
  // Came from pair screen — go back to menu, no pair recursion
  router.push('/');
  return;
}

// Show pair suggestions for just the newly added item (not entire cart)
setCheckingPairs(true);
try {
  const newItem: UpsellCartItem = {
    menu_item_id: product.id,
    category: product.category,
    quantity: quantity,
    unit_price: calculatePrice(),
  };
  await showPair([newItem]);
} catch {
  // Ignore pair errors
}

setCheckingPairs(false);
router.push('/');
```

- [ ] **Step 4: Remove unused import**

The `mapCartItemsToUpsell` import is no longer used in this file (we removed `[...existingUpsellItems, newItem]`). Remove it:

**Current:**
```typescript
import { mapCartItemsToUpsell } from '@/lib/upsell-helpers';
```

**Remove this line entirely.** (Check if it's used elsewhere in the file first — it should only have been used in the `handleAddToCart` pair section.)

- [ ] **Step 5: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add app/product/[id]/page.tsx
git commit -m "fix(upsell): pass only new item to showPair; skip pairs when source=pair"
```

---

## Task 8: Update Flow Tests

**Files:**
- Modify: `tests/upsell-flow.test.ts`

- [ ] **Step 1: Add test for pair matching with single item vs entire cart**

Add to `tests/upsell-flow.test.ts`:

```typescript
describe('pair matching: single item vs entire cart', () => {
  it('single item matches only its own pair rules', () => {
    const singleItem = [makeUpsellCartItem({ menu_item_id: 'shake-1', category: 'shakes' })];
    const rules = [
      makePairRule({ id: 'pair-for-shake', source_item_id: 'shake-1', paired_item_id: 'fries-1' }),
      makePairRule({ id: 'pair-for-snack', source_item_id: 'snack-1', paired_item_id: 'drink-1' }),
    ];
    const offers = matchPairOffers(singleItem, rules);
    expect(offers).toHaveLength(1);
    expect(offers[0].rule.id).toBe('pair-for-shake');
  });

  it('entire cart matches pair rules for ALL items (old behavior)', () => {
    const entireCart = [
      makeUpsellCartItem({ menu_item_id: 'shake-1', category: 'shakes' }),
      makeUpsellCartItem({ menu_item_id: 'snack-1', category: 'snacks' }),
    ];
    const rules = [
      makePairRule({ id: 'pair-for-shake', source_item_id: 'shake-1', paired_item_id: 'fries-1' }),
      makePairRule({ id: 'pair-for-snack', source_item_id: 'snack-1', paired_item_id: 'drink-1' }),
    ];
    const offers = matchPairOffers(entireCart, rules);
    // Both match — this is the old (broken) behavior
    expect(offers).toHaveLength(2);
  });

  it('category-based pair rules only match the single item category', () => {
    const singleItem = [makeUpsellCartItem({ menu_item_id: 'shake-1', category: 'shakes' })];
    const rules = [
      makePairRule({ id: 'pair-shakes', source_item_id: null, source_category_id: 'shakes', paired_item_id: 'fries-1' }),
      makePairRule({ id: 'pair-snacks', source_item_id: null, source_category_id: 'snacks', paired_item_id: 'drink-1' }),
    ];
    const offers = matchPairOffers(singleItem, rules);
    expect(offers).toHaveLength(1);
    expect(offers[0].rule.id).toBe('pair-shakes');
  });
});
```

- [ ] **Step 2: Add test for `itemNeedsCustomization` integration with pair flow**

```typescript
import { itemNeedsCustomization, normalizeMenuItemWithRelations } from '@/lib/upsell-helpers';

describe('pair item customization detection', () => {
  it('item with variations needs customization', () => {
    const raw = {
      id: 'item-1', name: 'Test', base_price: 100, category: 'shakes',
      variations: [{ id: 'v1', name: 'Large', price: 20 }],
    };
    const normalized = normalizeMenuItemWithRelations(raw);
    expect(itemNeedsCustomization(normalized)).toBe(true);
  });

  it('item without variations/add-ons does not need customization', () => {
    const raw = {
      id: 'item-1', name: 'Test', base_price: 100, category: 'shakes',
    };
    const normalized = normalizeMenuItemWithRelations(raw);
    expect(itemNeedsCustomization(normalized)).toBe(false);
  });

  it('normalizeMenuItemWithRelations maps add_ons for customization check', () => {
    const raw = {
      id: 'item-1', name: 'Test', base_price: 100, category: 'shakes',
      add_ons: [{ id: 'a1', name: 'Whip', price: 15, category: 'toppings' }],
    };
    const normalized = normalizeMenuItemWithRelations(raw);
    expect(itemNeedsCustomization(normalized)).toBe(true);
  });
});
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run tests/ --reporter=verbose`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add tests/upsell-flow.test.ts
git commit -m "test(upsell): add tests for single-item pair matching and customization detection"
```

---

## Task 9: Run Full Test Suite + Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run all upsell tests**

Run: `npx vitest run tests/upsell-helpers.test.ts tests/upsell-flow.test.ts --reporter=verbose`
Expected: All tests PASS

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -50`
Expected: No new errors

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: All tests PASS (no regressions)

- [ ] **Step 4: Final commit with all changes verified**

If any files were missed or need cleanup:
```bash
git add -A
git status
```

Only commit if there are unstaged changes that were part of this work. Otherwise, all changes are already committed in Tasks 1-8.
