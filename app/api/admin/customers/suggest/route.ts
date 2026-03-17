import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { supabaseServer } from '@/lib/supabase-server';
import { normalizePhone } from '@/lib/customer-utils';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const unauthorized = requireAdminRequest(request);
    if (unauthorized) return unauthorized;

    const rawPhone = new URL(request.url).searchParams.get('phone') || '';
    const phone = normalizePhone(rawPhone);

    if (!phone) return NextResponse.json({ customer: null });

    const { data } = await (supabaseServer.from('customers') as any)
      .select('id, name, phone, email, messenger_psid, source')
      .eq('phone', phone)
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ customer: data ?? null });
  } catch (err) {
    console.error('[api/admin/customers/suggest] GET unhandled:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
