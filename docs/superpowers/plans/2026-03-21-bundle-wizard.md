# Bundle Customization Wizard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the accordion-style BundleCustomizer modal with a full-page, multi-step wizard at `/bundle/[id]/customize`.

**Architecture:** Single-route wizard (`app/bundle/[id]/customize/page.tsx`) managing step state internally. Each bundle slot renders as its own step with a 2-column item card grid + inline customization. After all slots: review screen → optional upsell pair → optional upsell interstitial → add to cart → return to menu. Reuses all existing business logic from `bundle-engine.ts` and `CartContext` unchanged.

**Tech Stack:** Next.js App Router, React (client components), TypeScript, Tailwind CSS, Supabase client, Lucide icons

**Spec:** `docs/superpowers/specs/2026-03-21-bundle-wizard-design.md`

---

## File Structure

```
src/types/bundle.ts                              — Add shared SlotState interface (extract from BundleCustomizer)
src/lib/bundle-fetcher.ts                        — NEW: Extract Supabase fetch + mapSlotMenuItem from bundle page
src/components/bundle-wizard/WizardStepIndicator.tsx  — NEW: Numbered dot progress bar
src/components/bundle-wizard/ItemCard.tsx              — NEW: 2-col grid card for menu item
src/components/bundle-wizard/ItemCustomizer.tsx        — NEW: Variations + add-ons panel
src/components/bundle-wizard/SlotStep.tsx              — NEW: Full slot step (grid + customization)
src/components/bundle-wizard/ReviewItemCard.tsx        — NEW: Summary card with Edit button
src/components/bundle-wizard/BundleReviewStep.tsx      — NEW: Review screen with price breakdown
src/components/bundle-wizard/WizardBottomBar.tsx       — NEW: Sticky bottom bar
src/components/bundle-wizard/BundleUpsellPair.tsx      — NEW: Full-page pair upsell (adapted from BestPairScreen)
src/components/bundle-wizard/BundleUpsellInterstitial.tsx — NEW: Full-page interstitial (adapted from CheckoutInterstitial)
app/bundle/[id]/customize/page.tsx               — NEW: Wizard page component
src/components/Menu.tsx                          — Modify: link to wizard instead of opening modal
app/bundle/[id]/page.tsx                         — Modify: use shared bundle-fetcher
src/components/BundleCustomizer.tsx              — Modify: use shared SlotState import
```

---

### Task 1: Extract shared SlotState and bundle fetcher

**Files:**
- Modify: `src/types/bundle.ts` — add `SlotState` export
- Create: `src/lib/bundle-fetcher.ts` — extract fetch + mapping logic
- Modify: `app/bundle/[id]/page.tsx` — import from shared locations
- Modify: `src/components/BundleCustomizer.tsx` — import from shared locations

- [ ] **Step 1: Add `SlotState` interface to `src/types/bundle.ts`**

Add after the `SlotSelection` interface (line 51):

```typescript
export interface SlotState {
  slot_id: string;
  selected_items: {
    menu_item_id: string;
    menu_item: MenuItem;
    selected_variation: Variation | null;
    selected_add_ons: AddOn[];
  }[];
}
```

Note: The import for `Variation` and `AddOn` already exists at line 3.

- [ ] **Step 2: Create `src/lib/bundle-fetcher.ts`**

Extract `mapSlotMenuItem` and the Supabase fetch from `app/bundle/[id]/page.tsx` (lines 17-39, 66-106):

```typescript
import { supabase } from '@/lib/supabase';
import type { Bundle } from '@/types/bundle';
import type { MenuItem } from '@/types';

/** Map raw Supabase menu_item row to the camelCase shape the bundle engine expects */
export function mapSlotMenuItem(raw: any): MenuItem {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? '',
    basePrice: Number(raw.base_price),
    category: raw.category,
    image: raw.image_url || undefined,
    popular: Boolean(raw.popular),
    available: raw.available ?? true,
    variations: raw.variations?.map((v: any) => ({
      id: v.id,
      name: v.name,
      price: Number(v.price),
    })) || [],
    addOns: raw.add_ons?.map((a: any) => ({
      id: a.id,
      name: a.name,
      price: Number(a.price),
      category: a.category,
    })) || [],
  };
}

/** Fetch a bundle by ID with all nested slot/item/variation/addon data */
export async function fetchBundleById(id: string): Promise<Bundle | null> {
  const { data } = await (supabase.from('bundles') as any)
    .select(`
      *,
      slots:bundle_slots (
        *,
        items:bundle_slot_items (
          *,
          menu_item:menu_items (
            *,
            variations (*),
            add_ons (*)
          )
        )
      )
    `)
    .eq('id', id)
    .single();

  if (!data) return null;

  return {
    ...data,
    slots: data.slots.map((slot: any) => ({
      ...slot,
      items: slot.items.map((si: any) => ({
        ...si,
        menu_item: si.menu_item ? mapSlotMenuItem(si.menu_item) : undefined,
      })),
    })),
  } as Bundle;
}
```

- [ ] **Step 3: Update `app/bundle/[id]/page.tsx` to use shared utilities**

Replace the local `mapSlotMenuItem` function (lines 16-39) and `SlotState` interface (lines 41-49) with imports:

```typescript
import { fetchBundleById } from '@/lib/bundle-fetcher';
import type { SlotState } from '@/types/bundle';
```

Remove the local `mapSlotMenuItem` function and `SlotState` interface. Replace the fetch logic inside `useEffect` (lines 66-106) with:

```typescript
useEffect(() => {
  async function load() {
    const mapped = await fetchBundleById(id);
    if (mapped) {
      setBundle(mapped);
      setSlotStates(mapped.slots.map(slot => ({ slot_id: slot.id, selected_items: [] })));
      setExpandedSlot(mapped.slots[0]?.id ?? '');
    }
    setLoading(false);
  }
  void load();
}, [id]);
```

- [ ] **Step 4: Update `src/components/BundleCustomizer.tsx` to use shared `SlotState`**

Replace the local `SlotState` interface (lines 18-26) with import:

```typescript
import type { Bundle, BundleSlot, SlotSelection, SlotState } from '@/types/bundle';
```

Remove the local `interface SlotState { ... }` block.

- [ ] **Step 5: Verify the app still compiles**

Run: `npx next build` or `npx tsc --noEmit`
Expected: No type errors. Existing bundle page and BundleCustomizer work as before.

- [ ] **Step 6: Commit**

