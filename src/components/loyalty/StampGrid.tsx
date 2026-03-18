// ─── StampGrid ────────────────────────────────────────────────────────────────

interface StampGridProps {
  currentStamps: number;
  goalStamps: number | null;
}

export default function StampGrid({ currentStamps, goalStamps }: StampGridProps) {
  // No goal set — simple text fallback
  if (goalStamps === null) {
    return (
      <p className="text-2xl font-semibold text-[#3D8A80] dark:text-[#7BBFB5]">
        {currentStamps} starrs
      </p>
    );
  }

  const total = goalStamps;
  const filled = Math.min(currentStamps, total);
  const remaining = Math.max(0, total - filled);

  return (
    <div>
      {/* Grid */}
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: total }, (_, i) => {
          const slotNumber = i + 1;
          const isFilled = slotNumber <= filled;
          const isLast = slotNumber === total;

          if (isFilled) {
            return (
              <div
                key={slotNumber}
                className="aspect-square flex items-center justify-center rounded-xl bg-[#3D8A80] shadow-sm"
              >
                <span className="text-lg leading-none">⭐</span>
              </div>
            );
          }

          return (
            <div
              key={slotNumber}
              className="aspect-square flex items-center justify-center rounded-xl bg-[#F0EBE0] dark:bg-[#1a1f2e] border-2 border-dashed border-[#D5CFC4] dark:border-[#2a3040]"
            >
              {isLast ? (
                <span className="text-lg leading-none">🎁</span>
              ) : (
                <span className="text-xs font-medium text-stone-400 dark:text-[#555]">
                  {slotNumber}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress text */}
      <div className="flex items-center justify-between mt-3">
        <span className="text-sm font-medium text-stone-700 dark:text-[#ccc]">
          {filled}/{total} starrs
        </span>
        {remaining > 0 ? (
          <span className="text-sm text-stone-500 dark:text-[#999]">
            {remaining} more to go!
          </span>
        ) : (
          <span className="text-sm font-semibold text-[#3D8A80] dark:text-[#7BBFB5]">
            Goal reached! 🎉
          </span>
        )}
      </div>
    </div>
  );
}
