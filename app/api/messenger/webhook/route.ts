// app/api/messenger/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { verifyWebhookSignature } from '@/lib/messenger-session';

// Webhook verification (Facebook sends this during setup)
export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.FACEBOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse('Forbidden', { status: 403 });
}

// Incoming messages from Facebook
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();

  // Verify X-Hub-Signature-256
  const signature = request.headers.get('x-hub-signature-256') || '';
  const appSecret = process.env.FACEBOOK_APP_SECRET || '';
  if (!verifyWebhookSignature(rawBody, signature, appSecret)) {
    return new NextResponse('Invalid signature', { status: 403 });
  }

  // Get page token from facebook_config
  const { data: config } = await (supabaseServer
    .from('facebook_config') as any)
    .select('page_access_token')
    .single();

  if (!config) {
    console.error('No Facebook config found — cannot process Messenger events');
    return new NextResponse('OK', { status: 200 }); // Always return 200 to Facebook
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new NextResponse('OK', { status: 200 });
  }

  if (body.object === 'page') {
    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        // Import dynamically to avoid circular deps
        const { handleMessengerEvent } = await import('@/lib/messenger-handler');
        // Process asynchronously — respond to Facebook quickly
        handleMessengerEvent(event, config.page_access_token).catch((err) =>
          console.error('Messenger event handler error:', err)
        );
      }
    }
  }

  return new NextResponse('OK', { status: 200 });
}
