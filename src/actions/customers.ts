'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAdmin, requireSuperAdmin, getClientIPFromHeaders, checkActionRateLimit } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import { customerLinkSchema, customerUnlinkSchema } from '@/lib/validation';

type ActionResult = { success: boolean; error?: string };

// ─── linkCustomer ───────────────────────────────────────────────────────────

export async function linkCustomer(input: unknown): Promise<ActionResult> {
  const { adminType } = await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };
  const parsed = customerLinkSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  // Verify customer exists
  const { data: customer } = await (supabaseServer
    .from('customers') as any)
    .select('id')
    .eq('id', parsed.data.customer_id)
    .single();
  if (!customer) return { success: false, error: 'Customer not found' };

  // Update order
  const { error } = await (supabaseServer
    .from('orders') as any)
    .update({ customer_id: parsed.data.customer_id })
    .eq('id', parsed.data.order_id);
  if (error) return { success: false, error: 'Failed to link customer' };

  // Resolve performer identity — email for super admins, 'admin' for regular
  let performedBy = 'admin';
  if (adminType === 'super_admin') {
    const { adminId } = await requireSuperAdmin();
    const { data: sa } = await (supabaseServer
      .from('super_admins') as any)
      .select('email')
      .eq('id', adminId)
      .single();
    performedBy = sa?.email || adminId;
  }

  // Audit log
  const ip = await getClientIPFromHeaders();
  await (supabaseServer
    .from('customer_link_audit') as any)
    .insert({
      order_id: parsed.data.order_id,
      customer_id: parsed.data.customer_id,
      action: 'link',
      reason: parsed.data.reason,
      performed_by: performedBy,
      admin_type: adminType,
      ip_address: ip,
    });

  revalidateTag('customers');
  revalidatePath('/admin/orders');
  return { success: true };
}

// ─── unlinkCustomer ─────────────────────────────────────────────────────────

export async function unlinkCustomer(input: unknown): Promise<ActionResult> {
  const { adminId } = await requireSuperAdmin(); // ONLY super admins
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };
  const parsed = customerUnlinkSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  // Get current customer_id before unlinking
  const { data: order } = await (supabaseServer
    .from('orders') as any)
    .select('customer_id')
    .eq('id', parsed.data.order_id)
    .single();
  if (!order?.customer_id) return { success: false, error: 'No linked customer' };

  // Unlink
  const { error } = await (supabaseServer
    .from('orders') as any)
    .update({ customer_id: null })
    .eq('id', parsed.data.order_id);
  if (error) return { success: false, error: 'Failed to unlink' };

  // Resolve email
  const { data: sa } = await (supabaseServer
    .from('super_admins') as any)
    .select('email')
    .eq('id', adminId)
    .single();

  // Audit log
  const ip = await getClientIPFromHeaders();
  await (supabaseServer
    .from('customer_link_audit') as any)
    .insert({
      order_id: parsed.data.order_id,
      customer_id: order.customer_id,
      action: 'unlink',
      reason: parsed.data.reason,
      performed_by: sa?.email || adminId,
      admin_type: 'super_admin',
      ip_address: ip,
    });

  revalidateTag('customers');
  revalidatePath('/admin/orders');
  return { success: true };
}
