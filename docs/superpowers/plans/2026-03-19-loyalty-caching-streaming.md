# Loyalty Caching & Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cache shared loyalty data and add Suspense streaming to the card page so it renders instantly.

**Architecture:** Add two cached data-fetching functions to `src/lib/cached-queries.ts` using `unstable_cache`. Create three async server components for streamed sections (redemptions, boosters, activity) with skeleton fallbacks. Refactor the card page to render the header immediately and stream secondary sections via `<Suspense>`.

**Tech Stack:** Next.js 15.5.10, React 18, `unstable_cache` from `next/cache`, Supabase, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-19-loyalty-caching-streaming-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/cached-queries.ts` | Modify (append) | Add `getCachedActiveRewards` and `getCachedActiveBoosters` |
| `src/components/loyalty/ActivitySection.tsx` | Create | Async server component — fetches + renders activity list |
| `src/components/loyalty/BoostersSection.tsx` | Create | Async server component — fetches cached boosters, filters by date, renders |
| `src/components/loyalty/PendingRedemptionsSection.tsx` | Create | Async server component — fetches + renders pending redemptions |
| `src/components/loyalty/skeletons.tsx` | Create | Three skeleton components (Activity, Booster, Redemptions) |
| `app/loyalty/card/[hash]/page.tsx` | Modify | Use cached fetchers, wrap sections in Suspense |
| `app/loyalty/card/[hash]/goals/page.tsx` | Modify | Use `getCachedActiveRewards()` instead of direct query |

---

### Task 1: Add cached data functions to `cached-queries.ts`

**Files:**
- Modify: `src/lib/cached-queries.ts` (append after line 155)

- [ ] **Step 1: Add `getCachedActiveRewards`**

Append to `src/lib/cached-queries.ts` after the existing `getCachedLoyaltyBoosters`:

```ts
// ── Customer-Facing: Active Rewards ─────────────────────────
export const getCachedActiveRewards = unstable_cache(
  async () => {
    const { data } = await (supabaseServer.from('loyalty_rewards') as any)
      .select(
        'id, name, description, image_url, stamps_required, points_required, is_active, sort_order, created_at, updated_at',
      )
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    return data || [];
  },
  ['customer-active-rewards'],
  { revalidate: 60, tags: ['loyalty-rewards'] }
);
```

- [ ] **Step 2: Add `getCachedActiveBoosters`**

Append immediately after `getCachedActiveRewards`:

```ts
// ── Customer-Facing: Active Boosters ────────────────────────
// Date filtering is done at render time, not here — prevents
// cached `now` timestamp from showing/hiding boosters at wrong times.
export const getCachedActiveBoosters = unstable_cache(
  async () => {
    const { data } = await (supabaseServer.from('loyalty_boosters') as any)
      .select('name, ends_at, starts_at')
      .eq('is_active', true);
    return data || [];
  },
  ['customer-active-boosters'],
  { revalidate: 60, tags: ['loyalty-boosters'] }
);
```

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds with no errors related to `cached-queries.ts`

- [ ] **Step 4: Commit**

```bash
git add src/lib/cached-queries.ts
git commit -m "feat(loyalty): add cached active rewards and boosters fetchers"
```

---

### Task 2: Create skeleton components

**Files:**
- Create: `src/components/loyalty/skeletons.tsx`

- [ ] **Step 1: Create the skeletons file**

Create `src/components/loyalty/skeletons.tsx` with three skeleton components matching the existing card page design language:

```tsx
// ─── Loyalty Page Skeleton Components ─────────────────────────────────────────

