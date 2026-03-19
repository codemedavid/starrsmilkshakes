# Loyalty Goals & Milestones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the loyalty system to separate goals (reward items customers choose) from milestones (universal stamp checkpoints with small rewards earned along the way).

**Architecture:** Rename `loyalty_rewards` → `loyalty_goals` throughout the stack. Add `loyalty_milestones` + `loyalty_milestone_claims` tables. Modify `creditLoyalty` to auto-check milestones after each stamp credit. Lock goal selection to one active goal at a time.

**Tech Stack:** Supabase (Postgres), Next.js App Router, TypeScript, Vitest, Zod, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-19-loyalty-goals-milestones-design.md`

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260321000000_goals_milestones.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/20260321000000_goals_milestones.sql
-- Loyalty Goals & Milestones Redesign

-- ── 1. Rename loyalty_rewards → loyalty_goals ─────────────────────────────────
alter table public.loyalty_rewards rename to loyalty_goals;

-- ── 2. Rename FK columns ──────────────────────────────────────────────────────
alter table public.loyalty_cards rename column goal_reward_id to goal_id;
alter table public.loyalty_redemptions rename column reward_id to goal_id;

-- ── 3. Rename FK constraints to match new names ──────────────────────────────
alter table public.loyalty_cards
  rename constraint loyalty_cards_goal_reward_id_fkey to loyalty_cards_goal_id_fkey;

alter table public.loyalty_redemptions
  rename constraint loyalty_redemptions_reward_id_fkey to loyalty_redemptions_goal_id_fkey;

-- ── 4. Create loyalty_milestones table ────────────────────────────────────────
create table public.loyalty_milestones (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  image_url   text,
  stamps_required integer not null check (stamps_required > 0),
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-update updated_at
create trigger set_updated_at_loyalty_milestones
  before update on public.loyalty_milestones
  for each row execute function public.set_updated_at();

-- ── 5. Create loyalty_milestone_claims table ──────────────────────────────────
create table public.loyalty_milestone_claims (
  id           uuid primary key default gen_random_uuid(),
  card_id      uuid not null references public.loyalty_cards(id) on delete cascade,
  milestone_id uuid not null references public.loyalty_milestones(id) on delete cascade,
  goal_id      uuid not null references public.loyalty_goals(id) on delete cascade,
  earned_at    timestamptz not null default now(),
  claimed_at   timestamptz not null default now(),
  created_at   timestamptz not null default now(),

  constraint uq_milestone_per_goal_cycle unique (card_id, milestone_id, goal_id)
);

create index idx_milestone_claims_card_goal on public.loyalty_milestone_claims (card_id, goal_id);

-- ── 6. Enable RLS ────────────────────────────────────────────────────────────
alter table public.loyalty_milestones enable row level security;
alter table public.loyalty_milestone_claims enable row level security;

create policy "Allow public read on milestones"
  on public.loyalty_milestones for select using (true);

create policy "Allow public read on milestone_claims"
  on public.loyalty_milestone_claims for select using (true);

create policy "Allow service role all on milestones"
  on public.loyalty_milestones for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Allow service role all on milestone_claims"
  on public.loyalty_milestone_claims for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ── 7. Replace redeem_loyalty_reward with redeem_loyalty_goal ─────────────────
drop function if exists public.redeem_loyalty_reward(uuid, uuid, text);

create or replace function public.redeem_loyalty_goal(
  p_redemption_id uuid,
  p_branch_id     uuid,
  p_claimed_by    text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card_id        uuid;
  v_goal_id        uuid;
  v_stamps_cost    integer;
  v_points_cost    integer;
begin
  -- Lock the redemption row; only proceed if status = 'earned'
  select card_id, goal_id
    into v_card_id, v_goal_id
    from public.loyalty_redemptions
   where id = p_redemption_id
     and status = 'earned'
  for update;

  if not found then
    raise exception 'Redemption % not found or already processed', p_redemption_id;
  end if;

  -- Get goal costs
  select coalesce(stamps_required, 0), coalesce(points_required, 0)
    into v_stamps_cost, v_points_cost
    from public.loyalty_goals
   where id = v_goal_id;

  if not found then
    raise exception 'Goal not found for redemption %', p_redemption_id;
  end if;

  -- Deduct from card and clear goal_id (unlock for new goal selection)
  update public.loyalty_cards
     set current_stamps = current_stamps - v_stamps_cost,
         current_points = current_points - v_points_cost,
         goal_id        = null,
         updated_at     = now()
   where id = v_card_id;

  -- Mark redemption as claimed
  update public.loyalty_redemptions
     set status            = 'claimed',
         claimed_at        = now(),
         claimed_branch_id = p_branch_id,
         claimed_by        = p_claimed_by
   where id = p_redemption_id;

  -- Insert a 'redeem' transaction record
  insert into public.loyalty_transactions (
    card_id, type, stamps_delta, points_delta, description
  ) values (
    v_card_id, 'redeem', -v_stamps_cost, -v_points_cost,
    'Goal redeemed: ' || p_redemption_id::text
  );
end;
$$;
```

