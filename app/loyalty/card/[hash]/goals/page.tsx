import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase-server';
import { isTokenExpired } from '@/lib/loyalty-hash';
import GoalPicker from './GoalPicker';
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
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#3D8A80] to-[#7BBFB5] flex items-center justify-center mx-auto mb-4">
          <span className="text-white text-xl">⭐</span>
        </div>
        <h1 className="text-lg font-semibold text-stone-800 mb-2">
          Starr&apos;s Famous Shakes
        </h1>
        <p className="text-sm text-stone-500 mt-4">{message}</p>
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

  // ── 3. Load active rewards ────────────────────────────────────────────────

  const { data: rewardsData } = await (supabaseServer.from('loyalty_rewards') as any)
    .select(
      'id, name, description, image_url, stamps_required, points_required, is_active, sort_order, created_at, updated_at',
    )
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  const rewards: LoyaltyReward[] = rewardsData ?? [];

  // ── 4. Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#FAF8F5] pb-10">
      <div className="max-w-md mx-auto">

        {/* ── Teal gradient header ─────────────────────────────────────────── */}
        <div className="bg-gradient-to-br from-[#3D8A80] to-[#7BBFB5] px-6 pt-10 pb-8 text-center">
          <p className="text-2xl font-bold text-white">Choose Your Goal 🎯</p>
          <p className="text-sm text-white/70 mt-1">
            Pick the reward you want to work toward
          </p>
        </div>

        {/* ── Content ──────────────────────────────────────────────────────── */}
        <div className="px-4 space-y-4 mt-4">

          {rewards.length === 0 ? (
            <div className="bg-white border border-[#E8E3DA] rounded-2xl p-6 text-center shadow-sm">
              <p className="text-sm text-stone-500">
                No rewards are available right now. Check back soon!
              </p>
            </div>
          ) : (
            <GoalPicker card={card} rewards={rewards} hash={hash} />
          )}

          {/* Back link */}
          <Link
            href={`/loyalty/card/${hash}`}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl
              bg-white
              border border-[#E8E3DA]
              text-sm font-semibold text-stone-700
              hover:bg-[#F0EBE0]
              transition-colors shadow-sm"
          >
            ← Back to My Card
          </Link>

        </div>
      </div>
    </div>
  );
}
