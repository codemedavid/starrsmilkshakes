# Upsell Flow Fix — Design Spec

**Date:** 2026-03-20
**Status:** Approved
**Approach:** URL Query Param (Approach A)

---

## Overview

Fix the upsell system's add-to-cart flow so that each phase triggers correctly, pair suggestions only match the item just added (not the entire cart), and items requiring customization navigate to their product detail page before being finalized in cart.

### Problems

1. **Pair upsell shows wrong items**: `showPair` receives the entire cart, so pair rules match against ALL cart items — not just the item the customer just added. This makes it look like "all items available" are showing as pairs.
2. **Upgrade accept flow wrong**: After accepting an upgrade (e.g., a bundle), the code still navigates to the original item's product detail page. The upgrade should replace the need for the original item.
3. **Pair items added without customization**: When a customer taps "Add" on a pair item that has variations or add-ons, it gets added to cart without letting them customize first.

### Goals

1. Pair suggestions only match against the item just added
2. After accepting an upgrade, skip product detail → show pairs → back to menu
3. Pair items with variations/add-ons navigate to product detail for customization
4. Pair items without customization add inline and stay on pair screen
5. Prevent pair recursion (adding a pair item shouldn't trigger another pair screen)

---

## 1. Complete Flow

```
Menu → Click Item Card
  │
  ├─ showUpgrade(itemId, category, price)
  │   ├─ Offers exist → UpgradeScreen modal
  │   │   ├─ ACCEPTED → upgrade added to cart
  │   │   │   └─ showPair([upgradedItem])
  │   │   │       ├─ Pairs exist → BestPairScreen
  │   │   │       │   ├─ Add (needs customization) → /product/[pairId]?source=pair → add to cart → menu
  │   │   │       │   ├─ Add (simple) → add to cart, stay on pair screen
  │   │   │       │   └─ Skip → menu
  │   │   │       └─ No pairs → menu
  │   │   └─ SKIPPED → /product/[id]
  │   └─ No offers → /product/[id]
  │
  ├─ Product Detail Page
  │   ├─ Customer customizes (variations, add-ons)
  │   ├─ Clicks "Add to Cart"
  │   │
  │   ├─ If source=pair (came from pair screen):
  │   │   └─ Add to cart → router.push('/') (no pair screen, prevents recursion)
  │   │
  │   └─ Normal flow (no source=pair):
  │       └─ showPair([newItemOnly])
  │           ├─ Pairs exist → BestPairScreen
  │           │   ├─ Add (needs customization) → /product/[pairId]?source=pair
  │           │   ├─ Add (simple) → add to cart, stay on pair screen
  │           │   └─ Skip → menu
  │           └─ No pairs → menu
  │
Cart Page → "Proceed to Checkout"
  │
  ├─ showInterstitial()
  │   ├─ Offer exists → CheckoutInterstitial modal
  │   │   ├─ ACCEPTED → item/bundle added to cart
  │   │   └─ SKIPPED → continue
  │   └─ No offer → continue
  │
  └─ router.push('/checkout')
```

---

## 2. File Changes

### 2A. `src/components/MenuItemCard.tsx`

**Current behavior**: `await showUpgrade(...)` then ALWAYS `router.push('/product/[id]')`.

**New behavior**:
```typescript
onClick={async () => {
  if (navigating) return;
  setNavigating(true);

  const result = await showUpgrade(item.id, item.category, item.effectivePrice || item.basePrice);

  if (result === 'accepted') {
    // Upgrade added to cart by overlay — show pairs for the upgrade, then back to menu
    // The UpsellOverlay already added the item/bundle to cart.
    // Build UpsellCartItem from the accepted upgrade offer.
    // showPair is called from the overlay's accept handler (see 2D).
    setNavigating(false);
    router.push('/');
  } else {
    // No upgrade or skipped — go to product detail for customization
    router.push(`/product/${item.id}`);
    setNavigating(false);
  }
}}
```

Key changes:
- `result === 'accepted'` → skip product detail, show pairs, go to menu
- Destructure `showPair` from `useUpsell()`: `const { showUpgrade, showPair } = useUpsell()`
- Note: `showPair` is called synchronously after `showUpgrade` resolves. The `isActive` ref is already `false` at this point (set by the resolver callback), so `showPair` proceeds correctly. React 18 batching handles the intermediate `setActiveUpsell(null)` → `setActiveUpsell({ type: 'pair', loading: true })` transition without a flash.

### 2B. `app/product/[id]/page.tsx`

**Change 1**: Pass only the newly added item to `showPair`, not the entire cart.

```typescript
// BEFORE (broken — matches pairs against entire cart)
const existingUpsellItems = mapCartItemsToUpsell(cart.cartItems);
const newItem: UpsellCartItem = { ... };
await showPair([...existingUpsellItems, newItem]);

// AFTER (fixed — matches pairs only against the just-added item)
const newItem: UpsellCartItem = {
  menu_item_id: product.id,
  category: product.category,
  quantity: quantity,
  unit_price: calculatePrice(),
};
await showPair([newItem]);
```

**Change 2**: Check `source=pair` query param. If present, skip pair screen after add-to-cart (prevents recursion). Note: `useSearchParams()` is safe here since the page is already a client component (`'use client'`). No additional `Suspense` boundary needed.

```typescript
const searchParams = useSearchParams();
const fromPair = searchParams.get('source') === 'pair';

const handleAddToCart = async (buyNow = false) => {
  // ... add to cart logic ...

  if (buyNow) {
    router.push('/checkout');
    return;
  }

  if (fromPair) {
    // Came from pair screen — go back to menu, no pair recursion
    router.push('/');
    return;
  }

  // Normal flow — show pair suggestions for just-added item
  setCheckingPairs(true);
  const newItem: UpsellCartItem = { ... };
  await showPair([newItem]);
  setCheckingPairs(false);
  router.push('/');
};
```

### 2C. `src/components/BestPairScreen.tsx`

**Change**: Add `onNavigateToProduct` callback. Check if each pair item has variations or add-ons. Render different button behavior based on that.

```typescript
interface BestPairScreenProps {
  offers: PairOffer[];
  onAddItem: (itemId: string) => void;               // Simple items — add inline
  onNavigateToProduct: (itemId: string) => void;      // Items needing customization
  onSkip: () => void;
  asModal?: boolean;
}
```

In the render for each offer card:
```typescript
const target = offer.item || offer.bundle;
// Bundles always need customization (slot selection).
// Items need customization if they have variations or add-ons.
const needsCustomization = offer.bundle
  ? true
  : offer.item
    ? itemNeedsCustomization(offer.item)
    : false;

// Button onClick:
if (needsCustomization) {
  onNavigateToProduct(itemId);
} else {
  onAddItem(itemId);
}
```

Important: When a simple item is added via `onAddItem`, the pair screen stays open. Only `onNavigateToProduct` and `onSkip` close it.

For bundles, `onNavigateToProduct` routes to `/bundle/[bundleId]?source=pair` (the existing bundle customizer page). For items, it routes to `/product/[itemId]?source=pair`.

### 2D. `src/components/UpsellOverlay.tsx`

**Change 1 (Upgrade accept → pair flow)**: After accepting an upgrade, trigger pair suggestions before resolving.

The current upgrade accept flow:
```typescript
onAcceptBundle={(bundleId, selections, totalPrice) => {
  cart.addBundleToCart(offer.rule.offer_bundle, selections, totalPrice);
  resolveUpsell('accepted');
}}
```

New flow: After adding to cart, show pair screen, THEN resolve. But since UpsellContext only supports one active upsell at a time, we need to resolve the upgrade first, then trigger pair.

Approach: resolve upgrade as 'accepted', then in `MenuItemCard` handle the pair flow. Since `MenuItemCard` already checks `result === 'accepted'`, it can trigger `showPair` there. But `MenuItemCard` doesn't know what item was upgraded to.

**Better approach**: Have the upgrade accept handler pass back information about what was added, so `MenuItemCard` can build the correct `UpsellCartItem` for pair matching.

Actually, simplest: After upgrade accepted in `MenuItemCard`:
```typescript
if (result === 'accepted') {
  // Upgrade was accepted. We don't know exactly what was added (item vs bundle),
  // but we can use the original item's category for pair matching since upgrades
  // are category-related.
  const upgradeItem: UpsellCartItem = {
    menu_item_id: item.id,
    category: item.category,
    quantity: 1,
    unit_price: item.effectivePrice || item.basePrice,
  };
  await showPair([upgradeItem]);
  router.push('/');
  setNavigating(false);
}
```

This works because pair rules match on `source_category_id` or `source_item_id`, and the original item's category is the right context for pair matching.

**Change 2 (Pair navigate to product)**: Handle `onNavigateToProduct` callback. Track inline-added items to filter them from the display.

```typescript
// Inside UpsellOverlay component:
const router = useRouter();
const [addedPairIds, setAddedPairIds] = useState<Set<string>>(new Set());

// Reset addedPairIds when a new pair upsell is shown
useEffect(() => {
  if (activeUpsell?.type === 'pair') {
    setAddedPairIds(new Set());
  }
}, [activeUpsell?.type]);

// Pair modal
if (activeUpsell.type === 'pair' && activeUpsell.pairOffers) {
  const filteredOffers = activeUpsell.pairOffers.filter(
    (o) => !addedPairIds.has(o.rule.id)
  );

  return (
    <BestPairScreen
      asModal
      offers={filteredOffers}
      onAddItem={(itemId) => {
        // Simple item — add to cart, stay on pair screen
        const offer = activeUpsell.pairOffers!.find(
          (o) => o.rule.paired_item_id === itemId || o.rule.paired_bundle_id === itemId,
        );
        if (offer?.item) {
          cart.addToCart(offer.item as MenuItem);
        }
        // Mark as added — BestPairScreen re-renders with filtered list.
        // When filteredOffers becomes empty, BestPairScreen's useEffect
        // triggers onSkip → resolves as 'skipped'. This is semantically
        // fine because the items are already in the cart at this point.
        setAddedPairIds((prev) => new Set(prev).add(offer!.rule.id));
      }}
      onNavigateToProduct={(itemId) => {
        // Item/bundle needs customization — close pair screen, navigate
        resolveUpsell('accepted');
        // Route to product detail or bundle customizer
        const offer = activeUpsell.pairOffers!.find(
          (o) => o.rule.paired_item_id === itemId || o.rule.paired_bundle_id === itemId,
        );
        if (offer?.bundle) {
          router.push(`/bundle/${itemId}?source=pair`);
        } else {
          router.push(`/product/${itemId}?source=pair`);
        }
      }}
      onSkip={() => resolveUpsell('skipped')}
    />
  );
}
```

**Note on auto-close semantics**: When all simple pair items are added inline, `filteredOffers` becomes empty, triggering `BestPairScreen`'s `useEffect(() => { if (offers.length === 0) onSkip(); })`. This resolves as `'skipped'` — semantically acceptable because all added items are already in the cart regardless of the resolve value. No downstream code depends on the `'accepted'` vs `'skipped'` distinction for pair results.

### 2E. `src/lib/upsell-helpers.ts`

**Add**: `itemNeedsCustomization` helper function.

```typescript
/**
 * Check if a menu item requires customization (has variations or add-ons).
 * Items with variations/add-ons should navigate to product detail for customization
 * rather than being added to cart directly.
 */
export function itemNeedsCustomization(item: MenuItem): boolean {
  const hasVariations = Array.isArray(item.variations) && item.variations.length > 0;
  const hasAddOns = Array.isArray(item.addOns) && item.addOns.length > 0;
  return hasVariations || hasAddOns;
}
```

### 2F. `src/lib/upsell-engine.ts`

No changes needed. The matching logic (`matchPairOffers`) is correct — it properly filters by source_item_id and source_category_id. The bug was in what cart items were being passed to it (entire cart vs. just-added item).

### 2G. `src/actions/upsell.ts`

**Change**: The `getPairSuggestions` server action needs to return item data WITH variations and add-ons, so `BestPairScreen` can determine if customization is needed.

Current query:
```typescript
.select('*, paired_item:menu_items!paired_item_id(*), paired_bundle:bundles!paired_bundle_id(*)')
```

New query — join variations and add-ons on paired items:
```typescript
.select('*, paired_item:menu_items!paired_item_id(*, variations(*), add_ons(*)), paired_bundle:bundles!paired_bundle_id(*)')
```

Update `normalizeMenuItem` call to also map variations and add-ons:
```typescript
const mapped = (rules || []).map((r: any) => ({
  ...r,
  paired_item: r.paired_item ? normalizeMenuItemWithRelations(r.paired_item) : null,
  paired_bundle: r.paired_bundle ?? null,
}));
```

### 2H. `src/lib/upsell-helpers.ts` — `normalizeMenuItemWithRelations`

Extend `normalizeMenuItem` to also handle nested variations and add-ons when present.

**Type compatibility note**: The `Variation` type uses `{ id, name, price, image? }` and the `AddOn` type uses `{ id, name, price, category, quantity? }`. These field names match the Supabase column names directly (both are lowercase), so raw Supabase rows can be assigned without transformation. The Supabase join returns `add_ons` (snake_case table name) which maps to `addOns` (camelCase property name).

```typescript
export function normalizeMenuItemWithRelations(raw: any): MenuItem {
  const base = normalizeMenuItem(raw);
  return {
    ...base,
    // Variation fields (id, name, price) match Supabase columns directly — no transformation needed
    variations: Array.isArray(raw.variations) ? raw.variations : undefined,
    // Supabase join key is "add_ons" (table name), maps to MenuItem.addOns
    addOns: Array.isArray(raw.add_ons) ? raw.add_ons : undefined,
  };
}
```

---

## 3. State Management for Inline Pair Adds

When a simple item is added from the pair screen (no customization), the pair screen stays open. Implementation details are in section 2D (`UpsellOverlay` code):

1. **Track added pair IDs**: `UpsellOverlay` maintains `addedPairIds` state (`Set<string>`, reset on new pair upsell)
2. **Filter displayed offers**: Pass `activeUpsell.pairOffers.filter(o => !addedPairIds.has(o.rule.id))` to `BestPairScreen`
3. **Auto-close when empty**: `BestPairScreen`'s existing `useEffect` calls `onSkip()` when `offers.length === 0` → resolves as `'skipped'` (acceptable — items are already in cart)

This means when the customer adds all simple pair items, the screen auto-closes. If only customization-needed items remain, they can tap one (navigates to product detail) or skip.

---

## 4. Edge Cases

| Scenario | Behavior |
|----------|----------|
| Upgrade accepted, no pair rules match | Pair screen skipped, straight to menu |
| All pair items need customization | Pair screen shows all with navigation buttons; tapping one closes screen and navigates |
| All pair items are simple | Items can be added inline; screen auto-closes when all added or user skips |
| Mix of simple and complex pair items | Simple items add inline; complex items navigate; screen stays open until skip or all simple added |
| Customer navigates back from pair product detail | They're on the product detail page with `?source=pair`; back button goes to previous page (pair screen is already closed) |
| Pair item is a bundle | Bundles always need customization (slot selection) → `onNavigateToProduct` routes to `/bundle/[bundleId]?source=pair` |
| source=pair product detail → "Buy Now" | Goes to checkout, no pair recursion |
| Rapid clicks on MenuItemCard during upgrade | Protected by `navigating` state and `isActive` ref in UpsellContext |

---

## 5. Files Modified

```
src/components/MenuItemCard.tsx          — Upgrade accept → pair → menu (skip product detail)
app/product/[id]/page.tsx                — Pass only newItem to showPair; check source=pair
src/components/BestPairScreen.tsx         — Add onNavigateToProduct callback; check customization
src/components/UpsellOverlay.tsx          — Handle pair navigate; track inline adds
src/lib/upsell-helpers.ts                — Add itemNeedsCustomization, normalizeMenuItemWithRelations
src/actions/upsell.ts                    — Join variations/add_ons on paired items
tests/upsell-flow.test.ts               — Update tests for new flow
tests/upsell-helpers.test.ts            — Add itemNeedsCustomization tests
```

---

## 6. Testing Strategy

### Unit Tests (Pure Logic)

| Test | Assertion |
|------|-----------|
| `itemNeedsCustomization` with variations | Returns `true` |
| `itemNeedsCustomization` with add-ons | Returns `true` |
| `itemNeedsCustomization` with neither | Returns `false` |
| `itemNeedsCustomization` with empty arrays | Returns `false` |
| `normalizeMenuItemWithRelations` with nested data | Maps `add_ons` → `addOns`, preserves `variations` |
| `matchPairOffers` with single item | Only matches rules for that item/category |
| `matchPairOffers` with item already in cart | Excludes that item from results |

### Integration Tests (Flow)

| Test | Assertion |
|------|-----------|
| Upgrade accepted → pair screen shows → menu | No navigation to original product detail |
| Upgrade skipped → product detail | Navigates to product detail |
| Product detail add-to-cart → pair shows only for new item | Does not show pairs for other cart items |
| Pair item with customization → navigates to product detail | URL contains `?source=pair` |
| Pair item without customization → stays on pair screen | Item added to cart, screen stays open |
| source=pair product detail → add to cart → menu | No pair screen recursion |
| All pair items added inline → screen auto-closes | `onSkip` called when offers empty |
| Cart checkout → interstitial → checkout page | Full checkout flow works |

---

## 7. What's NOT Changing

- Upsell engine matching logic (`matchPairOffers`, `matchUpgradeOffers`, `matchInterstitialOffers`) — all correct
- Database schema — no changes
- Admin UI — no changes
- Checkout interstitial flow — already working correctly at `app/cart/page.tsx:33-48` (`handleCheckout` calls `showInterstitial()` before `router.push('/checkout')`)
- UpsellContext Promise/resolver pattern — stays the same
- UpgradeScreen component — no changes
- CheckoutInterstitial component — no changes
