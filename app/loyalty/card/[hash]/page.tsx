import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase-server';
import { isTokenExpired } from '@/lib/loyalty-hash';
import StampGrid from '@/components/loyalty/StampGrid';
import PointsBar from '@/components/loyalty/PointsBar';
import BoosterBanner from '@/components/loyalty/BoosterBanner';
import ActivityList from '@/components/loyalty/ActivityList';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ hash: string }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Error State ─────────────────────────────────────────────────────────────

function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#FAF8F5] dark:bg-[#0d1117]">
      <div className="max-w-md w-full bg-white dark:bg-[#161b22] border border-[#E8E3DA] dark:border-[#2a3040] rounded-2xl p-8 text-center shadow-sm">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#3D8A80] to-[#7BBFB5] flex items-center justify-center mx-auto mb-4">
          <span className="text-white text-xl">⭐</span>
        </div>
        <h1 className="text-lg font-semibold text-stone-800 dark:text-[#e6e6e6] mb-2">
          Starr&apos;s Famous Shakes
        </h1>
        <p className="text-sm text-stone-500 dark:text-[#999] mt-4">{message}</p>
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
            .select('id, name, stamps_required, points_required, icon')
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
  const cardCode: string = card.card_code;
  const currentStamps: number = card.current_stamps ?? 0;
  const currentPoints: number = card.current_points ?? 0;
  const lifetimePoints: number = card.lifetime_points ?? 0;
  const goalStamps: number | null = goalReward?.stamps_required ?? null;

  // ── 5. Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0d1117] pb-10">
      <div className="max-w-md mx-auto">

        {/* ── Teal gradient header ─────────────────────────────────────────── */}
        <div className="bg-gradient-to-br from-[#3D8A80] to-[#7BBFB5] px-6 pt-10 pb-8 text-center">
          <p className="text-lg font-semibold text-white">
            Hi, {customerName}! ⭐
          </p>
          <p className="text-sm text-white/70 mt-1 font-mono tracking-widest">{cardCode}</p>
        </div>

        {/* ── Content stack ────────────────────────────────────────────────── */}
        <div className="px-4 space-y-4 -mt-2">

          {/* Progress card */}
          <div className="bg-white dark:bg-[#161b22] border border-[#E8E3DA] dark:border-[#2a3040] rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-stone-500 dark:text-[#999] uppercase tracking-wide">
                Your Goal
              </p>
              <Link
                href={`/loyalty/card/${hash}/goals`}
                className="text-xs font-medium text-[#3D8A80] dark:text-[#7BBFB5] hover:opacity-80 transition-opacity"
              >
                Change &rsaquo;
              </Link>
            </div>

            {goalReward ? (
              <>
                <div className="flex items-center gap-2 mb-4">
                  {goalReward.icon && (
                    <span className="text-2xl leading-none">{goalReward.icon}</span>
                  )}
                  <p className="text-base font-semibold text-stone-800 dark:text-[#e6e6e6]">
                    {goalReward.name}
                  </p>
                </div>
                <StampGrid currentStamps={currentStamps} goalStamps={goalStamps} />
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-stone-500 dark:text-[#999] mb-3">
                  No goal selected yet.
                </p>
                <StampGrid currentStamps={currentStamps} goalStamps={null} />
                <Link
                  href={`/loyalty/card/${hash}/goals`}
                  className="inline-block mt-3 text-sm font-medium text-[#3D8A80] dark:text-[#7BBFB5] hover:opacity-80 transition-opacity"
                >
                  Pick a reward goal →
                </Link>
              </div>
            )}
          </div>

          {/* Points bar */}
          <div className="bg-white dark:bg-[#161b22] border border-[#E8E3DA] dark:border-[#2a3040] rounded-2xl overflow-hidden shadow-sm">
            <PointsBar currentPoints={currentPoints} lifetimePoints={lifetimePoints} />
          </div>

          {/* Active boosters */}
          {boosters.length > 0 && (
            <div className="bg-white dark:bg-[#161b22] border border-[#E8E3DA] dark:border-[#2a3040] rounded-2xl p-5 shadow-sm">
              <p className="text-xs font-semibold text-stone-500 dark:text-[#999] uppercase tracking-wide mb-3">
                Active Boosters
              </p>
              <BoosterBanner boosters={boosters} />
            </div>
          )}

          {/* Pending redemptions */}
          {pendingRedemptions.length > 0 && (
            <div className="bg-white dark:bg-[#161b22] border border-[#E8E3DA] dark:border-[#2a3040] rounded-2xl p-5 shadow-sm">
              <p className="text-xs font-semibold text-stone-500 dark:text-[#999] uppercase tracking-wide mb-3">
                Ready to Claim
              </p>
              <ul className="space-y-3">
                {pendingRedemptions.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xl leading-none shrink-0">🎁</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 truncate">
                          {r.loyalty_rewards?.name ?? 'Reward'}
                        </p>
                        <p className="text-xs text-emerald-600 dark:text-emerald-500">
                          Claim by {formatDate(r.expires_at)}{' '}
                          <span className="text-emerald-500 dark:text-emerald-600">
                            ({formatExpiryCountdown(r.expires_at)})
                          </span>
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Activity list */}
          <div className="bg-white dark:bg-[#161b22] border border-[#E8E3DA] dark:border-[#2a3040] rounded-2xl p-5 shadow-sm">
            <ActivityList transactions={transactions} />
          </div>

          {/* View all rewards CTA */}
          <Link
            href={`/loyalty/card/${hash}/goals`}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl
              bg-white dark:bg-[#161b22]
              border border-[#E8E3DA] dark:border-[#2a3040]
              text-sm font-semibold text-stone-700 dark:text-[#ccc]
              hover:bg-[#F0EBE0] dark:hover:bg-[#1a1f2e]
              transition-colors shadow-sm"
          >
            View All Rewards 🏆
          </Link>

        </div>
      </div>
    </div>
  );
}
