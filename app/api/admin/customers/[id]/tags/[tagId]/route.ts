import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { supabaseServer } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tagId: string }> }
) {
  try {
    const unauthorized = requireAdminRequest(request);
    if (unauthorized) return unauthorized;

    const { id, tagId } = await params;

    const { data: deleted, error } = await (supabaseServer.from('customer_tags') as any)
      .delete()
      .eq('id', tagId)
      .eq('customer_id', id)
      .select();

    if (error) {
      console.error('[api/admin/customers/[id]/tags/[tagId]] DELETE error:', error.message);
      return NextResponse.json({ error: 'Failed to remove tag' }, { status: 500 });
    }

    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[api/admin/customers/[id]/tags/[tagId]] DELETE unhandled:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