```bash
git add src/types/bundle.ts src/lib/bundle-fetcher.ts app/bundle/\[id\]/page.tsx src/components/BundleCustomizer.tsx
git commit -m "refactor: extract shared SlotState and bundle fetcher utilities"
```

---

### Task 2: WizardStepIndicator component

**Files:**
- Create: `src/components/bundle-wizard/WizardStepIndicator.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client';

import { Check } from 'lucide-react';

interface WizardStepIndicatorProps {
  steps: { label: string }[];
  currentStep: number;       // 0-indexed, matches slot index; last = review
  completedSteps: Set<number>;
}

export default function WizardStepIndicator({ steps, currentStep, completedSteps }: WizardStepIndicatorProps) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-center">
        {steps.map((step, i) => {
          const isCompleted = completedSteps.has(i);
          const isCurrent = i === currentStep;
          const isPast = i < currentStep;

          return (
            <div key={i} className="flex items-center">
              {/* Dot */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    isCompleted
                      ? 'bg-[#3D8A80] text-white'
                      : isCurrent
                        ? 'bg-[#7BBFB5] text-white'
                        : 'border-2 border-stone-300 text-stone-400'
                  }`}
                  aria-label={`Step ${i + 1} of ${steps.length}: ${step.label}`}
                >
                  {isCompleted ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                <span
                  className={`text-[10px] mt-1 font-nunito max-w-[48px] text-center leading-tight truncate ${
                    isCurrent || isCompleted ? 'text-[#3D8A80] font-semibold' : 'text-stone-400'
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {i < steps.length - 1 && (
                <div
                  className={`w-8 h-0.5 mx-1 mt-[-14px] ${
                    isPast || isCompleted ? 'bg-[#3D8A80]' : 'bg-stone-200'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/bundle-wizard/WizardStepIndicator.tsx
git commit -m "feat(wizard): add WizardStepIndicator component"
```

---

### Task 3: ItemCard component

**Files:**
- Create: `src/components/bundle-wizard/ItemCard.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client';

import { Check } from 'lucide-react';
import type { MenuItem } from '@/types';

interface ItemCardProps {
  item: MenuItem;
  priceOverride: number | null;
  isSelected: boolean;
  onSelect: () => void;
}

export default function ItemCard({ item, priceOverride, isSelected, onSelect }: ItemCardProps) {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex flex-col rounded-xl border-2 overflow-hidden transition-all duration-200 ${
        isSelected
          ? 'border-[#7BBFB5] bg-[#7BBFB5]/5 shadow-md'
          : 'border-transparent bg-white hover:shadow-sm'
      }`}
    >
      {/* Image */}
      <div className="w-full aspect-square bg-stone-100 relative overflow-hidden">
        {item.image ? (
          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="flex items-center justify-center w-full h-full text-3xl">🥤</div>
        )}
        {isSelected && (
          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#3D8A80] flex items-center justify-center">
            <Check className="w-3.5 h-3.5 text-white" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 text-left">
        <p className="font-nunito font-bold text-sm text-stone-900 line-clamp-2 leading-tight">
          {item.name}
        </p>
        {priceOverride !== null ? (
          <p className="text-xs text-stone-500 mt-1">+₱{priceOverride.toFixed(0)}</p>
        ) : (
          <p className="text-xs text-[#3D8A80] font-medium mt-1">Included</p>
        )}
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/bundle-wizard/ItemCard.tsx
git commit -m "feat(wizard): add ItemCard component for item grid"
```

---

### Task 4: ItemCustomizer component

**Files:**
- Create: `src/components/bundle-wizard/ItemCustomizer.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client';

import { Check } from 'lucide-react';
import type { MenuItem, Variation, AddOn } from '@/types';

interface ItemCustomizerProps {
  item: MenuItem;
  selectedVariation: Variation | null;
  selectedAddOns: AddOn[];
  onVariation: (variation: Variation | null) => void;
  onToggleAddOn: (addOn: AddOn) => void;
}

export default function ItemCustomizer({
  item,
  selectedVariation,
  selectedAddOns,
  onVariation,
  onToggleAddOn,
}: ItemCustomizerProps) {
  const hasVariations = item.variations && item.variations.length > 0;
  const hasAddOns = item.addOns && item.addOns.length > 0;

  if (!hasVariations && !hasAddOns) return null;

  return (
    <div className="mt-3 space-y-4 px-1">
      {/* Variations (radio pills) */}
      {hasVariations && (
        <div>
          <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">
            Size / Variation
          </p>
          <div className="flex gap-2 flex-wrap">
            {item.variations!.map(v => (
              <button
                key={v.id}
                onClick={() => onVariation(selectedVariation?.id === v.id ? null : v)}
                className={`px-3 py-2.5 min-h-[44px] rounded-lg text-xs font-nunito font-medium border transition-all ${
                  selectedVariation?.id === v.id
                    ? 'border-[#7BBFB5] bg-[#7BBFB5]/10 text-[#3D8A80]'
                    : 'border-stone-200 text-stone-600 hover:border-stone-300'
                }`}
              >
                {v.name}
                {v.price > 0 && ` +₱${v.price}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add-ons (toggle chips) */}
      {hasAddOns && (
        <div>
          <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">
            Add-ons
          </p>
          <div className="space-y-1.5">
            {item.addOns!.map(a => {
              const isAdded = selectedAddOns.some(sa => sa.id === a.id);
              return (
                <button
                  key={a.id}
                  onClick={() => onToggleAddOn(a)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 min-h-[44px] rounded-lg text-xs font-nunito border transition-all ${
                    isAdded
                      ? 'border-[#7BBFB5] bg-[#7BBFB5]/5 text-[#3D8A80] font-semibold'
                      : 'border-stone-200 text-stone-600 hover:border-stone-300'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {isAdded && <Check className="w-3 h-3 text-[#3D8A80]" />}
                    {a.name}
                  </span>
                  <span>+₱{a.price}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/bundle-wizard/ItemCustomizer.tsx
git commit -m "feat(wizard): add ItemCustomizer for variations and add-ons"
```

---

### Task 5: WizardBottomBar component

**Files:**
- Create: `src/components/bundle-wizard/WizardBottomBar.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client';

import { ArrowLeft } from 'lucide-react';

interface WizardBottomBarProps {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  nextDisabled: boolean;
  totalPrice: number;
  showBack: boolean;
}

export default function WizardBottomBar({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  totalPrice,
  showBack,
}: WizardBottomBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-stone-100 px-4 py-3 pb-6 z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
      <div className="max-w-lg mx-auto flex items-center gap-3">
        {showBack && (
          <button
            onClick={onBack}
            className="min-w-[48px] min-h-[48px] flex items-center justify-center rounded-xl border border-stone-200 hover:bg-stone-50 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </button>
        )}
        <button
          onClick={onNext}
          disabled={nextDisabled}
          className="flex-1 min-h-[48px] py-3 bg-[#7BBFB5] text-white font-nunito font-bold text-sm rounded-xl hover:bg-[#3D8A80] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          aria-label={nextLabel}
        >
          {nextLabel}
          {totalPrice > 0 && (
            <span className="font-normal opacity-90">· ₱{totalPrice.toFixed(0)}</span>
          )}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/bundle-wizard/WizardBottomBar.tsx
git commit -m "feat(wizard): add WizardBottomBar sticky footer component"
```

---

### Task 6: SlotStep component

**Files:**
- Create: `src/components/bundle-wizard/SlotStep.tsx`

- [ ] **Step 1: Create the component**

This is the main step view — renders a 2-column grid of items for a slot, with inline customization for selected items.

```typescript
'use client';

import type { BundleSlot } from '@/types/bundle';
import type { SlotState } from '@/types/bundle';
import type { MenuItem, Variation, AddOn } from '@/types';
import ItemCard from './ItemCard';
import ItemCustomizer from './ItemCustomizer';

interface SlotStepProps {
  slot: BundleSlot;
  slotState: SlotState;
  onSelectItem: (menuItem: MenuItem) => void;
  onVariation: (menuItemId: string, variation: Variation | null) => void;
  onToggleAddOn: (menuItemId: string, addOn: AddOn) => void;
}

export default function SlotStep({
  slot,
  slotState,
  onSelectItem,
  onVariation,
  onToggleAddOn,
}: SlotStepProps) {
  const sortedItems = [...slot.items].sort((a, b) => a.sort_order - b.sort_order);
  const selCount = slotState.selected_items.length;

  return (
    <div className="px-4 pb-28">
      {/* Header */}
      <div className="mb-4">
        <h2 className="font-playfair text-xl font-semibold text-stone-900">{slot.label}</h2>
        <p className="font-nunito text-sm text-stone-500 mt-1">
          {slot.min_selections === slot.max_selections
            ? `Pick ${slot.min_selections}`
            : `Pick ${slot.min_selections} to ${slot.max_selections}`}
          {selCount > 0 && (
            <span className="text-[#3D8A80] font-semibold"> · {selCount} selected</span>
          )}
        </p>
      </div>

      {/* 2-column card grid */}
      <div className="grid grid-cols-2 gap-3">
        {sortedItems.map(slotItem => {
          const mi = slotItem.menu_item;
          if (!mi) return null;
          const isSelected = slotState.selected_items.some(i => i.menu_item_id === mi.id);

          return (
            <div key={slotItem.id}>
              <ItemCard
                item={mi}
                priceOverride={slotItem.price_override}
                isSelected={isSelected}
                onSelect={() => onSelectItem(mi)}
              />
            </div>
          );
        })}
      </div>

      {/* Customization panels for selected items */}
      {slotState.selected_items.map(sel => {
        const mi = sel.menu_item;
        return (
          <div
            key={sel.menu_item_id}
            className="mt-4 p-3 bg-[#7BBFB5]/5 border border-[#7BBFB5]/20 rounded-xl"
          >
            <p className="font-nunito font-bold text-sm text-stone-800 mb-1">
              Customize: {mi.name}
            </p>
            <ItemCustomizer
              item={mi}
              selectedVariation={sel.selected_variation}
              selectedAddOns={sel.selected_add_ons}
              onVariation={(v) => onVariation(sel.menu_item_id, v)}
              onToggleAddOn={(a) => onToggleAddOn(sel.menu_item_id, a)}
            />
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/bundle-wizard/SlotStep.tsx
git commit -m "feat(wizard): add SlotStep with item grid and inline customization"
```

---

### Task 7: ReviewItemCard component

**Files:**
- Create: `src/components/bundle-wizard/ReviewItemCard.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client';

import type { SlotState } from '@/types/bundle';
import type { BundleSlot } from '@/types/bundle';

interface ReviewItemCardProps {
  slot: BundleSlot;
  slotState: SlotState;
  onEdit: () => void;
}

export default function ReviewItemCard({ slot, slotState, onEdit }: ReviewItemCardProps) {
  return (
    <div className="bg-white rounded-xl p-3 border border-stone-200 space-y-3">
      {slotState.selected_items.map(sel => {
        const mi = sel.menu_item;
        const variationText = sel.selected_variation ? sel.selected_variation.name : null;
        const addOnsText = sel.selected_add_ons.length > 0
          ? sel.selected_add_ons.map(a => a.name).join(', ')
          : null;
        const subtitle = [variationText, addOnsText].filter(Boolean).join(' · ') || 'No customizations';

        return (
          <div key={sel.menu_item_id} className="flex items-start gap-3">
            {/* Thumbnail */}
            <div className="w-12 h-12 rounded-lg overflow-hidden bg-stone-100 flex-shrink-0">
              {mi.image ? (
                <img src={mi.image} alt={mi.name} className="w-full h-full object-cover" />
              ) : (
                <div className="flex items-center justify-center w-full h-full text-lg">🥤</div>
              )}
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-[#3D8A80] uppercase tracking-wide">
                {slot.label}
              </p>
              <p className="font-nunito font-bold text-sm text-stone-900 truncate">{mi.name}</p>
              <p className="font-nunito text-xs text-stone-500 truncate">{subtitle}</p>
            </div>

            {/* Edit button */}
            <button
              onClick={onEdit}
              className="text-xs text-[#3D8A80] font-semibold border border-[#3D8A80] rounded-md px-2.5 py-1 min-h-[32px] hover:bg-[#3D8A80]/5 transition-colors flex-shrink-0"
            >
              Edit
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/bundle-wizard/ReviewItemCard.tsx
git commit -m "feat(wizard): add ReviewItemCard summary component"
```

---

### Task 8: BundleReviewStep component

**Files:**
- Create: `src/components/bundle-wizard/BundleReviewStep.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client';

import { Minus, Plus } from 'lucide-react';
import type { Bundle, SlotState } from '@/types/bundle';
import ReviewItemCard from './ReviewItemCard';

interface BundleReviewStepProps {
  bundle: Bundle;
  slotStates: SlotState[];
  quantity: number;
  onQuantityChange: (qty: number) => void;
  onEditSlot: (slotIndex: number) => void;
  priceInfo: { effectivePrice: number; addOnsTotal: number; variationsExtra: number; total: number };
  savingsInfo: { savings: number; savingsPercent: number };
}

export default function BundleReviewStep({
  bundle,
  slotStates,
  quantity,
  onQuantityChange,
  onEditSlot,
  priceInfo,
  savingsInfo,
}: BundleReviewStepProps) {
  const sortedSlots = [...bundle.slots].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="px-4 pb-28">
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="font-playfair text-xl font-semibold text-stone-900">{bundle.name}</h2>
        <p className="font-nunito text-sm text-stone-500 mt-1">Review your selections</p>
      </div>

      {/* Selection summary cards */}
      <div className="space-y-3 mb-6">
        {sortedSlots.map((slot, slotIndex) => {
          const state = slotStates.find(s => s.slot_id === slot.id);
          if (!state || state.selected_items.length === 0) return null;
          return (
            <ReviewItemCard
              key={slot.id}
              slot={slot}
              slotState={state}
              onEdit={() => onEditSlot(slotIndex)}
            />
          );
        })}
      </div>

      {/* Quantity selector */}
      <div className="flex items-center justify-center gap-4 mb-6">
        <span className="font-nunito text-sm text-stone-600">Quantity</span>
        <div className="flex items-center gap-3 bg-stone-100 rounded-xl px-3 py-1.5">
          <button
            onClick={() => quantity > 1 && onQuantityChange(quantity - 1)}
            disabled={quantity <= 1}
            className="min-w-[36px] min-h-[36px] flex items-center justify-center text-stone-600 disabled:text-stone-300"
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="font-nunito font-bold text-lg min-w-[24px] text-center">{quantity}</span>
          <button
            onClick={() => onQuantityChange(quantity + 1)}
            className="min-w-[36px] min-h-[36px] flex items-center justify-center text-stone-600"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Price breakdown */}
      <div className="bg-[#F0FDF9] rounded-xl p-4">
        <div className="flex justify-between text-sm text-stone-600 mb-2">
          <span className="font-nunito">Bundle price {quantity > 1 ? `× ${quantity}` : ''}</span>
          <span className="font-nunito">₱{(priceInfo.effectivePrice * quantity).toFixed(0)}</span>
        </div>
        {(priceInfo.addOnsTotal + priceInfo.variationsExtra) > 0 && (
          <div className="flex justify-between text-sm text-stone-600 mb-2">
            <span className="font-nunito">Customizations</span>
            <span className="font-nunito">+₱{((priceInfo.addOnsTotal + priceInfo.variationsExtra) * quantity).toFixed(0)}</span>
          </div>
        )}
        {savingsInfo.savings > 0 && (
          <div className="flex justify-between text-sm text-[#3D8A80] font-semibold mb-2">
            <span className="font-nunito">You save</span>
            <span className="font-nunito">-₱{(savingsInfo.savings * quantity).toFixed(0)} ({savingsInfo.savingsPercent.toFixed(0)}% off)</span>
          </div>
        )}
        <div className="border-t border-[#D1FAE5] mt-2 pt-2 flex justify-between">
          <span className="font-nunito font-bold text-lg text-stone-900">Total</span>
          <span className="font-nunito font-bold text-lg text-stone-900">
            ₱{(priceInfo.total * quantity).toFixed(0)}
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/bundle-wizard/BundleReviewStep.tsx
git commit -m "feat(wizard): add BundleReviewStep with price breakdown and quantity"
```

---

### Task 9: BundleUpsellPair component

**Files:**
- Create: `src/components/bundle-wizard/BundleUpsellPair.tsx`

Adapted from `src/components/BestPairScreen.tsx` for full-page wizard context.

- [ ] **Step 1: Create the component**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Heart, Plus } from 'lucide-react';
import type { MenuItem } from '@/types';
import type { Bundle } from '@/types/bundle';
import type { PairOffer } from '@/types/upsell';

interface BundleUpsellPairProps {
  offers: PairOffer[];
  onAddItem: (itemId: string) => void;
  onSkip: () => void;
}

function getImage(target: MenuItem | Bundle): string | undefined {
  if ('image_url' in target) return target.image_url ?? undefined;
  return target.image;
}

function getPrice(target: MenuItem | Bundle): number {
  if ('base_price' in target) return target.base_price;
  return target.basePrice;
}

export default function BundleUpsellPair({ offers, onAddItem, onSkip }: BundleUpsellPairProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (offers.length === 0) { onSkip(); return; }
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, [offers.length, onSkip]);

  if (offers.length === 0) return null;

  return (
    <div className="px-4 pb-28">
      {/* Header */}
      <div
        className="text-center pt-2 pb-6 transition-all duration-300"
        style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(-12px)' }}
      >
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-pink-50 rounded-full mb-4">
          <Heart className="w-4 h-4 text-pink-500" />
          <span className="font-nunito text-sm font-semibold text-pink-600">Perfect Pairing</span>
        </div>
        <h2 className="font-playfair text-xl font-semibold text-stone-900">Complete your order</h2>
        <p className="font-nunito text-sm text-stone-500 mt-1">These go great with what you ordered</p>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-2 gap-3">
        {offers.slice(0, 4).map((offer, index) => {
          const target = offer.item || offer.bundle;
          if (!target) return null;
          const name = target.name;
          const image = getImage(target);
          const price = getPrice(target);
          const itemId = offer.rule.paired_item_id || offer.rule.paired_bundle_id;

          return (
            <div
              key={offer.rule.id}
              className="bg-white rounded-xl border border-stone-100 overflow-hidden shadow-sm transition-all duration-300"
              style={{
                opacity: mounted ? 1 : 0,
                transform: mounted ? 'translateY(0)' : 'translateY(20px)',
                transitionDelay: `${index * 80}ms`,
              }}
            >
              {image && (
                <div className="aspect-square bg-stone-100 overflow-hidden">
                  <img src={image} alt={name} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-3">
                <h3 className="font-nunito font-bold text-sm text-stone-900 truncate">{name}</h3>
                {offer.rule.message && (
                  <p className="font-nunito text-xs text-stone-400 mt-0.5 line-clamp-2">{offer.rule.message}</p>
                )}
                <div className="flex items-center justify-between mt-2">
                  <span className="font-nunito font-bold text-[#3D8A80]">₱{price.toFixed(0)}</span>
                  <button
                    onClick={() => itemId && onAddItem(itemId)}
                    disabled={!itemId}
                    className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] bg-[#7BBFB5] text-white font-nunito font-semibold text-xs rounded-lg hover:bg-[#3D8A80] transition-colors disabled:opacity-50"
                  >
                    <Plus className="w-3 h-3" />
                    Add
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/bundle-wizard/BundleUpsellPair.tsx
git commit -m "feat(wizard): add BundleUpsellPair full-page component"
```

---

### Task 10: BundleUpsellInterstitial component

**Files:**
- Create: `src/components/bundle-wizard/BundleUpsellInterstitial.tsx`

Adapted from `src/components/CheckoutInterstitial.tsx` for inline wizard step (not a modal).

- [ ] **Step 1: Create the component**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { ShoppingBag, Tag, Star } from 'lucide-react';
import type { InterstitialOffer } from '@/types/upsell';

interface BundleUpsellInterstitialProps {
  offer: InterstitialOffer;
  onAccept: () => void;
  onDecline: () => void;
}

export default function BundleUpsellInterstitial({ offer, onAccept, onDecline }: BundleUpsellInterstitialProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const item = offer.item;
  const image = item ? ((item as any).image_url || (item as any).image) : null;
  const price = item ? ((item as any).base_price ?? (item as any).basePrice ?? 0) : 0;

  return (
    <div
      className="px-4 pb-28 flex flex-col items-center justify-center min-h-[60vh] transition-all duration-300"
      style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(20px)' }}
    >
      <div className="w-full max-w-sm text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-50 rounded-full mb-6">
          <ShoppingBag className="w-4 h-4 text-amber-600" />
          <span className="font-nunito text-sm font-semibold text-amber-700">Before you go...</span>
        </div>

        {/* Item offer */}
        {(offer.type === 'item' || offer.type === 'discount') && item && (
          <>
            {image && (
              <div className="h-40 w-40 mx-auto rounded-2xl overflow-hidden mb-4 bg-stone-100">
                <img src={image} alt={item.name} className="w-full h-full object-cover" />
              </div>
            )}
            <h3 className="font-nunito font-bold text-lg text-stone-900">{item.name}</h3>
            {offer.type === 'discount' ? (
              <div className="flex items-center justify-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 rounded-full">
                  <Tag className="w-3 h-3 text-red-500" />
                  <span className="text-xs font-bold text-red-600">{offer.rule.offer_discount_percent}% OFF</span>
                </span>
                <span className="font-nunito text-xl font-bold text-[#3D8A80]">₱{(offer.discounted_price ?? price).toFixed(0)}</span>
                <span className="font-nunito text-sm text-stone-400 line-through">₱{Number(price).toFixed(0)}</span>
              </div>
            ) : (
              <p className="font-nunito text-xl font-bold text-[#3D8A80] mt-2">₱{Number(price).toFixed(0)}</p>
            )}
            {offer.rule.offer_message && (
              <p className="font-nunito text-sm text-stone-500 mt-2">{offer.rule.offer_message}</p>
            )}
          </>
        )}

        {/* Bundle offer */}
        {offer.type === 'bundle' && offer.bundle && (
          <>
            <h3 className="font-nunito font-bold text-lg text-stone-900">{offer.bundle.name}</h3>
            <p className="font-nunito text-xl font-bold text-[#3D8A80] mt-2">₱{offer.bundle.base_price.toFixed(0)}</p>
          </>
        )}

        {/* Loyalty nudge */}
        {offer.type === 'loyalty_nudge' && (
          <>
            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Star className="w-8 h-8 text-amber-500" />
            </div>
            <h3 className="font-nunito font-bold text-lg text-stone-900">Almost there!</h3>
            <p className="font-nunito text-sm text-stone-600 mt-2">{offer.loyalty_message}</p>
          </>
        )}

        {/* Action buttons */}
        <div className="mt-8 space-y-3">
          <button
            onClick={onAccept}
            className="w-full py-3.5 min-h-[48px] bg-[#3D8A80] text-white font-nunito font-bold text-base rounded-xl hover:bg-[#2E6E65] transition-colors shadow-lg shadow-[#3D8A80]/20"
          >
            {offer.type === 'loyalty_nudge' ? 'Browse Menu' : 'Add to Order'}
          </button>
          <button
            onClick={onDecline}
            className="w-full min-h-[44px] py-2.5 font-nunito text-sm font-medium text-stone-500 bg-stone-50 hover:bg-stone-100 rounded-xl transition-colors"
          >
            No thanks
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/bundle-wizard/BundleUpsellInterstitial.tsx
git commit -m "feat(wizard): add BundleUpsellInterstitial full-page component"
```

---

### Task 11: BundleWizardPage — main page component

**Files:**
- Create: `app/bundle/[id]/customize/page.tsx`

This is the core orchestrator — manages step state, slot states, browser history, upsell data fetching, and renders the right component per step.

- [ ] **Step 1: Create the page component**

```typescript
'use client';

import { use, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useCartContext } from '@/contexts/CartContext';
import { fetchBundleById } from '@/lib/bundle-fetcher';
import type { Bundle, SlotSelection, SlotState } from '@/types/bundle';
import type { MenuItem, Variation, AddOn } from '@/types';
import type { BundleSlot } from '@/types/bundle';
import type { PairOffer, InterstitialOffer, UpsellCartItem, UpsellCart } from '@/types/upsell';
import {
  validateBundleSelections,
  calculateBundlePrice,
  calculateBundleSavings,
} from '@/lib/bundle-engine';
import { getPairSuggestions, getInterstitialOffers } from '@/actions/upsell';

import WizardStepIndicator from '@/components/bundle-wizard/WizardStepIndicator';
import SlotStep from '@/components/bundle-wizard/SlotStep';
import BundleReviewStep from '@/components/bundle-wizard/BundleReviewStep';
import BundleUpsellPair from '@/components/bundle-wizard/BundleUpsellPair';
import BundleUpsellInterstitial from '@/components/bundle-wizard/BundleUpsellInterstitial';
import WizardBottomBar from '@/components/bundle-wizard/WizardBottomBar';

interface PageProps {
  params: Promise<{ id: string }>;
}

type WizardPhase = 'slots' | 'review' | 'upsell-pair' | 'upsell-interstitial' | 'done';

export default function BundleWizardPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const cart = useCartContext();

  // Bundle data
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);

  // Wizard state
  const [currentSlotIndex, setCurrentSlotIndex] = useState(0);
  const [phase, setPhase] = useState<WizardPhase>('slots');
  const [slotStates, setSlotStates] = useState<SlotState[]>([]);
  const [editingFromReview, setEditingFromReview] = useState(false);
  const [quantity, setQuantity] = useState(1);

  // Upsell state
  const [pairOffers, setPairOffers] = useState<PairOffer[] | null>(null);
  const [interstitialOffer, setInterstitialOffer] = useState<InterstitialOffer | null>(null);

  // Ref to guard pushState against popstate-triggered re-renders
  const isPopStateNav = useRef(false);
  // Ref to track slide direction for step transitions
  const slideDirection = useRef<'left' | 'right'>('left');
  // Ref for step content container to manage focus on transition
  const stepContentRef = useRef<HTMLDivElement>(null);

  // Sorted slots for consistent ordering
  const sortedSlots = useMemo(
    () => bundle ? [...bundle.slots].sort((a, b) => a.sort_order - b.sort_order) : [],
    [bundle]
  );

  // Build SlotSelection[] for engine functions
  const selections = useMemo<SlotSelection[]>(
    () => slotStates.map(s => ({
      slot_id: s.slot_id,
      selected_items: s.selected_items.map(i => ({
        menu_item_id: i.menu_item_id,
        selected_variation: i.selected_variation,
        selected_add_ons: i.selected_add_ons,
      })),
    })),
    [slotStates]
  );

  const priceInfo = useMemo(
    () => bundle ? calculateBundlePrice(bundle, selections, new Date()) : { effectivePrice: 0, addOnsTotal: 0, variationsExtra: 0, total: 0 },
    [bundle, selections]
  );

  const savingsInfo = useMemo(
    () => bundle ? calculateBundleSavings(bundle, selections, new Date()) : { individualTotal: 0, bundleTotal: 0, savings: 0, savingsPercent: 0 },
    [bundle, selections]
  );

  // Validation for the current slot
  const currentSlotValid = useMemo(() => {
    if (!bundle || phase !== 'slots') return false;
    const slot = sortedSlots[currentSlotIndex];
    if (!slot) return false;
    const state = slotStates.find(s => s.slot_id === slot.id);
    return (state?.selected_items.length ?? 0) >= slot.min_selections;
  }, [bundle, phase, sortedSlots, currentSlotIndex, slotStates]);

  // All slots completed
  const allSlotsValid = useMemo(
    () => bundle ? validateBundleSelections(bundle, selections).valid : false,
    [bundle, selections]
  );

  // Completed steps set for indicator
  const completedSteps = useMemo(() => {
    const set = new Set<number>();
    sortedSlots.forEach((slot, i) => {
      const state = slotStates.find(s => s.slot_id === slot.id);
      if (state && state.selected_items.length >= slot.min_selections) set.add(i);
    });
    if (allSlotsValid && phase !== 'slots') set.add(sortedSlots.length); // review step
    return set;
  }, [sortedSlots, slotStates, allSlotsValid, phase]);

  // Step labels for indicator
  const stepLabels = useMemo(
    () => [...sortedSlots.map(s => ({ label: s.label })), { label: 'Review' }],
    [sortedSlots]
  );

  // Fetch bundle
  useEffect(() => {
    async function load() {
      const data = await fetchBundleById(id);
      if (data) {
        setBundle(data);
        const sorted = [...data.slots].sort((a, b) => a.sort_order - b.sort_order);
        setSlotStates(sorted.map(slot => ({ slot_id: slot.id, selected_items: [] })));
      }
      setLoading(false);
    }
    void load();
  }, [id]);

  // Browser history management
  useEffect(() => {
    const handlePopState = () => {
      isPopStateNav.current = true;
      if (phase === 'slots' && currentSlotIndex > 0) {
        slideDirection.current = 'right';
        setCurrentSlotIndex(i => i - 1);
      } else if (phase === 'review') {
        setPhase('slots');
        setCurrentSlotIndex(sortedSlots.length - 1);
      } else if (phase === 'upsell-pair') {
        setPhase('review');
      } else if (phase === 'upsell-interstitial') {
        setPhase(pairOffers && pairOffers.length > 0 ? 'upsell-pair' : 'review');
      } else {
        router.replace('/');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [phase, currentSlotIndex, sortedSlots.length, pairOffers, router]);

  // Push history entry on step change — skip when triggered by popstate
  useEffect(() => {
    if (!bundle) return;
    if (isPopStateNav.current) {
      isPopStateNav.current = false;
      return;
    }
    window.history.pushState({ step: currentSlotIndex, phase }, '');
  }, [currentSlotIndex, phase, bundle]);

  // Focus management: auto-focus first interactive element on step transition
  useEffect(() => {
    if (!stepContentRef.current) return;
    const timer = setTimeout(() => {
      const focusable = stepContentRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      focusable?.focus({ preventScroll: true });
    }, 300); // after slide animation completes
    return () => clearTimeout(timer);
  }, [currentSlotIndex, phase]);

  // --- Handlers ---

  const handleSelectItem = useCallback((slotId: string, menuItem: MenuItem) => {
    const slot = sortedSlots.find(s => s.id === slotId);
    if (!slot) return;

    setSlotStates(prev => prev.map(s => {
      if (s.slot_id !== slotId) return s;

      const alreadySelected = s.selected_items.find(i => i.menu_item_id === menuItem.id);
      if (alreadySelected) {
        return { ...s, selected_items: s.selected_items.filter(i => i.menu_item_id !== menuItem.id) };
      }

      if (slot.max_selections === 1) {
        return {
          ...s,
          selected_items: [{
            menu_item_id: menuItem.id,
            menu_item: menuItem,
            selected_variation: null,
            selected_add_ons: [],
          }],
        };
      }

      if (s.selected_items.length < slot.max_selections) {
        return {
          ...s,
          selected_items: [
            ...s.selected_items,
            { menu_item_id: menuItem.id, menu_item: menuItem, selected_variation: null, selected_add_ons: [] },
          ],
        };
      }
      return s;
    }));
  }, [sortedSlots]);

  const handleVariation = useCallback((slotId: string, menuItemId: string, variation: Variation | null) => {
    setSlotStates(prev => prev.map(s => {
      if (s.slot_id !== slotId) return s;
      return {
        ...s,
        selected_items: s.selected_items.map(i =>
          i.menu_item_id === menuItemId ? { ...i, selected_variation: variation } : i
        ),
      };
    }));
  }, []);

  const handleToggleAddOn = useCallback((slotId: string, menuItemId: string, addOn: AddOn) => {
    setSlotStates(prev => prev.map(s => {
      if (s.slot_id !== slotId) return s;
      return {
        ...s,
        selected_items: s.selected_items.map(i => {
          if (i.menu_item_id !== menuItemId) return i;
          const exists = i.selected_add_ons.find(a => a.id === addOn.id);
          return exists
            ? { ...i, selected_add_ons: i.selected_add_ons.filter(a => a.id !== addOn.id) }
            : { ...i, selected_add_ons: [...i.selected_add_ons, addOn] };
        }),
      };
    }));
  }, []);

  const handleNext = useCallback(() => {
    if (phase === 'slots') {
      slideDirection.current = 'left';
      if (editingFromReview) {
        setEditingFromReview(false);
        setPhase('review');
        return;
      }
      if (currentSlotIndex < sortedSlots.length - 1) {
        setCurrentSlotIndex(i => i + 1);
      } else {
        setPhase('review');
      }
    }
  }, [phase, editingFromReview, currentSlotIndex, sortedSlots.length]);

  const handleBack = useCallback(() => {
    slideDirection.current = 'right';
    if (phase === 'slots') {
      if (editingFromReview) {
        setEditingFromReview(false);
        setPhase('review');
        return;
      }
      if (currentSlotIndex > 0) {
        setCurrentSlotIndex(i => i - 1);
      } else {
        // Step 1 back — confirm discard
        const hasSelections = slotStates.some(s => s.selected_items.length > 0);
        if (!hasSelections || window.confirm('Discard your selections?')) {
          router.replace('/');
        }
      }
    } else if (phase === 'review') {
      setPhase('slots');
      setCurrentSlotIndex(sortedSlots.length - 1);
    } else if (phase === 'upsell-pair') {
      setPhase('review');
    } else if (phase === 'upsell-interstitial') {
      setPhase(pairOffers && pairOffers.length > 0 ? 'upsell-pair' : 'review');
    }
  }, [phase, editingFromReview, currentSlotIndex, slotStates, sortedSlots.length, pairOffers, router]);

  const handleEditSlot = useCallback((slotIndex: number) => {
    setEditingFromReview(true);
    setCurrentSlotIndex(slotIndex);
    setPhase('slots');
  }, []);

  const handleConfirmReview = useCallback(async () => {
    if (!bundle) return;

    // Build upsell cart items from selections
    const upsellCartItems: UpsellCartItem[] = selections.flatMap(sel =>
      sel.selected_items.map(item => ({
        menu_item_id: item.menu_item_id,
        category: bundle.category,
        quantity: quantity,
        unit_price: priceInfo.total,
      }))
    );

    // Fetch upsell data
    try {
      const [pairResult, interstitialResult] = await Promise.all([
        getPairSuggestions(upsellCartItems),
        getInterstitialOffers({
          items: upsellCartItems,
          total: priceInfo.total * quantity,
        }),
      ]);

      const pairs = pairResult.success ? (pairResult.data as PairOffer[] ?? []) : [];
      const interstitial = interstitialResult.success ? (interstitialResult.data as InterstitialOffer | null) : null;

      setPairOffers(pairs);
      setInterstitialOffer(interstitial);

      if (pairs.length > 0) {
        setPhase('upsell-pair');
      } else if (interstitial) {
        setPhase('upsell-interstitial');
      } else {
        addToCartAndFinish();
      }
    } catch {
      // Upsell fetch failed — skip and add to cart
      addToCartAndFinish();
    }
  }, [bundle, selections, quantity, priceInfo.total, addToCartAndFinish]);

  const addBundleToCart = useCallback(() => {
    if (!bundle) return;
    cart.addBundleToCart(bundle, selections, priceInfo.total);
    // cart.bundleItems.length is the pre-add length, which equals the index
    // of the newly pushed item in the [...prev, newItem] callback
    if (quantity > 1) {
      cart.updateBundleQuantity(cart.bundleItems.length, quantity);
    }
  }, [bundle, selections, priceInfo.total, quantity, cart]);

  const addToCartAndFinish = useCallback(() => {
    addBundleToCart();
    router.replace('/');
  }, [addBundleToCart, router]);

  const handlePairSkip = useCallback(() => {
    if (interstitialOffer) {
      setPhase('upsell-interstitial');
    } else {
      addToCartAndFinish();
    }
  }, [interstitialOffer, addToCartAndFinish]);

  const handlePairAdd = useCallback((itemId: string) => {
    // Add the bundle to cart first so it's not lost, then navigate
    // to the paired product page for customization
    addBundleToCart();
    router.replace(`/product/${itemId}?source=pair`);
  }, [addBundleToCart, router]);

  const handleInterstitialAccept = useCallback(() => {
    if (interstitialOffer?.type === 'loyalty_nudge') {
      // Loyalty nudge — just add bundle and go to menu
      addToCartAndFinish();
      return;
    }
    // Add the upsell offer item to regular cart, then add bundle and finish
    if (interstitialOffer?.item) {
      cart.addToCart(interstitialOffer.item as any, 1, undefined, []);
    }
    addToCartAndFinish();
  }, [interstitialOffer, addToCartAndFinish, cart]);

  const handleInterstitialDecline = useCallback(() => {
    addToCartAndFinish();
  }, [addToCartAndFinish]);

  // --- Render ---

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#3D8A80]" />
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex flex-col items-center justify-center p-4">
        <h2 className="font-playfair text-2xl font-bold text-stone-900 mb-4">Combo Not Found</h2>
        <button
          onClick={() => router.replace('/')}
          className="px-6 py-2 bg-[#3D8A80] text-white rounded-xl font-nunito font-semibold"
        >
          Back to Menu
        </button>
      </div>
    );
  }

  if (!bundle.available) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex flex-col items-center justify-center p-4">
        <h2 className="font-playfair text-2xl font-bold text-stone-900 mb-2">Currently Unavailable</h2>
        <p className="font-nunito text-stone-500 mb-4">This bundle is currently unavailable</p>
        <button
          onClick={() => router.replace('/')}
          className="px-6 py-2 bg-[#3D8A80] text-white rounded-xl font-nunito font-semibold"
        >
          Back to Menu
        </button>
      </div>
    );
  }

  const currentSlot = sortedSlots[currentSlotIndex];
  const currentSlotState = slotStates.find(s => s.slot_id === currentSlot?.id);
  const indicatorCurrentStep = phase === 'slots' ? currentSlotIndex : sortedSlots.length;

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      {/* Top header with back button */}
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-stone-100">
        <div className="flex items-center px-4 py-2">
          <button
            onClick={handleBack}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-stone-100 rounded-full transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </button>
          <h1 className="flex-1 text-center font-nunito font-bold text-sm text-stone-700 truncate pr-11">
            {bundle.name}
          </h1>
        </div>

        {/* Step indicator — only during slots and review */}
        {(phase === 'slots' || phase === 'review') && (
          <WizardStepIndicator
            steps={stepLabels}
            currentStep={indicatorCurrentStep}
            completedSteps={completedSteps}
          />
        )}
      </div>

      {/* Step content with slide transition */}
      <div
        ref={stepContentRef}
        className="pt-2 transition-transform duration-300 ease-out"
        key={`${phase}-${currentSlotIndex}`}
        style={{
          animation: `${slideDirection.current === 'left' ? 'slideInLeft' : 'slideInRight'} 250ms ease-out`,
        }}
      >
        {/* Slot steps */}
        {phase === 'slots' && currentSlot && currentSlotState && (
          <SlotStep
            slot={currentSlot}
            slotState={currentSlotState}
            onSelectItem={(mi) => handleSelectItem(currentSlot.id, mi)}
            onVariation={(menuItemId, v) => handleVariation(currentSlot.id, menuItemId, v)}
            onToggleAddOn={(menuItemId, a) => handleToggleAddOn(currentSlot.id, menuItemId, a)}
          />
        )}

        {/* Review step */}
        {phase === 'review' && (
          <BundleReviewStep
            bundle={bundle}
            slotStates={slotStates}
            quantity={quantity}
            onQuantityChange={setQuantity}
            onEditSlot={handleEditSlot}
            priceInfo={priceInfo}
            savingsInfo={savingsInfo}
          />
        )}

        {/* Upsell pair — only render when offers exist */}
        {phase === 'upsell-pair' && pairOffers && pairOffers.length > 0 && (
          <BundleUpsellPair
            offers={pairOffers}
            onAddItem={handlePairAdd}
            onSkip={handlePairSkip}
          />
        )}

        {/* Upsell interstitial */}
        {phase === 'upsell-interstitial' && interstitialOffer && (
          <BundleUpsellInterstitial
            offer={interstitialOffer}
            onAccept={handleInterstitialAccept}
            onDecline={handleInterstitialDecline}
          />
        )}
      </div>

      {/* Bottom bar — for slots and review phases */}
      {phase === 'slots' && (
        <WizardBottomBar
          onBack={handleBack}
          onNext={handleNext}
          nextLabel={editingFromReview ? 'Done' : 'Next'}
          nextDisabled={!currentSlotValid}
          totalPrice={priceInfo.total}
          showBack={true}
        />
      )}
      {phase === 'review' && (
        <WizardBottomBar
          onBack={handleBack}
          onNext={handleConfirmReview}
          nextLabel={`Confirm · ₱${(priceInfo.total * quantity).toFixed(0)}`}
          nextDisabled={!allSlotsValid}
          totalPrice={0}
          showBack={true}
        />
      )}
      {phase === 'upsell-pair' && (
        <WizardBottomBar
          onBack={handleBack}
          onNext={handlePairSkip}
          nextLabel="Skip"
          nextDisabled={false}
          totalPrice={0}
          showBack={true}
        />
      )}

      {/* Slide transition keyframes */}
      <style>{`
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(30px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(-30px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 2: Verify the app compiles**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add app/bundle/\[id\]/customize/page.tsx
git commit -m "feat(wizard): add BundleWizardPage orchestrator"
```

---

### Task 12: Update Menu to link to wizard route

**Files:**
- Modify: `src/components/Menu.tsx`

- [ ] **Step 1: Replace modal trigger with route navigation**

In `Menu.tsx`, the bundle cards currently call `setSelectedBundle(bundle)` (line 126) to open the `BundleCustomizer` modal. Change them to navigate to the wizard route instead.

Add `useRouter` import at the top:

```typescript
import { useRouter } from 'next/navigation';
```

Inside the `Menu` component, add:

```typescript
const router = useRouter();
```

Replace line 126 (`onClick={() => setSelectedBundle(bundle)}`) with:

```typescript
onClick={() => router.push(`/bundle/${bundle.id}/customize`)}
```

Remove the `selectedBundle` state (line 33), `handleBundleAddToCart` function (lines 94-98), and the `BundleCustomizer` modal rendering block (lines 198-205). Also remove the `BundleCustomizer` import (line 9) — but **keep the import statement in the file** since `BundleCustomizer` is still used by the upgrade upsell flow elsewhere in the codebase.

Actually — to be safe, only remove `selectedBundle` state and the modal rendering. Keep the import since other files may re-export or the upgrade flow references it. The key change is the `onClick` on bundle cards.

Replace lines 33, 94-98, and 198-205 as follows:

- Remove: `const [selectedBundle, setSelectedBundle] = React.useState<Bundle | null>(null);`
- Remove: the `handleBundleAddToCart` function
- Remove: the `{selectedBundle && <BundleCustomizer ... />}` block
- The `BundleCustomizer` import at line 9 can be removed since it's no longer used in this file.

- [ ] **Step 2: Verify the app compiles and the menu renders**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/Menu.tsx
git commit -m "feat(wizard): update Menu to navigate to wizard instead of opening modal"
```

---

### Task 13: Manual integration testing

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Test happy path**

1. Open the menu page
2. Tap a bundle/combo card → should navigate to `/bundle/[id]/customize`
3. Step 1 should show: step indicator (dot 1 active), slot label, 2-column grid of items
4. Select an item → customization panel appears (if item has variations/addons)
5. Tap "Next" → Step 2
6. Complete all slots → Review screen shows
7. Verify price breakdown, savings badge, quantity selector, edit buttons
8. Tap "Confirm" → upsell screens if available, otherwise back to menu
9. Check cart has the bundle with correct selections

- [ ] **Step 3: Test edit-from-review**

1. Complete all slots, reach review
2. Tap "Edit" on a slot card
3. Should jump to that step, button says "Done"
4. Make a change, tap "Done" → jumps back to review (not through remaining steps)

- [ ] **Step 4: Test navigation**

1. Browser back button should step backwards through wizard
2. Step 1 back should prompt "Discard selections?" if items selected
3. After adding to cart, browser back should NOT return to stale wizard

- [ ] **Step 5: Test edge cases**

1. Bundle not found → error screen with "Back to Menu"
2. Bundle unavailable → "Currently Unavailable" screen
3. Bundle with single slot → wizard should be 1 step + review

- [ ] **Step 6: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(wizard): address issues found during integration testing"
```
