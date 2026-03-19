'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAdmin, checkActionRateLimit } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import { paymentMethodSchema, reorderSchema, uuidSchema } from '@/lib/validation';

type ActionResult = { success: boolean; error?: string; data?: any };

// ─── addPaymentMethod ────────────────────────────────────────────────────────

export async function addPaymentMethod(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  const parsed = paymentMethodSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const payload = {
    id: parsed.data.id,
    name: parsed.data.name,
    account_name: parsed.data.account_name,
    account_number: parsed.data.account_number,
    qr_code_url: parsed.data.qr_code_url,
    active: parsed.data.active,
    sort_order: parsed.data.sort_order ?? 0,
  };

  const { data, error } = await (supabaseServer
    .from('payment_methods') as any)
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('[addPaymentMethod] DB error:', error.code);
    return { success: false, error: 'Failed to create payment method' };
  }

  revalidateTag('payments');
  revalidatePath('/admin/payments');
  return { success: true, data };
}

// ─── updatePaymentMethod ─────────────────────────────────────────────────────

export async function updatePaymentMethod(id: unknown, input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success) return { success: false, error: 'Invalid ID' };

  const parsed = paymentMethodSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const updates = {
    name: parsed.data.name,
    account_name: parsed.data.account_name,
    account_number: parsed.data.account_number,
    qr_code_url: parsed.data.qr_code_url,
    active: parsed.data.active,
    sort_order: parsed.data.sort_order ?? 0,
  };

  const { data, error } = await (supabaseServer
    .from('payment_methods') as any)
    .update(updates)
    .eq('id', idResult.data)
    .select()
    .single();

  if (error) {
    console.error('[updatePaymentMethod] DB error:', error.code);
    return { success: false, error: 'Failed to update payment method' };
  }

  revalidateTag('payments');
  revalidatePath('/admin/payments');
  return { success: true, data };
}

// ─── deletePaymentMethod ─────────────────────────────────────────────────────

export async function deletePaymentMethod(id: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success) return { success: false, error: 'Invalid ID' };

  const { error } = await (supabaseServer
    .from('payment_methods') as any)
    .delete()
    .eq('id', idResult.data);

  if (error) {
    console.error('[deletePaymentMethod] DB error:', error.code);
    return { success: false, error: 'Failed to delete payment method' };
  }

  revalidateTag('payments');
  revalidatePath('/admin/payments');
  return { success: true };
}

// ─── reorderPaymentMethods ───────────────────────────────────────────────────

export async function reorderPaymentMethods(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const { ids } = parsed.data;

  // Update all payment methods in parallel, assigning sort_order by position
  const results = await Promise.all(
    ids.map((id, index) =>
      (supabaseServer.from('payment_methods') as any)
        .update({ sort_order: index + 1 })
        .eq('id', id),
    ),
  );

  const failed = results.find((result: any) => result.error);
  if (failed?.error) {
    console.error('[reorderPaymentMethods] DB error:', (failed as any).error.code);
    return { success: false, error: 'Failed to reorder payment methods' };
  }

  revalidateTag('payments');
  revalidatePath('/admin/payments');
  return { success: true };
}
