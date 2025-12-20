/*
  Add Meta Pixel ID setting for Facebook tracking
*/

INSERT INTO site_settings (id, value, type, description) VALUES
  ('meta_pixel_id', '', 'text', 'Facebook Meta Pixel ID for tracking')
ON CONFLICT (id) DO NOTHING;
