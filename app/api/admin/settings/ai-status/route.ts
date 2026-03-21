import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data } = await (supabaseServer.from('site_settings') as any)
    .select('value')
    .eq('id', 'ai_faq_enabled')
    .single();

  const enabled = (data as { value: string } | null)?.value === 'true';
  return NextResponse.json({ enabled });
}
