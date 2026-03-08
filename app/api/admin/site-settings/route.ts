import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { mapSiteSettingsRows } from '@/lib/site-settings';
import { supabaseServer } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const { data, error } = await (supabaseServer.from('site_settings') as any).select('*').order('id');

  if (error) {
    console.error('Error fetching admin site settings:', error);
    return NextResponse.json({ error: 'Failed to fetch site settings' }, { status: 500 });
  }

  return NextResponse.json({ siteSettings: mapSiteSettingsRows(data as any[]) });
}

export async function PATCH(request: NextRequest) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  let body: { updates?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const updates = body.updates || {};
  const entries = Object.entries(updates).filter(([key]) => Boolean(key));

  if (entries.length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
  }

  const results = await Promise.all(
    entries.map(([id, value]) =>
      (supabaseServer
        .from('site_settings') as any)
        .update({ value: String(value ?? '') })
        .eq('id', id)
    )
  );

  const failed = results.find((result) => result.error);
  if (failed?.error) {
    console.error('Error updating site settings:', failed.error);
    return NextResponse.json({ error: 'Failed to update site settings' }, { status: 500 });
  }

  const { data, error } = await (supabaseServer.from('site_settings') as any).select('*').order('id');
  if (error) {
    console.error('Error refetching site settings:', error);
    return NextResponse.json({ error: 'Settings updated but failed to reload' }, { status: 500 });
  }

  return NextResponse.json({ siteSettings: mapSiteSettingsRows(data as any[]) });
}
