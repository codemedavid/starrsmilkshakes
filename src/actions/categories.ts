'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAdmin, checkActionRateLimit } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import { categorySchema, reorderSchema, uuidSchema } from '@/lib/validation';
import { syncEmbedding, removeEmbedding, buildCategoryContent } from '@/lib/rag-sync';

type ActionResult = { success: boolean; error?: string; data?: any };

// ─── addCategory ─────────────────────────────────────────────────────────────

export async function addCategory(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  // Build insert payload — include optional id_slug only when provided
  const payload: Record<string, unknown> = {
    name: parsed.data.name,
    icon: parsed.data.icon ?? '',
  };
  if (parsed.data.id_slug) {
    payload.id = parsed.data.id_slug;
  }

  const { data, error } = await (supabaseServer
    .from('categories') as any)
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('[addCategory] DB error:', error.code);
    return { success: false, error: 'Failed to create category' };
  }

  revalidateTag('categories');
  revalidatePath('/admin/categories');

  // Fire-and-forget RAG sync
  syncEmbedding('categories', data.id, buildCategoryContent(data), { name: data.name }).catch((err) => console.error('[rag-sync] category add:', err));

  return { success: true, data };
}

// ─── updateCategory ──────────────────────────────────────────────────────────

export async function updateCategory(id: unknown, input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success) return { success: false, error: 'Invalid ID' };

  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const updates: Record<string, unknown> = {
    name: parsed.data.name,
    icon: parsed.data.icon ?? '',
  };

  const { data, error } = await (supabaseServer
    .from('categories') as any)
    .update(updates)
    .eq('id', idResult.data)
    .select()
    .single();

  if (error) {
    console.error('[updateCategory] DB error:', error.code);
    return { success: false, error: 'Failed to update category' };
  }

  revalidateTag('categories');
  revalidatePath('/admin/categories');

  // Fire-and-forget RAG sync
  syncEmbedding('categories', data.id, buildCategoryContent(data), { name: data.name }).catch((err) => console.error('[rag-sync] category update:', err));

  return { success: true, data };
}

// ─── deleteCategory ──────────────────────────────────────────────────────────

export async function deleteCategory(id: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success) return { success: false, error: 'Invalid ID' };

  // Guard: prevent deleting a category that still has menu items
  const { data: menuItems, error: menuError } = await (supabaseServer
    .from('menu_items') as any)
    .select('id')
    .eq('category', idResult.data)
    .limit(1);

  if (menuError) {
    console.error('[deleteCategory] menu check error:', menuError.code);
    return { success: false, error: 'Failed to validate category usage' };
  }

  if (menuItems && menuItems.length > 0) {
    return { success: false, error: 'Cannot delete a category that still contains menu items' };
  }

  const { error } = await (supabaseServer
    .from('categories') as any)
    .delete()
    .eq('id', idResult.data);

  if (error) {
    console.error('[deleteCategory] DB error:', error.code);
    return { success: false, error: 'Failed to delete category' };
  }

  revalidateTag('categories');
  revalidatePath('/admin/categories');

  // Fire-and-forget RAG sync
  removeEmbedding('categories', idResult.data).catch((err) => console.error('[rag-sync] category delete:', err));

  return { success: true };
}

// ─── reorderCategories ───────────────────────────────────────────────────────

export async function reorderCategories(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const { ids } = parsed.data;

  // Update all categories in parallel, assigning sort_order by position
  const results = await Promise.all(
    ids.map((id, index) =>
      (supabaseServer.from('categories') as any)
        .update({ sort_order: index + 1 })
        .eq('id', id),
    ),
  );

  const failed = results.find((result: any) => result.error);
  if (failed?.error) {
    console.error('[reorderCategories] DB error:', (failed as any).error.code);
    return { success: false, error: 'Failed to reorder categories' };
  }

  revalidateTag('categories');
  revalidatePath('/admin/categories');
  return { success: true };
}
