'use client';

import { useEffect, useState } from 'react';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { trackPageView } from '../lib/meta-pixel';

/**
 * MetaPixel component
 * 
 * Dynamically loads the Facebook Meta Pixel script based on the
 * configured pixel ID from site settings. Also tracks PageView on mount.
 */
const MetaPixel: React.FC = () => {
    const { siteSettings, loading } = useSiteSettings();
    const [pixelLoaded, setPixelLoaded] = useState(false);

    useEffect(() => {
        // Don't do anything while loading or if no pixel ID
        if (loading) return;

        const pixelId = siteSettings?.meta_pixel_id?.trim();
        if (!pixelId) return;

        // Don't load twice
        if (pixelLoaded || typeof window === 'undefined') return;

        // Check if fbq is already loaded
        if (typeof window.fbq === 'function') {
            setPixelLoaded(true);
            return;
        }

        // Initialize fbq
        const fbq = function (...args: unknown[]) {
            if ((fbq as any).callMethod) {
                (fbq as any).callMethod.apply(fbq, args);
            } else {
                (fbq as any).queue.push(args);
            }
        };

        (window as any).fbq = fbq;
        (window as any)._fbq = fbq;
        (fbq as any).push = fbq;
        (fbq as any).loaded = true;
        (fbq as any).version = '2.0';
        (fbq as any).queue = [];

        // Load the script
        const script = document.createElement('script');
        script.async = true;
        script.src = 'https://connect.facebook.net/en_US/fbevents.js';

        script.onload = () => {
            // Initialize the pixel with the ID
            window.fbq('init', pixelId);
            trackPageView();
            setPixelLoaded(true);
            console.log('[MetaPixel] Initialized with ID:', pixelId);
        };

        script.onerror = () => {
            console.error('[MetaPixel] Failed to load script');
        };

        // Insert the script
        const firstScript = document.getElementsByTagName('script')[0];
        if (firstScript?.parentNode) {
            firstScript.parentNode.insertBefore(script, firstScript);
        } else {
            document.head.appendChild(script);
        }

        // Cleanup is not needed since we want the pixel to persist
    }, [siteSettings, loading, pixelLoaded]);

    // Add noscript fallback image
    if (!loading && siteSettings?.meta_pixel_id?.trim()) {
        return (
            <noscript>
                <img
                    height="1"
                    width="1"
                    style={{ display: 'none' }}
                    src={`https://www.facebook.com/tr?id=${siteSettings.meta_pixel_id}&ev=PageView&noscript=1`}
                    alt=""
                />
            </noscript>
        );
    }

    return null;
};

export default MetaPixel;