function PulseBar({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-stone-100 ${className ?? ''}`} />;
}

export function RedemptionsSkeleton() {
  return (
    <div className="bg-gradient-to-br from-emerald-50 to-emerald-50/50 border-2 border-emerald-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-emerald-100" />
        <PulseBar className="h-3 w-24 !bg-emerald-100" />
      </div>
      <div className="space-y-2.5">
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 bg-white border border-emerald-200/80 rounded-xl px-4 py-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 shrink-0" />
            <div className="flex-1 space-y-2">
              <PulseBar className="h-3.5 w-32 !bg-emerald-100" />
              <PulseBar className="h-2.5 w-24 !bg-emerald-50" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BoosterSkeleton() {
  return (
    <div className="bg-white border border-[#E8E3DA] rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-md bg-purple-100" />
        <PulseBar className="h-3 w-28 !bg-purple-50" />
      </div>
      <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-gradient-to-r from-purple-50 to-violet-50 border border-purple-200/80">
        <div className="w-9 h-9 rounded-lg bg-purple-100 shrink-0" />
        <div className="flex-1 space-y-2">
          <PulseBar className="h-3.5 w-36 !bg-purple-100" />
          <PulseBar className="h-2.5 w-20 !bg-purple-50" />
        </div>
      </div>
    </div>
  );
}

export function ActivitySkeleton() {
  return (
    <div className="bg-white border border-[#E8E3DA] rounded-2xl p-5 shadow-sm">
      <PulseBar className="h-3 w-28 mb-4" />
      <div className="space-y-0.5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 py-3 border-b border-[#F5F1EB] last:border-0">
            <div className="w-8 h-8 rounded-lg bg-stone-100 shrink-0 animate-pulse" />
            <div className="flex-1 space-y-2">
              <PulseBar className="h-3 w-40" />
              <PulseBar className="h-2.5 w-20" />
            </div>
            <PulseBar className="h-5 w-14 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/loyalty/skeletons.tsx
git commit -m "feat(loyalty): add loading skeleton components for streamed sections"
```

---

### Task 3: Create Suspense server components

**Files:**
- Create: `src/components/loyalty/PendingRedemptionsSection.tsx`
- Create: `src/components/loyalty/BoostersSection.tsx`
- Create: `src/components/loyalty/ActivitySection.tsx`

- [ ] **Step 1: Create `PendingRedemptionsSection.tsx`**

This async server component fetches pending redemptions and renders the existing UI block (extracted from `card/[hash]/page.tsx` lines 163-220):

```tsx
import { supabaseServer } from '@/lib/supabase-server';

interface Props {
  cardId: string;
}

function formatExpiryCountdown(expiresAt: string): string {
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'expires today';
  if (diffDays === 1) return '1 day left';
  return `${diffDays} days left`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
  });
}

export default async function PendingRedemptionsSection({ cardId }: Props) {
  const { data } = await (supabaseServer.from('loyalty_redemptions') as any)
    .select('id, expires_at, loyalty_rewards(name)')
    .eq('card_id', cardId)
    .eq('status', 'earned');

  const pendingRedemptions: Array<{
    id: string;
    expires_at: string;
    loyalty_rewards: { name: string } | null;
  }> = data ?? [];

  if (pendingRedemptions.length === 0) return null;

  return (
    <div
      className="bg-gradient-to-br from-emerald-50 to-emerald-50/50 border-2 border-emerald-200 rounded-2xl p-5 shadow-sm relative overflow-hidden"
      role="region"
      aria-label="Rewards ready to claim"
    >
      <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-100/50 rounded-full -translate-y-1/2 translate-x-1/2" aria-hidden="true" />

      <div className="flex items-center gap-2 mb-3 relative z-10">
        <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
          <span className="text-sm" aria-hidden="true">🎁</span>
        </div>
        <h2 className="text-xs font-bold text-emerald-800 uppercase tracking-wide">
          Ready to Claim
        </h2>
        <span className="ml-auto text-[10px] font-bold bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full">
          {pendingRedemptions.length}
        </span>
      </div>

      <ul className="space-y-2.5 relative z-10">
        {pendingRedemptions.map((r) => {
          const isExpiringSoon = new Date(r.expires_at).getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000;
          return (
            <li
              key={r.id}
              className="flex items-center gap-3 bg-white border border-emerald-200/80 rounded-xl px-4 py-3.5 shadow-sm"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-50 flex items-center justify-center shrink-0">
                <span className="text-lg" aria-hidden="true">🎁</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-emerald-900 truncate">
                  {r.loyalty_rewards?.name ?? 'Reward'}
                </p>
                <p className="text-xs text-emerald-600 mt-0.5 flex items-center gap-1">
                  {isExpiringSoon && (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" aria-hidden="true" />
                  )}
                  <span>
                    Claim by {formatDate(r.expires_at)}
                    {' '}
                    <span className="text-emerald-500 font-medium">
                      ({formatExpiryCountdown(r.expires_at)})
                    </span>
                  </span>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-emerald-600/70 mt-3 text-center relative z-10">
        Show this to the cashier to claim your reward
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Create `BoostersSection.tsx`**

This async server component fetches cached boosters and filters by current date at render time:

```tsx
import { getCachedActiveBoosters } from '@/lib/cached-queries';
import BoosterBanner from './BoosterBanner';

export default async function BoostersSection() {
  const allBoosters = await getCachedActiveBoosters();

  // Filter by current date at render time (not in cache)
  const now = new Date().toISOString();
  const activeBoosters = allBoosters.filter(
    (b: { starts_at: string; ends_at: string }) => b.starts_at <= now && b.ends_at >= now,
  );

  if (activeBoosters.length === 0) return null;

  return (
    <div className="bg-white border border-[#E8E3DA] rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-md bg-purple-100 flex items-center justify-center">
          <span className="text-xs" aria-hidden="true">🚀</span>
        </div>
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
          Active Boosters
        </p>
      </div>
      <BoosterBanner boosters={activeBoosters} />
    </div>
  );
}
```

- [ ] **Step 3: Create `ActivitySection.tsx`**

This async server component fetches recent transactions:

```tsx
import { supabaseServer } from '@/lib/supabase-server';
import ActivityList from './ActivityList';

interface Props {
  cardId: string;
}

export default async function ActivitySection({ cardId }: Props) {
  const { data } = await (supabaseServer.from('loyalty_transactions') as any)
    .select('id, type, stamps_delta, points_delta, description, created_at')
    .eq('card_id', cardId)
    .order('created_at', { ascending: false })
    .limit(10);

  return (
    <div className="bg-white border border-[#E8E3DA] rounded-2xl p-5 shadow-sm">
      <ActivityList transactions={data ?? []} />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/loyalty/PendingRedemptionsSection.tsx src/components/loyalty/BoostersSection.tsx src/components/loyalty/ActivitySection.tsx
git commit -m "feat(loyalty): add async server components for streamed sections"
```

---

### Task 4: Refactor card page to use caching + Suspense

**Files:**
- Modify: `app/loyalty/card/[hash]/page.tsx`

- [ ] **Step 1: Update imports**

Replace the top of the file (lines 1-7). Remove `BoosterBanner` and `ActivityList` imports, add Suspense and the new components:

```tsx
import { Suspense } from 'react';
import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase-server';
import { isTokenExpired } from '@/lib/loyalty-hash';
import { getCachedActiveRewards } from '@/lib/cached-queries';
import StampGrid from '@/components/loyalty/StampGrid';
import PointsBar from '@/components/loyalty/PointsBar';
import PendingRedemptionsSection from '@/components/loyalty/PendingRedemptionsSection';
import BoostersSection from '@/components/loyalty/BoostersSection';
import ActivitySection from '@/components/loyalty/ActivitySection';
import { RedemptionsSkeleton, BoosterSkeleton, ActivitySkeleton } from '@/components/loyalty/skeletons';
```

- [ ] **Step 2: Simplify the data fetching section**

Replace the current `Promise.all` block (lines 86-136) with:

```tsx
  // ── 3. Load goal reward from cached rewards catalog ──────────────────────
  const rewards = await getCachedActiveRewards();
  const goalReward = card.goal_reward_id
    ? rewards.find((r: any) => r.id === card.goal_reward_id) ?? null
    : null;

  // ── 4. Derived values ─────────────────────────────────────────────────────
  const customerName: string = card.customers?.name ?? 'Friend';
  const firstName = customerName.split(' ')[0];
  const cardCode: string = card.card_code;
  const currentStamps: number = card.current_stamps ?? 0;
  const currentPoints: number = card.current_points ?? 0;
  const lifetimePoints: number = card.lifetime_points ?? 0;
  const goalStamps: number | null = goalReward?.stamps_required ?? null;
```

- [ ] **Step 3: Replace the render section with Suspense boundaries**

Replace the content stack section (inside `<div className="px-4 space-y-4 -mt-4 relative z-10">`) with:

```tsx
          {/* ── Pending redemptions (streamed) ─────────────────────────── */}
          <Suspense fallback={<RedemptionsSkeleton />}>
            <PendingRedemptionsSection cardId={card.id} />
          </Suspense>

          {/* ── Progress card ──────────────────────────────────────────── */}
          <div className="bg-white border border-[#E8E3DA] rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-[#3D8A80]/10 flex items-center justify-center">
                  <span className="text-xs" aria-hidden="true">⭐</span>
                </div>
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
                  Your Goal
                </p>
              </div>
              <Link
                href={`/loyalty/card/${hash}/goals`}
                className="text-xs font-semibold text-[#3D8A80] hover:text-[#2D6B63] transition-colors px-2 py-1 rounded-md hover:bg-[#3D8A80]/5"
              >
                Change
              </Link>
            </div>

            {goalReward ? (
              <>
                <p className="text-base font-bold text-stone-800 mb-4">
                  {goalReward.name}
                </p>
                <StampGrid currentStamps={currentStamps} goalStamps={goalStamps} />
              </>
            ) : (
              <div className="text-center py-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#F0EBE0] to-[#E8E3DA] flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl" aria-hidden="true">🎯</span>
                </div>
                <p className="text-sm font-medium text-stone-700 mb-1">
                  No goal selected yet
                </p>
                <p className="text-xs text-stone-400 mb-4 max-w-[220px] mx-auto">
                  Choose a reward to work toward and track your progress here.
                </p>
                <StampGrid currentStamps={currentStamps} goalStamps={null} />
                <Link
                  href={`/loyalty/card/${hash}/goals`}
                  className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold text-white bg-gradient-to-r from-[#3D8A80] to-[#5AAF9E] px-5 py-2.5 rounded-xl hover:opacity-90 active:opacity-80 transition-opacity shadow-sm"
                >
                  Pick a Reward Goal
                </Link>
              </div>
            )}
          </div>

          {/* ── Points bar ─────────────────────────────────────────────── */}
          <div className="bg-white border border-[#E8E3DA] rounded-2xl overflow-hidden shadow-sm">
            <PointsBar currentPoints={currentPoints} lifetimePoints={lifetimePoints} />
          </div>

          {/* ── Active boosters (streamed, cached) ─────────────────────── */}
          <Suspense fallback={<BoosterSkeleton />}>
            <BoostersSection />
          </Suspense>

          {/* ── Activity list (streamed) ───────────────────────────────── */}
          <Suspense fallback={<ActivitySkeleton />}>
            <ActivitySection cardId={card.id} />
          </Suspense>

          {/* ── View all rewards CTA ───────────────────────────────────── */}
          <Link
            href={`/loyalty/card/${hash}/goals`}
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl
              bg-gradient-to-r from-[#3D8A80] to-[#5AAF9E]
              text-sm font-bold text-white
              hover:opacity-90 active:opacity-80
              transition-opacity shadow-sm shadow-[#3D8A80]/20"
          >
            Browse All Rewards
          </Link>

          {/* ── Footer ─────────────────────────────────────────────────── */}
          <p className="text-[11px] text-stone-400 text-center pt-2 pb-4">
            Starr&apos;s Famous Shakes Loyalty Program
          </p>
```

- [ ] **Step 4: Verify build**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add app/loyalty/card/\[hash\]/page.tsx
git commit -m "feat(loyalty): add caching + Suspense streaming to card page"
```

---

### Task 5: Refactor goals page to use cached rewards

**Files:**
- Modify: `app/loyalty/card/[hash]/goals/page.tsx`

- [ ] **Step 1: Add the cached import**

Add to imports (after line 3):

```tsx
import { getCachedActiveRewards } from '@/lib/cached-queries';
```

- [ ] **Step 2: Replace the direct rewards query**

Replace the direct query block (lines 67-74):

```tsx
  // ── 3. Load active rewards (cached) ──────────────────────────────────────
  const rewards: LoyaltyReward[] = await getCachedActiveRewards();
```

This replaces the 6-line Supabase query with a single cached call.

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add app/loyalty/card/\[hash\]/goals/page.tsx
git commit -m "feat(loyalty): use cached rewards on goals page"
```

---

### Task 6: Manual verification

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Test card page loads**

Open a loyalty card URL. Verify:
- Header (name, card code) renders immediately
- Stamp grid and points bar appear quickly
- Redemptions, boosters, and activity sections stream in with skeleton loading states
- All data renders correctly once streamed

- [ ] **Step 3: Test goals page loads**

Navigate to the goals page. Verify:
- Rewards list loads from cache (should be faster than before)
- All rewards display correctly with progress indicators

- [ ] **Step 4: Final commit (if any cleanup needed)**

```bash
git add -A
git commit -m "feat(loyalty): caching + streaming complete"
```
