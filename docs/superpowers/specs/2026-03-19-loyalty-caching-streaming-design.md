# Loyalty Page Caching & Streaming Design

**Date**: 2026-03-19
**Status**: Approved
**Approach**: Cached data functions + Suspense streaming (Approach B)

## Problem

All loyalty pages are pure SSR — every request hits Supabase for everything (session, card, rewards, boosters, transactions, redemptions). Shared data like the rewards catalog and active boosters is fetched fresh on every page load even though it rarely changes. This creates unnecessary database load and slower page renders.

## Solution

Two changes:

1. **Cache shared data** using `unstable_cache` from `next/cache` with tag-based invalidation
2. **Stream secondary sections** using React Suspense so the card header renders instantly

## Architecture

### Data Classification

| Data | Cached? | Reason |
|------|---------|--------|
| Session validation | No | Security — must validate per-request |
| Loyalty card (stamps, points, goal) | No | Per-user, changes on every order |
| Rewards catalog | Yes, tag: `loyalty-rewards` | Shared, changes only via admin |
| Active boosters | Yes, tag: `loyalty-boosters` | Shared, changes only via admin |
| Goal reward (by ID) | No (derived from cached rewards) | Looked up in-memory from cached catalog |
| Transactions (last 10) | No | Per-user, changes on every order |
| Pending redemptions | No | Per-user, changes on redemption |

### Tag Invalidation (already wired)

| Tag | Invalidated in | Actions |
|-----|---------------|---------|
| `loyalty-rewards` | `src/actions/loyalty-admin.ts` | createReward, updateReward, toggleReward |
| `loyalty-boosters` | `src/actions/loyalty-admin.ts` | createBooster, updateBooster, toggleBooster |

No new `revalidateTag` calls needed — the admin actions already handle this.

## Modified Files

### `src/lib/cached-queries.ts` — Add customer-facing cached functions

Add two new functions alongside the existing admin-facing ones. The existing `getCachedLoyaltyRewards` and `getCachedLoyaltyBoosters` return all records (unfiltered) for the admin dashboard. The new functions filter for customer-facing display:

```ts
// Customer-facing: only active rewards, ordered by sort_order
export const getCachedActiveRewards = unstable_cache(
  async () => {
    const { data } = await (supabaseServer.from('loyalty_rewards') as any)
      .select('id, name, description, image_url, stamps_required, points_required, is_active, sort_order, created_at, updated_at')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    return data || [];
  },
  ['customer-active-rewards'],
  { revalidate: 60, tags: ['loyalty-rewards'] }
);

// Customer-facing: active boosters (is_active=true, no date filter — date filtering at render time)
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

**TTL convention**: Uses `revalidate: 60` to match the existing project convention as a safety net alongside tag-based invalidation. This prevents indefinite staleness if a code path ever modifies data without calling `revalidateTag`.

**Booster date filtering**: Boosters are cached without date range filtering. The `starts_at`/`ends_at` filter is applied at **render time** in the component, not in the cached query. This prevents the cached `now` timestamp from causing boosters to appear/disappear at wrong times.

**Goal reward lookup**: No separate `getCachedGoalReward(id)` function. Instead, the card page calls `getCachedActiveRewards()` and uses `.find(r => r.id === card.goal_reward_id)` in memory. The rewards catalog is small (likely <50 items) so this has zero performance cost and avoids extra cache entries.

### New Suspense Server Components (in `src/components/loyalty/`)

Three new async server components that fetch their own data:

- **`PendingRedemptionsSection.tsx`** — accepts `cardId` prop, queries pending redemptions, renders the existing redemptions UI block
- **`BoostersSection.tsx`** — calls `getCachedActiveBoosters()`, filters by current date at render time, renders the existing booster banner
- **`ActivitySection.tsx`** — accepts `cardId` prop, queries last 10 transactions, renders the existing activity list

### New Skeleton Components (in `src/components/loyalty/`)

Three loading skeletons matching existing card design (`bg-white border-[#E8E3DA] rounded-2xl`):

- **`RedemptionsSkeleton.tsx`** — green-tinted card with 2 pulsing rows
- **`BoosterSkeleton.tsx`** — single card with purple-tinted pulsing row
- **`ActivitySkeleton.tsx`** — card with 4 pulsing rows

All use Tailwind `animate-pulse` on `bg-stone-100` bars. No new dependencies.

### `app/loyalty/card/[hash]/page.tsx`

- Remove inline queries for boosters, transactions, and pending redemptions from the main `Promise.all`
- Replace direct goal reward query with `getCachedActiveRewards()` + `.find()`
- Wrap secondary sections in `<Suspense>` boundaries with skeleton fallbacks
- The page now renders session + card + goal immediately, streams the rest

Page structure after changes:

```
CardPage (async server component)
├── Session validation (uncached, blocks render)
├── Card fetch (uncached, blocks render)
├── getCachedActiveRewards() → .find(goalId) (cached, fast)
├── Header + StampGrid + PointsBar (renders immediately)
├── <Suspense fallback={<RedemptionsSkeleton />}>
│   └── PendingRedemptionsSection cardId={card.id}
├── <Suspense fallback={<BoosterSkeleton />}>
│   └── BoostersSection
└── <Suspense fallback={<ActivitySkeleton />}>
    └── ActivitySection cardId={card.id}
```

### `app/loyalty/card/[hash]/goals/page.tsx`

- Replace direct rewards query with `getCachedActiveRewards()`
- No Suspense needed — page is simple (card data + cached rewards list)

## What Does NOT Change

- Session validation logic (per-request, security)
- Card data fetching (per-user, always fresh)
- Register page (one-time flow, not performance-sensitive)
- All existing server actions in `src/actions/loyalty.ts`
- All existing client components (StampGrid, PointsBar, GoalPicker, BoosterBanner, ActivityList, RewardCard)
- Existing admin cached functions in `cached-queries.ts`
- Layout file (`app/loyalty/layout.tsx`)
- Next.js version (stays on 15.5.10)

## Performance Impact

| Metric | Before | After |
|--------|--------|-------|
| Render-blocking DB queries (card page) | 6 (all sequential/parallel before any paint) | 2 (session + card; goal derived from cache) |
| Total DB queries per card page load | 6 | 4 (session + card blocking, transactions + redemptions streamed) |
| Shared data queries (rewards, boosters) | Every request | Cached; refreshed on admin change or every 60s |
| Time to first meaningful paint | Blocked on all 6 queries | Immediate after session + card (2 queries) |
| Goals page render-blocking queries | 3 (session + card + rewards) | 2 (session + card; rewards cached) |

## Dependencies

- `unstable_cache` from `next/cache` (available in Next.js 15.5.10, already used in `src/lib/cached-queries.ts`)
- No new npm packages required
