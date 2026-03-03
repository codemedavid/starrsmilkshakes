import { useState } from 'react';

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export const useImageUpload = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadImage = async (file: File): Promise<string> => {
    try {
      setUploading(true);
      setUploadProgress(0);

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowedTypes.includes(file.type)) {
        throw new Error('Please upload a valid image file (JPEG, PNG, WebP, or GIF)');
      }

      // Validate file size (10MB limit - Cloudinary free tier allows up to 10MB)
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        throw new Error('Image size must be less than 10MB');
      }

      if (!CLOUD_NAME || !UPLOAD_PRESET) {
        throw new Error('Cloudinary configuration is missing. Check your environment variables.');
      }

      // Build FormData for Cloudinary unsigned upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', UPLOAD_PRESET);
      formData.append('folder', 'menu-images');

      // Upload to Cloudinary with progress tracking via XMLHttpRequest
      const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

      const secureUrl = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(percent);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const response = JSON.parse(xhr.responseText);
            resolve(response.secure_url);
          } else {
            try {
              const errResponse = JSON.parse(xhr.responseText);
              reject(new Error(errResponse.error?.message || 'Upload failed'));
            } catch {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'));
        });

        xhr.open('POST', url);
        xhr.send(formData);
      });

      setUploadProgress(100);
      return secureUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  const deleteImage = async (_imageUrl: string): Promise<void> => {
    // Cloudinary deletion requires server-side signed API calls.
    // For now, we just clear the URL from the UI.
    // The image remains on Cloudinary storage (free tier has generous limits).
    // To add server-side deletion later, create an API route that uses
    // the Cloudinary Admin API with API_KEY and API_SECRET.
    return;
  };

  return {
    uploadImage,
    deleteImage,
    uploading,
    uploadProgress
  };
};