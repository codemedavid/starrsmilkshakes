# Cart & Checkout Redesign — Design Spec

**Date:** 2026-03-19
**Status:** Approved
**Scope:** Cart page + Checkout page (menu/product customization out of scope)

## Problem

The current cart and checkout experience has three core issues:

1. **Visual design is dated/generic** — doesn't reflect the Starr's brand (sage teal + cream, refined casual warmth)
2. **Flow is confusing** — branch modal interrupts, 2-step checkout with side-by-side panels disorients on mobile, service type changes reshape the form unpredictably, cart lives at a URL param (`/?view=cart`) not a real route
3. **Doesn't feel like Starr's** — red/pink payment section clashes with the brand palette, generic UI patterns, no personality

## Brand Identity

- **Palette:** Sage teal `#8FB8A8`, deep green `#2A5A4A`, warm cream `#FFF8E7`, soft linen background `#F6F1EB`
- **Typography:** Clean, modern, slightly rounded — bold weights for headings, lighter for secondary text
- **Personality:** Refined casual — approachable but not cheap, warm but not loud
- **Reference:** Logo uses cream text on sage teal, bold italic "starr's" + light spaced "famous shakes"

## Target Device

Mobile-first. Most customers order from phones.

## Approach

**Guided Steps (Accordion)** — single checkout page with collapsible sections that open one at a time. Each completed section collapses to a summary. Progress dots at top show position.

### Upsell Flow (Existing — Preserved)

The current checkout has a pre-checkout upsell sequence: `upgrade → pair → checkout → interstitial → placing`. This renders `UpgradeScreen`, `BestPairScreen`, and `CheckoutInterstitial` before the checkout form appears. This flow is preserved as-is — it runs **before** the accordion opens. The upsell screens keep their current behavior and styling (they are separate full-screen overlays, not accordion steps). Once the upsell sequence completes (or is skipped), the accordion checkout appears.

### Messenger Session Entry (`msession`)

The current checkout page supports an `msession` query parameter that loads a cart from the Messenger chatbot session (`/api/messenger/session/{hash}`). This entry point is preserved. When `msession` is present, the checkout page shows a loading state while fetching the session cart, then proceeds into the upsell → accordion flow with the loaded items. The `msession` value is passed through to the order creation payload.

## Flow Architecture

### Cart Page (`/cart`)

Dedicated route (replaces `/?view=cart`).

**Layout:**
- Header: sage teal background, "Your Cart" title, item count
- Cart items: white cards on linen background, each showing:
  - Product emoji/image placeholder (64px, rounded)
  - Item name (bold), variation + add-ons (sage teal secondary text)
  - Price (bold, deep green) + quantity stepper (minus/count/plus in a pill shape, plus button filled sage teal)
- Bundle items: rendered alongside regular cart items with the same card style, showing bundle name, selected slots/items, and bundle price
- Sticky bottom bar: white card with rounded top, subtotal + "Proceed to Checkout" button (deep green)

**Empty state:** Redirect to menu with a toast message.

### Checkout Page (`/checkout`)

Single page, accordion pattern with 4 steps + sticky bottom bar.

**Header:**
- Sage teal background with back arrow + "Checkout" title
- Progress dots: 4 circles connected by lines, filled/active/locked states

**Step 1: Branch**
- Auto-selected from localStorage (last used branch)
- Shows as compact card: branch name + address
- Tap "Edit" to expand inline branch selector (not a modal)
- Collapses to: "📍 Starr's Main Branch"
- If no stored branch, this step opens by default

**Step 2: Service & Details**
- Service type pills: 3 equal cards (Dine In 🪑 / Pickup 🚶 / Delivery 🛵)
  - Selected state: deep green `#2A5A4A` background, cream text
  - Unselected: light green `#F0F7F4` background
- Contextual fields animate in/out based on service type:
  - **Dine In:** No extra fields
  - **Pickup:** Pickup time selector (preset pills: 5-10, 15-20, 25-30 min + custom)
  - **Delivery:** Address autocomplete (same Nominatim integration), landmark field, delivery fee display
- Customer fields: Full Name + Phone Number (pre-filled from localStorage for returning customers)
- Special instructions textarea (optional, order-level notes passed to API)
- "Continue" button (sage teal)
- Collapses to: "🪑 Dine In • David • 0912..."

**Step 3: Payment Method**
- 2x2 card grid of available payment methods
  - Selected: deep green background, cream text
  - Unselected: light green background
- Selected method expands inline to show:
  - QR code image (centered, white background card) with fallback if no image
  - Account number in monospace font (large, prominent, on white pill)
  - Account holder name
  - Amount to pay (large bold)
- Reference number input (optional, for customers who have already paid)
- Info tip: subtle green box explaining payment proof goes via Messenger
- "Continue" button
- Collapses to: "📱 GCash"

**Step 4: Review & Order**
- Full order item list (regular cart items + bundle items) with names, variations, add-ons, quantities, line totals
- Customer details summary in a green-tinted card (name, phone, service type, payment method)
- Delivery fee line item (if delivery)
- Total: large bold text with a top border separator
- CTA: "Send Order via Messenger 💬" — deep green button, full width
- Subtitle: "You'll be redirected to Messenger to confirm your order"

