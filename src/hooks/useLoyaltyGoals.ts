'use client';

import { useState, useCallback } from 'react';
import type { LoyaltyGoal } from '@/types/loyalty';
import { createGoal, updateGoal, toggleGoal } from '@/actions/loyalty-admin';

export function useLoyaltyGoals(initialGoals: LoyaltyGoal[]) {
  const [goals, setGoals] = useState<LoyaltyGoal[]>(initialGoals);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addGoal = useCallback(async (input: unknown) => {
    setSaving(true);
    setError(null);
    const result = await createGoal(input);
    if (result.success && result.data) {
      setGoals(prev => [...prev, result.data as LoyaltyGoal]);
    } else {
      setError(result.error ?? 'Failed to create goal');
    }
    setSaving(false);
    return result;
  }, []);

  const editGoal = useCallback(async (id: string, input: unknown) => {
    setSaving(true);
    setError(null);
    const result = await updateGoal(id, input);
    if (result.success && result.data) {
      setGoals(prev => prev.map(g => g.id === id ? result.data as LoyaltyGoal : g));
    } else {
      setError(result.error ?? 'Failed to update goal');
    }
    setSaving(false);
    return result;
  }, []);

  const toggle = useCallback(async (id: string, isActive: boolean) => {
    // Optimistic update
    setGoals(prev => prev.map(g => g.id === id ? { ...g, is_active: isActive } : g));
    const result = await toggleGoal(id, isActive);
    if (!result.success) {
      // Rollback
      setGoals(prev => prev.map(g => g.id === id ? { ...g, is_active: !isActive } : g));
      setError(result.error ?? 'Failed to toggle goal');
    }
    return result;
  }, []);

  return { goals, addGoal, editGoal, toggle, saving, error, setError };
}
