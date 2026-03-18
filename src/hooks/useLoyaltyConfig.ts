'use client';

import { useState, useCallback } from 'react';
import type { LoyaltyConfig } from '@/types/loyalty';
import { updateLoyaltyConfig } from '@/actions/loyalty-admin';

export function useLoyaltyConfig(initialConfig: LoyaltyConfig) {
  const [config, setConfig] = useState<LoyaltyConfig>(initialConfig);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveConfig = useCallback(async (updates: Partial<LoyaltyConfig>) => {
    setSaving(true);
    setError(null);
    const updated = { ...config, ...updates };
    setConfig(updated); // optimistic

    const result = await updateLoyaltyConfig({
      stamps_enabled: updated.stamps_enabled,
      points_enabled: updated.points_enabled,
      points_per_peso: updated.points_per_peso,
      stamps_per_order: updated.stamps_per_order,
      filter_mode: updated.filter_mode,
      filtered_category_ids: updated.filtered_category_ids,
      filtered_item_ids: updated.filtered_item_ids,
      claim_window_days: updated.claim_window_days,
    });

    if (!result.success) {
      setConfig(initialConfig); // rollback
      setError(result.error || 'Failed to save');
    }
    setSaving(false);
    return result;
  }, [config, initialConfig]);

  return { config, setConfig, saveConfig, saving, error };
}
