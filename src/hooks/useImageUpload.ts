import { useState } from 'react';

const IMAGEKIT_PUBLIC_KEY = process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;

export const useImageUpload = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadImage = async (file: File): Promise<string> => {
    try {
      setUploading(true);
      setUploadProgress(0);

      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowedTypes.includes(file.type)) {
        throw new Error('Please upload a valid image file (JPEG, PNG, WebP, or GIF)');
      }

      const maxSize = 25 * 1024 * 1024;
      if (file.size > maxSize) {
        throw new Error('Image size must be less than 25MB');
      }

      if (!IMAGEKIT_PUBLIC_KEY) {
        throw new Error('ImageKit configuration is missing. Check your environment variables.');
      }

      const authRes = await fetch('/api/imagekit-auth');
      if (!authRes.ok) throw new Error('Failed to get upload credentials');
      const { token, expire, signature } = await authRes.json();

      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileName', file.name);
      formData.append('publicKey', IMAGEKIT_PUBLIC_KEY);
      formData.append('signature', signature);
      formData.append('expire', String(expire));
      formData.append('token', token);
      formData.append('folder', 'menu-images');
      formData.append('useUniqueFileName', 'true');

      const imageUrl = await new Promise<string>((resolve, reject) => {
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
            resolve(response.url);
          } else {
            try {
              const errResponse = JSON.parse(xhr.responseText);
              reject(new Error(errResponse.message || 'Upload failed'));
            } catch {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'));
        });

        xhr.open('POST', 'https://upload.imagekit.io/api/v1/files/upload');
        xhr.send(formData);
      });

      setUploadProgress(100);
      return imageUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  const deleteImage = async (_imageUrl: string): Promise<void> => {
    // ImageKit deletion requires server-side API calls with the private key.
    // The image remains in ImageKit storage.
    return;
  };

  return {
    uploadImage,
    deleteImage,
    uploading,
    uploadProgress
  };
};
