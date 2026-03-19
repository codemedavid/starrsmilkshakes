// ─── PointsBar ────────────────────────────────────────────────────────────────

interface PointsBarProps {
  currentPoints: number;
  lifetimePoints: number;
}

function formatPoints(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return n.toLocaleString();
}

export default function PointsBar({ currentPoints, lifetimePoints }: PointsBarProps) {
  return (
    <div className="grid grid-cols-2 divide-x divide-[#E8E3DA]" role="group" aria-label="Points summary">
      {/* Current points */}
      <div className="px-5 py-5 text-center">
        <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest mb-2">
          Available
        </p>
        <div className="flex items-baseline justify-center gap-1">
          <p className="text-3xl font-bold text-amber-500 leading-none tabular-nums">
            {formatPoints(currentPoints)}
          </p>
          <span className="text-xs font-medium text-amber-400">pts</span>
        </div>
        <p className="text-[11px] text-stone-400 mt-1.5">ready to spend</p>
      </div>

      {/* Lifetime points */}
      <div className="px-5 py-5 text-center">
        <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest mb-2">
          All-Time
        </p>
        <div className="flex items-baseline justify-center gap-1">
          <p className="text-3xl font-bold text-stone-600 leading-none tabular-nums">
            {formatPoints(lifetimePoints)}
          </p>
          <span className="text-xs font-medium text-stone-400">pts</span>
        </div>
        <p className="text-[11px] text-stone-400 mt-1.5">total earned</p>
      </div>
    </div>
  );
}
