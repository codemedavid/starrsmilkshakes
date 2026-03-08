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
    .from('categories') as any)
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
  }

  return NextResponse.json({ categories: data || [] });
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

  const id = String(body.id || '').trim();
  const name = String(body.name || '').trim();
  const icon = String(body.icon || '').trim();
  const sortOrder = Number(body.sort_order);
  const active = body.active !== false;

  if (!id || !name || !icon || !Number.isFinite(sortOrder)) {
    return NextResponse.json({ error: 'Missing required category fields' }, { status: 400 });
  }

  const { data, error } = await (supabaseServer
    .from('categories') as any)
    .insert({
      id,
      name,
      icon,
      sort_order: sortOrder,
      active,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating category:', error);
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 });
  }

  return NextResponse.json({ category: data }, { status: 201 });
}
