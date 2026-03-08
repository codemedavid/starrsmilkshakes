import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { supabaseServer } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const updates = {
    name: body.name !== undefined ? String(body.name || '').trim() : undefined,
    icon: body.icon !== undefined ? String(body.icon || '').trim() : undefined,
    sort_order: body.sort_order !== undefined ? Number(body.sort_order) : undefined,
    active: body.active !== undefined ? Boolean(body.active) : undefined,
  };

  const { data, error } = await (supabaseServer
    .from('categories') as any)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating category:', error);
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 });
  }

  return NextResponse.json({ category: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const { id } = await params;

  const { data: menuItems, error: menuError } = await (supabaseServer
    .from('menu_items') as any)
    .select('id')
    .eq('category', id)
    .limit(1);

  if (menuError) {
    console.error('Error checking category usage:', menuError);
    return NextResponse.json({ error: 'Failed to validate category usage' }, { status: 500 });
  }

  if (menuItems && menuItems.length > 0) {
    return NextResponse.json(
      { error: 'Cannot delete a category that still contains menu items' },
      { status: 409 }
    );
  }

  const { error } = await (supabaseServer.from('categories') as any).delete().eq('id', id);

  if (error) {
    console.error('Error deleting category:', error);
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
