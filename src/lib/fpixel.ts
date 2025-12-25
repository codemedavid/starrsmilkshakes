/**
 * Facebook Pixel utility functions
 * Pixel ID is fetched from database via useSiteSettings hook
 */

declare global {
    interface Window {
        fbq: (...args: unknown[]) => void;
        _fbq: unknown;
    }
}

/**
 * Track a page view
 */
export const pageview = (): void => {
    if (typeof window !== 'undefined' && window.fbq) {
        window.fbq('track', 'PageView');
    }
};

/**
 * Track a custom event
 * @param name - Event name (e.g., 'Purchase', 'AddToCart')
 * @param options - Event parameters
 */
export const event = (name: string, options: Record<string, unknown> = {}): void => {
    if (typeof window !== 'undefined' && window.fbq) {
        window.fbq('track', name, options);
    }
};

/**
 * Initialize the pixel with a given ID
 * @param pixelId - Facebook Pixel ID
 */
export const init = (pixelId: string): void => {
    if (typeof window !== 'undefined' && window.fbq) {
        window.fbq('init', pixelId);
    }
};

// Convenience functions for common events
export const trackAddToCart = (value: number, currency: string, contentName: string, contentId?: string): void => {
    event('AddToCart', {
        value,
        currency,
        content_name: contentName,
        content_ids: contentId ? [contentId] : undefined,
        content_type: 'product'
    });
};

export const trackInitiateCheckout = (value: number, currency: string, numItems: number, contentIds?: string[]): void => {
    event('InitiateCheckout', {
        value,
        currency,
        num_items: numItems,
        content_ids: contentIds,
        content_type: 'product'
    });
};

export const trackPurchase = (value: number, currency: string, contentIds: string[], numItems: number): void => {
    event('Purchase', {
        value,
        currency,
        content_ids: contentIds,
        content_type: 'product',
        num_items: numItems
    });
};
