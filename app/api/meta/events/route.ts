import { NextRequest, NextResponse } from 'next/server';
import { checkServerRateLimit } from '@/lib/server-rate-limit';
import { mapSiteSettingsRows } from '@/lib/site-settings';
import { getClientIP, supabaseServer } from '@/lib/supabase-server';

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

interface ConversionsAPIRequest {
  testEventCode?: string;
  events: EventData[];
}

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const clientIP = getClientIP(request);
    const rateLimit = checkServerRateLimit(`meta-events:${clientIP}`, 20, 60 * 1000);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `Too many tracking events. Try again in ${rateLimit.retryAfterSeconds} seconds.` },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    const body: ConversionsAPIRequest = await request.json();
    const events = Array.isArray(body.events) ? body.events : [];

    if (events.length === 0 || events.length > 10) {
      return NextResponse.json({ error: 'At least one event is required' }, { status: 400 });
    }

    const { data: settingsRows, error: settingsError } = await supabaseServer
      .from('site_settings')
      .select('id, value')
      .in('id', ['meta_pixel_id', 'meta_access_token', 'meta_test_event_code']);

    if (settingsError) {
      console.error('[Meta Conversions API] Failed to load settings:', settingsError);
      return NextResponse.json({ error: 'Failed to load Meta configuration' }, { status: 500 });
    }

    const settings = mapSiteSettingsRows(settingsRows as any[]);
    const pixelId = settings.meta_pixel_id?.trim();
    const accessToken = settings.meta_access_token?.trim();

    if (!pixelId || !accessToken) {
      return NextResponse.json({ success: true, skipped: true, reason: 'Meta is not configured' }, { status: 200 });
    }

    const payload: Record<string, unknown> = {
      data: events.map((event) => ({
        ...event,
        user_data: {
          ...event.user_data,
          client_ip_address: event.user_data?.client_ip_address || clientIP,
          client_user_agent: event.user_data?.client_user_agent || request.headers.get('user-agent') || undefined,
        },
      })),
    };

    const testEventCode = body.testEventCode?.trim() || settings.meta_test_event_code?.trim();
    if (testEventCode) {
      payload.test_event_code = testEventCode;
    }

    const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('[Meta Conversions API] Error:', data);
      return NextResponse.json(
        {
          error: (data as any).error?.message || 'Failed to send events to Facebook',
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      events_received: (data as any).events_received,
      messages: (data as any).messages,
      fbtrace_id: (data as any).fbtrace_id,
    });
  } catch (error) {
    console.error('[Meta Conversions API] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
