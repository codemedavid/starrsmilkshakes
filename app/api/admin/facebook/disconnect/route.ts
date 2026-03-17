// app/api/admin/facebook/disconnect/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { requireSuperAdminRequest } from '@/lib/super-admin-auth';
import { unsubscribePageFromWebhook } from '@/lib/messenger-auth';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authError = requireSuperAdminRequest(request);
  if (authError) return authError;

  try {
    const { data: config } = await (supabaseServer
      .from('facebook_config') as any)
      .select('page_id, page_access_token')
      .single();

    if (config) {
      await unsubscribePageFromWebhook(config.page_id, config.page_access_token);
      await (supabaseServer.from('facebook_config') as any).delete().eq('page_id', config.page_id);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Facebook disconnect error:', err);
    return NextResponse.json({ error: err.message || 'Disconnect failed' }, { status: 500 });
  }
}
