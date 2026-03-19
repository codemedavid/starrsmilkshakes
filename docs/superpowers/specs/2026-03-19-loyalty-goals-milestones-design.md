# Loyalty Goals & Milestones Redesign

## Overview

Restructure the loyalty system to clearly separate **goals** (reward items customers choose and work toward) from **milestones** (universal stamp-count checkpoints with small rewards earned along the way).

### Key Concepts

- **Goal** — A reward item the customer wants to earn (e.g., "Free Large Shake" at 15 stamps). One active goal per customer. Locked until completed. Stamps deducted on claim with carryover.
- **Milestone** — A universal stamp-count checkpoint with a small reward (e.g., "3 stamps = Free Sticker"). Auto-earned and auto-claimed as stamps accumulate. No stamp deduction. Resets each goal cycle. Milestones are informational rewards (a congratulatory marker with a name displayed in the UI), not tangible items requiring physical pickup.

### Current State

- `loyalty_rewards` table holds admin-defined reward tiers
- `loyalty_cards.goal_reward_id` points to the one reward a customer is working toward
- `loyalty_redemptions` tracks earned/claimed rewards
- `registerLoyaltyCard` auto-assigns the cheapest reward as initial goal
- No milestone concept exists

---

## Data Model

### Rename Existing Table

`loyalty_rewards` → `loyalty_goals` (same columns preserved):

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| name | text | e.g., "Free Large Shake" |
| description | text? | Optional detail |
| image_url | text? | Optional image |
| stamps_required | int? | Stamp cost (nullable — can use points instead) |
| points_required | int? | Points cost (nullable — can use stamps instead) |
| is_active | boolean | Admin toggle |
| sort_order | int | Display order |
| created_at | timestamptz | |
| updated_at | timestamptz | Preserved from existing table (auto-set via trigger) |

### Rename Columns

- `loyalty_cards.goal_reward_id` → `loyalty_cards.goal_id` (FK → loyalty_goals)
- `loyalty_redemptions.reward_id` → `loyalty_redemptions.goal_id` (FK → loyalty_goals)

### New Table: `loyalty_milestones`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| name | text | e.g., "Free Sticker" |
| description | text? | Optional detail |
| image_url | text? | Optional image |
| stamps_required | int | Stamp threshold; `CHECK (stamps_required > 0)`, `NOT NULL` |
| is_active | boolean | Admin toggle |
| sort_order | int | Display order |
| created_at | timestamptz | |
| updated_at | timestamptz | Auto-set via `set_updated_at` trigger (matches other admin tables) |

### New Table: `loyalty_milestone_claims`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| card_id | FK → loyalty_cards | Which customer |
| milestone_id | FK → loyalty_milestones | Which milestone |
| goal_id | FK → loyalty_goals | The goal they were working toward when earned |
| earned_at | timestamptz | When stamp count crossed threshold |
| claimed_at | timestamptz | Auto-set to `now()` on insert (milestones are auto-claimed) |
| created_at | timestamptz | |

**Constraints:**
- `UNIQUE (card_id, milestone_id, goal_id)` — prevents duplicate claims within the same goal cycle. Application code uses `INSERT ... ON CONFLICT DO NOTHING` for idempotent concurrent writes.

**Indexes:**
- `CREATE INDEX ON loyalty_milestone_claims (card_id, goal_id)` — covers the per-cycle lookup in milestone auto-check (the unique constraint also provides an index path)

**Why `goal_id` on milestone_claims?** Milestones reset each goal cycle. After claiming a goal (stamps deducted with carryover) and picking a new goal, customers re-earn milestones as they accumulate stamps again. The `goal_id` scopes claims to the current goal cycle.

### Admin Edge Cases

**Deactivating a milestone:** Hides it from the progress ladder for future goal cycles. Existing claims for the deactivated milestone remain valid and visible on the customer's current cycle.

**Changing a goal's `stamps_required` while customers are working toward it:** Changes apply immediately. `checkGoalReached` reads the current goal row each time, so adjustments take effect on the next stamp credit. Admins should be aware this affects in-progress customers.

