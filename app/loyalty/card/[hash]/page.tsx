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

// ─── Types ────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ hash: string }>;
}

// ─── Error State ─────────────────────────────────────────────────────────────

function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#FAF8F5]">
      <div className="max-w-md w-full bg-white border border-[#E8E3DA] rounded-2xl p-8 text-center shadow-sm">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#3D8A80] to-[#7BBFB5] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-[#3D8A80]/20">
          <span className="text-white text-2xl">⭐</span>
        </div>
        <h1 className="text-lg font-semibold text-stone-800 mb-2">
          Starr&apos;s Famous Shakes
        </h1>
        <p className="text-sm text-stone-500 mt-4 leading-relaxed">{message}</p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function CardPage({ params }: PageProps) {
  const { hash } = await params;

  // ── 1. Validate session ───────────────────────────────────────────────────

  const { data: session } = await (supabaseServer.from('loyalty_sessions') as any)
    .select('*')
    .eq('token', hash)
    .eq('purpose', 'card_view')
    .single();

  if (!session) {
    return <ErrorState message="Invalid or expired link. Open Messenger to get a new one." />;
  }

  if (isTokenExpired(session.expires_at)) {
    return <ErrorState message="This link has expired. Open Messenger to get a fresh one." />;
  }

  const psid: string = session.psid;

  // ── 2. Load card (need customer_id for subsequent queries) ────────────────

  const { data: card } = await (supabaseServer.from('loyalty_cards') as any)
    .select('*, customers!inner(name)')
    .eq('customers.messenger_psid', psid)
    .single();

  if (!card) {
    return <ErrorState message="No loyalty card found. Open Messenger to register." />;
  }

  // ── 3. Load all remaining data in parallel ────────────────────────────────

  const now = new Date().toISOString();

  const [goalRewardResult, boostersResult, transactionsResult, redemptionsResult] =
    await Promise.all([
      // Goal reward
      card.goal_reward_id
        ? (supabaseServer.from('loyalty_rewards') as any)
            .select('id, name, stamps_required, points_required, image_url')
            .eq('id', card.goal_reward_id)
            .single()
        : Promise.resolve({ data: null }),

      // Active boosters
      (supabaseServer.from('loyalty_boosters') as any)
        .select('name, ends_at')
        .eq('is_active', true)
        .lte('starts_at', now)
        .gte('ends_at', now),

      // Recent transactions (last 10)
      (supabaseServer.from('loyalty_transactions') as any)
        .select('id, type, stamps_delta, points_delta, description, created_at')
        .eq('card_id', card.id)
        .order('created_at', { ascending: false })
        .limit(10),

      // Pending redemptions
      (supabaseServer.from('loyalty_redemptions') as any)
        .select('id, expires_at, loyalty_rewards(name)')
        .eq('card_id', card.id)
        .eq('status', 'earned'),
    ]);

  const goalReward = goalRewardResult.data ?? null;
  const boosters: Array<{ name: string; ends_at: string }> = boostersResult.data ?? [];
  const transactions = transactionsResult.data ?? [];
  const pendingRedemptions: Array<{
    id: string;
    expires_at: string;
    loyalty_rewards: { name: string } | null;
  }> = redemptionsResult.data ?? [];

  // ── 4. Derived values ─────────────────────────────────────────────────────

  const customerName: string = card.customers?.name ?? 'Friend';
  const firstName = customerName.split(' ')[0];
  const cardCode: string = card.card_code;
  const currentStamps: number = card.current_stamps ?? 0;
  const currentPoints: number = card.current_points ?? 0;
  const lifetimePoints: number = card.lifetime_points ?? 0;
  const goalStamps: number | null = goalReward?.stamps_required ?? null;

  // ── 5. Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#FAF8F5] pb-12">
      <div className="max-w-md mx-auto">

        {/* ── Teal gradient header ─────────────────────────────────────────── */}
        <div className="bg-gradient-to-br from-[#3D8A80] to-[#7BBFB5] px-6 pt-12 pb-10 text-center relative overflow-hidden">
          {/* Subtle decorative circles */}
          <div className="absolute top-4 right-4 w-24 h-24 rounded-full bg-white/5" aria-hidden="true" />
          <div className="absolute -bottom-6 -left-6 w-32 h-32 rounded-full bg-white/5" aria-hidden="true" />

          <p className="text-xs font-medium text-white/60 uppercase tracking-widest mb-1 relative z-10">
            Welcome back
          </p>
          <h1 className="text-xl font-bold text-white relative z-10">
            {firstName}
          </h1>
          <p className="text-xs text-white/50 mt-2 font-mono tracking-[0.25em] relative z-10">{cardCode}</p>
        </div>

        {/* ── Content stack ────────────────────────────────────────────────── */}
        <div className="px-4 space-y-4 -mt-4 relative z-10">

          {/* ── Pending redemptions (PRIORITY: show at top!) ──────────────── */}
          {pendingRedemptions.length > 0 && (
            <div
              className="bg-gradient-to-br from-emerald-50 to-emerald-50/50 border-2 border-emerald-200 rounded-2xl p-5 shadow-sm relative overflow-hidden"
              role="region"
              aria-label="Rewards ready to claim"
            >
              {/* Celebration decoration */}
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
          )}

          {/* ── Progress card ──────────────────────────────────────────────── */}
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

          {/* ── Points bar ─────────────────────────────────────────────────── */}
          <div className="bg-white border border-[#E8E3DA] rounded-2xl overflow-hidden shadow-sm">
            <PointsBar currentPoints={currentPoints} lifetimePoints={lifetimePoints} />
          </div>

          {/* ── Active boosters ────────────────────────────────────────────── */}
          {boosters.length > 0 && (
            <div className="bg-white border border-[#E8E3DA] rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-md bg-purple-100 flex items-center justify-center">
                  <span className="text-xs" aria-hidden="true">🚀</span>
                </div>
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
                  Active Boosters
                </p>
              </div>
              <BoosterBanner boosters={boosters} />
            </div>
          )}

          {/* ── Activity list ──────────────────────────────────────────────── */}
          <div className="bg-white border border-[#E8E3DA] rounded-2xl p-5 shadow-sm">
            <ActivityList transactions={transactions} />
          </div>

          {/* ── View all rewards CTA ───────────────────────────────────────── */}
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

          {/* ── Footer ─────────────────────────────────────────────────────── */}
          <p className="text-[11px] text-stone-400 text-center pt-2 pb-4">
            Starr&apos;s Famous Shakes Loyalty Program
          </p>

        </div>
      </div>
    </div>
  );
}
