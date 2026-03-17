import { NextRequest, NextResponse } from 'next/server';
import { getClientIP } from '@/lib/supabase-server';
import { checkServerRateLimit } from '@/lib/server-rate-limit';
import { isAdminAuthConfigured, isSameOriginRequest, setAdminSessionCookie, verifyAdminPassword } from '@/lib/admin-auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    if (!isAdminAuthConfigured()) {
      return NextResponse.json(
        { error: 'Admin authentication is not configured. Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET.' },
        { status: 500 }
      );
    }

    const rateLimit = checkServerRateLimit(`admin-login:${getClientIP(request)}`, 5, 15 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `Too many login attempts. Try again in ${rateLimit.retryAfterSeconds} seconds.` },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    if (process.env.NODE_ENV === 'production' && !isSameOriginRequest(request)) {
      return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
    }

    let body: { password?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const password = body.password?.trim();
    if (!password) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    if (!verifyAdminPassword(password)) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });
    setAdminSessionCookie(response);
    return response;
  } catch (err) {
    console.error('[api/admin/auth/login] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
