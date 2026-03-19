'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAdmin, checkActionRateLimit } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import {
  updateItemCostSchema,
  updateVariationCostSchema,
  updateAddOnCostSchema,
  bulkImportCostsSchema,
} from '@/lib/validation';

type ActionResult = { success: boolean; error?: string; data?: any };

export async function updateItemCost(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const parsed = updateItemCostSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const { itemId, costPrice } = parsed.data;
  const { data, error } = await (supabaseServer.from('menu_items') as any)
    .update({ cost_price: costPrice })
    .eq('id', itemId)
    .select()
    .single();

  if (error) return { success: false, error: 'Failed to update cost' };

  revalidateTag('menu-items');
  revalidatePath('/admin/menu');
  return { success: true, data };
}

export async function updateVariationCost(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const parsed = updateVariationCostSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const { variationId, costPrice } = parsed.data;
  const { data, error } = await (supabaseServer.from('variations') as any)
    .update({ cost_price: costPrice })
    .eq('id', variationId)
    .select()
    .single();

  if (error) return { success: false, error: 'Failed to update cost' };

  revalidateTag('menu-items');
  revalidatePath('/admin/menu');
  return { success: true, data };
}

export async function updateAddOnCost(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const parsed = updateAddOnCostSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const { addOnId, costPrice } = parsed.data;
  const { data, error } = await (supabaseServer.from('add_ons') as any)
    .update({ cost_price: costPrice })
    .eq('id', addOnId)
    .select()
    .single();

  if (error) return { success: false, error: 'Failed to update cost' };

  revalidateTag('menu-items');
  revalidatePath('/admin/menu');
  return { success: true, data };
}

export async function previewBulkImportCosts(input: unknown): Promise<ActionResult> {
  await requireAdmin();

  const parsed = bulkImportCostsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const { items } = parsed.data;

  const { data: menuItems, error: fetchError } = await (supabaseServer.from('menu_items') as any)
    .select('id, name');

  if (fetchError || !menuItems) return { success: false, error: 'Failed to fetch menu items' };

  const menuMap = new Map<string, { id: string; name: string }>();
  for (const mi of menuItems) {
    menuMap.set(mi.name.toLowerCase().trim(), { id: mi.id, name: mi.name });
  }

  const matches: { name: string; menuItemId: string; menuItemName: string; costPrice: number }[] = [];
  const notFound: string[] = [];

  for (const item of items) {
    const normalized = item.name.toLowerCase().trim();
    const match = menuMap.get(normalized);
    if (match) {
      matches.push({ name: item.name, menuItemId: match.id, menuItemName: match.name, costPrice: item.costPrice });
    } else {
      notFound.push(item.name);
    }
  }

  return { success: true, data: { matches, notFound } };
}

export async function applyBulkImportCosts(
  items: { menuItemId: string; costPrice: number }[],
): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  let updated = 0;
  for (const item of items) {
    const { error } = await (supabaseServer.from('menu_items') as any)
      .update({ cost_price: item.costPrice })
      .eq('id', item.menuItemId);
    if (!error) updated++;
  }

  revalidateTag('menu-items');
  revalidatePath('/admin/menu');
  return { success: true, data: { updated } };
}
