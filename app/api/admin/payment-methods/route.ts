import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { supabaseServer } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const { data, error } = await (supabaseServer
    .from('payment_methods') as any)
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Error fetching payment methods:', error);
    return NextResponse.json({ error: 'Failed to fetch payment methods' }, { status: 500 });
  }

  return NextResponse.json({ paymentMethods: data || [] });
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const payload = {
    id: String(body.id || '').trim(),
    name: String(body.name || '').trim(),
    account_number: String(body.account_number || '').trim(),
    account_name: String(body.account_name || '').trim(),
    qr_code_url: String(body.qr_code_url || '').trim(),
    active: body.active !== false,
    sort_order: Number(body.sort_order),
  };

  if (
    !payload.id ||
    !payload.name ||
    !payload.account_number ||
    !payload.account_name ||
    !payload.qr_code_url ||
    !Number.isFinite(payload.sort_order)
  ) {
    return NextResponse.json({ error: 'Missing required payment method fields' }, { status: 400 });
  }

  const { data, error } = await (supabaseServer
    .from('payment_methods') as any)
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('Error creating payment method:', error);
    return NextResponse.json({ error: 'Failed to create payment method' }, { status: 500 });
  }

  return NextResponse.json({ paymentMethod: data }, { status: 201 });
}
