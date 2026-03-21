'use client';
import { useState, useCallback } from 'react';
import type { LoyaltyMilestone } from '@/types/loyalty';
import { createMilestone, updateMilestone, toggleMilestone } from '@/actions/loyalty-admin';

export function useLoyaltyMilestones(initialMilestones: LoyaltyMilestone[]) {
  const [milestones, setMilestones] = useState(initialMilestones);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addMilestone = useCallback(async (input: Omit<LoyaltyMilestone, 'id' | 'created_at' | 'updated_at'>) => {
    setSaving(true);
    setError(null);
    const result = await createMilestone(input);
    if (result.success && result.data) {
      setMilestones((prev) => [...prev, result.data]);
    } else {
      setError(result.error ?? 'Failed to create milestone');
    }
    setSaving(false);
    return result;
  }, []);

  const editMilestone = useCallback(async (id: string, input: Partial<LoyaltyMilestone>) => {
    setSaving(true);
    setError(null);
    const result = await updateMilestone(id, input);
    if (result.success && result.data) {
      setMilestones((prev) => prev.map((m) => (m.id === id ? result.data : m)));
    } else {
      setError(result.error ?? 'Failed to update milestone');
    }
    setSaving(false);
    return result;
  }, []);

  const toggle = useCallback(async (id: string, isActive: boolean) => {
    setSaving(true);
    setError(null);
    const result = await toggleMilestone(id, isActive);
    if (result.success) {
      setMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, is_active: isActive } : m)));
    } else {
      setError(result.error ?? 'Failed to toggle milestone');
    }
    setSaving(false);
    return result;
  }, []);

  return { milestones, addMilestone, editMilestone, toggle, saving, error, setError };
}
