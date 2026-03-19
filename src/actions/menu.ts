'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAdmin, checkActionRateLimit } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import { menuItemSchema, uuidSchema } from '@/lib/validation';
import { z } from 'zod';

type ActionResult = { success: boolean; error?: string; data?: any };

// ─── Sub-schemas for variations and add-ons ──────────────────────────────────

const variationSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Variation name is required'),
  price: z.number().nonnegative('Variation price must be non-negative'),
  image: z.string().url().optional().nullable(),
});

const addOnSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Add-on name is required'),
  price: z.number().nonnegative('Add-on price must be non-negative'),
  category: z.string().min(1, 'Add-on category is required'),
});

const menuItemWithNested = menuItemSchema.extend({
  variations: z.array(variationSchema).optional().default([]),
  addOns: z.array(addOnSchema).optional().default([]),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert camelCase frontend payload to snake_case DB columns. */
function toDbPayload(parsed: z.infer<typeof menuItemSchema>) {
  return {
    name: parsed.name,
    description: parsed.description,
    base_price: parsed.basePrice,
    category: parsed.category,
    image_url: parsed.image ?? null,
    popular: parsed.popular,
    available: parsed.available,
    show_in_messenger: parsed.show_in_messenger,
    discount_price: parsed.discountPrice ?? null,
    discount_start_date: parsed.discountStartDate ?? null,
    discount_end_date: parsed.discountEndDate ?? null,
    discount_active: parsed.discountActive,
    cost_price: parsed.costPrice ?? null,
  };
}

function toVariationRows(
  variations: z.infer<typeof variationSchema>[],
  menuItemId: string,
) {
  return variations
    .filter((v) => v.name && v.price !== undefined)
    .map((v) => ({
      menu_item_id: menuItemId,
      name: v.name.trim(),
      price: v.price,
      image_url: v.image ?? null,
    }));
}

function toAddOnRows(
  addOns: z.infer<typeof addOnSchema>[],
  menuItemId: string,
) {
  return addOns
    .filter((a) => a.name && a.price !== undefined && a.category)
    .map((a) => ({
      menu_item_id: menuItemId,
      name: a.name.trim(),
      price: a.price,
      category: a.category.trim(),
    }));
}

// ─── addMenuItem ─────────────────────────────────────────────────────────────

export async function addMenuItem(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  const parsed = menuItemWithNested.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  // 1. Insert the menu item
  const { data: menuItem, error: itemError } = await (supabaseServer
    .from('menu_items') as any)
    .insert(toDbPayload(parsed.data))
    .select()
    .single();

  if (itemError || !menuItem) {
    console.error('[addMenuItem] DB error:', itemError?.code);
    return { success: false, error: 'Failed to create menu item' };
  }

  // 2. Insert variations
  const variations = toVariationRows(parsed.data.variations, menuItem.id);
  if (variations.length > 0) {
    const { error } = await (supabaseServer.from('variations') as any).insert(variations);
    if (error) {
      console.error('[addMenuItem] Variations DB error:', error.code);
      return { success: false, error: 'Failed to create variations' };
    }
  }

  // 3. Insert add-ons
  const addOns = toAddOnRows(parsed.data.addOns, menuItem.id);
  if (addOns.length > 0) {
    const { error } = await (supabaseServer.from('add_ons') as any).insert(addOns);
    if (error) {
      console.error('[addMenuItem] Add-ons DB error:', error.code);
      return { success: false, error: 'Failed to create add-ons' };
    }
  }

  revalidateTag('menu');
  revalidatePath('/admin/menu');
  return { success: true, data: menuItem };
}

// ─── updateMenuItem ──────────────────────────────────────────────────────────

export async function updateMenuItem(id: unknown, input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success) return { success: false, error: 'Invalid ID' };

  const parsed = menuItemWithNested.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  // 1. Update the menu item
  const { error: itemError } = await (supabaseServer
    .from('menu_items') as any)
    .update(toDbPayload(parsed.data))
    .eq('id', idResult.data);

  if (itemError) {
    console.error('[updateMenuItem] DB error:', itemError.code);
    return { success: false, error: 'Failed to update menu item' };
  }

  // 2. Replace variations: delete existing, then insert new set
  await (supabaseServer.from('variations') as any).delete().eq('menu_item_id', idResult.data);

  const variations = toVariationRows(parsed.data.variations, idResult.data);
  if (variations.length > 0) {
    const { error } = await (supabaseServer.from('variations') as any).insert(variations);
    if (error) {
      console.error('[updateMenuItem] Variations DB error:', error.code);
      return { success: false, error: 'Failed to update variations' };
    }
  }

  // 3. Replace add-ons: delete existing, then insert new set
  await (supabaseServer.from('add_ons') as any).delete().eq('menu_item_id', idResult.data);

  const addOns = toAddOnRows(parsed.data.addOns, idResult.data);
  if (addOns.length > 0) {
    const { error } = await (supabaseServer.from('add_ons') as any).insert(addOns);
    if (error) {
      console.error('[updateMenuItem] Add-ons DB error:', error.code);
      return { success: false, error: 'Failed to update add-ons' };
    }
  }

  revalidateTag('menu');
  revalidatePath('/admin/menu');
  return { success: true };
}

// ─── deleteMenuItem ──────────────────────────────────────────────────────────

export async function deleteMenuItem(id: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success) return { success: false, error: 'Invalid ID' };

  // Cascade: variations and add_ons are deleted by FK cascade in DB,
  // but we explicitly delete them for safety.
  await (supabaseServer.from('variations') as any).delete().eq('menu_item_id', idResult.data);
  await (supabaseServer.from('add_ons') as any).delete().eq('menu_item_id', idResult.data);

  const { error } = await (supabaseServer
    .from('menu_items') as any)
    .delete()
    .eq('id', idResult.data);

  if (error) {
    console.error('[deleteMenuItem] DB error:', error.code);
    return { success: false, error: 'Failed to delete menu item' };
  }

  revalidateTag('menu');
  revalidatePath('/admin/menu');
  return { success: true };
}

// ─── bulkUpdateMessengerVisibility ───────────────────────────────────────────

const bulkMessengerSchema = z.object({
  ids: z.union([z.array(uuidSchema), z.literal('all')]),
  show_in_messenger: z.boolean(),
});

export async function bulkUpdateMessengerVisibility(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  const parsed = bulkMessengerSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const { ids, show_in_messenger } = parsed.data;

  let data;
  let error;

  if (ids === 'all') {
    ({ data, error } = await (supabaseServer.from('menu_items') as any)
      .update({ show_in_messenger })
      .gte('created_at', '1970-01-01')
      .select('id'));
  } else {
    if (ids.length === 0) {
      return { success: true, data: { updated: 0 } };
    }
    ({ data, error } = await (supabaseServer.from('menu_items') as any)
      .update({ show_in_messenger })
      .in('id', ids)
      .select('id'));
  }

  if (error) {
    console.error('[bulkUpdateMessengerVisibility] DB error:', error.code);
    return { success: false, error: 'Failed to update menu items' };
  }

  revalidateTag('menu');
  revalidatePath('/admin/menu');
  return { success: true, data: { updated: Array.isArray(data) ? data.length : 0 } };
}
