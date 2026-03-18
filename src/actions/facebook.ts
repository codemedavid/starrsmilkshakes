'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin, checkActionRateLimit } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import {
  exchangeForLongLivedToken,
  getPageAccessToken,
  subscribePageToWebhook,
  unsubscribePageFromWebhook,
} from '@/lib/messenger-auth';

type ActionResult = { success: boolean; error?: string; data?: any };

// ─── connectFacebook ─────────────────────────────────────────────────────────

export async function connectFacebook(
  accessToken: string,
  pageId?: string,
): Promise<ActionResult> {
  const { adminId } = await requireSuperAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  if (!accessToken || typeof accessToken !== 'string') {
    return { success: false, error: 'accessToken is required' };
  }

  try {
    const longLivedToken = await exchangeForLongLivedToken(accessToken);
    const pages = await getPageAccessToken(longLivedToken);

    if (pages.length === 0) {
      return { success: false, error: 'No Facebook Pages found for this account' };
    }

    const page = pageId
      ? pages.find((p) => p.pageId === pageId)
      : pages[0];

    if (!page) {
      return { success: false, error: 'Specified page not found' };
    }

    await subscribePageToWebhook(page.pageId, page.pageAccessToken);

    // Clear existing config rows before inserting new one
    const { data: existingConfigs } = await (supabaseServer
      .from('facebook_config') as any)
      .select('id');

    if (existingConfigs && existingConfigs.length > 0) {
      for (const config of existingConfigs) {
        await (supabaseServer.from('facebook_config') as any)
          .delete()
          .eq('id', config.id);
      }
    }

    const insertPayload = {
      page_id: page.pageId,
      page_name: page.pageName,
      page_access_token: page.pageAccessToken,
      app_id: process.env.FACEBOOK_APP_ID || '',
      connected_by: adminId || null,
    };

    const { error: insertError } = await (supabaseServer
      .from('facebook_config') as any)
      .insert(insertPayload);

    if (insertError) {
      console.error('[connectFacebook] DB error:', insertError.code);
      return { success: false, error: 'Failed to save Facebook config' };
    }

    revalidatePath('/admin/facebook');
    return {
      success: true,
      data: {
        page: { id: page.pageId, name: page.pageName },
        pages: pages.map((p) => ({ id: p.pageId, name: p.pageName })),
      },
    };
  } catch (err: any) {
    console.error('[connectFacebook] error:', err.message);
    return { success: false, error: err.message || 'Connection failed' };
  }
}

// ─── disconnectFacebook ──────────────────────────────────────────────────────

export async function disconnectFacebook(): Promise<ActionResult> {
  await requireSuperAdmin();
  const { allowed } = await checkActionRateLimit();
  if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };

  try {
    const { data: config } = await (supabaseServer
      .from('facebook_config') as any)
      .select('page_id, page_access_token')
      .single();

    if (config) {
      await unsubscribePageFromWebhook(config.page_id, config.page_access_token);
      await (supabaseServer.from('facebook_config') as any)
        .delete()
        .eq('page_id', config.page_id);
    }

    revalidatePath('/admin/facebook');
    return { success: true };
  } catch (err: any) {
    console.error('[disconnectFacebook] error:', err.message);
    return { success: false, error: err.message || 'Disconnect failed' };
  }
}
