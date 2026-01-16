-- Secure policy for menu-images bucket
-- Restrict uploads/updates/deletes to authenticated users only

-- Drop existing public policies 
DROP POLICY IF EXISTS "Public can upload menu images" ON storage.objects;
DROP POLICY IF EXISTS "Public can update menu images" ON storage.objects;
DROP POLICY IF EXISTS "Public can delete menu images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload menu images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update menu images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete menu images" ON storage.objects;

-- Create authenticated-only policies for writes
CREATE POLICY "Authenticated users can upload menu images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'menu-images'
    AND (storage.foldername(name))[1] != ''
    AND octet_length(name) < 512
);

CREATE POLICY "Authenticated users can update menu images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'menu-images')
WITH CHECK (
    bucket_id = 'menu-images'
    AND octet_length(name) < 512
);

CREATE POLICY "Authenticated users can delete menu images"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'menu-images');

-- Keep public read policy for serving images
CREATE POLICY IF NOT EXISTS "Public can read menu images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'menu-images');