- [ ] **Step 2: Apply migration locally**

Run: `npx supabase db reset` or `npx supabase migration up`
Expected: Migration applies without errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260321000000_goals_milestones.sql
git commit -m "feat(loyalty): add goals/milestones migration — rename rewards, add milestone tables"
```

---

### Task 2: Update Type Definitions

**Files:**
- Modify: `src/types/loyalty.ts`

- [ ] **Step 1: Rename `LoyaltyReward` → `LoyaltyGoal` and add milestone types**

In `src/types/loyalty.ts`, make these changes:

1. Rename the `LoyaltyReward` interface to `LoyaltyGoal` (lines 23-34) — keep all fields identical.
2. Rename `LoyaltyCard.goal_reward_id` to `goal_id` (line 42).
3. Rename `LoyaltyRedemption.reward_id` to `goal_id` (line 64).
4. In `LoyaltyCardLookup` (lines 124-131): rename `goal_reward` to `goal`, change its type from `LoyaltyReward | null` to `LoyaltyGoal | null`, and add `milestone_claims: LoyaltyMilestoneClaim[]`.
5. Add these new interfaces at end of file:

```typescript
export interface LoyaltyMilestone {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  stamps_required: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface LoyaltyMilestoneClaim {
  id: string;
  card_id: string;
  milestone_id: string;
  goal_id: string;
  earned_at: string;
  claimed_at: string;
  created_at: string;
  milestone?: LoyaltyMilestone; // joined data
}
```

- [ ] **Step 2: Verify no TypeScript errors in the types file**

Run: `npx tsc --noEmit src/types/loyalty.ts 2>&1 | head -20`
Expected: May show downstream errors (expected at this point — dependents haven't been updated yet). The types file itself should have no syntax errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/loyalty.ts
git commit -m "feat(loyalty): rename LoyaltyReward → LoyaltyGoal, add milestone types"
```

---

### Task 3: Update Validation Schemas

**Files:**
- Modify: `src/lib/validation.ts`

- [ ] **Step 1: Rename `loyaltyRewardSchema` → `loyaltyGoalSchema` and add milestone schema**

In `src/lib/validation.ts`:

1. Rename `loyaltyRewardSchema` to `loyaltyGoalSchema` (line 170). Keep the schema body identical.
2. Rename `LoyaltyRewardInput` to `LoyaltyGoalInput` (line 180).
3. Update the section comment from `Loyalty Reward` to `Loyalty Goal` (line 168).
4. Add after the goal schema block (after line 180):

```typescript
// ─── Loyalty Milestone ────────────────────────────────────────────────────────

export const loyaltyMilestoneSchema = z.object({
  name: sanitized.pipe(z.string().min(1).max(100)),
  description: sanitized.pipe(z.string().max(500)).nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  stamps_required: z.number().int().min(1),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

export type LoyaltyMilestoneInput = z.infer<typeof loyaltyMilestoneSchema>;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/validation.ts
git commit -m "feat(loyalty): rename loyaltyRewardSchema → loyaltyGoalSchema, add milestoneSchema"
```

---

### Task 4: Update Business Logic (TDD)

**Files:**
- Modify: `src/lib/loyalty-engine.ts`
- Modify: `tests/loyalty-engine.test.ts`

- [ ] **Step 1: Write failing tests for `checkMilestonesReached`**

Add to end of `tests/loyalty-engine.test.ts`:

```typescript
import type { LoyaltyMilestone, LoyaltyMilestoneClaim } from '@/types/loyalty';

const baseMilestone = (overrides: Partial<LoyaltyMilestone> = {}): LoyaltyMilestone => ({
  id: 'ms-1',
  name: 'Free Sticker',
  description: null,
  image_url: null,
  stamps_required: 5,
  is_active: true,
  sort_order: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('checkMilestonesReached', () => {
  it('returns milestones whose stamps_required <= current_stamps', () => {
    const milestones = [
      baseMilestone({ id: 'ms-1', stamps_required: 3 }),
      baseMilestone({ id: 'ms-2', stamps_required: 5 }),
      baseMilestone({ id: 'ms-3', stamps_required: 10 }),
    ];
    const result = checkMilestonesReached(5, milestones, []);
    expect(result.map((m) => m.id)).toEqual(['ms-1', 'ms-2']);
  });

  it('excludes already claimed milestones', () => {
    const milestones = [
      baseMilestone({ id: 'ms-1', stamps_required: 3 }),
      baseMilestone({ id: 'ms-2', stamps_required: 5 }),
    ];
    const existingClaims: Pick<LoyaltyMilestoneClaim, 'milestone_id'>[] = [
      { milestone_id: 'ms-1' },
    ];
    const result = checkMilestonesReached(5, milestones, existingClaims);
    expect(result.map((m) => m.id)).toEqual(['ms-2']);
  });

  it('returns empty when no milestones crossed', () => {
    const milestones = [baseMilestone({ stamps_required: 10 })];
    expect(checkMilestonesReached(3, milestones, [])).toEqual([]);
  });

  it('returns empty when all crossed milestones already claimed', () => {
    const milestones = [baseMilestone({ id: 'ms-1', stamps_required: 3 })];
    const claims: Pick<LoyaltyMilestoneClaim, 'milestone_id'>[] = [
      { milestone_id: 'ms-1' },
    ];
    expect(checkMilestonesReached(5, milestones, claims)).toEqual([]);
  });

  it('only considers active milestones (inactive filtered before calling)', () => {
    const milestones = [baseMilestone({ stamps_required: 3 })];
    expect(checkMilestonesReached(5, milestones, [])).toHaveLength(1);
  });
});
```

Also update imports at top of file:
- Add `checkMilestonesReached` to the import from `@/lib/loyalty-engine`
- Change `LoyaltyReward` to `LoyaltyGoal` in the import from `@/types/loyalty`

Update all test fixtures/references that use `LoyaltyReward` type to use `LoyaltyGoal`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/loyalty-engine.test.ts 2>&1 | tail -20`
Expected: FAIL — `checkMilestonesReached` is not exported.

- [ ] **Step 3: Implement `checkMilestonesReached` and rename types in engine**

In `src/lib/loyalty-engine.ts`:

1. Update import: `LoyaltyReward` → `LoyaltyGoal`. Add `LoyaltyMilestone, LoyaltyMilestoneClaim` to imports.
2. Rename the `reward` parameter in `checkGoalReached` from `LoyaltyReward | null` to `LoyaltyGoal | null` (line 142).
3. Rename the `reward` parameter in `calculateCarryover` from `LoyaltyReward` to `LoyaltyGoal` (line 163).
4. Add at end of file:

```typescript
/**
 * Given the current stamp count, active milestones, and existing claims for
 * this goal cycle, return the milestones that are newly reached.
 *
 * Only pass active milestones. Filtering inactive milestones is the caller's
 * responsibility.
 */
export function checkMilestonesReached(
  currentStamps: number,
  milestones: LoyaltyMilestone[],
  existingClaims: Pick<LoyaltyMilestoneClaim, 'milestone_id'>[],
): LoyaltyMilestone[] {
  const claimedIds = new Set(existingClaims.map((c) => c.milestone_id));
  return milestones.filter(
    (ms) => ms.stamps_required <= currentStamps && !claimedIds.has(ms.id),
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/loyalty-engine.test.ts 2>&1 | tail -20`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/loyalty-engine.ts tests/loyalty-engine.test.ts
git commit -m "feat(loyalty): add checkMilestonesReached, rename LoyaltyReward → LoyaltyGoal in engine"
```

---

### Task 5: Update Notifications

**Files:**
- Modify: `src/lib/loyalty-notifications.ts`

- [ ] **Step 1: Add `buildMilestoneEarnedMessage` and rename `buildRewardClaimedMessage` → `buildGoalClaimedMessage`**

In `src/lib/loyalty-notifications.ts`:

1. Rename `buildRewardClaimedMessage` to `buildGoalClaimedMessage` (line 61). Update the `@example` comment to say "Goal claimed" instead of "Reward claimed". Update the return string from `'✅ Reward claimed!'` to `'✅ Goal claimed!'`.
2. Add after `buildGoalAchievedMessage` (after line 48):

```typescript
/**
 * Build the "you hit a milestone" message.
 *
 * @example
 * buildMilestoneEarnedMessage('Free Sticker')
 * // "🏆 You hit a milestone — Free Sticker!"
 */
export function buildMilestoneEarnedMessage(milestoneName: string): string {
  return `🏆 You hit a milestone — ${milestoneName}!`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/loyalty-notifications.ts
git commit -m "feat(loyalty): add buildMilestoneEarnedMessage, rename to buildGoalClaimedMessage"
```

---

### Task 6: Update Cached Queries

**Files:**
- Modify: `src/lib/cached-queries.ts`

- [ ] **Step 1: Rename reward caches → goal caches, add milestone caches**

In `src/lib/cached-queries.ts`:

1. Rename `getCachedLoyaltyRewards` → `getCachedLoyaltyGoals` (line 134). Change `.from('loyalty_rewards')` to `.from('loyalty_goals')`. Update cache key from `'admin-loyalty-rewards'` to `'admin-loyalty-goals'`. Update tag from `'loyalty-rewards'` to `'loyalty-goals'`.
2. Rename `getCachedActiveRewards` → `getCachedActiveGoals` (line 228). Change `.from('loyalty_rewards')` to `.from('loyalty_goals')`. Update cache key from `'customer-active-rewards'` to `'customer-active-goals'`. Update tag from `'loyalty-rewards'` to `'loyalty-goals'`.
3. Update `getCachedLoyaltyStats` section comment from "rewards" to "goals" where applicable.
4. Add after the boosters cache (after line 155):

```typescript
// ── Loyalty Milestones ─────────────────────────────────────
export const getCachedLoyaltyMilestones = unstable_cache(
  async () => {
    const { data } = await (supabaseServer.from('loyalty_milestones') as any)
      .select('*')
      .order('stamps_required', { ascending: true });
    return data || [];
  },
  ['admin-loyalty-milestones'],
  { revalidate: 60, tags: ['loyalty-milestones'] }
);

// ── Customer-Facing: Active Milestones ─────────────────────
export const getCachedActiveMilestones = unstable_cache(
  async () => {
    const { data } = await (supabaseServer.from('loyalty_milestones') as any)
      .select('id, name, description, image_url, stamps_required, is_active, sort_order')
      .eq('is_active', true)
      .order('stamps_required', { ascending: true });
    return data || [];
  },
  ['customer-active-milestones'],
  { revalidate: 60, tags: ['loyalty-milestones'] }
);
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/cached-queries.ts
git commit -m "feat(loyalty): rename reward caches → goal caches, add milestone caches"
```

---

### Task 7: Update Core Server Actions

**Files:**
- Modify: `src/actions/loyalty.ts`

This is the largest change. Update in this order:

- [ ] **Step 1: Update imports and `setGoal` with guard**

1. Change all `LoyaltyReward` type references to `LoyaltyGoal`.
2. Change all `loyalty_rewards` table references to `loyalty_goals`.
3. Change all `goal_reward_id` column references to `goal_id`.
4. In `setGoal` (line 510), add guard at the start of the function body:

```typescript
// Guard: only allow goal selection when no active goal
const { data: card } = await supabase
  .from('loyalty_cards')
  .select('goal_id')
  .eq('id', cardId)
  .single();

if (card?.goal_id) {
  return { success: false, error: 'You already have an active goal. Complete it first to choose a new one.' };
}
```

5. After setting the new `goal_id`, add an immediate milestone auto-check (carryover stamps from a previous goal may already cross thresholds). Extract the milestone check logic into a shared helper `checkAndClaimMilestones(supabase, card, psid, pageAccessToken)` to reuse in both `setGoal` and `creditLoyalty`:

```typescript
// src/actions/loyalty.ts — shared helper (not a server action, just a function)
async function checkAndClaimMilestones(
  supabase: SupabaseClient,
  card: { id: string; goal_id: string; current_stamps: number },
  messengerPsid: string | null,
  pageAccessToken: string | null,
) {
  const activeMilestones = await supabase
    .from('loyalty_milestones')
    .select('*')
    .eq('is_active', true)
    .lte('stamps_required', card.current_stamps)
    .order('stamps_required', { ascending: true });

  const existingClaims = await supabase
    .from('loyalty_milestone_claims')
    .select('milestone_id')
    .eq('card_id', card.id)
    .eq('goal_id', card.goal_id);

  const newMilestones = checkMilestonesReached(
    card.current_stamps,
    activeMilestones.data || [],
    existingClaims.data || [],
  );

  for (const ms of newMilestones) {
    const { data: inserted } = await supabase
      .from('loyalty_milestone_claims')
      .upsert(
        { card_id: card.id, milestone_id: ms.id, goal_id: card.goal_id },
        { onConflict: 'card_id,milestone_id,goal_id', ignoreDuplicates: true },
      )
      .select('id')
      .single();

    if (inserted?.id && messengerPsid && pageAccessToken) {
      const msg = buildMilestoneEarnedMessage(ms.name);
      await sendLoyaltyNotification(messengerPsid, msg, pageAccessToken);
    }
  }

  if (newMilestones.length > 0) revalidateTag('loyalty-milestone-claims');
}
```

Call `checkAndClaimMilestones` at the end of `setGoal` (after setting `goal_id`) and in `creditLoyalty` (Step 2).

- [ ] **Step 2: Update `creditLoyalty` to add milestone auto-check**

In `creditLoyalty` (starts at line 237), after the stamp credit is applied and before the goal check, add milestone auto-check logic:

```typescript
// ── Milestone auto-check (uses shared helper from Step 1) ───
if (updatedCard.goal_id) {
  await checkAndClaimMilestones(supabase, updatedCard, messengerPsid, pageAccessToken);
}
```

Add imports at top: `checkMilestonesReached` from `@/lib/loyalty-engine` and `buildMilestoneEarnedMessage` from `@/lib/loyalty-notifications`.

- [ ] **Step 3: Update `redeemReward` → `redeemGoal`**

Rename the function from `redeemReward` to `redeemGoal`. Change the RPC call from `redeem_loyalty_reward` to `redeem_loyalty_goal`. Update the `revalidateTag` call from `'loyalty-rewards'` to `'loyalty-goals'`.

- [ ] **Step 4: Update `registerLoyaltyCard` — remove auto-goal-assignment**

Find the section that auto-assigns the cheapest reward as the initial goal (around lines 119-137 and 200-219). Remove that logic. New customers start with `goal_id = null`.

- [ ] **Step 5: Update `lookupCard` and `getCardByCustomerId` PostgREST joins**

1. In `lookupCard`: Change `.select('..., loyalty_rewards(name, stamps_required, points_required)')` → `.select('..., loyalty_goals(name, stamps_required, points_required)')`. Rename the `goal_reward` variable and return key to `goal`.
2. In `getCardByCustomerId`: Change the FK-hinted join `loyalty_rewards!goal_reward_id(name, stamps_required, points_required)` → `loyalty_goals!goal_id(name, stamps_required, points_required)` (both table name AND FK hint must change).
3. In `lookupCard`, after fetching the card, also fetch milestone claims for the `LoyaltyCardLookup.milestone_claims` field:

```typescript
const { data: milestoneClaims } = await supabase
  .from('loyalty_milestone_claims')
  .select('*, loyalty_milestones(name, stamps_required)')
  .eq('card_id', card.id)
  .eq('goal_id', card.goal_id);
```

Include `milestone_claims: milestoneClaims || []` in the return mapping.

- [ ] **Step 6: Commit**

```bash
git add src/actions/loyalty.ts
git commit -m "feat(loyalty): update core actions — milestone check, goal guard, rename reward refs"
```

---

### Task 8: Update Admin Server Actions

**Files:**
- Modify: `src/actions/loyalty-admin.ts`

- [ ] **Step 1: Rename all reward admin actions to goal actions**

1. `createReward` → `createGoal` — change `.from('loyalty_rewards')` to `.from('loyalty_goals')`, update `revalidateTag('loyalty-rewards')` to `revalidateTag('loyalty-goals')`.
2. `updateReward` → `updateGoal` — same table/tag renames.
3. `toggleReward` → `toggleGoal` — same table/tag renames.
4. `getRedemptions` — change the PostgREST join from `loyalty_rewards!inner(name)` to `loyalty_goals!inner(name)`.
5. Update schema reference from `loyaltyRewardSchema` to `loyaltyGoalSchema` in imports.

- [ ] **Step 2: Add milestone admin actions**

Add to `src/actions/loyalty-admin.ts`:

```typescript
// ─── Milestone Admin Actions ────────────────────────────────────────────────

export async function createMilestone(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  await checkActionRateLimit();
  const parsed = loyaltyMilestoneSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const { data, error } = await supabase
    .from('loyalty_milestones')
    .insert(parsed.data)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  revalidateTag('loyalty-milestones');
  return { success: true, data };
}

export async function updateMilestone(id: unknown, input: unknown): Promise<ActionResult> {
  await requireAdmin();
  await checkActionRateLimit();
  if (typeof id !== 'string') return { success: false, error: 'Invalid ID' };
  const parsed = loyaltyMilestoneSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const { data, error } = await supabase
    .from('loyalty_milestones')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  revalidateTag('loyalty-milestones');
  return { success: true, data };
}

export async function toggleMilestone(id: unknown, isActive: boolean): Promise<ActionResult> {
  await requireAdmin();
  await checkActionRateLimit();
  if (typeof id !== 'string') return { success: false, error: 'Invalid ID' };

  const { error } = await supabase
    .from('loyalty_milestones')
    .update({ is_active: isActive })
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  revalidateTag('loyalty-milestones');
  return { success: true };
}
```

Add imports: `loyaltyMilestoneSchema` from `@/lib/validation`.

- [ ] **Step 3: Commit**

```bash
git add src/actions/loyalty-admin.ts
git commit -m "feat(loyalty): rename reward admin actions → goal, add milestone CRUD"
```

---

### Task 9: Update Hooks

**Files:**
- Modify: `src/hooks/useLoyaltyRewards.ts` (rename file to `src/hooks/useLoyaltyGoals.ts`)
- Modify: `src/hooks/useLoyaltyLookup.ts`
- Create: `src/hooks/useLoyaltyMilestones.ts`

- [ ] **Step 1: Rename `useLoyaltyRewards` → `useLoyaltyGoals`**

Rename the file from `src/hooks/useLoyaltyRewards.ts` to `src/hooks/useLoyaltyGoals.ts`. Inside:

1. Rename function `useLoyaltyRewards` → `useLoyaltyGoals`.
2. Change `LoyaltyReward` import → `LoyaltyGoal`.
3. Change action imports: `createReward` → `createGoal`, `updateReward` → `updateGoal`, `toggleReward` → `toggleGoal`.
4. Rename all internal state variable names (`rewards` → `goals`, `addReward` → `addGoal`, etc.).

- [ ] **Step 2: Update `useLoyaltyLookup`**

In `src/hooks/useLoyaltyLookup.ts`: change `redeemReward` import → `redeemGoal` and update the call site.

- [ ] **Step 3: Create `useLoyaltyMilestones` hook**

Create `src/hooks/useLoyaltyMilestones.ts` following the same pattern as the goals hook:

```typescript
'use client';
import { useState, useCallback } from 'react';
import type { LoyaltyMilestone } from '@/types/loyalty';
import { createMilestone, updateMilestone, toggleMilestone } from '@/actions/loyalty-admin';

export function useLoyaltyMilestones(initialMilestones: LoyaltyMilestone[]) {
  const [milestones, setMilestones] = useState(initialMilestones);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addMilestone = useCallback(async (input: Omit<LoyaltyMilestone, 'id' | 'created_at' | 'updated_at'>) => {
    setSaving(true);
    setError(null);
    const result = await createMilestone(input);
    if (result.success && result.data) {
      setMilestones((prev) => [...prev, result.data]);
    } else {
      setError(result.error ?? 'Failed to create milestone');
    }
    setSaving(false);
    return result;
  }, []);

  const editMilestone = useCallback(async (id: string, input: Partial<LoyaltyMilestone>) => {
    setSaving(true);
    setError(null);
    const result = await updateMilestone(id, input);
    if (result.success && result.data) {
      setMilestones((prev) => prev.map((m) => (m.id === id ? result.data : m)));
    } else {
      setError(result.error ?? 'Failed to update milestone');
    }
    setSaving(false);
    return result;
  }, []);

  const toggle = useCallback(async (id: string, isActive: boolean) => {
    setSaving(true);
    setError(null);
    const result = await toggleMilestone(id, isActive);
    if (result.success) {
      setMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, is_active: isActive } : m)));
    } else {
      setError(result.error ?? 'Failed to toggle milestone');
    }
    setSaving(false);
    return result;
  }, []);

  return { milestones, addMilestone, editMilestone, toggle, saving, error, setError };
}
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useLoyaltyGoals.ts src/hooks/useLoyaltyMilestones.ts src/hooks/useLoyaltyLookup.ts
git rm src/hooks/useLoyaltyRewards.ts
git commit -m "feat(loyalty): rename useLoyaltyRewards → useLoyaltyGoals, add useLoyaltyMilestones"
```

---

### Task 10: Rename Existing Components

**Files:**
- Modify: `src/components/loyalty/RewardCard.tsx` (rename to `src/components/loyalty/GoalCard.tsx`)
- Modify: `src/components/admin/LoyaltyRewardsTab.tsx` (rename to `src/components/admin/LoyaltyGoalsTab.tsx`)
- Modify: `src/components/admin/LoyaltyRedemptionsTab.tsx`
- Modify: `src/components/admin/LoyaltyLookupTab.tsx`
- Modify: `src/components/loyalty/PendingRedemptionsSection.tsx`
- Modify: `src/components/CustomerLoyaltyWidget.tsx`

- [ ] **Step 1: Rename `RewardCard.tsx` → `GoalCard.tsx`**

Rename the file. Inside: rename the component from `RewardCard` to `GoalCard`, rename `RewardCardProps` to `GoalCardProps`, change `reward` prop name to `goal`. Update all internal references.

- [ ] **Step 2: Rename `LoyaltyRewardsTab.tsx` → `LoyaltyGoalsTab.tsx`**

Rename the file. Inside:
1. Rename component `LoyaltyRewardsTab` → `LoyaltyGoalsTab`.
2. Change import `useLoyaltyRewards` → `useLoyaltyGoals` from the renamed hook.
3. Change all `reward`/`rewards` variable names to `goal`/`goals`.
4. Change `LoyaltyReward` type to `LoyaltyGoal`.
5. Update `RewardForm` → `GoalForm`, `RewardCard` → `GoalCard` sub-components.

- [ ] **Step 3: Update `LoyaltyRedemptionsTab.tsx`**

Change `redemption.loyalty_rewards?.name` → `redemption.loyalty_goals?.name`. Change PostgREST join reference from `loyalty_rewards` to `loyalty_goals`.

- [ ] **Step 4: Update `LoyaltyLookupTab.tsx`**

Change `card.goal_reward` → `card.goal`. Change `redeemReward` → `redeemGoal`. Update the `LoyaltyReward` type references to `LoyaltyGoal`.

- [ ] **Step 5: Update `PendingRedemptionsSection.tsx`**

Change `.select('..., loyalty_rewards(name)')` → `.select('..., loyalty_goals(name)')`.

- [ ] **Step 6: Update `CustomerLoyaltyWidget.tsx`**

Change `card.loyalty_rewards` → `card.loyalty_goals`.

- [ ] **Step 7: Commit**

```bash
git add src/components/loyalty/GoalCard.tsx src/components/admin/LoyaltyGoalsTab.tsx \
  src/components/admin/LoyaltyRedemptionsTab.tsx src/components/admin/LoyaltyLookupTab.tsx \
  src/components/loyalty/PendingRedemptionsSection.tsx src/components/CustomerLoyaltyWidget.tsx
git rm src/components/loyalty/RewardCard.tsx src/components/admin/LoyaltyRewardsTab.tsx
git commit -m "refactor(loyalty): rename reward components → goal components"
```

---

### Task 11: New Components — MilestoneLadder & LoyaltyMilestonesTab

**Files:**
- Create: `src/components/loyalty/MilestoneLadder.tsx`
- Create: `src/components/admin/LoyaltyMilestonesTab.tsx`

- [ ] **Step 1: Create `MilestoneLadder` component**

Create `src/components/loyalty/MilestoneLadder.tsx`:

```tsx
'use client';
import type { LoyaltyMilestone, LoyaltyMilestoneClaim } from '@/types/loyalty';

interface MilestoneLadderProps {
  milestones: LoyaltyMilestone[];
  claims: LoyaltyMilestoneClaim[];
  currentStamps: number;
}

export default function MilestoneLadder({ milestones, claims, currentStamps }: MilestoneLadderProps) {
  const claimedIds = new Set(claims.map((c) => c.milestone_id));

  if (milestones.length === 0) return null;

  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Milestones</h3>
      <div className="relative ml-3 border-l-2 border-zinc-700 pl-4 space-y-3">
        {milestones.map((ms) => {
          const earned = claimedIds.has(ms.id);
          const reachable = currentStamps >= ms.stamps_required;
          return (
            <div key={ms.id} className="relative">
              {/* Dot on the line */}
              <div
                className={`absolute -left-[1.35rem] top-1 h-3 w-3 rounded-full border-2 ${
                  earned
                    ? 'border-green-400 bg-green-400'
                    : reachable
                      ? 'border-amber-400 bg-amber-400'
                      : 'border-zinc-600 bg-zinc-800'
                }`}
              />
              <div className={earned ? 'opacity-100' : 'opacity-60'}>
                <p className="text-sm font-medium text-zinc-200">
                  {ms.name}
                  {earned && <span className="ml-2 text-xs text-green-400">Earned</span>}
                </p>
                <p className="text-xs text-zinc-500">
                  {ms.stamps_required} stamps
                  {ms.description && ` — ${ms.description}`}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `LoyaltyMilestonesTab` admin component**

Create `src/components/admin/LoyaltyMilestonesTab.tsx` following the same pattern as `LoyaltyGoalsTab` (formerly `LoyaltyRewardsTab`). Key differences:

- Uses `useLoyaltyMilestones` hook
- Form fields: name, description, image_url, stamps_required, is_active, sort_order
- Sorted by `stamps_required` ascending
- No `points_required` field (milestones are stamp-count only)

The component should include an inline form for create/edit and a list of milestone cards with toggle.

Follow the exact same structural pattern as `LoyaltyGoalsTab.tsx` (from Task 10) — `MilestoneForm` sub-component, `MilestoneCard` sub-component, form state management, validation with `loyaltyMilestoneSchema`.

- [ ] **Step 3: Commit**

```bash
git add src/components/loyalty/MilestoneLadder.tsx src/components/admin/LoyaltyMilestonesTab.tsx
git commit -m "feat(loyalty): add MilestoneLadder and LoyaltyMilestonesTab components"
```

---

### Task 12: Update Pages

**Files:**
- Modify: `app/admin/loyalty/LoyaltyContent.tsx`
- Modify: `app/loyalty/card/[hash]/page.tsx`
- Modify: `app/loyalty/card/[hash]/goals/page.tsx`
- Modify: `app/loyalty/card/[hash]/goals/GoalPicker.tsx`

- [ ] **Step 1: Update admin `LoyaltyContent.tsx`**

1. Change import `LoyaltyRewardsTab` → `LoyaltyGoalsTab` from renamed file.
2. Add import `LoyaltyMilestonesTab` from the new component.
3. Rename the "Rewards" tab label to "Goals".
4. Add a "Milestones" tab after "Goals", rendering `<LoyaltyMilestonesTab milestones={initialMilestones} />`.
5. Update props to accept `initialMilestones` and pass it down. The parent page (`app/admin/loyalty/page.tsx`) will need to fetch milestones via `getCachedLoyaltyMilestones()`.

Also update `app/admin/loyalty/page.tsx` to fetch `getCachedLoyaltyMilestones()` and pass as prop.

- [ ] **Step 2: Update customer card page**

In `app/loyalty/card/[hash]/page.tsx`:

1. Import `MilestoneLadder` from `@/components/loyalty/MilestoneLadder`.
2. Import `getCachedActiveMilestones` from `@/lib/cached-queries`.
3. Fetch active milestones and milestone claims for the current card+goal.
4. Add `<MilestoneLadder>` between the goal/stamp section and the activity list.
5. When `goal_id` is null, show "Pick your goal" CTA instead of goal progress.
6. When `goal_id` is set, hide "Change" link and "Browse All Rewards" button.
7. Update all `LoyaltyReward` type references → `LoyaltyGoal`.
8. Update any `goal_reward` → `goal` data accessors.

- [ ] **Step 3: Update goal picker page and component**

In `app/loyalty/card/[hash]/goals/page.tsx`:
1. Add guard: if `card.goal_id` is not null, redirect back to card page.
2. Update `LoyaltyReward` → `LoyaltyGoal` types.

In `app/loyalty/card/[hash]/goals/GoalPicker.tsx`:
1. Change import `RewardCard` → `GoalCard`.
2. Change `LoyaltyReward` → `LoyaltyGoal`.
3. Change `setGoal` action's `rewardId` parameter naming.

- [ ] **Step 4: Commit**

```bash
git add app/admin/loyalty/ app/loyalty/card/
git commit -m "feat(loyalty): update pages — admin milestones tab, card milestone ladder, goal locking"
```

---

### Task 13: Update All Tests

**Files:**
- Modify: `tests/loyalty-system.test.ts`
- Modify: `tests/loyalty-actions.test.ts`
- Modify: `tests/loyalty-notifications.test.ts`

- [ ] **Step 1: Update existing test references across all test files**

In `tests/loyalty-system.test.ts`:
1. Change all `LoyaltyReward` → `LoyaltyGoal` type references.
2. Change all `loyalty_rewards` table references → `loyalty_goals`.
3. Change all `goal_reward_id` → `goal_id` column references.
4. Change `redeemReward` → `redeemGoal` action references.
5. Change `redeem_loyalty_reward` RPC → `redeem_loyalty_goal`.

In `tests/loyalty-actions.test.ts`:
1. Apply the same renames as above (`LoyaltyReward` → `LoyaltyGoal`, table/column/action renames).

In `tests/loyalty-notifications.test.ts`:
1. Rename import `buildRewardClaimedMessage` → `buildGoalClaimedMessage`.
2. Rename the `describe('buildRewardClaimedMessage', ...)` block to `describe('buildGoalClaimedMessage', ...)`.
3. Update test assertion that checks for `'Reward claimed'` string → `'Goal claimed'`.
4. Add a new `describe('buildMilestoneEarnedMessage', ...)` block:

```typescript
describe('buildMilestoneEarnedMessage', () => {
  it('builds a milestone message with the name', () => {
    expect(buildMilestoneEarnedMessage('Free Sticker')).toBe(
      '🏆 You hit a milestone — Free Sticker!',
    );
  });
});
```

- [ ] **Step 2: Add milestone system tests**

Add test cases:

```typescript
describe('Milestone System', () => {
  it('auto-earns milestones when stamp count crosses threshold', async () => {
    // Setup: create milestones at 3 and 5 stamps
    // Credit enough stamps to cross 3
    // Verify milestone claim created for 3-stamp milestone
    // Credit more to cross 5
    // Verify both milestones claimed
  });

  it('does not duplicate milestone claims on repeated credits', async () => {
    // Setup: milestone at 3 stamps
    // Credit to 5 stamps (crosses milestone)
    // Credit again (no new orders, same stamp count)
    // Verify only one claim row exists
  });

  it('resets milestones when new goal cycle begins', async () => {
    // Setup: milestone at 3 stamps, goal at 10 stamps
    // Credit to 10 stamps, claim goal
    // Pick new goal
    // Credit to 3 stamps again
    // Verify new milestone claim with new goal_id
  });

  it('prevents goal change when active goal exists', async () => {
    // Setup: set goal A
    // Try to set goal B
    // Expect error: "You already have an active goal"
  });

  it('allows goal selection after goal is claimed', async () => {
    // Setup: set goal, reach it, claim it
    // Verify goal_id is null
    // Set new goal
    // Expect success
  });

  it('new customers start with no goal', async () => {
    // Register new card
    // Verify goal_id is null
  });
});
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run 2>&1 | tail -30`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add tests/
git commit -m "test(loyalty): update system tests for goals/milestones, add milestone scenarios"
```

---

### Task 14: Final Verification & Cleanup

**Files:**
- All modified files

- [ ] **Step 1: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run 2>&1 | tail -30`
Expected: All tests pass.

- [ ] **Step 3: Grep for leftover `loyalty_rewards` references**

Run: `grep -r "loyalty_rewards\|LoyaltyReward\|goal_reward_id\|goal_reward\|redeemReward\|createReward\|updateReward\|toggleReward\|useLoyaltyRewards\|loyaltyRewardSchema\|RewardCard\|LoyaltyRewardsTab\|getCachedLoyaltyRewards\|getCachedActiveRewards\|redeem_loyalty_reward\|buildRewardClaimedMessage" src/ app/ tests/ --include="*.ts" --include="*.tsx" -l`
Expected: No files returned (all references renamed).

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore(loyalty): clean up any remaining reward → goal references"
```
