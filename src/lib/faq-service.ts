import { supabaseServer } from '@/lib/supabase-server';
import { sendButtonTemplate, sendTextMessage } from '@/lib/messenger';
import type { FaqEntry, FaqInput } from '@/types';

// --- Cache ---
let cachedEntries: FaqEntry[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getFaqEntries(): Promise<FaqEntry[]> {
  const now = Date.now();
  if (cachedEntries && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedEntries;
  }

  const { data, error } = await (supabaseServer.from('faq_entries') as any)
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

  if (error || !data) {
    console.error('Failed to fetch FAQ entries:', error);
    return cachedEntries || [];
  }

  cachedEntries = data as FaqEntry[];
  cacheTimestamp = now;
  return cachedEntries;
}

export function invalidateFaqCache(): void {
  cachedEntries = null;
  cacheTimestamp = 0;
}

// --- Matching ---
export async function matchFaq(userText: string): Promise<FaqEntry | null> {
  const normalized = userText.toLowerCase().trim().replace(/[?!.,;:'"]/g, '');
  const entries = await getFaqEntries();

  let bestMatch: FaqEntry | null = null;
  let bestScore = 0;

  for (const entry of entries) {
    let score = 0;
    for (const keyword of entry.keywords) {
      const normalizedKeyword = keyword.toLowerCase();
      if (normalized.includes(normalizedKeyword)) {
        score++;
      }
    }

    if (score > bestScore || (score === bestScore && score > 0 && entry.sort_order < (bestMatch?.sort_order ?? Infinity))) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  return bestScore > 0 ? bestMatch : null;
}

// --- Response Builder ---
export async function buildFaqResponse(
  entry: FaqEntry,
  psid: string,
  pageToken: string,
  siteUrl: string
): Promise<void> {
  switch (entry.action_type) {
    case 'text':
      await sendButtonTemplate(psid, entry.answer, [
        { type: 'postback', title: 'Browse Menu', payload: 'MAIN_MENU' },
        { type: 'web_url', title: 'Order Online', url: siteUrl },
      ], pageToken);
      break;

    case 'send_menu':
      // Handled by caller — handler checks for send_menu before calling buildFaqResponse
      console.warn('buildFaqResponse called with send_menu — this should be handled by the caller');
      break;

    case 'send_branches': {
      const { data: branches } = await supabaseServer
        .from('branches')
        .select('name, address, phone')
        .eq('active', true);

      if (branches && branches.length > 0) {
        const branchText = branches.map((b: any) =>
          `• ${b.name}: ${b.address} — ${b.phone}`
        ).join('\n');
        await sendButtonTemplate(psid, `Our branches:\n\n${branchText}`, [
          { type: 'postback', title: 'Browse Menu', payload: 'MAIN_MENU' },
          { type: 'web_url', title: 'Order Online', url: siteUrl },
        ], pageToken);
      } else {
        await sendTextMessage(psid, entry.answer, pageToken);
      }
      break;
    }

    case 'connect_human': {
      const { data: branches } = await supabaseServer
        .from('branches')
        .select('name, phone')
        .eq('active', true);

      const contactText = branches && branches.length > 0
        ? `${entry.answer}\n\nContact:\n${branches.map((b: any) => `• ${b.name}: ${b.phone}`).join('\n')}`
        : entry.answer;

      await sendButtonTemplate(psid, contactText, [
        { type: 'postback', title: 'Browse Menu', payload: 'MAIN_MENU' },
      ], pageToken);
      break;
    }
  }
}

// --- Admin CRUD ---
export async function getAllFaqs(): Promise<FaqEntry[]> {
  const { data, error } = await (supabaseServer.from('faq_entries') as any)
    .select('*')
    .order('sort_order');

  if (error || !data) return [];
  return data as FaqEntry[];
}

export async function upsertFaq(input: FaqInput): Promise<FaqEntry | null> {
  if (input.id) {
    const { data, error } = await (supabaseServer.from('faq_entries') as any)
      .update({
        question: input.question,
        answer: input.answer,
        keywords: input.keywords,
        category: input.category ?? null,
        action_type: input.action_type ?? 'text',
        sort_order: input.sort_order ?? 0,
      })
      .eq('id', input.id)
      .select()
      .single();

    if (error || !data) return null;
    invalidateFaqCache();
    return data as FaqEntry;
  }

  const { data, error } = await (supabaseServer.from('faq_entries') as any)
    .insert({
      question: input.question,
      answer: input.answer,
      keywords: input.keywords,
      category: input.category ?? null,
      action_type: input.action_type ?? 'text',
      sort_order: input.sort_order ?? 0,
    })
    .select()
    .single();

  if (error || !data) return null;
  invalidateFaqCache();
  return data as FaqEntry;
}

export async function deleteFaq(id: string): Promise<boolean> {
  const { error } = await (supabaseServer.from('faq_entries') as any)
    .update({ is_active: false })
    .eq('id', id);

  if (error) return false;
  invalidateFaqCache();
  return true;
}
