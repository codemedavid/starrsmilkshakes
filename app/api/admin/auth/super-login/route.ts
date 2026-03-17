// app/api/admin/auth/super-login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import {
  verifySuperAdminPassword,
  setSuperAdminSessionCookie,
} from '@/lib/super-admin-auth';

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  const response = NextResponse.json({ success: true, adminId: admin.id });
  setSuperAdminSessionCookie(response, admin.id);
  return response;
}
