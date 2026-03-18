import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { supabaseServer } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const unauthorized = requireAdminRequest(request);
    if (unauthorized) return unauthorized;

    const { id } = await params;

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const tag = String(body.tag || '').trim();
    if (!tag) return NextResponse.json({ error: 'tag is required' }, { status: 400 });

    const { data, error } = await (supabaseServer.from('customer_tags') as any)
      .insert({ customer_id: id, tag, tag_type: 'manual' })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Tag already exists on this customer' }, { status: 409 });
      }
      if (error.code === '23503') {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
      }
      console.error('[api/admin/customers/[id]/tags] POST error:', error.message);
      return NextResponse.json({ error: 'Failed to add tag' }, { status: 500 });
    }

    return NextResponse.json({ tag: data }, { status: 201 });
  } catch (err) {
    console.error('[api/admin/customers/[id]/tags] POST unhandled:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
