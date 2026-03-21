'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAdmin, checkActionRateLimit } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import {
  loyaltyConfigSchema,
  loyaltyGoalSchema,
  loyaltyMilestoneSchema,
  loyaltyBoosterSchema,
  uuidSchema,
} from '@/lib/validation';

type ActionResult = { success: boolean; error?: string; data?: any };

// ─── updateLoyaltyConfig ─────────────────────────────────────────────────────

export async function updateLoyaltyConfig(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  const parsed = loyaltyConfigSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  // Singleton — fetch the row's UUID first, then update by it
  const { data: row } = await (supabaseServer
    .from('loyalty_config') as any)
    .select('id')
    .limit(1)
    .single();
  if (!row) return { success: false, error: 'Loyalty config not initialized' };

  const { data, error } = await (supabaseServer
    .from('loyalty_config') as any)
    .update(parsed.data)
    .eq('id', row.id)
    .select()
    .single();

  if (error) {
    console.error('[updateLoyaltyConfig] DB error:', error.code);
    return { success: false, error: 'Failed to update loyalty config' };
  }

  revalidateTag('loyalty-config');
  revalidatePath('/admin/loyalty');
  return { success: true, data };
}

// ─── createGoal ───────────────────────────────────────────────────────────────

export async function createGoal(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  const parsed = loyaltyGoalSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const { data, error } = await (supabaseServer
    .from('loyalty_goals') as any)
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    console.error('[createGoal] DB error:', error.code);
    return { success: false, error: 'Failed to create goal' };
  }

  revalidateTag('loyalty-goals');
  revalidatePath('/admin/loyalty');
  return { success: true, data };
}

// ─── updateGoal ───────────────────────────────────────────────────────────────

export async function updateGoal(id: unknown, input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success) return { success: false, error: 'Invalid ID' };

  const parsed = loyaltyGoalSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const { data, error } = await (supabaseServer
    .from('loyalty_goals') as any)
    .update(parsed.data)
    .eq('id', idResult.data)
    .select()
    .single();

  if (error) {
    console.error('[updateGoal] DB error:', error.code);
    return { success: false, error: 'Failed to update goal' };
  }

  revalidateTag('loyalty-goals');
  revalidatePath('/admin/loyalty');
  return { success: true, data };
}

// ─── toggleGoal ───────────────────────────────────────────────────────────────

export async function toggleGoal(id: unknown, isActive: boolean): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success) return { success: false, error: 'Invalid ID' };

  const { data, error } = await (supabaseServer
    .from('loyalty_goals') as any)
    .update({ is_active: isActive })
    .eq('id', idResult.data)
    .select()
    .single();

  if (error) {
    console.error('[toggleGoal] DB error:', error.code);
    return { success: false, error: 'Failed to toggle goal' };
  }

  revalidateTag('loyalty-goals');
  revalidatePath('/admin/loyalty');
  return { success: true, data };
}

// ─── createBooster ───────────────────────────────────────────────────────────

export async function createBooster(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  const parsed = loyaltyBoosterSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const { data, error } = await (supabaseServer
    .from('loyalty_boosters') as any)
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    console.error('[createBooster] DB error:', error.code);
    return { success: false, error: 'Failed to create booster' };
  }

  revalidateTag('loyalty-boosters');
  revalidatePath('/admin/loyalty');
  return { success: true, data };
}

// ─── updateBooster ───────────────────────────────────────────────────────────

export async function updateBooster(id: unknown, input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success) return { success: false, error: 'Invalid ID' };

  const parsed = loyaltyBoosterSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const { data, error } = await (supabaseServer
    .from('loyalty_boosters') as any)
    .update(parsed.data)
    .eq('id', idResult.data)
    .select()
    .single();

  if (error) {
    console.error('[updateBooster] DB error:', error.code);
    return { success: false, error: 'Failed to update booster' };
  }

  revalidateTag('loyalty-boosters');
  revalidatePath('/admin/loyalty');
  return { success: true, data };
}

// ─── toggleBooster ───────────────────────────────────────────────────────────

export async function toggleBooster(id: unknown, isActive: boolean): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success) return { success: false, error: 'Invalid ID' };

  const { data, error } = await (supabaseServer
    .from('loyalty_boosters') as any)
    .update({ is_active: isActive })
    .eq('id', idResult.data)
    .select()
    .single();

  if (error) {
    console.error('[toggleBooster] DB error:', error.code);
    return { success: false, error: 'Failed to toggle booster' };
  }

  revalidateTag('loyalty-boosters');
  revalidatePath('/admin/loyalty');
  return { success: true, data };
}

// ─── getRedemptions ──────────────────────────────────────────────────────────

export async function getRedemptions(statusFilter?: string): Promise<ActionResult> {
  await requireAdmin();

  let query = (supabaseServer.from('loyalty_redemptions') as any)
    .select('*, loyalty_cards!inner(customer_id, card_code, customers!inner(name, email)), loyalty_goals!inner(name)')
    .order('earned_at', { ascending: false })
    .limit(50);

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[getRedemptions] DB error:', error.code);
    return { success: false, error: error.message };
  }

  return { success: true, data: data || [] };
}

// ─── Milestone Admin Actions ────────────────────────────────────────────────

export async function createMilestone(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };
  const parsed = loyaltyMilestoneSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const { data, error } = await (supabaseServer
    .from('loyalty_milestones') as any)
    .insert(parsed.data)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  revalidateTag('loyalty-milestones');
  return { success: true, data };
}

export async function updateMilestone(id: unknown, input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };
  if (typeof id !== 'string') return { success: false, error: 'Invalid ID' };
  const parsed = loyaltyMilestoneSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const { data, error } = await (supabaseServer
    .from('loyalty_milestones') as any)
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  revalidateTag('loyalty-milestones');
  return { success: true, data };
}

export async function toggleMilestone(id: unknown, isActive: boolean): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };
  if (typeof id !== 'string') return { success: false, error: 'Invalid ID' };

  const { error } = await (supabaseServer
    .from('loyalty_milestones') as any)
    .update({ is_active: isActive })
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  revalidateTag('loyalty-milestones');
  return { success: true };
}

// ─── getLoyaltyConfig ────────────────────────────────────────────────────────

export async function getLoyaltyConfig(): Promise<ActionResult> {
  const { data, error } = await (supabaseServer
    .from('loyalty_config') as any)
    .select('*')
    .limit(1)
    .single();

  if (error) {
    console.error('[getLoyaltyConfig] DB error:', error.code);
    return { success: false, error: 'Failed to fetch loyalty config' };
  }

  return { success: true, data };
}
