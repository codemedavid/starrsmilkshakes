import { Suspense } from 'react';
import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase-server';
import { isTokenExpired } from '@/lib/loyalty-hash';
import { getCachedActiveGoals, getCachedActiveMilestones } from '@/lib/cached-queries';
import StampGrid from '@/components/loyalty/StampGrid';
import PointsBar from '@/components/loyalty/PointsBar';
import MilestoneLadder from '@/components/loyalty/MilestoneLadder';
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

  // ── 3. Load goal from cached goals catalog ───────────────────────────────
  const [goals, activeMilestones] = await Promise.all([
    getCachedActiveGoals(),
    getCachedActiveMilestones(),
  ]);
  const goal = card.goal_id
    ? goals.find((g: any) => g.id === card.goal_id) ?? null
    : null;

  // ── 4. Load milestone claims for this card+goal ───────────────────────────
  const { data: milestoneClaims } = await supabaseServer
    .from('loyalty_milestone_claims')
    .select('*, loyalty_milestones(name, stamps_required)')
    .eq('card_id', card.id)
    .eq('goal_id', card.goal_id ?? '');

  // ── 5. Derived values ─────────────────────────────────────────────────────
  const customerName: string = card.customers?.name ?? 'Friend';
  const firstName = customerName.split(' ')[0];
  const cardCode: string = card.card_code;
  const currentStamps: number = card.current_stamps ?? 0;
  const currentPoints: number = card.current_points ?? 0;
  const lifetimePoints: number = card.lifetime_points ?? 0;
  const goalStamps: number | null = goal?.stamps_required ?? null;

  // ── 6. Render ──────────────────────────────────────────────────────────────

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
            </div>

            {card.goal_id && goal ? (
              <>
                <p className="text-base font-bold text-stone-800 mb-4">
                  {goal.name}
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
                  Pick Your Goal
                </Link>
              </div>
            )}
          </div>

          {/* ── Milestone ladder ───────────────────────────────────────── */}
          {activeMilestones.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm">
              <MilestoneLadder
                milestones={activeMilestones}
                claims={milestoneClaims ?? []}
                currentStamps={currentStamps}
              />
            </div>
          )}

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

          {/* ── Footer ─────────────────────────────────────────────────── */}
          <p className="text-[11px] text-stone-400 text-center pt-2 pb-4">
            Starr&apos;s Famous Shakes Loyalty Program
          </p>

        </div>
      </div>
    </div>
  );
}
