import { NextRequest, NextResponse } from 'next/server';
import { mapMenuRows } from '@/lib/menu-utils';
import { requireAdminRequest } from '@/lib/admin-auth';
import { supabaseServer } from '@/lib/supabase-server';

export const runtime = 'nodejs';

const normalizeMenuPayload = (body: Record<string, unknown>) => ({
  name: String(body.name || '').trim(),
  description: String(body.description || '').trim(),
  base_price: Number(body.basePrice),
  category: String(body.category || '').trim(),
  popular: Boolean(body.popular),
  available: body.available !== false,
  image_url: body.image ? String(body.image) : null,
  discount_price: body.discountPrice ? Number(body.discountPrice) : null,
  discount_start_date: body.discountStartDate ? String(body.discountStartDate) : null,
  discount_end_date: body.discountEndDate ? String(body.discountEndDate) : null,
  discount_active: Boolean(body.discountActive),
  show_in_messenger: Boolean(body.showInMessenger),
});

const normalizeVariationPayload = (value: unknown, menuItemId: string) =>
  Array.isArray(value)
    ? value
        .map((variation) => variation as Record<string, unknown>)
        .filter((variation) => variation.name && variation.price !== undefined)
        .map((variation) => ({
          menu_item_id: menuItemId,
          name: String(variation.name || '').trim(),
          price: Number(variation.price),
          image_url: variation.image ? String(variation.image) : null,
        }))
    : [];

const normalizeAddOnPayload = (value: unknown, menuItemId: string) =>
  Array.isArray(value)
    ? value
        .map((addOn) => addOn as Record<string, unknown>)
        .filter((addOn) => addOn.name && addOn.price !== undefined && addOn.category)
        .map((addOn) => ({
          menu_item_id: menuItemId,
          name: String(addOn.name || '').trim(),
          price: Number(addOn.price),
          category: String(addOn.category || '').trim(),
        }))
    : [];

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const { data, error } = await (supabaseServer
    .from('menu_items') as any)
    .select(`
      *,
      variations (*),
      add_ons (*)
    `)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching menu items:', error);
    return NextResponse.json({ error: 'Failed to fetch menu items' }, { status: 500 });
  }

  return NextResponse.json({ menuItems: mapMenuRows(data as any[]) });
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

  const menuItemPayload = normalizeMenuPayload(body);
  if (
    !menuItemPayload.name ||
    !menuItemPayload.description ||
    !menuItemPayload.category ||
    !Number.isFinite(menuItemPayload.base_price)
  ) {
    return NextResponse.json({ error: 'Missing required menu item fields' }, { status: 400 });
  }

  const { data: menuItem, error: itemError } = await (supabaseServer
    .from('menu_items') as any)
    .insert(menuItemPayload)
    .select()
    .single();

  if (itemError || !menuItem) {
    console.error('Error creating menu item:', itemError);
    return NextResponse.json({ error: 'Failed to create menu item' }, { status: 500 });
  }

  const variations = normalizeVariationPayload(body.variations, menuItem.id);
  if (variations.length > 0) {
    const { error } = await (supabaseServer.from('variations') as any).insert(variations as any);
    if (error) {
      console.error('Error creating variations:', error);
      return NextResponse.json({ error: 'Failed to create menu item variations' }, { status: 500 });
    }
  }

  const addOns = normalizeAddOnPayload(body.addOns, menuItem.id);
  if (addOns.length > 0) {
    const { error } = await (supabaseServer.from('add_ons') as any).insert(addOns as any);
    if (error) {
      console.error('Error creating add-ons:', error);
      return NextResponse.json({ error: 'Failed to create menu item add-ons' }, { status: 500 });
    }
  }

  return NextResponse.json({ menuItem }, { status: 201 });
}
