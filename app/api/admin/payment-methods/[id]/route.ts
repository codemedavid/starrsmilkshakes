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
    account_number: body.account_number !== undefined ? String(body.account_number || '').trim() : undefined,
    account_name: body.account_name !== undefined ? String(body.account_name || '').trim() : undefined,
    qr_code_url: body.qr_code_url !== undefined ? String(body.qr_code_url || '').trim() : undefined,
    active: body.active !== undefined ? Boolean(body.active) : undefined,
    sort_order: body.sort_order !== undefined ? Number(body.sort_order) : undefined,
  };

  const { data, error } = await (supabaseServer
    .from('payment_methods') as any)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating payment method:', error);
    return NextResponse.json({ error: 'Failed to update payment method' }, { status: 500 });
  }

  return NextResponse.json({ paymentMethod: data });
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
  const { error } = await (supabaseServer.from('payment_methods') as any).delete().eq('id', id);

  if (error) {
    console.error('Error deleting payment method:', error);
    return NextResponse.json({ error: 'Failed to delete payment method' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
