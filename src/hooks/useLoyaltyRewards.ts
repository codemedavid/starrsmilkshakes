'use client';

import { useState, useCallback } from 'react';
import type { LoyaltyReward } from '@/types/loyalty';
import { createReward, updateReward, toggleReward } from '@/actions/loyalty-admin';

export function useLoyaltyRewards(initialRewards: LoyaltyReward[]) {
  const [rewards, setRewards] = useState<LoyaltyReward[]>(initialRewards);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addReward = useCallback(async (input: unknown) => {
    setSaving(true);
    setError(null);
    const result = await createReward(input);
    if (result.success && result.data) {
      setRewards(prev => [...prev, result.data as LoyaltyReward]);
    } else {
      setError(result.error ?? 'Failed to create reward');
    }
    setSaving(false);
    return result;
  }, []);

  const editReward = useCallback(async (id: string, input: unknown) => {
    setSaving(true);
    setError(null);
    const result = await updateReward(id, input);
    if (result.success && result.data) {
      setRewards(prev => prev.map(r => r.id === id ? result.data as LoyaltyReward : r));
    } else {
      setError(result.error ?? 'Failed to update reward');
    }
    setSaving(false);
    return result;
  }, []);

  const toggle = useCallback(async (id: string, isActive: boolean) => {
    // Optimistic update
    setRewards(prev => prev.map(r => r.id === id ? { ...r, is_active: isActive } : r));
    const result = await toggleReward(id, isActive);
    if (!result.success) {
      // Rollback
      setRewards(prev => prev.map(r => r.id === id ? { ...r, is_active: !isActive } : r));
      setError(result.error ?? 'Failed to toggle reward');
    }
    return result;
  }, []);

  return { rewards, addReward, editReward, toggle, saving, error, setError };
}
