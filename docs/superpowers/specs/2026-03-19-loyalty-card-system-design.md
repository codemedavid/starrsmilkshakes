# Loyalty Card System — Design Spec

**Date:** 2026-03-19
**Status:** Draft
**Module:** Standalone loyalty module (references customer system via FK)

---

## Overview

A retention-focused loyalty card system for Starr's Famous Shakes. Customers register through Facebook Messenger, provide their email, and earn stamps and points with every qualifying order. They choose a reward goal from an admin-defined catalog and work toward it. When achieved, they claim it at any branch within a configurable time window. Admins manage the full program — rewards, boosters, qualifying rules — from a dedicated loyalty page in the admin dashboard.

### Core Principles

- **No customer login** — identity is Messenger PSID + email
- **Hybrid system** — stamps and points, each independently toggleable
- **Modular** — standalone tables and code; does not modify the customer system
- **Testable** — pure business logic separated from I/O; every unit testable in isolation

---

## Data Architecture

### loyalty_config (singleton)

Global settings for the loyalty program. Always exactly 1 row.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| stamps_enabled | boolean | Toggle stamp system on/off |
| points_enabled | boolean | Toggle point system on/off |
| points_per_peso | numeric | Multiplier for points calculation. Formula: `floor(qualifying_total * points_per_peso)`. E.g., 0.1 means 1 point per ₱10 spent (₱150 order → 15 points). |
| stamps_per_order | integer | Stamps earned per qualifying order |
| filter_mode | enum: 'allowlist' \| 'blocklist' | How qualifying purchases are determined |
| filtered_category_ids | uuid[] | Categories included or excluded |
| filtered_item_ids | uuid[] | Specific items included or excluded |
| claim_window_days | integer | Days customers have to claim earned rewards |
| updated_at | timestamptz | |

### loyalty_rewards (admin-defined catalog)

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| name | text | e.g., "Free Premium Shake" |
| description | text | Optional details |
| image_url | text | Optional reward image |
| stamps_required | integer? | Null if stamps not used for this reward |
| points_required | integer? | Null if points not used for this reward |
| is_active | boolean | Show/hide from customers. When deactivated, customers with this as their goal keep their progress but are prompted to pick a new goal on next card view. |
| sort_order | integer | Display order in catalog |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### loyalty_cards (1 per customer)

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| customer_id | uuid FK (unique) | → customers.id |
| card_code | text (unique) | Human-readable code, format: "STARR-" + 4 uppercase alphanumeric chars (A-Z, 0-9, excluding ambiguous chars I/O/0/1). ~800K combinations. Generated with collision retry (max 5 attempts, then extend to 5 chars). |
| current_stamps | integer | Running stamp count |
| current_points | integer | Running point balance |
| goal_reward_id | uuid FK? | → loyalty_rewards.id (chosen goal) |
| lifetime_stamps | integer | Total stamps ever earned |
| lifetime_points | integer | Total points ever earned |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### loyalty_transactions (audit trail)

Every stamp/point change is recorded as an immutable transaction.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| card_id | uuid FK | → loyalty_cards.id |
| order_id | uuid FK? | → orders.id (null for manual adjustments) |
| type | enum: 'earn' \| 'redeem' \| 'expire' \| 'adjust' | |
| stamps_delta | integer | +1, -10, etc. |
| points_delta | integer | +50, -500, etc. |
| booster_id | uuid FK? | → loyalty_boosters.id (if booster applied) |
| description | text | e.g., "Order #142 — 2x Booster applied" |
| created_at | timestamptz | |

### loyalty_redemptions (reward claim lifecycle)

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| card_id | uuid FK | → loyalty_cards.id |
| reward_id | uuid FK | → loyalty_rewards.id |
| status | enum: 'earned' \| 'claimed' \| 'expired' | |
| earned_at | timestamptz | When goal was hit |
| expires_at | timestamptz | earned_at + claim_window_days |
| claimed_at | timestamptz? | When admin marked redeemed |
| claimed_branch_id | uuid FK? | → branches.id |
| claimed_by | text? | Admin email who processed it |

