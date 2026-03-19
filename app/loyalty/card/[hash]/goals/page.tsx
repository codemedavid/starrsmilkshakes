import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase-server';
import { isTokenExpired } from '@/lib/loyalty-hash';
import GoalPicker from './GoalPicker';
import { getCachedActiveRewards } from '@/lib/cached-queries';
import type { LoyaltyReward } from '@/types/loyalty';

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

export default async function GoalsPage({ params }: PageProps) {
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

  // ── 2. Load card ──────────────────────────────────────────────────────────

  const { data: card } = await (supabaseServer.from('loyalty_cards') as any)
    .select('id, current_stamps, current_points, goal_reward_id, customers!inner(name)')
    .eq('customers.messenger_psid', psid)
    .single();

  if (!card) {
    return <ErrorState message="No loyalty card found. Open Messenger to register." />;
  }

  // ── 3. Load active rewards (cached) ──────────────────────────────────────
  const rewards: LoyaltyReward[] = await getCachedActiveRewards();

  // ── 4. Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#FAF8F5] pb-12">
      <div className="max-w-md mx-auto">

        {/* ── Teal gradient header ─────────────────────────────────────────── */}
        <div className="bg-gradient-to-br from-[#3D8A80] to-[#7BBFB5] px-6 pt-12 pb-10 text-center relative overflow-hidden">
          {/* Decorative circles */}
          <div className="absolute top-4 left-4 w-20 h-20 rounded-full bg-white/5" aria-hidden="true" />
          <div className="absolute -bottom-4 -right-4 w-28 h-28 rounded-full bg-white/5" aria-hidden="true" />

          <h1 className="text-xl font-bold text-white relative z-10">Choose Your Goal</h1>
          <p className="text-sm text-white/70 mt-1.5 relative z-10">
            Pick the reward you want to work toward
          </p>

          {/* Stats summary */}
          <div className="flex items-center justify-center gap-4 mt-4 relative z-10">
            <div className="bg-white/15 backdrop-blur-sm rounded-lg px-3 py-1.5">
              <span className="text-xs font-medium text-white">
                {card.current_stamps} ⭐ starrs
              </span>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-lg px-3 py-1.5">
              <span className="text-xs font-medium text-white">
                {card.current_points} pts
              </span>
            </div>
          </div>
        </div>

        {/* ── Content ──────────────────────────────────────────────────────── */}
        <div className="px-4 space-y-4 -mt-4 relative z-10">

          {/* Reward count */}
          {rewards.length > 0 && (
            <p className="text-xs font-medium text-stone-400 text-center pt-2">
              {rewards.length} reward{rewards.length !== 1 ? 's' : ''} available
            </p>
          )}

          {rewards.length === 0 ? (
            <div className="bg-white border border-[#E8E3DA] rounded-2xl p-8 text-center shadow-sm">
              <div className="w-16 h-16 rounded-2xl bg-[#F0EBE0] flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl" aria-hidden="true">🎁</span>
              </div>
              <p className="text-sm font-medium text-stone-700 mb-1">
                No rewards available yet
              </p>
              <p className="text-xs text-stone-400 max-w-[220px] mx-auto">
                New rewards are added regularly. Keep collecting starrs in the meantime!
              </p>
            </div>
          ) : (
            <GoalPicker card={card} rewards={rewards} hash={hash} />
          )}

          {/* Back link */}
          <Link
            href={`/loyalty/card/${hash}`}
            className="flex items-center justify-center gap-1.5 w-full py-3.5 rounded-2xl
              bg-white
              border border-[#E8E3DA]
              text-sm font-semibold text-stone-600
              hover:bg-[#F8F5EF] hover:border-stone-300
              active:bg-[#F0EBE0]
              transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to My Card
          </Link>

        </div>
      </div>
    </div>
  );
}
