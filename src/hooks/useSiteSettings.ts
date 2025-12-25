import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { SiteSettings, SiteSetting } from '../types';

export const useSiteSettings = () => {
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSiteSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('site_settings')
        .select('*')
        .order('id');

      if (error) throw error;

      const settingsLookup: Record<string, string> = {};
      (data || []).forEach((setting) => {
        settingsLookup[setting.id] = setting.value;
      });

      const getValue = (key: string, fallback = '') =>
        settingsLookup[key] ?? fallback;

      // Transform the data into a more usable format
      const settings: SiteSettings = {
        site_name: getValue('site_name', 'Beracah Cafe'),
        site_logo: getValue('site_logo', ''),
        site_description: getValue('site_description', ''),
        currency: getValue('currency', 'PHP'),
        currency_code: getValue('currency_code', 'PHP'),
        lalamove_market: getValue('lalamove_market', ''),
        lalamove_service_type: getValue('lalamove_service_type', ''),
        lalamove_sandbox: getValue('lalamove_sandbox', 'true'),
        lalamove_api_key: getValue('lalamove_api_key', ''),
        lalamove_api_secret: getValue('lalamove_api_secret', ''),
        lalamove_store_name: getValue('lalamove_store_name', ''),
        lalamove_store_phone: getValue('lalamove_store_phone', ''),
        lalamove_store_address: getValue('lalamove_store_address', ''),
        lalamove_store_latitude: getValue('lalamove_store_latitude', ''),
        lalamove_store_longitude: getValue('lalamove_store_longitude', ''),
        meta_pixel_id: getValue('meta_pixel_id', ''),
        meta_access_token: getValue('meta_access_token', ''),
        meta_test_event_code: getValue('meta_test_event_code', '')
      };

      setSiteSettings(settings);
    } catch (err) {
      console.error('Error fetching site settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch site settings');
    } finally {
      setLoading(false);
    }
  };

  const updateSiteSetting = async (id: string, value: string) => {
    try {
      setError(null);

      const { error } = await supabase
        .from('site_settings')
        .update({ value })
        .eq('id', id);

      if (error) throw error;

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

      const updatePromises = Object.entries(updates).map(([key, value]) =>
        supabase
          .from('site_settings')
          .update({ value })
          .eq('id', key)
      );

      const results = await Promise.all(updatePromises);

      // Check for errors
      const errors = results.filter(result => result.error);
      if (errors.length > 0) {
        throw new Error('Some updates failed');
      }

      // Refresh the settings
      await fetchSiteSettings();
    } catch (err) {
      console.error('Error updating site settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to update site settings');
      throw err;
    }
  };

  useEffect(() => {
    fetchSiteSettings();
  }, []);

  return {
    siteSettings,
    loading,
    error,
    updateSiteSetting,
    updateSiteSettings,
    refetch: fetchSiteSettings
  };
};
