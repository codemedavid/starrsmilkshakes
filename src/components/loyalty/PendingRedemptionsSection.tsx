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
    .select('id, expires_at, loyalty_goals(name)')
    .eq('card_id', cardId)
    .eq('status', 'earned');

  const pendingRedemptions: Array<{
    id: string;
    expires_at: string;
    loyalty_goals: { name: string } | null;
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
                  {r.loyalty_goals?.name ?? 'Reward'}
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
