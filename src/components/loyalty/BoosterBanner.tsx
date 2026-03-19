// ─── BoosterBanner ────────────────────────────────────────────────────────────

interface Booster {
  name: string;
  ends_at: string;
}

interface BoosterBannerProps {
  boosters: Booster[];
}

function formatCountdown(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours <= 0) return 'Ending soon';
  if (diffHours < 24) return `${diffHours}h left`;
  if (diffDays === 1) return '1 day left';
  return `${diffDays} days left`;
}

function isEndingSoon(iso: string): boolean {
  const diffMs = new Date(iso).getTime() - Date.now();
  const diffHours = diffMs / (1000 * 60 * 60);
  return diffHours < 48;
}

export default function BoosterBanner({ boosters }: BoosterBannerProps) {
  if (boosters.length === 0) return null;

  return (
    <div className="space-y-2" role="list" aria-label="Active boost promotions">
      {boosters.map((booster) => {
        const urgent = isEndingSoon(booster.ends_at);
        return (
          <div
            key={booster.name}
            role="listitem"
            className={[
              'flex items-center gap-3 px-4 py-3.5 rounded-xl relative overflow-hidden',
              'bg-gradient-to-r from-purple-50 to-violet-50 border border-purple-200/80',
            ].join(' ')}
          >
            {/* Decorative shimmer stripe */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -skew-x-12 opacity-50" style={{ width: '30%', left: '-10%' }} />

            <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center shrink-0 relative z-10">
              <span className="text-lg leading-none" aria-hidden="true">🚀</span>
            </div>

            <div className="min-w-0 flex-1 relative z-10">
              <p className="text-sm font-semibold text-purple-900 truncate">
                {booster.name}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {urgent && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" aria-hidden="true" />
                )}
                <p className={[
                  'text-xs font-medium',
                  urgent ? 'text-purple-700' : 'text-purple-500',
                ].join(' ')}>
                  {formatCountdown(booster.ends_at)}
                </p>
              </div>
            </div>

            {/* "ACTIVE" pill */}
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full shrink-0 relative z-10">
              Live
            </span>
          </div>
        );
      })}
    </div>
  );
}