**Sticky Bottom Bar:**
- Deep green `#2A5A4A` background
- Left: item count + total price
- Right: "Step X of 4" indicator
- Persists across all steps

### Accordion Behavior

- Only one step open at a time
- Completed steps collapse to a single-line summary with green checkmark + "Edit" link
- Locked (future) steps show as grayed out with step number
- Active step has a 2px sage teal border + subtle shadow
- Opening a completed step for editing closes the currently active step
- Smooth CSS transitions for open/close (height + opacity)

### Messenger Handoff

Same redirect pattern as current (`https://m.me/{messengerUsername}?text={encodedOrder}`) but with:
- Brief success animation/state on the button before redirect (checkmark + "Redirecting...")
- Formatted order text includes all details from Step 4 review

## Component Architecture

Current `Checkout.tsx` (~1165 lines) gets decomposed into:

| Component | Responsibility |
|---|---|
| `Cart.tsx` | Rewritten — new visual design, renders both `cartItems` and `bundleItems` from CartContext |
| `CheckoutAccordion.tsx` | Step orchestration, manages active/completed states, receives `msession` prop |
| `BranchStep.tsx` | Branch selection (inline, localStorage auto-fill) |
| `ServiceDetailsStep.tsx` | Service pills, contextual fields, customer form, special instructions |
| `PaymentStep.tsx` | Payment grid, QR/account display, reference number input |
| `ReviewStep.tsx` | Order summary (regular + bundle items), Messenger CTA |
| `CheckoutStickyBar.tsx` | Bottom bar with total + step indicator |
| `StepHeader.tsx` | Reusable collapsed/active/locked step chrome |

Existing upsell components (`UpgradeScreen`, `BestPairScreen`, `CheckoutInterstitial`) remain as-is and render before the accordion in the checkout page.

## State Management

- **Cart state:** Existing `CartContext` (includes both `cartItems` and `bundleItems`) — no changes needed
- **Checkout form state:** Local `useState` within `CheckoutAccordion`, passed down to step components
- **Upsell state:** Managed in the checkout page wrapper, same as current (`UpsellStep` state machine)
- **Active step:** `useState<number>` in `CheckoutAccordion`
- **Completed steps:** `Record<number, boolean>` tracking which steps are done
- **Branch persistence:** `localStorage` key for last-used branch ID
- **Customer persistence:** `localStorage` for name + phone (returning customer convenience)

## Integrations Preserved

All existing integrations remain, just consumed by new components:

- **Lalamove delivery quotes** — triggered in `ServiceDetailsStep` when delivery address has coordinates
- **Nominatim address autocomplete** — same `useAddressAutocomplete` hook in `ServiceDetailsStep`
- **Meta Pixel tracking** — `trackInitiateCheckout()` on checkout page load, `trackPurchase()` on order placement
- **Meta Conversions API** — `sendPurchaseEvent()` server-side event alongside client-side pixel on order placement
- **Messenger redirect** — same `m.me` URL construction in `ReviewStep`
- **Messenger session loading** — `msession` query param loads cart from `/api/messenger/session/{hash}`, passed through to order creation
- **Payment methods API** — same `usePaymentMethods` hook in `PaymentStep`
- **Order creation** — same `useOrders` hook's `createOrder` function in `ReviewStep`
- **Upsell flow** — existing `UpgradeScreen`, `BestPairScreen`, `CheckoutInterstitial` render before accordion

## Edge Cases

| Scenario | Behavior |
|---|---|
| Empty cart → checkout | Redirect to menu, show toast "Your cart is empty" |
| No stored branch | Step 1 opens expanded with branch list |
| Returning customer | Pre-fill name + phone from localStorage |
| No QR image for payment | Show account number prominently without QR placeholder |
| Delivery fee calculating | Show spinner + "Calculating..." in the delivery fee line |
| Delivery fee unavailable | Show warning message, allow proceeding with "Fee pending" note |
| Address validation issues | Inline warning in ServiceDetailsStep, same Nominatim validation |
| Service type change mid-flow | Reset contextual fields, keep name/phone |

## Design Tokens

| Token | Value | Usage |
|---|---|---|
| `--starrs-sage` | `#8FB8A8` | Primary brand, headers, active borders, completed checkmarks |
| `--starrs-deep` | `#2A5A4A` | CTAs, selected states, text emphasis, sticky bar |
| `--starrs-cream` | `#FFF8E7` | Text on dark backgrounds, payment detail card |
| `--starrs-linen` | `#F6F1EB` | Page background |
| `--starrs-mint` | `#F0F7F4` | Unselected pills, info cards, summary backgrounds |
| `--starrs-muted` | `#6B8F80` | Secondary text, labels |
| Card radius | `14px` | All card containers |
| Button radius | `12-14px` | All buttons |
| Step transition | `300ms ease` | Accordion open/close |

## Out of Scope

- Menu browsing / product customization redesign
- New upsell features (existing upsell flow is preserved, not redesigned)
- Promo codes, order tracking
- Desktop-specific layouts (mobile-first only, desktop gets the same layout centered)
- Changes to the order creation API
- Changes to CartContext internals
- Redesigning upsell screen visuals (`UpgradeScreen`, `BestPairScreen`, `CheckoutInterstitial`)
