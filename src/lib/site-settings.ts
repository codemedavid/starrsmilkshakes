import type { SiteSettings } from '@/types';

export const SENSITIVE_SITE_SETTING_KEYS = new Set([
  'meta_access_token',
  'lalamove_api_key',
  'lalamove_api_secret',
]);

type SiteSettingRow = {
  id: string;
  value: string | null;
};

const getValueFactory = (rows: SiteSettingRow[] | null | undefined) => {
  const lookup: Record<string, string> = {};

  (rows || []).forEach((row) => {
    lookup[row.id] = row.value ?? '';
  });

  return (key: string, fallback = '') => lookup[key] ?? fallback;
};

export const mapSiteSettingsRows = (rows: SiteSettingRow[] | null | undefined): SiteSettings => {
  const getValue = getValueFactory(rows);

  return {
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
    meta_test_event_code: getValue('meta_test_event_code', ''),
    header_scripts: getValue('header_scripts', ''),
    ai_faq_enabled: getValue('ai_faq_enabled', 'false'),
  };
};

export const filterPublicSiteSettingsRows = (rows: SiteSettingRow[] | null | undefined) =>
  (rows || []).filter((row) => !SENSITIVE_SITE_SETTING_KEYS.has(row.id));
