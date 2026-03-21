import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { supabaseServer } from '@/lib/supabase-server';
import { setupMessengerProfile } from '@/lib/messenger';

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) return unauthorized;

  // Get page token from facebook_config (table not in generated types, cast as any)
  const { data: config, error: configError } = await (supabaseServer
    .from('facebook_config') as any)
    .select('page_access_token')
    .limit(1)
    .single();

  if (configError || !config || !config.page_access_token) {
    return NextResponse.json(
      { error: 'Facebook page not connected. Connect a page first.' },
      { status: 400 }
    );
  }

  const result = await setupMessengerProfile(config.page_access_token);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: 'Messenger profile updated successfully' });
}
