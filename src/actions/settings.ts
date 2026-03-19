'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAdmin, checkActionRateLimit } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import { siteSettingsSchema } from '@/lib/validation';
import { mapSiteSettingsRows } from '@/lib/site-settings';
import type { SiteSettings } from '@/types';

type ActionResult = { success: boolean; error?: string; data?: SiteSettings };

// ─── updateSiteSettings ──────────────────────────────────────────────────────

export async function updateSiteSettings(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  const parsed = siteSettingsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const entries = Object.entries(parsed.data).filter(([key]) => Boolean(key));

  if (entries.length === 0) {
    return { success: false, error: 'No updates provided' };
  }

  const results = await Promise.all(
    entries.map(([id, value]) =>
      (supabaseServer
        .from('site_settings') as any)
        .update({ value: String(value ?? '') })
        .eq('id', id)
    )
  );

  const failed = results.find((result) => result.error);
  if (failed?.error) {
    console.error('[updateSiteSettings] DB error:', failed.error.code);
    return { success: false, error: 'Failed to update site settings' };
  }

  const { data, error } = await (supabaseServer
    .from('site_settings') as any)
    .select('*')
    .order('id');

  if (error) {
    console.error('[updateSiteSettings] Refetch error:', error.code);
    return { success: false, error: 'Settings updated but failed to reload' };
  }

  revalidateTag('settings');
  revalidatePath('/admin/settings');
  return { success: true, data: mapSiteSettingsRows(data as any[]) };
}
