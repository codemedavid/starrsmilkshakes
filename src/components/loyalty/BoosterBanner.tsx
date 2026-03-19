// ─── BoosterBanner ────────────────────────────────────────────────────────────

interface Booster {
  name: string;
  ends_at: string;
}

interface BoosterBannerProps {
  boosters: Booster[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
  });
}

export default function BoosterBanner({ boosters }: BoosterBannerProps) {
  if (boosters.length === 0) return null;

  return (
    <div className="space-y-2">
      {boosters.map((booster) => (
        <div
          key={booster.name}
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-purple-50 border border-purple-200"
        >
          <span className="text-xl leading-none shrink-0">🚀</span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-purple-900 truncate">
              {booster.name}
            </p>
            <p className="text-xs text-purple-600">
              Until {formatDate(booster.ends_at)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
