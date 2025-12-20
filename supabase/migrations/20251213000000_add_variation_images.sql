-- Add image_url column to variations table for variation-specific images
ALTER TABLE variations ADD COLUMN IF NOT EXISTS image_url text;