---

## Business Logic

### Execution Order After Stamp Credit

After `creditLoyalty` applies stamps, the following checks run **in this exact order**:

1. **Milestone auto-check** — uses the post-credit `current_stamps` value
2. **Goal completion check** — uses the same post-credit `current_stamps` value

Goal deduction only happens at claim time (staff action), not at earn time, so both checks see the full accumulated stamp count.

### Milestone Auto-Check (new)

After each stamp credit:

1. Fetch all active milestones where `stamps_required <= card.current_stamps`
2. Filter out any already earned for the current goal cycle (existing row in `loyalty_milestone_claims` with matching `card_id` + `milestone_id` + `goal_id`)
3. For each newly crossed milestone → `INSERT INTO loyalty_milestone_claims ... ON CONFLICT (card_id, milestone_id, goal_id) DO NOTHING RETURNING id` with `earned_at = now()`, `claimed_at = now()`
4. Only if the insert returned a row (not a no-op conflict), send notification via `buildMilestoneEarnedMessage(milestoneName)`: "You hit a milestone — [milestone name]!"

### Goal Completion Check (modified from `checkGoalReached`)

After each stamp credit:

1. If `card.goal_id` is set AND `current_stamps >= goal.stamps_required` (or points equivalent)
2. Auto-create `loyalty_redemptions` row with status `'earned'`
3. Send notification: "You reached your goal! Claim [goal name] at any branch within X days"

### Goal Claiming (modified `redeemReward` → `redeemGoal`)

The renamed `redeem_loyalty_goal()` RPC must include a new step (behavioral change, not just rename):

1. Staff scans/verifies → marks redemption as `'claimed'`
2. Deduct `goal.stamps_required` from `current_stamps` and/or `goal.points_required` from `current_points` (carryover for excess on both)
3. **Set `card.goal_id = NULL`** (unlocked — customer can pick new goal). This is new — the current RPC does not do this.

### Goal Selection (`setGoal` — modified with new guard)

1. **Guard: reject if `card.goal_id IS NOT NULL`** — this is a new validation. Returns error: "You already have an active goal. Complete it first to choose a new one."
2. Set `card.goal_id` to chosen goal
3. Immediately check if any milestones are already earned (carryover stamps from previous goal may already cross thresholds)

### Registration Flow Change

Remove auto-goal-assignment from `registerLoyaltyCard`. New customers start with `goal_id = null` and see a "Pick your goal" CTA on their card page. This aligns with the goal-picker flow and gives customers agency over their first goal choice.

### Unchanged

- Stamp/point calculation engine (`calculateEarnings`)
- Booster system
- Allowlist/blocklist filtering
- Points-per-peso config

---

## UI Changes

### Customer-Facing Card Page (`/loyalty/card/[hash]`)

- **Goal section (top):** Current goal item with image, name, and overall stamp progress bar (e.g., "12/15 stamps"). If no goal set, shows "Pick your goal" CTA button linking to goal picker.
- **When goal is active:** The "Change" link and "Browse All Rewards" button are hidden. The goal section shows the current goal with progress and no option to switch.
- **Milestone ladder (middle):** Vertical progress timeline showing all active milestones as checkpoints. Earned ones are checked with their reward name. Unearned ones show the stamp threshold. Current position indicated on the ladder.
- **Activity list (bottom):** Unchanged — transaction history.

### Goal Picker Page (`/loyalty/card/[hash]/goals`)

- Only accessible when `goal_id` is null (after claiming or first time)
- If accessed with an active goal, redirect back to card page
- Shows available goals as cards with stamp/point cost, image, description
- Selecting one locks it in — no changing until completed

### Admin Panel

**Rename "Rewards" tab → "Goals" tab:**
- Same CRUD functionality, just renamed
- Manages the prize items customers work toward

