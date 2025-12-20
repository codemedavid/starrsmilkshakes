/**
 * Meta Pixel (Facebook Pixel) tracking utilities
 * 
 * These functions provide type-safe wrappers for Meta Pixel event tracking.
 * The pixel script is loaded dynamically by the MetaPixel component.
 */

// Declare fbq as a global function
declare global {
    interface Window {
        fbq: (
            action: string,
            eventName: string,
            params?: Record<string, unknown>
        ) => void;
    }
}

/**
 * Check if Meta Pixel is available
 */
export const isPixelAvailable = (): boolean => {
    return typeof window !== 'undefined' && typeof window.fbq === 'function';
};

/**
 * Track a page view event
 */
export const trackPageView = (): void => {
    if (isPixelAvailable()) {
        window.fbq('track', 'PageView');
    }
};

/**
 * Track an Add to Cart event
 * @param value - The value of the item added
 * @param currency - Currency code (e.g., 'PHP')
 * @param contentName - Name of the item
 * @param contentId - Optional ID of the item
 */
export const trackAddToCart = (
    value: number,
    currency: string,
    contentName: string,
    contentId?: string
): void => {
    if (isPixelAvailable()) {
        window.fbq('track', 'AddToCart', {
            value,
            currency,
            content_name: contentName,
            content_ids: contentId ? [contentId] : undefined,
            content_type: 'product'
        });
    }
};

/**
 * Track an Initiate Checkout event
 * @param value - Total cart value
 * @param currency - Currency code (e.g., 'PHP')
 * @param numItems - Number of items in cart
 * @param contentIds - Optional array of item IDs
 */
export const trackInitiateCheckout = (
    value: number,
    currency: string,
    numItems: number,
    contentIds?: string[]
): void => {
    if (isPixelAvailable()) {
        window.fbq('track', 'InitiateCheckout', {
            value,
            currency,
            num_items: numItems,
            content_ids: contentIds,
            content_type: 'product'
        });
    }
};

/**
 * Track a Purchase event
 * @param value - Order total
 * @param currency - Currency code (e.g., 'PHP')
 * @param contentIds - Array of item IDs purchased
 * @param numItems - Number of items purchased
 */
export const trackPurchase = (
    value: number,
    currency: string,
    contentIds: string[],
    numItems: number
): void => {
    if (isPixelAvailable()) {
        window.fbq('track', 'Purchase', {
            value,
            currency,
            content_ids: contentIds,
            content_type: 'product',
            num_items: numItems
        });
    }
};

/**
 * Track a custom event
 * @param eventName - Name of the custom event
 * @param params - Optional parameters
 */
export const trackCustomEvent = (
    eventName: string,
    params?: Record<string, unknown>
): void => {
    if (isPixelAvailable()) {
        window.fbq('track', eventName, params);
    }
};
