// ─── StampGrid ────────────────────────────────────────────────────────────────

interface StampGridProps {
  currentStamps: number;
  goalStamps: number | null;
}

export default function StampGrid({ currentStamps, goalStamps }: StampGridProps) {
  // No goal set — show an encouraging counter with visual flair
  if (goalStamps === null) {
    return (
      <div className="text-center py-2" role="status" aria-label={`You have ${currentStamps} starrs`}>
        <div className="inline-flex items-baseline gap-1.5">
          <span className="text-3xl font-bold bg-gradient-to-r from-[#3D8A80] to-[#7BBFB5] bg-clip-text text-transparent">
            {currentStamps}
          </span>
          <span className="text-sm font-medium text-stone-500">starrs collected</span>
        </div>
        <p className="text-xs text-stone-400 mt-1">Pick a goal to see your progress!</p>
      </div>
    );
  }

  const total = goalStamps;
  const filled = Math.min(currentStamps, total);
  const remaining = Math.max(0, total - filled);
  const progressPercent = total > 0 ? Math.round((filled / total) * 100) : 0;
  const isComplete = remaining === 0;
  // The next stamp to fill (for the "glow" effect on the next target)
  const nextSlot = filled + 1;

  return (
    <div role="progressbar" aria-valuenow={filled} aria-valuemin={0} aria-valuemax={total} aria-label={`${filled} of ${total} starrs collected`}>
      {/* Grid */}
      <div className="grid grid-cols-5 gap-2.5">
        {Array.from({ length: total }, (_, i) => {
          const slotNumber = i + 1;
          const isFilled = slotNumber <= filled;
          const isLast = slotNumber === total;
          const isNext = slotNumber === nextSlot && !isComplete;

          // Filled stamp
          if (isFilled) {
            return (
              <div
                key={slotNumber}
                className="aspect-square flex items-center justify-center rounded-xl bg-gradient-to-br from-[#3D8A80] to-[#5AAF9E] shadow-md relative overflow-hidden"
                style={{
                  animationDelay: `${i * 60}ms`,
                }}
              >
                {/* Subtle shine overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
                <span className="text-lg leading-none relative z-10" aria-hidden="true">⭐</span>
              </div>
            );
          }

          // Last slot (the reward!)
          if (isLast && !isFilled) {
            return (
              <div
                key={slotNumber}
                className={[
                  'aspect-square flex items-center justify-center rounded-xl border-2 border-dashed relative',
                  isNext
                    ? 'border-[#3D8A80]/50 bg-[#3D8A80]/5'
                    : 'border-[#D5CFC4] bg-[#F8F5EF]',
                ].join(' ')}
              >
                <div className="flex flex-col items-center">
                  <span className="text-lg leading-none" aria-hidden="true">🎁</span>
                </div>
              </div>
            );
          }

          // Next slot to fill (pulsing target)
          if (isNext) {
            return (
              <div
                key={slotNumber}
                className="aspect-square flex items-center justify-center rounded-xl border-2 border-dashed border-[#3D8A80]/40 bg-[#3D8A80]/5 relative"
              >
                <div className="absolute inset-0 rounded-xl border-2 border-[#3D8A80]/20 animate-ping" style={{ animationDuration: '2s' }} />
                <span className="text-xs font-semibold text-[#3D8A80]/60">
                  {slotNumber}
                </span>
              </div>
            );
          }

          // Empty slot
          return (
            <div
              key={slotNumber}
              className="aspect-square flex items-center justify-center rounded-xl bg-[#F8F5EF] border-2 border-dashed border-[#E8E3DA]"
            >
              <span className="text-xs font-medium text-stone-300">
                {slotNumber}
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress bar + text */}
      <div className="mt-4">
        {/* Thin progress bar */}
        <div className="h-1.5 rounded-full bg-[#F0EBE0] overflow-hidden">
          <div
            className={[
              'h-full rounded-full transition-all duration-700 ease-out',
              isComplete
                ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                : 'bg-gradient-to-r from-[#3D8A80] to-[#7BBFB5]',
            ].join(' ')}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex items-center justify-between mt-2">
          <span className="text-sm font-semibold text-stone-700">
            {filled}<span className="text-stone-400 font-normal">/{total}</span> starrs
          </span>
          {isComplete ? (
            <span className="text-sm font-bold text-emerald-600 flex items-center gap-1">
              Goal reached!
            </span>
          ) : remaining === 1 ? (
            <span className="text-sm font-medium text-[#3D8A80]">
              Almost there — 1 more!
            </span>
          ) : (
            <span className="text-xs text-stone-400">
              {remaining} more to go
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
