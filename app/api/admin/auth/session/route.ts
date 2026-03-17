import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthConfigured, isAdminRequest } from '@/lib/admin-auth';
import { isSuperAdminRequest } from '@/lib/super-admin-auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const isAdmin = isAdminRequest(request);
  const { valid: isSuperAdmin } = isSuperAdminRequest(request);

  return NextResponse.json({
    authenticated: isAdmin || isSuperAdmin,
    configured: isAdminAuthConfigured(),
  });
}
