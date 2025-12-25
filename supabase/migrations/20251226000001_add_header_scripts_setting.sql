/*
  Add custom header scripts setting for tracking codes
*/

INSERT INTO site_settings (id, value, type, description) VALUES
  ('header_scripts', '', 'text', 'Custom scripts to inject in the document head (e.g., Meta Pixel, Google Analytics)')
ON CONFLICT (id) DO NOTHING;
