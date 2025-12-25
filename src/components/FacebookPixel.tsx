'use client';

import { usePathname } from 'next/navigation';
import Script from 'next/script';
import { useEffect, useState } from 'react';
import * as pixel from '../lib/fpixel';
import { useSiteSettings } from '../hooks/useSiteSettings';

const FacebookPixel = () => {
    const [loaded, setLoaded] = useState(false);
    const pathname = usePathname();
    const { siteSettings, loading } = useSiteSettings();

    const pixelId = siteSettings?.meta_pixel_id?.trim();

    // Track page views on route change
    useEffect(() => {
        if (!loaded || !pixelId) return;
        pixel.pageview();
    }, [pathname, loaded, pixelId]);

    // Don't render anything if no pixel ID configured
    if (loading || !pixelId) {
        return null;
    }

    return (
        <>
            <Script
                id="fb-pixel"
                src="/scripts/pixel.js"
                strategy="afterInteractive"
                onLoad={() => setLoaded(true)}
                data-pixel-id={pixelId}
            />
            <noscript>
                <img
                    height="1"
                    width="1"
                    style={{ display: 'none' }}
                    src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
                    alt=""
                />
            </noscript>
        </>
    );
};

export default FacebookPixel;