### loyalty_boosters (promotional multipliers)

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| name | text | e.g., "Weekend Double Starrs" |
| multiplier | numeric | 2.0, 3.0, etc. |
| applies_to | enum: 'stamps' \| 'points' \| 'both' | |
| filter_mode | enum: 'all' \| 'categories' \| 'items' | |
| filter_ids | uuid[] | Category or item IDs (if filtered) |
| starts_at | timestamptz | Promo start |
| ends_at | timestamptz | Promo end |
| is_active | boolean | Manual enable/disable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### loyalty_sessions (hash-to-PSID mapping for secure links)

| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | |
| token | text (unique) | HMAC-signed random UUID |
| psid | text | Facebook Messenger PSID |
| purpose | enum: 'registration' \| 'card_view' | What this session is for |
| expires_at | timestamptz | Token expiry (30min from creation) |
| used_at | timestamptz? | When the registration was completed (registration tokens only) |
| created_at | timestamptz | |

### Relationships

```
customers ──1:1──▶ loyalty_cards ──1:N──▶ loyalty_transactions
loyalty_cards ──N:1──▶ loyalty_rewards (chosen goal)
loyalty_cards ──1:N──▶ loyalty_redemptions ──N:1──▶ loyalty_rewards
loyalty_transactions ──N:1──▶ orders (nullable)
loyalty_transactions ──N:1──▶ loyalty_boosters (nullable)
loyalty_redemptions ──N:1──▶ branches (claimed at)

loyalty_config (singleton, no FKs)
loyalty_boosters (standalone, references category/item IDs)
```

---

## System Flows

### Flow 1: Customer Registration

1. Customer taps "Loyalty Card" in Messenger persistent menu (or bot prompts after first order)
2. Bot checks: does this PSID already have a loyalty_card?
   - **YES** → Send hashed link to their existing card dashboard
   - **NO** → Generate secure hashed registration link (HMAC-SHA256, 30min expiry)
3. Customer opens link → `/loyalty/register/[hash]` website page
4. Page shows: email input (required), phone input (optional), submit button
5. On submit → Server Action:
   a. Validate hash (not expired, valid PSID)
   b. Find or create customer record (match by PSID, email, or phone)
   c. Create loyalty_card with generated card_code (e.g., "STARR-A7X2")
   d. If only 1 active reward → auto-set as goal
   e. If multiple rewards → redirect to goal picker page
6. Send Messenger confirmation: "Your Starr Card is ready! Code: STARR-A7X2"

### Flow 2: Earning Stamps/Points (Messenger Order)

1. Customer places order through Messenger (existing flow)
2. Admin marks order as "completed"
3. Order completion trigger fires → `creditLoyalty(order)`
   a. Find loyalty_card by order's customer_id or messenger_psid
   b. Filter order items against loyalty_config allowlist/blocklist
   c. Check active boosters (date range, matching items/categories)
   d. Calculate: stamps = base × booster, points = qualifying_total × rate × booster
   e. Insert loyalty_transaction, update loyalty_card balances
4. Check if goal reached → if yes, create loyalty_redemption (status: 'earned')
5. Send Messenger notification (within 24hr window):
   - Stamp earned: "⭐ +2 starrs (2x Weekend Boost)! You now have 8/10 toward Free Premium Shake"
   - Goal hit: "🎉 You earned a Free Premium Shake! Claim within 7 days at any branch."

### Flow 3: Earning Stamps/Points (Walk-in Order)

1. Customer walks in and orders at the counter
2. Admin creates order in system (existing flow)
3. To credit loyalty, admin uses one of two options:
   - **Search** — types name/email/phone in loyalty lookup
   - **Code** — customer says their card code (e.g., "STARR-A7X2")
4. System matches → shows customer name + current starr count for verification
5. Admin confirms link → same `creditLoyalty()` logic runs
6. If customer has messenger_psid AND last interaction was <24hrs → send notification

### Flow 4: Reward Redemption

