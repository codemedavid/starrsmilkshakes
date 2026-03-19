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

  const stampsPercent = Math.round(stampsProgress * 100);
  const pointsPercent = Math.round(pointsProgress * 100);

  // Can they afford it?
  const canAffordStamps = stampsRequired > 0 && currentStamps >= stampsRequired;
  const canAffordPoints = pointsRequired > 0 && currentPoints >= pointsRequired;
  const isAchievable = (stampsRequired === 0 || canAffordStamps) && (pointsRequired === 0 || canAffordPoints);

  return (
    <button
      type="button"
      onClick={() => onSelect(reward.id)}
      disabled={selecting}
      aria-label={`${isCurrentGoal ? 'Current goal: ' : 'Select '}${reward.name}${stampsRequired > 0 ? `, requires ${stampsRequired} starrs` : ''}${pointsRequired > 0 ? `, requires ${pointsRequired} points` : ''}`}
      className={[
        'w-full text-left rounded-2xl p-4 cursor-pointer transition-all duration-200',
        'active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#3D8A80]/40 focus:ring-offset-2',
        isCurrentGoal
          ? 'bg-gradient-to-br from-[#3D8A80]/[0.03] to-[#7BBFB5]/[0.06] border-2 border-[#3D8A80] shadow-md shadow-[#3D8A80]/10'
          : 'bg-white border border-[#E8E3DA] hover:border-[#3D8A80]/30 hover:shadow-md',
        selecting ? 'opacity-60 pointer-events-none' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Current goal badge */}
      {isCurrentGoal && (
        <div className="flex items-center gap-1.5 mb-2.5">
          <span className="inline-block w-2 h-2 rounded-full bg-[#3D8A80]" aria-hidden="true" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#3D8A80]">
            Current Goal
          </span>
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        {/* Left: reward image or icon placeholder + info */}
        <div className="flex gap-3 flex-1 min-w-0">
          {/* Reward thumbnail */}
          {reward.image_url ? (
            <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-[#F8F5EF]">
              <img
                src={reward.image_url}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#F0EBE0] to-[#E8E3DA] flex items-center justify-center shrink-0">
              <span className="text-lg" aria-hidden="true">🎁</span>
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-stone-800 leading-snug">
              {reward.name}
            </p>
            {reward.description && (
              <p className="text-xs text-stone-500 mt-0.5 leading-snug line-clamp-2">
                {reward.description}
              </p>
            )}

            {/* Progress bars */}
            {stampsRequired > 0 && (
              <div className="mt-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium text-stone-500">
                    {currentStamps} / {stampsRequired} starrs
                  </span>
                  <span className="text-[11px] font-semibold text-[#3D8A80]">
                    {stampsPercent}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[#F0EBE0] overflow-hidden">
                  <div
                    className={[
                      'h-full rounded-full transition-all duration-500',
                      canAffordStamps
                        ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                        : 'bg-gradient-to-r from-[#3D8A80] to-[#7BBFB5]',
                    ].join(' ')}
                    style={{ width: `${stampsPercent}%` }}
                  />
                </div>
              </div>
            )}

            {pointsRequired > 0 && (
              <div className="mt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium text-stone-500">
                    {currentPoints} / {pointsRequired} pts
                  </span>
                  <span className="text-[11px] font-semibold text-amber-600">
                    {pointsPercent}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-amber-50 overflow-hidden">
                  <div
                    className={[
                      'h-full rounded-full transition-all duration-500',
                      canAffordPoints
                        ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                        : 'bg-gradient-to-r from-amber-300 to-amber-400',
                    ].join(' ')}
                    style={{ width: `${pointsPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: cost badges + spinner */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {selecting ? (
            <span
              role="status"
              aria-label="Selecting..."
              className="inline-block w-5 h-5 border-2 border-[#3D8A80] border-t-transparent rounded-full animate-spin"
            />
          ) : (
            <>
              {stampsRequired > 0 && (
                <span className={[
                  'text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap',
                  canAffordStamps
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-[#F0EBE0] text-[#3D8A80]',
                ].join(' ')}>
                  {stampsRequired} ⭐
                </span>
              )}
              {pointsRequired > 0 && (
                <span className={[
                  'text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap',
                  canAffordPoints
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-amber-50/50 text-amber-600',
                ].join(' ')}>
                  {pointsRequired} pts
                </span>
              )}
              {isAchievable && (stampsRequired > 0 || pointsRequired > 0) && (
                <span className="text-[10px] font-bold text-emerald-600 mt-0.5">
                  Ready!
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </button>
  );
}
