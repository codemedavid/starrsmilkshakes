'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAdmin, checkActionRateLimit } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import { upsellRuleSchema, setAddonSuggestionsSchema, pairRuleSchema } from '@/lib/validation';

type ActionResult = { success: boolean; error?: string; data?: any };

// ── Upsell Rules (Phase 1, 3, 4) ───────────────────────────────────────────

export async function createUpsellRule(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const parsed = upsellRuleSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input: ' + parsed.error.issues.map(i => i.message).join(', ') };

  const { data, error } = await (supabaseServer.from('upsell_rules') as any)
    .insert(parsed.data).select().single();

  if (error) return { success: false, error: 'Failed to create rule' };
  revalidateTag('upsell-rules');
  revalidatePath('/admin/upsell');
  return { success: true, data };
}

export async function updateUpsellRule(id: string, input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const parsed = upsellRuleSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const { error } = await (supabaseServer.from('upsell_rules') as any)
    .update(parsed.data).eq('id', id);

  if (error) return { success: false, error: 'Failed to update rule' };
  revalidateTag('upsell-rules');
  revalidatePath('/admin/upsell');
  return { success: true };
}

export async function deleteUpsellRule(id: string): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const { error } = await (supabaseServer.from('upsell_rules') as any).delete().eq('id', id);
  if (error) return { success: false, error: 'Failed to delete rule' };
  revalidateTag('upsell-rules');
  revalidatePath('/admin/upsell');
  return { success: true };
}

export async function toggleUpsellRule(id: string): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const { data: rule, error: fetchError } = await (supabaseServer.from('upsell_rules') as any)
    .select('is_active').eq('id', id).single();
  if (fetchError || !rule) return { success: false, error: 'Rule not found' };

  const { error } = await (supabaseServer.from('upsell_rules') as any)
    .update({ is_active: !rule.is_active }).eq('id', id);
  if (error) return { success: false, error: 'Failed to toggle rule' };
  revalidateTag('upsell-rules');
  revalidatePath('/admin/upsell');
  return { success: true, data: { is_active: !rule.is_active } };
}

// ── Add-on Suggestions (Phase 2) ───────────────────────────────────────────

export async function setAddonSuggestions(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const parsed = setAddonSuggestionsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const { menu_item_id, suggestions } = parsed.data;

  // Delete existing suggestions for this item
  await (supabaseServer.from('addon_suggestions') as any)
    .delete().eq('menu_item_id', menu_item_id);

  // Insert new ones
  if (suggestions.length > 0) {
    const rows = suggestions.map(s => ({ menu_item_id, ...s }));
    const { error } = await (supabaseServer.from('addon_suggestions') as any).insert(rows);
    if (error) return { success: false, error: 'Failed to save suggestions' };
  }

  revalidateTag('addon-suggestions');
  revalidatePath('/admin/upsell');
  return { success: true };
}

// ── Pair Rules (Phase 3) ────────────────────────────────────────────────────

export async function createPairRule(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const parsed = pairRuleSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input: ' + parsed.error.issues.map(i => i.message).join(', ') };

  const { data, error } = await (supabaseServer.from('pair_rules') as any)
    .insert(parsed.data).select().single();
  if (error) return { success: false, error: 'Failed to create pair rule' };
  revalidateTag('pair-rules');
  revalidatePath('/admin/upsell');
  return { success: true, data };
}

export async function updatePairRule(id: string, input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const parsed = pairRuleSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const { error } = await (supabaseServer.from('pair_rules') as any)
    .update(parsed.data).eq('id', id);
  if (error) return { success: false, error: 'Failed to update pair rule' };
  revalidateTag('pair-rules');
  revalidatePath('/admin/upsell');
  return { success: true };
}

export async function deletePairRule(id: string): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests' };

  const { error } = await (supabaseServer.from('pair_rules') as any).delete().eq('id', id);
  if (error) return { success: false, error: 'Failed to delete pair rule' };
  revalidateTag('pair-rules');
  revalidatePath('/admin/upsell');
  return { success: true };
}
