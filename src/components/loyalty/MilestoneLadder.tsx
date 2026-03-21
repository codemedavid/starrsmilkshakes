'use client';
import type { LoyaltyMilestone, LoyaltyMilestoneClaim } from '@/types/loyalty';

interface MilestoneLadderProps {
  milestones: LoyaltyMilestone[];
  claims: LoyaltyMilestoneClaim[];
  currentStamps: number;
}

export default function MilestoneLadder({ milestones, claims, currentStamps }: MilestoneLadderProps) {
  const claimedIds = new Set(claims.map((c) => c.milestone_id));

  if (milestones.length === 0) return null;

  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Milestones</h3>
      <div className="relative ml-3 border-l-2 border-zinc-700 pl-4 space-y-3">
        {milestones.map((ms) => {
          const earned = claimedIds.has(ms.id);
          const reachable = currentStamps >= ms.stamps_required;
          return (
            <div key={ms.id} className="relative">
              <div
                className={`absolute -left-[1.35rem] top-1 h-3 w-3 rounded-full border-2 ${
                  earned
                    ? 'border-green-400 bg-green-400'
                    : reachable
                      ? 'border-amber-400 bg-amber-400'
                      : 'border-zinc-600 bg-zinc-800'
                }`}
              />
              <div className={earned ? 'opacity-100' : 'opacity-60'}>
                <p className="text-sm font-medium text-zinc-200">
                  {ms.name}
                  {earned && <span className="ml-2 text-xs text-green-400">Earned</span>}
                </p>
                <p className="text-xs text-zinc-500">
                  {ms.stamps_required} stamps
                  {ms.description && ` — ${ms.description}`}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
