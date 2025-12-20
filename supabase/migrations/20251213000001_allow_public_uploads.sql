-- Allow public uploads to menu-images bucket for Admin Dashboard usage
-- (Since the dashboard uses anonymous access with a simple frontend password check)

-- Drop existing authenticated-only policies
DROP POLICY IF EXISTS "Authenticated users can upload menu images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update menu images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete menu images" ON storage.objects;

-- Create new public policies
CREATE POLICY "Public can upload menu images"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'menu-images');

CREATE POLICY "Public can update menu images"
ON storage.objects
FOR UPDATE
TO public
USING (bucket_id = 'menu-images');

CREATE POLICY "Public can delete menu images"
ON storage.objects
FOR DELETE
TO public
USING (bucket_id = 'menu-images');
