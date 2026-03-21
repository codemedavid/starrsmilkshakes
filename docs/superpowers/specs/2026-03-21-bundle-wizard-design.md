# Bundle Customization Wizard — Design Spec

**Date:** 2026-03-21
**Status:** Approved

## Overview

Replace the current accordion-style `BundleCustomizer` modal with a **full-page, multi-step wizard** at `/bundle/[id]/customize`. Each bundle slot becomes its own step, followed by a review step, then optional upsell screens (pair + interstitial), then add-to-cart and return to menu.

## Decisions

| Question | Decision |
|----------|----------|
| Slot screen scope | Each slot = one screen (pick item + customize add-ons/variations together) |
| Review edit behavior | Navigate back to that specific wizard step |
| Wizard container | Full-page experience at `/bundle/[id]/customize` |
| Progress indicator | Numbered dots connected by lines, with slot labels |
| Upsell phases | Pair + interstitial after review (skip upgrade — user already chose a bundle) |
| Item display | 2-column card grid with food photos |
| Review layout | Stacked summary cards with thumbnail, slot label, customization details, Edit button |
| Intro screen | None — jump straight to Step 1 |
| Architecture | Single route with step state (Approach A) — `currentStep` state, no URL routing per step |

## Flow

```
Menu → tap bundle → /bundle/[id]/customize
  → Step 1: Slot 1 (e.g. Choose & customize your shake)
  → Step 2: Slot 2 (e.g. Choose & customize your snack)
  → Step N: Slot N
  → Review: Summary of all selections with Edit per item
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
- **Price breakdown section:**
  - Bundle base price
  - Add-ons total
  - Savings badge (amount + percentage)
  - Grand total (bold, large)
- **Bottom sticky bar:** "Confirm · ₱{total}" button

## Upsell Screens

After confirming on the review screen:

1. **Pair screen** — if pair suggestions exist for the bundle items, show them. Adapted from existing `BestPairScreen` to full-page layout. "Skip" and "Add" buttons.
2. **Interstitial screen** — if an interstitial offer exists, show it. Adapted from existing `CheckoutInterstitial` to full-page layout. "No thanks" and "Add" buttons.
3. If no upsells available, skip directly to add-to-cart.

After upsells (or skipping): add bundle to cart via `CartContext.addBundleToCart`, navigate to `/` (menu).

## Navigation Rules

| From | Back | Forward |
|------|------|---------|
| Step 1 | Prompt "Discard selections?" → menu | Step 2 (enabled when `min_selections` met) |
| Step N | Step N-1 (selections preserved) | Step N+1 (enabled when `min_selections` met) |
| Review | Last slot step | Upsell pair (or interstitial, or add-to-cart) |
| Review Edit | Jump to specific step; "Next" walks through remaining steps back to review | — |
| Upsell Pair | Review | Upsell interstitial (or add-to-cart) |
| Upsell Interstitial | Upsell pair (or review) | Add to cart → menu |

## State Architecture

Single page component at `app/bundle/[id]/customize/page.tsx`:

- `currentStep: number` — 0-indexed slot steps, then review index, then upsell indices
- `slotStates: SlotState[]` — reuses existing `SlotState` interface from `BundleCustomizer`
- `editingFromReview: boolean` — tracks if user navigated back from review via Edit
- All existing business logic reused unchanged:
  - `validateBundleSelections()` from `bundle-engine.ts`
  - `calculateBundlePrice()` from `bundle-engine.ts`
  - `calculateBundleSavings()` from `bundle-engine.ts`
- `CartContext.addBundleToCart()` for final cart addition
- `UpsellContext` for pair/interstitial data fetching

## Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `BundleWizardPage` | `app/bundle/[id]/customize/page.tsx` | Page component, fetches bundle, manages step + slot state |
| `WizardStepIndicator` | `src/components/bundle-wizard/WizardStepIndicator.tsx` | Numbered dot progress bar with slot labels |
| `SlotStep` | `src/components/bundle-wizard/SlotStep.tsx` | Renders a single slot: item grid + customization panel |
| `ItemCard` | `src/components/bundle-wizard/ItemCard.tsx` | 2-col grid card for a menu item (image, name, price, selected state) |
| `ItemCustomizer` | `src/components/bundle-wizard/ItemCustomizer.tsx` | Variations (radio pills) + add-ons (toggle chips) for a selected item |
| `BundleReviewStep` | `src/components/bundle-wizard/BundleReviewStep.tsx` | Review screen with summary cards + price breakdown |
| `ReviewItemCard` | `src/components/bundle-wizard/ReviewItemCard.tsx` | Single slot summary card with Edit button |
| `BundleUpsellPair` | `src/components/bundle-wizard/BundleUpsellPair.tsx` | Pair upsell screen (adapted from BestPairScreen) |
| `BundleUpsellInterstitial` | `src/components/bundle-wizard/BundleUpsellInterstitial.tsx` | Interstitial screen (adapted from CheckoutInterstitial) |
| `WizardBottomBar` | `src/components/bundle-wizard/WizardBottomBar.tsx` | Sticky bottom bar with Back/Next/Confirm + price |

## What Gets Reused (zero changes)

- `src/lib/bundle-engine.ts` — all pricing, validation, savings logic
- `src/contexts/CartContext.tsx` — `addBundleToCart()`
- `src/contexts/UpsellContext.tsx` — pair/interstitial data fetching
- `src/types/bundle.ts` — `SlotSelection`, `BundleCartItem`, `Bundle`, `BundleSlot` types
- `src/types/index.ts` — `MenuItem`, `Variation`, `AddOn` types
- Server-side bundle fetch logic from `app/bundle/[id]/page.tsx`

## What Changes

- **New route:** `app/bundle/[id]/customize/page.tsx` — the wizard page
- **New components:** `src/components/bundle-wizard/` directory with all wizard components
- **Menu component:** Updated to link to `/bundle/{id}/customize` instead of opening `BundleCustomizer` modal
- **`BundleCustomizer.tsx`:** Kept for backward compatibility (upgrade upsell flow still uses it as a modal) but no longer the primary entry point from menu

## Visual Design

- Uses existing Starr's brand tokens: `#3D8A80` (teal), `#7BBFB5` (light teal), stone palette
- Font families: Playfair Display for headings, Nunito for body/UI
- Card border radius: `rounded-xl` (12px)
- Touch targets: minimum 44px height on all interactive elements
- Consistent with existing `BundleCustomizer` styling patterns