**New "Milestones" tab:**
- List of milestones with name, stamp threshold, description, image, active toggle
- Create/edit inline (same pattern as Goals/Boosters tabs)
- Sorted by `stamps_required` ascending (natural ladder order)

**"Redemptions" tab:**
- Stays mostly the same, shows goal redemptions
- Could add secondary section for milestone claims visibility

### Component Renames

| Current | New |
|---------|-----|
| `RewardCard` | `GoalCard` |
| `LoyaltyRewardsTab` | `LoyaltyGoalsTab` |
| `useLoyaltyRewards` hook | `useLoyaltyGoals` hook |

### New Components

| Component | Purpose |
|-----------|---------|
| `MilestoneLadder` | Visual progress timeline on customer card page |
| `LoyaltyMilestonesTab` | Admin CRUD for milestones |
| `useLoyaltyMilestones` hook | Admin state management |

---

## Migration Path

### Database Migration (single SQL file)

1. `ALTER TABLE loyalty_rewards RENAME TO loyalty_goals`
2. `ALTER TABLE loyalty_cards RENAME COLUMN goal_reward_id TO goal_id`
3. `ALTER TABLE loyalty_redemptions RENAME COLUMN reward_id TO goal_id`
4. Update FK constraint names to match new table/column names
5. `CREATE TABLE loyalty_milestones` (schema above, including `CHECK`, `updated_at` trigger)
6. `CREATE TABLE loyalty_milestone_claims` (schema above, including `UNIQUE` constraint and index)
7. Replace `redeem_loyalty_reward()` RPC with `redeem_loyalty_goal()` — updated body that sets `goal_id = NULL` after stamp deduction

### Data Preservation

- All current rewards become goals (just a rename)
- All current redemptions stay valid (FK still points to same rows)
- Customer cards keep their current goal selection
- No data loss, no backfill needed

### Code Migration

- Types: `LoyaltyReward` → `LoyaltyGoal`, `LoyaltyCardLookup.goal_reward` → `LoyaltyCardLookup.goal` (add `milestones: LoyaltyMilestoneClaim[]` field)
- Actions: `createReward` → `createGoal`, `toggleReward` → `toggleGoal`, etc.
- Supabase PostgREST `.select()` join references: update all `loyalty_rewards` → `loyalty_goals` and `goal_reward_id` → `goal_id` in:
  - `src/actions/loyalty-admin.ts` (`getRedemptions` join)
  - `src/actions/loyalty.ts` (`lookupCard`, `getCardByCustomerId`)
  - `src/lib/cached-queries.ts` (`getCachedLoyaltyRewards` → `getCachedLoyaltyGoals`, `getCachedActiveRewards` → `getCachedActiveGoals`)
  - `src/components/loyalty/PendingRedemptionsSection.tsx` (`.select('... loyalty_rewards(name)')`)
  - `src/components/admin/LoyaltyRedemptionsTab.tsx` (`redemption.loyalty_rewards?.name`)
  - `src/components/admin/LoyaltyLookupTab.tsx` (`card.goal_reward`)
  - `src/components/CustomerLoyaltyWidget.tsx` (`card.loyalty_rewards`)
  - `src/hooks/useLoyaltyLookup.ts` (`redeemReward` → `redeemGoal`)
- Components: renames listed above
- Validation schemas: `loyaltyRewardSchema` → `loyaltyGoalSchema`
- Notifications: update message copy ("reward" → "goal" where appropriate), add `buildMilestoneEarnedMessage(milestoneName: string)` to `loyalty-notifications.ts`
- Cache tags: add `loyalty-milestones` and `loyalty-milestone-claims` tags, with `revalidateTag` calls in admin actions and after auto-claiming
- Registration: remove auto-goal-assignment from `registerLoyaltyCard`
- `setGoal`: add guard rejecting calls when `goal_id IS NOT NULL`
- Tests: update references, add new tests for milestone logic and goal locking

### No Breaking External Changes

- Card codes stay the same
- Messenger session tokens stay the same
- Customer-facing URLs stay the same (`/loyalty/card/[hash]`)
