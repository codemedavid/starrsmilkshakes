'use client';

import { usePathname } from 'next/navigation';
import Script from 'next/script';
import { useEffect, useState, useRef } from 'react';
import * as pixel from '../lib/fpixel';
import { useSiteSettings } from '../hooks/useSiteSettings';

const FacebookPixel = () => {
    const [loaded, setLoaded] = useState(false);
    const pathname = usePathname();
    const { siteSettings, loading } = useSiteSettings();
    const initialPageviewFired = useRef(false);

    const pixelId = siteSettings?.meta_pixel_id?.trim();

    // Track initial pageview when pixel script loads
    useEffect(() => {
        if (!loaded || !pixelId) return;
        if (!initialPageviewFired.current) {
            pixel.pageview();
            initialPageviewFired.current = true;
        }
    }, [loaded, pixelId]);

    // Track subsequent page views on route change
    useEffect(() => {
        if (!loaded || !pixelId || !initialPageviewFired.current) return;
        pixel.pageview();
    }, [loaded, pathname, pixelId]);

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
