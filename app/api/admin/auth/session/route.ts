import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthConfigured, isAdminRequest } from '@/lib/admin-auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  return NextResponse.json({
    authenticated: isAdminRequest(request),
    configured: isAdminAuthConfigured(),
  });
}
