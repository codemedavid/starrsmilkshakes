'use client';

import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { getCardByCustomerId } from '@/actions/loyalty';

interface Props {
  customerId: string;
}

export default function CustomerLoyaltyWidget({ customerId }: Props) {
  const [card, setCard] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const result = await getCardByCustomerId(customerId);
        if (!cancelled && result.success) {
          setCard(result.data ?? null);
        }
      } catch {
        // silently fail — widget is non-critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (loading) {
    return (
      <div className="bg-[#F8F6F3] rounded-xl p-4 mt-4 animate-pulse">
        <div className="h-4 bg-[#E8E3DA] rounded w-1/3 mb-2" />
        <div className="h-2 bg-[#E8E3DA] rounded w-full" />
      </div>
    );
  }

  if (!card) {
    return (
      <div className="bg-[#F8F6F3] rounded-xl p-4 mt-4">
        <p className="text-sm font-nunito text-stone-400 italic">No loyalty card</p>
      </div>
    );
  }

  const goalReward = card.loyalty_rewards ?? null;
  const stampsRequired: number = goalReward?.stamps_required ?? 10;
  const currentStamps: number = card.current_stamps ?? 0;
  const currentPoints: number = card.current_points ?? 0;
  const filledSegments = Math.min(currentStamps, stampsRequired);
  const segments = Array.from({ length: stampsRequired }, (_, i) => i < filledSegments);

  return (
    <div className="bg-[#F8F6F3] rounded-xl p-4 mt-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <Star className="h-3.5 w-3.5 text-[#3D8A80]" />
          <span className="text-xs font-nunito font-semibold text-stone-600 uppercase tracking-wider">
            Loyalty Card
          </span>
        </div>
        <span className="text-xs font-mono text-[#3D8A80]">{card.card_code}</span>
      </div>

      {/* Progress segments */}
      <div className="flex gap-1 mb-2">
        {segments.map((filled, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full flex-1 ${filled ? 'bg-[#3D8A80]' : 'bg-[#E8E3DA]'}`}
          />
        ))}
      </div>

      {/* Stats + Goal */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-nunito font-medium text-[#3D8A80]">
          {currentStamps}/{stampsRequired} ⭐ · {currentPoints} pts
        </span>
        {goalReward?.name && (
          <span className="text-xs font-nunito text-stone-400 truncate max-w-[120px] text-right">
            {goalReward.name}
          </span>
        )}
      </div>
    </div>
  );
}
