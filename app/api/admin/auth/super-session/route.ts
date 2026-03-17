// app/api/admin/auth/super-session/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { isSuperAdminRequest } from '@/lib/super-admin-auth';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { valid, adminId } = isSuperAdminRequest(request);
  if (!valid) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true, adminId });
}
