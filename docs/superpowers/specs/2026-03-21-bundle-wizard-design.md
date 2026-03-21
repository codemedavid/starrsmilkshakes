# Bundle Customization Wizard — Design Spec

**Date:** 2026-03-21
**Status:** Approved

## Overview

Replace the current accordion-style `BundleCustomizer` modal with a **full-page, multi-step wizard** at `/bundle/[id]/customize`. Each bundle slot becomes its own step, followed by a review step, then optional upsell screens (pair + interstitial), then add-to-cart and return to menu.

## Decisions

| Question | Decision |
|----------|----------|
| Slot screen scope | Each slot = one screen (pick item + customize add-ons/variations together) |
| Review edit behavior | Navigate back to that specific wizard step, then skip directly back to Review |
| Wizard container | Full-page experience at `/bundle/[id]/customize` |
| Progress indicator | Numbered dots connected by lines, with slot labels |
| Upsell phases | Pair + interstitial after review (skip upgrade — user already chose a bundle) |
| Item display | 2-column card grid with food photos |
| Review layout | Stacked summary cards with thumbnail, slot label, customization details, Edit button |
| Intro screen | None — jump straight to Step 1 |
| Architecture | Single route with step state (Approach A) — `currentStep` state, no URL routing per step |
| Upsell data | Wizard fetches upsell data directly via server actions — does NOT use `UpsellContext` |

## Flow

```
Menu → tap bundle → /bundle/[id]/customize
  → Step 1: Slot 1 (e.g. Choose & customize your shake)
  → Step 2: Slot 2 (e.g. Choose & customize your snack)
  → Step N: Slot N
  → Review: Summary of all selections with Edit per item + quantity selector
  → Upsell Pair (if available, else skip)
  → Upsell Interstitial (if available, else skip)
  → Add to cart → navigate back to menu (/)
```

## Step Screen Layout (per slot)

- **Top:** Numbered dot progress indicator with slot labels
- **Header:** Slot label (e.g. "Choose your shake"), selection guidance (e.g. "Pick 1")
- **Body:** 2-column card grid of available items. Each card shows image, name, price (or "Included"). Tapping selects it (highlighted border + checkmark). For `max_selections=1`, selecting a new item deselects the previous.
- **Customization panel:** When an item is selected, a section expands below the grid showing:
  - **Variations** — radio pills (e.g. Small / Medium / Large), mutually exclusive
  - **Add-ons** — toggle chips with prices, multiple allowed
  - If `max_selections > 1` and multiple items are selected, each has its own expandable customization section
- **Bottom sticky bar:** "Next" button (disabled until `min_selections` met), running total price
- **Back arrow:** Top-left, navigates to previous step. From Step 1, prompts "Discard selections?" if any exist, then navigates to menu.

## Review Screen Layout

- **Top:** Progress indicator showing all steps complete, review step active
- **Header:** Bundle name, "Review your selections"
- **Body:** Stacked summary cards per slot:
  - Slot label (uppercase, teal)
  - Item thumbnail (48x48)
  - Item name (bold)
  - Selected variation + selected add-ons (subtitle text)
  - "Edit" button — navigates back to that step
- **Quantity selector:** +/- controls below the summary cards (default 1)
- **Price breakdown section:**
  - Bundle base price (× quantity)
  - Add-ons total
  - Savings badge (amount + percentage)
  - Grand total (bold, large)
- **Bottom sticky bar:** "Confirm · ₱{total}" button

## Upsell Screens

The wizard does **NOT** use `UpsellContext`. Instead, it calls `getPairSuggestions()` and `getInterstitialOffers()` server actions directly and manages upsell data in its own state. This avoids conflicts with `UpsellContext`'s promise-based modal pattern (which renders via `UpsellOverlay` at the layout level).

After confirming on the review screen:

1. **Pair screen** — if pair suggestions exist for the bundle items, show them. Adapted from existing `BestPairScreen` to full-page layout. "Skip" and "Add" buttons.
2. **Interstitial screen** — if an interstitial offer exists, show it. Adapted from existing `CheckoutInterstitial` to full-page layout. "No thanks" and "Add" buttons.
3. If no upsells available, skip directly to add-to-cart.

After upsells (or skipping): add bundle to cart via `CartContext.addBundleToCart`, then `router.replace('/')` to navigate to menu (using `replace` instead of `push` to collapse wizard history entries and prevent back-navigating into stale wizard state).

## Navigation Rules

| From | Back | Forward |
|------|------|---------|
| Step 1 | Prompt "Discard selections?" → menu | Step 2 (enabled when `min_selections` met) |
| Step N | Step N-1 (selections preserved) | Step N+1 (enabled when `min_selections` met) |
| Review | Last slot step | Upsell pair (or interstitial, or add-to-cart) |
| Review Edit | Jump to specific step | After editing, "Next" skips directly back to Review (not through remaining steps) |
| Upsell Pair | Review | Upsell interstitial (or add-to-cart) |
| Upsell Interstitial | Upsell pair (or review) | Add to cart → menu |

### Edit-from-Review Behavior

When the user taps "Edit" on a review card, the wizard sets `editingFromReview = true` and `returnToStep = reviewStepIndex`, then navigates to that slot step. On that step, the "Next" button label changes to "Done" and pressing it skips directly back to the Review step — it does not walk through the remaining slot steps, since those are already completed.

### Browser Back Button

The wizard uses `window.history.pushState` to create a history entry per step. Pressing the browser back button moves to the previous wizard step (same as the in-page Back arrow). On Step 1, browser back navigates to the menu. This prevents accidental loss of all wizard progress.

## State Architecture

Single page component at `app/bundle/[id]/customize/page.tsx`:

- `currentStep: number` — 0-indexed slot steps, then review index, then upsell indices
- `slotStates: SlotState[]` — uses the shared `SlotState` interface extracted to `src/types/bundle.ts`
- `editingFromReview: boolean` — tracks if user navigated back from review via Edit
- `returnToStep: number | null` — which step to return to after editing
- `quantity: number` — bundle quantity (default 1), controlled on review screen
- `pairSuggestions: PairSuggestion[] | null` — fetched via server action on review confirm
- `interstitialOffer: InterstitialOffer | null` — fetched via server action on review confirm
- All existing business logic reused unchanged:
  - `validateBundleSelections()` from `bundle-engine.ts`
  - `calculateBundlePrice()` from `bundle-engine.ts`
  - `calculateBundleSavings()` from `bundle-engine.ts`
- `CartContext.addBundleToCart()` for final cart addition (always adds with quantity 1, then call `updateBundleQuantity()` if quantity > 1)

## Loading & Error States

- **Loading:** While fetching bundle data, show a centered spinner with the Starr's teal color. Reuse the same loading pattern as `app/bundle/[id]/page.tsx`.
- **Bundle not found:** If the bundle ID is invalid or the bundle doesn't exist, show an error message with a "Back to Menu" button.
- **Bundle unavailable:** If `bundle.available === false`, show "This bundle is currently unavailable" with a "Back to Menu" button.
- **Upsell fetch error:** If fetching pair/interstitial data fails, silently skip upsells and proceed to add-to-cart. Non-blocking — upsells are optional.

## Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `BundleWizardPage` | `app/bundle/[id]/customize/page.tsx` | Page component, fetches bundle, manages step + slot state |
| `WizardStepIndicator` | `src/components/bundle-wizard/WizardStepIndicator.tsx` | Numbered dot progress bar with slot labels |
| `SlotStep` | `src/components/bundle-wizard/SlotStep.tsx` | Renders a single slot: item grid + customization panel |
| `ItemCard` | `src/components/bundle-wizard/ItemCard.tsx` | 2-col grid card for a menu item (image, name, price, selected state) |
| `ItemCustomizer` | `src/components/bundle-wizard/ItemCustomizer.tsx` | Variations (radio pills) + add-ons (toggle chips) for a selected item |
| `BundleReviewStep` | `src/components/bundle-wizard/BundleReviewStep.tsx` | Review screen with summary cards + price breakdown + quantity |
| `ReviewItemCard` | `src/components/bundle-wizard/ReviewItemCard.tsx` | Single slot summary card with Edit button |
| `BundleUpsellPair` | `src/components/bundle-wizard/BundleUpsellPair.tsx` | Pair upsell screen (renders data from server action, not UpsellContext) |
| `BundleUpsellInterstitial` | `src/components/bundle-wizard/BundleUpsellInterstitial.tsx` | Interstitial screen (renders data from server action, not UpsellContext) |
| `WizardBottomBar` | `src/components/bundle-wizard/WizardBottomBar.tsx` | Sticky bottom bar with Back/Next/Confirm + price |

## Prerequisites (extract shared utilities)

Before building the wizard, extract these currently-inlined pieces:

1. **`SlotState` interface** — currently defined as a local interface inside `BundleCustomizer.tsx` (line 18) and duplicated in `app/bundle/[id]/page.tsx` (line 41). Extract to `src/types/bundle.ts` as a shared export. This interface carries `menu_item: MenuItem` on each selected item (richer than `SlotSelection` which lacks it). The wizard uses `SlotState` internally and converts to `SlotSelection[]` before calling engine functions.

2. **Bundle fetch + mapping utility** — the Supabase query with nested joins and the `mapSlotMenuItem()` helper are inlined in `app/bundle/[id]/page.tsx`. Extract to `src/lib/bundle-fetcher.ts` so both the existing bundle page and the new wizard page can share it.

## What Gets Reused (zero changes)

- `src/lib/bundle-engine.ts` — all pricing, validation, savings logic
- `src/contexts/CartContext.tsx` — `addBundleToCart()`
- `src/types/bundle.ts` — `SlotSelection`, `BundleCartItem`, `Bundle`, `BundleSlot` types (plus new `SlotState` export)
- `src/types/index.ts` — `MenuItem`, `Variation`, `AddOn` types
- `src/actions/upsell.ts` — `getPairSuggestions()`, `getInterstitialOffers()` server actions

## What Changes

- **Extract shared utilities** (prerequisite):
  - `SlotState` interface → `src/types/bundle.ts`
  - Bundle fetch + mapping → `src/lib/bundle-fetcher.ts`
  - Update `app/bundle/[id]/page.tsx` and `BundleCustomizer.tsx` to import from shared locations
- **New route:** `app/bundle/[id]/customize/page.tsx` — the wizard page
- **New components:** `src/components/bundle-wizard/` directory with all wizard components
- **Menu component:** Updated to link to `/bundle/{id}/customize` instead of opening `BundleCustomizer` modal
- **`BundleCustomizer.tsx`:** Kept for backward compatibility (upgrade upsell flow still uses it as a modal) but no longer the primary entry point from menu

## Visual Design

- Uses existing Starr's brand tokens: `#3D8A80` (teal), `#7BBFB5` (light teal), stone palette
- Font families: Playfair Display for headings, Nunito for body/UI
- Card border radius: `rounded-xl` (12px)
- Touch targets: minimum 44px height on all interactive elements
- Step transitions: slide left/right animation (CSS `transform` + `transition`) when advancing/going back
- Consistent with existing `BundleCustomizer` styling patterns

## Accessibility

- Focus management: auto-focus the first interactive element when transitioning between steps
- Progress indicator: `aria-label="Step {n} of {total}: {slot label}"` on each dot
- Item card grid: keyboard navigable with arrow keys, Enter/Space to select
- Bottom bar buttons: clear `aria-label` including price context
