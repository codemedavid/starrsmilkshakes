/*
  Add Meta Conversions API settings for server-side event tracking
  
  IMPORTANT: The meta_access_token should be stored as an environment variable
  or in Supabase Vault. This migration only creates the placeholder row.
  Do NOT store the actual token in this SQL file.
*/

-- Insert settings placeholders (access token value should be set via admin UI or env var)
INSERT INTO site_settings (id, value, type, description) VALUES
  ('meta_access_token', '', 'text', 'Facebook Conversions API access token - store actual token via admin or env var'),
  ('meta_test_event_code', '', 'text', 'Test event code for Conversions API debugging (e.g., TEST1689)')
ON CONFLICT (id) DO NOTHING;

-- Enable Row Level Security on site_settings if not already enabled
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- Create policy to restrict meta_access_token reads to authenticated users only
-- This prevents anonymous users from reading sensitive tokens
DROP POLICY IF EXISTS "Restrict sensitive settings to authenticated" ON site_settings;

CREATE POLICY "Restrict sensitive settings to authenticated"
ON site_settings
FOR SELECT
USING (
    -- Allow all authenticated users to read settings
    (auth.role() = 'authenticated')
    OR
    -- Allow public to read non-sensitive settings only
    (auth.role() = 'anon' AND id NOT IN ('meta_access_token', 'lalamove_api_key', 'lalamove_api_secret'))
);

-- Create policy for admin writes (you may want to add admin role check)
DROP POLICY IF EXISTS "Authenticated can update settings" ON site_settings;

CREATE POLICY "Authenticated can update settings"
ON site_settings
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
