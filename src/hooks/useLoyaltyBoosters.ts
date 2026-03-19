'use client';

import { useState, useCallback } from 'react';
import type { LoyaltyBooster } from '@/types/loyalty';
import { createBooster, updateBooster, toggleBooster } from '@/actions/loyalty-admin';

export function useLoyaltyBoosters(initialBoosters: LoyaltyBooster[]) {
  const [boosters, setBoosters] = useState<LoyaltyBooster[]>(initialBoosters);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addBooster = useCallback(async (input: unknown) => {
    setSaving(true);
    setError(null);
    const result = await createBooster(input);
    if (result.success && result.data) {
      setBoosters(prev => [result.data as LoyaltyBooster, ...prev]);
    } else {
      setError(result.error ?? 'Failed to create booster');
    }
    setSaving(false);
    return result;
  }, []);

  const editBooster = useCallback(async (id: string, input: unknown) => {
    setSaving(true);
    setError(null);
    const result = await updateBooster(id, input);
    if (result.success && result.data) {
      setBoosters(prev => prev.map(b => b.id === id ? result.data as LoyaltyBooster : b));
    } else {
      setError(result.error ?? 'Failed to update booster');
    }
    setSaving(false);
    return result;
  }, []);

  const toggle = useCallback(async (id: string, isActive: boolean) => {
    // Optimistic update
    setBoosters(prev => prev.map(b => b.id === id ? { ...b, is_active: isActive } : b));
    const result = await toggleBooster(id, isActive);
    if (!result.success) {
      // Rollback
      setBoosters(prev => prev.map(b => b.id === id ? { ...b, is_active: !isActive } : b));
      setError(result.error ?? 'Failed to toggle booster');
    }
    return result;
  }, []);

  return { boosters, addBooster, editBooster, toggle, saving, error, setError };
}
