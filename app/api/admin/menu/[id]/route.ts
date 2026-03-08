import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { supabaseServer } from '@/lib/supabase-server';

export const runtime = 'nodejs';

const normalizeMenuPayload = (body: Record<string, unknown>) => ({
  name: body.name !== undefined ? String(body.name || '').trim() : undefined,
  description: body.description !== undefined ? String(body.description || '').trim() : undefined,
  base_price: body.basePrice !== undefined ? Number(body.basePrice) : undefined,
  category: body.category !== undefined ? String(body.category || '').trim() : undefined,
  popular: body.popular !== undefined ? Boolean(body.popular) : undefined,
  available: body.available !== undefined ? Boolean(body.available) : undefined,
  image_url: body.image !== undefined ? (body.image ? String(body.image) : null) : undefined,
  discount_price: body.discountPrice !== undefined ? (body.discountPrice ? Number(body.discountPrice) : null) : undefined,
  discount_start_date: body.discountStartDate !== undefined ? (body.discountStartDate ? String(body.discountStartDate) : null) : undefined,
  discount_end_date: body.discountEndDate !== undefined ? (body.discountEndDate ? String(body.discountEndDate) : null) : undefined,
  discount_active: body.discountActive !== undefined ? Boolean(body.discountActive) : undefined,
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

export async function PUT(
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

  const { error: itemError } = await (supabaseServer
    .from('menu_items') as any)
    .update(normalizeMenuPayload(body))
    .eq('id', id);

  if (itemError) {
    console.error('Error updating menu item:', itemError);
    return NextResponse.json({ error: 'Failed to update menu item' }, { status: 500 });
  }

  await (supabaseServer.from('variations') as any).delete().eq('menu_item_id', id);
  await (supabaseServer.from('add_ons') as any).delete().eq('menu_item_id', id);

  const variations = normalizeVariationPayload(body.variations, id);
  if (variations.length > 0) {
    const { error } = await (supabaseServer.from('variations') as any).insert(variations as any);
    if (error) {
      console.error('Error updating variations:', error);
      return NextResponse.json({ error: 'Failed to update menu item variations' }, { status: 500 });
    }
  }

  const addOns = normalizeAddOnPayload(body.addOns, id);
  if (addOns.length > 0) {
    const { error } = await (supabaseServer.from('add_ons') as any).insert(addOns as any);
    if (error) {
      console.error('Error updating add-ons:', error);
      return NextResponse.json({ error: 'Failed to update menu item add-ons' }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
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
  const { error } = await (supabaseServer.from('menu_items') as any).delete().eq('id', id);

  if (error) {
    console.error('Error deleting menu item:', error);
    return NextResponse.json({ error: 'Failed to delete menu item' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
