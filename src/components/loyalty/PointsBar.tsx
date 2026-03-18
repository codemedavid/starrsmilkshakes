// ─── PointsBar ────────────────────────────────────────────────────────────────

interface PointsBarProps {
  currentPoints: number;
  lifetimePoints: number;
}

function formatPoints(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return n.toString();
}

export default function PointsBar({ currentPoints, lifetimePoints }: PointsBarProps) {
  return (
    <div className="grid grid-cols-2 divide-x divide-[#E8E3DA] dark:divide-[#2a3040]">
      {/* Current points */}
      <div className="px-5 py-4">
        <p className="text-xs font-medium text-stone-500 dark:text-[#999] uppercase tracking-wide mb-1">
          Points
        </p>
        <p className="text-3xl font-bold text-amber-500 dark:text-amber-400 leading-none">
          {formatPoints(currentPoints)}
        </p>
        <p className="text-xs text-stone-400 dark:text-[#555] mt-1">available</p>
      </div>

      {/* Lifetime points */}
      <div className="px-5 py-4">
        <p className="text-xs font-medium text-stone-500 dark:text-[#999] uppercase tracking-wide mb-1">
          Lifetime
        </p>
        <p className="text-3xl font-bold text-stone-700 dark:text-[#ccc] leading-none">
          {formatPoints(lifetimePoints)}
        </p>
        <p className="text-xs text-stone-400 dark:text-[#555] mt-1">earned total</p>
      </div>
    </div>
  );
}
