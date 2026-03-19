'use client';

import type { LoyaltyReward } from '@/types/loyalty';

interface RewardCardProps {
  reward: LoyaltyReward;
  currentStamps: number;
  currentPoints: number;
  isCurrentGoal: boolean;
  onSelect: (rewardId: string) => void;
  selecting: boolean;
}

export default function RewardCard({
  reward,
  currentStamps,
  currentPoints,
  isCurrentGoal,
  onSelect,
  selecting,
}: RewardCardProps) {
  const stampsRequired = reward.stamps_required ?? 0;
  const pointsRequired = reward.points_required ?? 0;

  // Progress toward this reward
  const stampsProgress =
    stampsRequired > 0 ? Math.min(currentStamps / stampsRequired, 1) : 0;
  const pointsProgress =
    pointsRequired > 0 ? Math.min(currentPoints / pointsRequired, 1) : 0;

  // Show progress bar if there's a primary cost metric and user has some progress
  const showStampsBar = stampsRequired > 0 && currentStamps > 0;
  const showPointsBar = pointsRequired > 0 && currentPoints > 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(reward.id)}
      disabled={selecting}
      className={[
        'w-full text-left bg-white dark:bg-[#161b22] rounded-2xl p-4 cursor-pointer transition-all hover:shadow-md',
        isCurrentGoal
          ? 'border-2 border-[#3D8A80]'
          : 'border border-[#E8E3DA] dark:border-[#2a3040]',
        selecting ? 'opacity-60' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: name and description */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-stone-800 dark:text-[#e6e6e6] leading-snug">
            {reward.name}
          </p>
          {reward.description && (
            <p className="text-xs text-stone-500 dark:text-[#999] mt-0.5 leading-snug">
              {reward.description}
            </p>
          )}

          {/* Progress bars */}
          {showStampsBar && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs text-stone-400 dark:text-[#777]">
                  {currentStamps} / {stampsRequired} ⭐
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-stone-100 dark:bg-[#2a3040] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#3D8A80] transition-all"
                  style={{ width: `${stampsProgress * 100}%` }}
                />
              </div>
            </div>
          )}

          {showPointsBar && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs text-stone-400 dark:text-[#777]">
                  {currentPoints} / {pointsRequired} pts
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-stone-100 dark:bg-[#2a3040] overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-400 transition-all"
                  style={{ width: `${pointsProgress * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right: cost badges + spinner */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          {selecting ? (
            <span
              aria-label="Selecting…"
              className="inline-block w-4 h-4 border-2 border-[#3D8A80] border-t-transparent rounded-full animate-spin"
            />
          ) : (
            <>
              {stampsRequired > 0 && (
                <span className="text-[#3D8A80] font-bold text-sm whitespace-nowrap">
                  {stampsRequired} ⭐
                </span>
              )}
              {pointsRequired > 0 && (
                <span className="text-amber-600 dark:text-amber-400 text-sm whitespace-nowrap">
                  {pointsRequired} pts
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </button>
  );
}
