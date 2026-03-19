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

  const handleSelect = async (rewardId: string) => {
    setSelecting(rewardId);
    const result = await setGoal(card.id, rewardId);
    if (result.success) {
      window.location.href = `/loyalty/card/${hash}`;
    }
    setSelecting(null);
  };

  return (
    <div className="space-y-3">
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
