import { useCallback, useEffect, useState } from 'react';
import { adminFetch, parseApiResponse } from '@/lib/admin-api';
import { supabase } from '../lib/supabase';
import { mapSiteSettingsRows } from '@/lib/site-settings';
import { SiteSettings } from '../types';

interface UseSiteSettingsOptions {
  admin?: boolean;
}

export const useSiteSettings = ({ admin = false }: UseSiteSettingsOptions = {}) => {
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSiteSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (admin) {
        const response = await adminFetch('/api/admin/site-settings');
        const data = await parseApiResponse<{ siteSettings: SiteSettings }>(response);
        setSiteSettings(data.siteSettings);
        return;
      }

      const { data, error } = await supabase.from('site_settings').select('*').order('id');

      if (error) throw error;

      setSiteSettings(mapSiteSettingsRows(data as any[]));
    } catch (err) {
      console.error('Error fetching site settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch site settings');
    } finally {
      setLoading(false);
    }
  }, [admin]);

  const updateSiteSetting = async (id: string, value: string) => {
    try {
      setError(null);

      if (!admin) {
        throw new Error('Admin access required');
      }

      const response = await adminFetch('/api/admin/site-settings', {
        method: 'PATCH',
        body: JSON.stringify({ updates: { [id]: value } }),
      });

      await parseApiResponse<{ siteSettings: SiteSettings }>(response);

      // Refresh the settings
      await fetchSiteSettings();
    } catch (err) {
      console.error('Error updating site setting:', err);
      setError(err instanceof Error ? err.message : 'Failed to update site setting');
      throw err;
    }
  };

  const updateSiteSettings = async (updates: Partial<SiteSettings>) => {
    try {
      setError(null);

      if (!admin) {
        throw new Error('Admin access required');
      }

      const response = await adminFetch('/api/admin/site-settings', {
        method: 'PATCH',
        body: JSON.stringify({ updates }),
      });

      const data = await parseApiResponse<{ siteSettings: SiteSettings }>(response);
      setSiteSettings(data.siteSettings);
    } catch (err) {
      console.error('Error updating site settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to update site settings');
      throw err;
    }
  };

  useEffect(() => {
    void fetchSiteSettings();
  }, [fetchSiteSettings]);

  return {
    siteSettings,
    loading,
    error,
    updateSiteSetting,
    updateSiteSettings,
    refetch: fetchSiteSettings
  };
};
