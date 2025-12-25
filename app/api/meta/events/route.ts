import { NextRequest, NextResponse } from 'next/server';

// Facebook Graph API version
const GRAPH_API_VERSION = 'v24.0';

interface EventData {
    event_name: string;
    event_time: number;
    event_id?: string;
    event_source_url?: string;
    action_source: 'website';
    user_data: {
        client_ip_address?: string;
        client_user_agent?: string;
        em?: string; // hashed email
        ph?: string; // hashed phone
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

interface ConversionsAPIRequest {
    pixelId: string;
    accessToken: string;
    testEventCode?: string;
    events: EventData[];
}

/**
 * POST /api/meta/events
 * Send events to Facebook Conversions API
 */
export async function POST(request: NextRequest) {
    try {
        const body: ConversionsAPIRequest = await request.json();
        const { pixelId, accessToken, testEventCode, events } = body;

        if (!pixelId || !accessToken || !events || events.length === 0) {
            return NextResponse.json(
                { error: 'Missing required fields: pixelId, accessToken, events' },
                { status: 400 }
            );
        }

        // Build the request payload
        const payload: Record<string, unknown> = {
            data: events
        };

        // Add test_event_code if provided (for testing in Events Manager)
        if (testEventCode && testEventCode.trim()) {
            payload.test_event_code = testEventCode.trim();
        }

        // Send to Facebook Conversions API
        const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events?access_token=${accessToken}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[Meta Conversions API] Error:', data);
            return NextResponse.json(
                {
                    error: data.error?.message || 'Failed to send events to Facebook',
                    details: data.error
                },
                { status: response.status }
            );
        }

        console.log('[Meta Conversions API] Success:', {
            events_received: data.events_received,
            messages: data.messages,
            fbtrace_id: data.fbtrace_id
        });

        return NextResponse.json({
            success: true,
            events_received: data.events_received,
            messages: data.messages,
            fbtrace_id: data.fbtrace_id
        });

    } catch (error) {
        console.error('[Meta Conversions API] Unexpected error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
