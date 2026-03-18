import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { mapSiteSettingsRows } from '@/lib/site-settings';
import type { SiteSettings } from '../types';

export const useSiteSettings = () => {
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSiteSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('site_settings')
        .select('*')
        .order('id');

      if (fetchError) throw fetchError;

      setSiteSettings(mapSiteSettingsRows(data as any[]));
    } catch (err) {
      console.error('Error fetching site settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch site settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSiteSettings();
  }, [fetchSiteSettings]);

  return {
    siteSettings,
    loading,
    error,
    refetch: fetchSiteSettings,
  };
};
