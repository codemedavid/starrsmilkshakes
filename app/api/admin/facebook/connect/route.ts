// app/api/admin/facebook/connect/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { requireSuperAdminRequest, isSuperAdminRequest } from '@/lib/super-admin-auth';
import { exchangeForLongLivedToken, getPageAccessToken, subscribePageToWebhook } from '@/lib/messenger-auth';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authError = requireSuperAdminRequest(request);
  if (authError) return authError;

  const { adminId } = isSuperAdminRequest(request);

  let body: { accessToken: string; pageId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.accessToken) {
    return NextResponse.json({ error: 'accessToken is required' }, { status: 400 });
  }

  try {
    const longLivedToken = await exchangeForLongLivedToken(body.accessToken);
    const pages = await getPageAccessToken(longLivedToken);
    if (pages.length === 0) {
      return NextResponse.json({ error: 'No Facebook Pages found for this account' }, { status: 400 });
    }

    const page = body.pageId
      ? pages.find((p) => p.pageId === body.pageId)
      : pages[0];

    if (!page) {
      return NextResponse.json({ error: 'Specified page not found' }, { status: 400 });
    }

    await subscribePageToWebhook(page.pageId, page.pageAccessToken);

    // Clear existing config and insert new
    const { data: existingConfigs } = await supabaseServer.from('facebook_config').select('id');
    if (existingConfigs && existingConfigs.length > 0) {
      for (const config of existingConfigs) {
        await supabaseServer.from('facebook_config').delete().eq('id', config.id);
      }
    }

    const { error: insertError } = await supabaseServer.from('facebook_config').insert({
      page_id: page.pageId,
      page_name: page.pageName,
      page_access_token: page.pageAccessToken,
      app_id: process.env.FACEBOOK_APP_ID || '',
      connected_by: adminId,
    });

    if (insertError) {
      return NextResponse.json({ error: 'Failed to save config' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      page: { id: page.pageId, name: page.pageName },
      pages: pages.map((p) => ({ id: p.pageId, name: p.pageName })),
    });
  } catch (err: any) {
    console.error('Facebook connect error:', err);
    return NextResponse.json({ error: err.message || 'Connection failed' }, { status: 500 });
  }
}
