// app/api/admin/facebook/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { isAdminRequest } from '@/lib/admin-auth';
import { isSuperAdminRequest } from '@/lib/super-admin-auth';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const isAdmin = isAdminRequest(request);
  const { valid: isSuperAdmin } = isSuperAdminRequest(request);

  if (!isAdmin && !isSuperAdmin) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { data: config } = await supabaseServer
    .from('facebook_config')
    .select('page_id, page_name, app_id, connected_at, token_expires_at')
    .single();

  if (!config) {
    return NextResponse.json({ connected: false });
  }

  const tokenExpiring = config.token_expires_at
    ? new Date(config.token_expires_at).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000
    : false;

  return NextResponse.json({
    connected: true,
    pageName: config.page_name,
    pageId: config.page_id,
    connectedAt: config.connected_at,
    tokenExpiring,
    isSuperAdmin,
  });
}
