# Loyalty Goals & Milestones Redesign

## Overview

Restructure the loyalty system to clearly separate **goals** (reward items customers choose and work toward) from **milestones** (universal stamp-count checkpoints with small rewards earned along the way).

### Key Concepts

- **Goal** — A reward item the customer wants to earn (e.g., "Free Large Shake" at 15 stamps). One active goal per customer. Locked until completed. Stamps deducted on claim with carryover.
- **Milestone** — A universal stamp-count checkpoint with a small reward (e.g., "3 stamps = Free Sticker"). Auto-earned as stamps accumulate. No stamp deduction. Resets each goal cycle.

### Current State

- `loyalty_rewards` table holds admin-defined reward tiers
- `loyalty_cards.goal_reward_id` points to the one reward a customer is working toward
- `loyalty_redemptions` tracks earned/claimed rewards
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
| stamps_required | int | Stamp threshold to earn this milestone |
| is_active | boolean | Admin toggle |
| sort_order | int | Display order |
| created_at | timestamptz | |

### New Table: `loyalty_milestone_claims`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| card_id | FK → loyalty_cards | Which customer |
| milestone_id | FK → loyalty_milestones | Which milestone |
| goal_id | FK → loyalty_goals | The goal they were working toward when earned |
| earned_at | timestamptz | When stamp count crossed threshold |
| claimed_at | timestamptz? | When physically redeemed (null = auto-claimed) |
| created_at | timestamptz | |

**Why `goal_id` on milestone_claims?** Milestones reset each goal cycle. After claiming a goal (stamps deducted with carryover) and picking a new goal, customers re-earn milestones as they accumulate stamps again. The `goal_id` scopes claims to the current goal cycle.

---

## Business Logic

### Stamp Earning (existing `creditLoyalty` — mostly unchanged)

Order completes → stamps/points calculated and credited to card. `current_stamps` and `lifetime_stamps` both increase. After crediting, two new checks run.

### Milestone Auto-Check (new)

After each stamp credit:

1. Fetch all active milestones where `stamps_required <= card.current_stamps`
2. Filter out any already earned for the current goal cycle (existing row in `loyalty_milestone_claims` with matching `card_id` + `milestone_id` + `goal_id`)
3. For each newly crossed milestone → insert `loyalty_milestone_claims` row with `earned_at = now()`, `claimed_at = now()` (auto-claimed)
4. Send notification: "You earned [milestone reward]!"

### Goal Completion Check (modified from `checkGoalReached`)

After each stamp credit:

1. If `card.goal_id` is set AND `current_stamps >= goal.stamps_required` (or points equivalent)
2. Auto-create `loyalty_redemptions` row with status `'earned'`
3. Send notification: "You reached your goal! Claim [goal name] at any branch within X days"

### Goal Claiming (modified `redeemReward` → `redeemGoal`)

1. Staff scans/verifies → marks redemption as `'claimed'`
2. Deduct `goal.stamps_required` from `current_stamps` (carryover for excess)
3. Set `card.goal_id = null` (unlocked — customer can pick new goal)

### Goal Selection (`setGoal` — modified)

1. Check: `card.goal_id` must be null (no active goal)
2. Set `card.goal_id` to chosen goal
3. Immediately check if any milestones are already earned (carryover stamps from previous goal may already cross thresholds)

### Unchanged

- Stamp/point calculation engine (`calculateEarnings`)
- Booster system
- Allowlist/blocklist filtering
- Points-per-peso config

---

## UI Changes

### Customer-Facing Card Page (`/loyalty/card/[hash]`)

- **Goal section (top):** Current goal item with image, name, and overall stamp progress bar (e.g., "12/15 stamps"). If no goal set, "Pick your goal" CTA.
- **Milestone ladder (middle):** Vertical progress timeline showing all active milestones as checkpoints. Earned ones are checked with their reward name. Unearned ones show the stamp threshold. Current position indicated on the ladder.
- **Activity list (bottom):** Unchanged — transaction history.

### Goal Picker Page (`/loyalty/card/[hash]/goals`)

- Only accessible when `goal_id` is null (after claiming or first time)
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
5. `CREATE TABLE loyalty_milestones` (schema above)
6. `CREATE TABLE loyalty_milestone_claims` (schema above)
7. Rename `redeem_loyalty_reward()` RPC → `redeem_loyalty_goal()`

### Data Preservation

- All current rewards become goals (just a rename)
- All current redemptions stay valid (FK still points to same rows)
- Customer cards keep their current goal selection
- No data loss, no backfill needed

### Code Migration

- Types: `LoyaltyReward` → `LoyaltyGoal`
- Actions: `createReward` → `createGoal`, `toggleReward` → `toggleGoal`, etc.
- Components: renames listed above
- Validation schemas: `loyaltyRewardSchema` → `loyaltyGoalSchema`
- Notifications: update message copy ("reward" → "goal" where appropriate)
- Tests: update references, add new tests for milestone logic

### No Breaking External Changes

- Card codes stay the same
- Messenger session tokens stay the same
- Customer-facing URLs stay the same (`/loyalty/card/[hash]`)