1. Customer visits branch, says "I have a reward to claim"
2. Admin searches by name/code → sees pending redemption with 'earned' status
3. Admin clicks "Mark Redeemed" → confirms branch
4. System updates redemption: status → 'claimed', records branch + admin + timestamp
5. Stamps/points deducted from card (excess carries over)
   - e.g., had 12 stamps, goal was 10 → card now shows 2 stamps
6. Customer picks new goal (or keeps same if catalog hasn't changed)
7. If within 24hr Messenger window → "Reward claimed! You have 2 starrs toward your next goal."

### Flow 5: Customer Checks Their Card

1. Customer taps "My Loyalty Card" in Messenger
2. Bot generates time-limited hashed URL (30min expiry)
3. Customer opens → `/loyalty/card/[hash]`
4. Server validates hash → loads loyalty_card + related data
5. Dashboard shows:
   - Progress toward goal (visual stamp grid + points bar)
   - Card code (for walk-in use)
   - Active boosters
   - Pending rewards to claim
   - Redemption history
   - Change goal button

---

## Service Layer Architecture

### `src/lib/loyalty-engine.ts` — Pure business logic (no I/O)

- `calculateEarnings(orderItems, config, boosters)` → `{ stamps, points }`
- `filterQualifyingItems(items, config)` → `qualifiedItems[]`
- `findActiveBoosters(boosters, orderItems, date)` → `matched[]`
- `checkGoalReached(card, reward)` → `boolean`
- `calculateCarryover(card, reward)` → `{ stamps, points }`

### `src/actions/loyalty.ts` — Server Actions (DB + side effects)

- `creditLoyalty(orderId)` → credits card, creates transaction, triggers notification
- `redeemReward(redemptionId, branchId)` → marks claimed, deducts balance, handles carryover
- `registerLoyaltyCard(hash, email, phone?)` → validates hash, creates card
- `setGoal(cardId, rewardId)` → updates chosen goal
- `lookupCard(query)` → search by code, name, email, phone
- `linkOrderToCard(orderId, cardId)` → credits existing order to loyalty card

### `src/actions/loyalty-admin.ts` — Admin config actions

- `updateLoyaltyConfig(config)` → update singleton
- `createReward / updateReward / deleteReward`
- `createBooster / updateBooster / deleteBooster`
- `getLoyaltyStats()` → dashboard metrics (active cards, stamps earned, pending claims, etc.)

### `src/lib/loyalty-notifications.ts` — Messenger notifications

- `notifyStampEarned(psid, card, transaction)`
- `notifyGoalAchieved(psid, card, reward)`
- `notifyRewardClaimed(psid, card, redemption)`

All check 24hr window before sending. Fail silently if outside window.

---

## UI Architecture

### Customer-Facing Pages (public, hash-authenticated)

- `/loyalty/register/[hash]` — Registration form (email required, phone optional)
- `/loyalty/card/[hash]` — Full dashboard (progress, points, boosters, history, goal management)
- `/loyalty/card/[hash]/goals` — Goal picker / reward catalog

All mobile-first, dark/light mode via `prefers-color-scheme`. Teal brand header consistent across modes. Light mode uses cream (#FAF8F5) background with white (#FFF) cards and warm borders (#E8E3DA).

### Admin Pages

- `/admin/loyalty` — New sidebar item, tabbed layout:
  - **Configuration** — Stamp/point toggles, rates, qualifying purchase filter (allowlist/blocklist), claim window
  - **Rewards** — CRUD for reward catalog, shows how many customers are pursuing each
  - **Boosters** — CRUD for promotional multipliers with date range + item/category filter
  - **Redemptions** — List of all redemptions, filterable by status (earned/claimed/expired)
  - **Lookup** — Walk-in workflow: search customer or enter card code, view card status, mark rewards redeemed, credit orders

### Customer Detail Widget

Existing customer detail panel gets a compact loyalty card widget showing: card code, progress bar, stamp/point count, current goal. Links to full admin loyalty lookup for that customer.

---

## Messenger Integration Points

Changes to existing code (additive, no modifications to ordering flow):

1. **Persistent menu** — Add "My Loyalty Card" button to `messenger-handler.ts`
2. **Post-first-order prompt** — After order completion, if customer has no loyalty card, send quick reply: "Want to earn starrs? Tap to get your loyalty card"
3. **Hash generation** — Uses the existing DB-backed pattern from `messenger-session.ts`: generate a random UUID token, HMAC-sign it, and store the mapping in a `loyalty_sessions` table (token → PSID, purpose, expires_at). Validation looks up the token in DB, checks expiry, and retrieves the PSID. This avoids encoding PSID in the URL.
4. **Notifications** — `loyalty-notifications.ts` called from `creditLoyalty()` when order has a messenger_psid and within 24hr window
5. **24hr window compliance** — Only send notifications for: stamp earned, goal achieved, goal reset (all triggered by customer-initiated orders)

---

## Behavioral Rules

### Concurrency

- **`creditLoyalty()`** — Uses atomic SQL: `UPDATE loyalty_cards SET current_stamps = current_stamps + $delta, current_points = current_points + $delta ... WHERE id = $cardId`. No read-then-write race.
- **`redeemReward()`** — Wraps the redemption update and card balance deduction in a single Supabase RPC or transaction. Uses `SELECT ... FOR UPDATE` on the card row to prevent concurrent redemption + earning from producing incorrect balances.
- **`registerLoyaltyCard()`** — Idempotent: checks for existing loyalty_card by customer_id first. If card exists, returns it. The unique constraint on `customer_id` is a safety net, not the primary guard.

### Edge Cases

- **Reward deactivated while customers are pursuing it** — Customers keep their stamps/points. On next card view, if their `goal_reward_id` points to an inactive reward, the UI shows "This reward is no longer available" and prompts them to pick a new goal. The card's stamps/points are NOT reset.
- **Booster stacking** — When multiple boosters match the same item, the **highest multiplier wins** (no stacking). `findActiveBoosters()` returns all matches but `calculateEarnings()` applies only the max multiplier per item.
- **Qualifying order definition** — An order earns stamps if **at least one item** passes the allowlist/blocklist filter. Points are calculated only from the qualifying items' subtotal.
- **Double-credit prevention** — `creditLoyalty()` checks `loyalty_transactions` for an existing `earn` transaction with the same `order_id`. If found, it's a no-op.
- **Reward deletion** — Rewards are soft-deleted (`is_active = false`), never hard-deleted. FK references in `loyalty_redemptions` and `loyalty_cards.goal_reward_id` remain valid. Admin UI shows "Disable" not "Delete".
- **Points rounding** — All points calculations use `Math.floor()`. Fractional points are truncated, never rounded up.

### Notifications — messaging_type

- Stamp earned / goal achieved notifications use `messaging_type: 'MESSAGE_TAG'` with tag `POST_PURCHASE_UPDATE` (valid for order-related updates within the allowed policy window).
- Goal reset after redemption uses `messaging_type: 'RESPONSE'` since the admin action is in response to the customer's in-person interaction.

### Cache Invalidation Strategy

All loyalty Server Actions call `revalidateTag()` after mutations:

| Action | Tags invalidated |
|--------|-----------------|
| `creditLoyalty()` | `loyalty-cards`, `loyalty-transactions` |
| `redeemReward()` | `loyalty-cards`, `loyalty-redemptions`, `loyalty-transactions` |
| `registerLoyaltyCard()` | `loyalty-cards`, `customers` |
| `setGoal()` | `loyalty-cards` |
| `updateLoyaltyConfig()` | `loyalty-config` |
| `createReward / updateReward` | `loyalty-rewards` |
| `createBooster / updateBooster` | `loyalty-boosters` |

Admin loyalty page SSR uses `unstable_cache()` with these tags for initial data.

---

## Security

- **Hash-based access** — All customer-facing pages use HMAC-SHA256 hashed URLs with 30min expiry. No persistent sessions, no shareable links.
- **Card code** — Short human-readable code for walk-in use. Not sufficient for accessing the dashboard (requires Messenger hash).
- **Admin auth** — All admin loyalty endpoints require admin session (existing pattern). Reward redemption requires admin verification.
- **Rate limiting** — All mutation Server Actions use existing `checkActionRateLimit()` (30/min/IP).
- **Audit trail** — Every stamp/point change is a transaction. Redemptions track who claimed, where, and when.

---

## Testing Strategy

### Unit Tests (pure logic, no DB)

- `loyalty-engine.ts` — `calculateEarnings()`, `filterQualifyingItems()`, `findActiveBoosters()`, `checkGoalReached()`, `calculateCarryover()`
- Edge cases: empty orders, disabled stamps/points, multiple boosters on same item, zero qualifying items, exact goal threshold, carry-over math

### Integration Tests (mock Supabase)

- `loyalty.ts` — `creditLoyalty()`, `redeemReward()`, `registerLoyaltyCard()`, `setGoal()`, `lookupCard()`, `linkOrderToCard()`
- `loyalty-admin.ts` — CRUD for config, rewards, boosters
- Verify: correct DB calls, rate limiting, auth checks, error handling

### API Tests

- Registration hash validation (expired, tampered, reused)
- Card dashboard hash validation
- Admin loyalty endpoints (auth required)

### Messenger Integration Tests

- `loyalty-notifications.ts` — correct message format, 24hr window check, graceful failure on invalid PSID
- Messenger handler additions — "Loyalty Card" menu routing, registration link generation

### System Tests

- Full flow: register → earn stamps (Messenger) → earn stamps (walk-in) → hit goal → claim reward → carry over → new goal
- Booster flow: create booster → order during booster period → verify multiplied stamps
- Config changes: disable stamps mid-program → points still work → re-enable stamps

### Acceptance Tests

- Customer can register through Messenger link and see their card
- Customer earns stamps when order is completed
- Admin can look up a customer and credit a walk-in order
- Admin can mark a reward as redeemed
- Expired rewards are handled correctly
- Boosters apply correctly during their date range

---

## File Structure

```
app/
  admin/loyalty/
    page.tsx                    # SSR entry point
    LoyaltyContent.tsx          # Client component (tabbed layout)
  loyalty/
    register/[hash]/
      page.tsx                  # Registration form
    card/[hash]/
      page.tsx                  # Customer dashboard
      goals/
        page.tsx                # Goal picker

src/
  types/
    loyalty.ts                  # TypeScript types: LoyaltyConfig, LoyaltyReward, LoyaltyCard, LoyaltyTransaction, LoyaltyRedemption, LoyaltyBooster, LoyaltySession, LoyaltyStats
  lib/
    loyalty-engine.ts           # Pure business logic
    loyalty-notifications.ts    # Messenger notification helpers
    loyalty-hash.ts             # Hash generation/validation (DB-backed token pattern)
  actions/
    loyalty.ts                  # Customer-facing Server Actions
    loyalty-admin.ts            # Admin Server Actions
  hooks/
    useLoyaltyConfig.ts         # Admin config hook
    useLoyaltyRewards.ts        # Admin rewards hook
    useLoyaltyBoosters.ts       # Admin boosters hook
    useLoyaltyLookup.ts         # Admin lookup hook
  components/
    admin/
      LoyaltyConfigTab.tsx
      LoyaltyRewardsTab.tsx
      LoyaltyBoostersTab.tsx
      LoyaltyRedemptionsTab.tsx
      LoyaltyLookupTab.tsx
    loyalty/
      StampGrid.tsx             # Visual stamp progress
      PointsBar.tsx             # Points display
      BoosterBanner.tsx         # Active booster alert
      RewardCard.tsx            # Reward in catalog
      ActivityList.tsx          # Transaction history
    CustomerLoyaltyWidget.tsx   # Compact widget for customer detail panel

supabase/migrations/
    2026031XXXXXX_add_loyalty.sql  # All loyalty tables

tests/
    loyalty-engine.test.ts
    loyalty-actions.test.ts
    loyalty-admin.test.ts
    loyalty-notifications.test.ts
    loyalty-hash.test.ts
    loyalty-api.test.ts
```
