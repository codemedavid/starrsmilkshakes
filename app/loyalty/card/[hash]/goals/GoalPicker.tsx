'use client';

import { useState } from 'react';
import { setGoal } from '@/actions/loyalty';
import GoalCard from '@/components/loyalty/GoalCard';
import type { LoyaltyGoal } from '@/types/loyalty';

interface GoalPickerProps {
  card: {
    id: string;
    current_stamps: number;
    current_points: number;
    goal_id: string | null;
  };
  goals: LoyaltyGoal[];
  hash: string;
}

export default function GoalPicker({ card, goals, hash }: GoalPickerProps) {
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (goalId: string) => {
    setSelecting(goalId);
    setError(null);

    try {
      const result = await setGoal(card.id, goalId);
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
    <div className="space-y-3" role="radiogroup" aria-label="Available goals">
      {/* Instruction text */}
      <p className="text-xs text-stone-400 px-1">
        Tap a goal to set it as your target
      </p>

      {/* Error feedback */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {goals.map((goal) => (
        <GoalCard
          key={goal.id}
          goal={goal}
          currentStamps={card.current_stamps}
          currentPoints={card.current_points}
          isCurrentGoal={card.goal_id === goal.id}
          onSelect={handleSelect}
          selecting={selecting === goal.id}
        />
      ))}
    </div>
  );
}
