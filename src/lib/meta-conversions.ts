/**
 * Meta Conversions API client-side utilities
 * 
 * This module provides functions to send server-side events to Facebook
 * via the /api/meta/events endpoint.
 */

interface EventData {
    event_name: string;
    event_time: number;
    event_id?: string;
    event_source_url?: string;
    action_source: 'website';
    user_data: {
        client_ip_address?: string;
        client_user_agent?: string;
        em?: string;
        ph?: string;
        external_id?: string;
    };
    custom_data?: {
        value?: number;
        currency?: string;
        content_ids?: string[];
        content_type?: string;
        num_items?: number;
        order_id?: string;
    };
}

interface SendEventOptions {
    pixelId: string;
    accessToken: string;
    testEventCode?: string;
    events: EventData[];
}

interface SendEventResult {
    success: boolean;
    events_received?: number;
    error?: string;
}

/**
 * Send events to Meta Conversions API via server endpoint
 */
export async function sendServerEvent(options: SendEventOptions): Promise<SendEventResult> {
    try {
        const response = await fetch('/api/meta/events', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(options),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[Meta Conversions API Client] Error:', data);
            return {
                success: false,
                error: data.error || 'Failed to send event',
            };
        }

        console.log('[Meta Conversions API Client] Event sent successfully:', data);
        return {
            success: true,
            events_received: data.events_received,
        };
    } catch (error) {
        console.error('[Meta Conversions API Client] Unexpected error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Send a Purchase event to Meta Conversions API
 */
export async function sendPurchaseEvent(options: {
    pixelId: string;
    accessToken: string;
    testEventCode?: string;
    orderId: string;
    value: number;
    currency: string;
    contentIds: string[];
    numItems: number;
    customerPhone?: string;
}): Promise<SendEventResult> {
    const event: EventData = {
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        event_id: `purchase_${options.orderId}_${Date.now()}`,
        event_source_url: typeof window !== 'undefined' ? window.location.href : undefined,
        action_source: 'website',
        user_data: {
            client_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        },
        custom_data: {
            value: options.value,
            currency: options.currency,
            content_ids: options.contentIds,
            content_type: 'product',
            num_items: options.numItems,
            order_id: options.orderId,
        },
    };

    return sendServerEvent({
        pixelId: options.pixelId,
        accessToken: options.accessToken,
        testEventCode: options.testEventCode,
        events: [event],
    });
}

/**
 * Send an AddToCart event to Meta Conversions API
 */
export async function sendAddToCartEvent(options: {
    pixelId: string;
    accessToken: string;
    testEventCode?: string;
    value: number;
    currency: string;
    contentId: string;
    contentName: string;
}): Promise<SendEventResult> {
    const event: EventData = {
        event_name: 'AddToCart',
        event_time: Math.floor(Date.now() / 1000),
        event_id: `addtocart_${options.contentId}_${Date.now()}`,
        event_source_url: typeof window !== 'undefined' ? window.location.href : undefined,
        action_source: 'website',
        user_data: {
            client_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        },
        custom_data: {
            value: options.value,
            currency: options.currency,
            content_ids: [options.contentId],
            content_type: 'product',
        },
    };

    return sendServerEvent({
        pixelId: options.pixelId,
        accessToken: options.accessToken,
        testEventCode: options.testEventCode,
        events: [event],
    });
}

/**
 * Send an InitiateCheckout event to Meta Conversions API
 */
export async function sendInitiateCheckoutEvent(options: {
    pixelId: string;
    accessToken: string;
    testEventCode?: string;
    value: number;
    currency: string;
    contentIds: string[];
    numItems: number;
}): Promise<SendEventResult> {
    const event: EventData = {
        event_name: 'InitiateCheckout',
        event_time: Math.floor(Date.now() / 1000),
        event_id: `checkout_${Date.now()}`,
        event_source_url: typeof window !== 'undefined' ? window.location.href : undefined,
        action_source: 'website',
        user_data: {
            client_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        },
        custom_data: {
            value: options.value,
            currency: options.currency,
            content_ids: options.contentIds,
            content_type: 'product',
            num_items: options.numItems,
        },
    };

    return sendServerEvent({
        pixelId: options.pixelId,
        accessToken: options.accessToken,
        testEventCode: options.testEventCode,
        events: [event],
    });
}
