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
    .from('branches') as any)
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching branches:', error);
    return NextResponse.json({ error: 'Failed to fetch branches' }, { status: 500 });
  }

  return NextResponse.json({ branches: data || [] });
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
    name: String(body.name || '').trim(),
    address: String(body.address || '').trim(),
    phone: String(body.phone || '').trim(),
    latitude: String(body.latitude || '').trim(),
    longitude: String(body.longitude || '').trim(),
    is_main: Boolean(body.is_main),
    is_active: body.is_active !== false,
    messenger_username: body.messenger_username ? String(body.messenger_username).trim() : null,
  };

  if (!payload.name || !payload.address || !payload.phone || !payload.latitude || !payload.longitude) {
    return NextResponse.json({ error: 'Missing required branch fields' }, { status: 400 });
  }

  const { data, error } = await (supabaseServer
    .from('branches') as any)
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('Error creating branch:', error);
    return NextResponse.json({ error: 'Failed to create branch' }, { status: 500 });
  }

  return NextResponse.json({ branch: data }, { status: 201 });
}
