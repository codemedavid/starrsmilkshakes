'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, checkActionRateLimit } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import { branchSchema, uuidSchema } from '@/lib/validation';

type ActionResult = { success: boolean; error?: string; data?: any };

// ─── addBranch ───────────────────────────────────────────────────────────────

export async function addBranch(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  const parsed = branchSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const { data, error } = await (supabaseServer
    .from('branches') as any)
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    console.error('[addBranch] DB error:', error.code);
    return { success: false, error: 'Failed to create branch' };
  }

  revalidatePath('/admin/branches');
  return { success: true, data };
}

// ─── updateBranch ────────────────────────────────────────────────────────────

export async function updateBranch(id: unknown, input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success) return { success: false, error: 'Invalid ID' };

  const parsed = branchSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const { data, error } = await (supabaseServer
    .from('branches') as any)
    .update(parsed.data)
    .eq('id', idResult.data)
    .select()
    .single();

  if (error) {
    console.error('[updateBranch] DB error:', error.code);
    return { success: false, error: 'Failed to update branch' };
  }

  revalidatePath('/admin/branches');
  return { success: true, data };
}

// ─── deleteBranch ────────────────────────────────────────────────────────────

export async function deleteBranch(id: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success) return { success: false, error: 'Invalid ID' };

  const { error } = await (supabaseServer
    .from('branches') as any)
    .delete()
    .eq('id', idResult.data);

  if (error) {
    console.error('[deleteBranch] DB error:', error.code);
    return { success: false, error: 'Failed to delete branch' };
  }

  revalidatePath('/admin/branches');
  return { success: true };
}
