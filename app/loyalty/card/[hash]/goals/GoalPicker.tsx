'use client';

import { useState } from 'react';
import { setGoal } from '@/actions/loyalty';
import RewardCard from '@/components/loyalty/RewardCard';
import type { LoyaltyReward } from '@/types/loyalty';

interface GoalPickerProps {
  card: {
    id: string;
    current_stamps: number;
    current_points: number;
    goal_reward_id: string | null;
  };
  rewards: LoyaltyReward[];
  hash: string;
}

export default function GoalPicker({ card, rewards, hash }: GoalPickerProps) {
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (rewardId: string) => {
    setSelecting(rewardId);
    setError(null);

    try {
      const result = await setGoal(card.id, rewardId);
      if (result.success) {
        window.location.href = `/loyalty/card/${hash}`;
      } else {
        setError('Could not set goal. Please try again.');
        setSelecting(null);
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setSelecting(null);
    }
  };

  return (
    <div className="space-y-3" role="radiogroup" aria-label="Available rewards">
      {/* Instruction text */}
      <p className="text-xs text-stone-400 px-1">
        Tap a reward to set it as your goal
      </p>

      {/* Error feedback */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {rewards.map((reward) => (
        <RewardCard
          key={reward.id}
          reward={reward}
          currentStamps={card.current_stamps}
          currentPoints={card.current_points}
          isCurrentGoal={card.goal_reward_id === reward.id}
          onSelect={handleSelect}
          selecting={selecting === reward.id}
        />
      ))}
    </div>
  );
}
