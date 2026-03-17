// app/api/admin/auth/super-login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getClientIP, supabaseServer } from '@/lib/supabase-server';
import { checkServerRateLimit } from '@/lib/server-rate-limit';
import { isSameOriginRequest } from '@/lib/admin-auth';
import {
  verifySuperAdminPassword,
  setSuperAdminSessionCookie,
} from '@/lib/super-admin-auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const rateLimit = checkServerRateLimit(`super-login:${getClientIP(request)}`, 5, 15 * 60 * 1000);
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

    let body: { email?: string; password?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const { data: admin, error } = await (supabaseServer
      .from('super_admins') as any)
      .select('id, email, password_hash')
      .eq('email', email)
      .single();

    if (error || !admin) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const passwordValid = await verifySuperAdminPassword(password, admin.password_hash);
    if (!passwordValid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });
    setSuperAdminSessionCookie(response, admin.id);
    return response;
  } catch (err) {
    console.error('[api/admin/auth/super-login] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
