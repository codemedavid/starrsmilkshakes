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
    address: body.address !== undefined ? String(body.address || '').trim() : undefined,
    phone: body.phone !== undefined ? String(body.phone || '').trim() : undefined,
    latitude: body.latitude !== undefined ? String(body.latitude || '').trim() : undefined,
    longitude: body.longitude !== undefined ? String(body.longitude || '').trim() : undefined,
    is_main: body.is_main !== undefined ? Boolean(body.is_main) : undefined,
    is_active: body.is_active !== undefined ? Boolean(body.is_active) : undefined,
    messenger_username:
      body.messenger_username !== undefined
        ? body.messenger_username
          ? String(body.messenger_username).trim()
          : null
        : undefined,
  };

  const { data, error } = await (supabaseServer
    .from('branches') as any)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating branch:', error);
    return NextResponse.json({ error: 'Failed to update branch' }, { status: 500 });
  }

  return NextResponse.json({ branch: data });
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
  const { error } = await (supabaseServer.from('branches') as any).delete().eq('id', id);

  if (error) {
    console.error('Error deleting branch:', error);
    return NextResponse.json({ error: 'Failed to delete branch' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
