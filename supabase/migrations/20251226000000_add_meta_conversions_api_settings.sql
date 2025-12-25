/*
  Add Meta Conversions API settings for server-side event tracking
*/

INSERT INTO site_settings (id, value, type, description) VALUES
  ('meta_access_token', '', 'text', 'Facebook Conversions API access token'),
  ('meta_test_event_code', '', 'text', 'Test event code for Conversions API debugging (e.g., TEST1689)')
ON CONFLICT (id) DO NOTHING;
