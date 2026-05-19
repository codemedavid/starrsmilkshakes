'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAdmin, checkActionRateLimit } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import { createBundleSchema, updateBundleSchema } from '@/lib/validation';

type ActionResult = { success: boolean; error?: string; data?: any };

export async function createBundle(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const parsed = createBundleSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input: ' + parsed.error.issues.map(i => i.message).join(', ') };

  const { slots, ...bundleData } = parsed.data;

  // Insert bundle
  const { data: bundle, error: bundleError } = await (supabaseServer.from('bundles') as any)
    .insert({
      name: bundleData.name,
      description: bundleData.description ?? null,
      image_url: bundleData.image_url ?? null,
      base_price: bundleData.base_price,
      cost_price: bundleData.cost_price ?? null,
      category: bundleData.category,
      discount_price: bundleData.discount_price ?? null,
      discount_active: bundleData.discount_active ?? false,
      discount_start_date: bundleData.discount_start_date ?? null,
      discount_end_date: bundleData.discount_end_date ?? null,
      available: bundleData.available ?? true,
      popular: bundleData.popular ?? false,
      sort_order: bundleData.sort_order ?? 0,
    })
    .select()
    .single();

  if (bundleError || !bundle) return { success: false, error: 'Failed to create bundle: ' + (bundleError?.message ?? 'No data returned') };

  // Insert slots
  for (const slot of slots) {
    const { data: slotData, error: slotError } = await (supabaseServer.from('bundle_slots') as any)
      .insert({
        bundle_id: bundle.id,
        label: slot.label,
        sort_order: slot.sort_order ?? 0,
        min_selections: slot.min_selections ?? 1,
        max_selections: slot.max_selections ?? 1,
      })
      .select()
      .single();

    if (slotError || !slotData) {
      // Cleanup: delete the bundle (cascades slots)
      await (supabaseServer.from('bundles') as any).delete().eq('id', bundle.id);
      return { success: false, error: 'Failed to create slot: ' + slot.label };
    }

    // Insert slot items
    if (slot.items.length > 0) {
      const slotItems = slot.items.map((item: any, idx: number) => ({
        slot_id: slotData.id,
        menu_item_id: item.menu_item_id,
        price_override: item.price_override ?? null,
        sort_order: item.sort_order ?? idx,
      }));

      const { error: itemsError } = await (supabaseServer.from('bundle_slot_items') as any)
        .insert(slotItems);

      if (itemsError) {
        await (supabaseServer.from('bundles') as any).delete().eq('id', bundle.id);
        return { success: false, error: 'Failed to create slot items' };
      }
    }
  }

  revalidateTag('bundles');
  revalidatePath('/admin/bundles');
  return { success: true, data: bundle };
}

export async function updateBundle(id: string, input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const parsed = updateBundleSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input: ' + parsed.error.issues.map(i => i.message).join(', ') };

  const { slots, ...bundleData } = parsed.data;

  // Update bundle
  const { error: bundleError } = await (supabaseServer.from('bundles') as any)
    .update({
      name: bundleData.name,
      description: bundleData.description ?? null,
      image_url: bundleData.image_url ?? null,
      base_price: bundleData.base_price,
      cost_price: bundleData.cost_price ?? null,
      category: bundleData.category,
      discount_price: bundleData.discount_price ?? null,
      discount_active: bundleData.discount_active ?? false,
      discount_start_date: bundleData.discount_start_date ?? null,
      discount_end_date: bundleData.discount_end_date ?? null,
      available: bundleData.available ?? true,
      popular: bundleData.popular ?? false,
      sort_order: bundleData.sort_order ?? 0,
    })
    .eq('id', id);

  if (bundleError) return { success: false, error: 'Failed to update bundle' };

  // Delete old slots (cascades to slot_items)
  await (supabaseServer.from('bundle_slots') as any).delete().eq('bundle_id', id);

  // Insert new slots
  for (const slot of slots) {
    const { data: slotData, error: slotError } = await (supabaseServer.from('bundle_slots') as any)
      .insert({
        bundle_id: id,
        label: slot.label,
        sort_order: slot.sort_order ?? 0,
        min_selections: slot.min_selections ?? 1,
        max_selections: slot.max_selections ?? 1,
      })
      .select()
      .single();

    if (slotError || !slotData) return { success: false, error: 'Failed to update slot' };

    if (slot.items.length > 0) {
      const slotItems = slot.items.map((item: any, idx: number) => ({
        slot_id: slotData.id,
        menu_item_id: item.menu_item_id,
        price_override: item.price_override ?? null,
        sort_order: item.sort_order ?? idx,
      }));

      const { error: itemsError } = await (supabaseServer.from('bundle_slot_items') as any)
        .insert(slotItems);

      if (itemsError) return { success: false, error: 'Failed to update slot items' };
    }
  }

  revalidateTag('bundles');
  revalidatePath('/admin/bundles');
  return { success: true };
}

export async function deleteBundle(id: string): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const { error } = await (supabaseServer.from('bundles') as any)
    .delete()
    .eq('id', id);

  if (error) return { success: false, error: 'Failed to delete bundle' };

  revalidateTag('bundles');
  revalidatePath('/admin/bundles');
  return { success: true };
}

export async function toggleBundleAvailability(id: string): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  // Fetch current state
  const { data: bundle, error: fetchError } = await (supabaseServer.from('bundles') as any)
    .select('available')
    .eq('id', id)
    .single();

  if (fetchError || !bundle) return { success: false, error: 'Bundle not found' };

  const { error } = await (supabaseServer.from('bundles') as any)
    .update({ available: !bundle.available })
    .eq('id', id);

  if (error) return { success: false, error: 'Failed to toggle availability' };

  revalidateTag('bundles');
  revalidatePath('/admin/bundles');
  return { success: true, data: { available: !bundle.available } };
}
