'use server';

import { requireAdmin } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import { knowledgeEntrySchema, faqEntrySchema, triggerSchema } from '@/lib/validation';
import { syncEmbedding, removeEmbedding, buildKnowledgeEntryContent, buildFaqContent, buildChunkContent } from '@/lib/rag-sync';
import { validateRegexPattern } from '@/lib/trigger-matcher';
import { smartChunk } from '@/lib/document-chunker';
import { PDFParse } from 'pdf-parse';
import type { KnowledgeEntryInput, FaqEntryInput, TriggerInput } from '@/lib/validation';

type ActionResult = { success: boolean; error?: string; data?: any };

export async function getAiConversationSessions(
  page: number = 0,
  filters?: { intent?: string; dateFrom?: string; dateTo?: string }
): Promise<ActionResult> {
  await requireAdmin();

  const PAGE_SIZE = 20;

  // Get distinct sessions with aggregated data
  let query = supabaseServer
    .from('ai_conversations')
    .select('session_id, psid, intent, created_at, content, role, metadata');

  if (filters?.intent) {
    query = query.eq('intent', filters.intent);
  }
  if (filters?.dateFrom) {
    query = query.gte('created_at', filters.dateFrom);
  }
  if (filters?.dateTo) {
    query = query.lte('created_at', filters.dateTo);
  }

  const { data, error } = await (query as any).order('created_at', { ascending: false });

  if (error) return { success: false, error: 'Failed to fetch logs' };

  // Group by session_id
  const sessionMap = new Map<string, any>();
  for (const row of (data || [])) {
    if (!sessionMap.has(row.session_id)) {
      sessionMap.set(row.session_id, {
        session_id: row.session_id,
        psid: row.psid,
        latest_intent: null,
        latest_at: row.created_at,
        message_count: 0,
        first_message: null,
      });
    }
    const session = sessionMap.get(row.session_id);
    session.message_count++;
    if (row.role === 'assistant' && row.intent) {
      session.latest_intent = row.intent;
    }
    if (row.role === 'user' && !session.first_message) {
      session.first_message = row.content;
    }
  }

  const sessions = Array.from(sessionMap.values());
  const total = sessions.length;
  const paged = sessions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return {
    success: true,
    data: {
      sessions: paged,
      total,
      page,
      pageSize: PAGE_SIZE,
    },
  };
}

export async function getAiSessionMessages(sessionId: string): Promise<ActionResult> {
  await requireAdmin();

  const { data, error } = await supabaseServer
    .from('ai_conversations')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) return { success: false, error: 'Failed to fetch messages' };
  return { success: true, data: data || [] };
}

export async function getAiStats(): Promise<ActionResult> {
  await requireAdmin();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count: todayCount } = await supabaseServer
    .from('ai_conversations')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'user')
    .gte('created_at', today.toISOString());

  const { data: intentCounts } = await (supabaseServer
    .from('ai_conversations') as any)
    .select('intent')
    .eq('role', 'assistant')
    .gte('created_at', today.toISOString())
    .not('intent', 'is', null);

  const intents: Record<string, number> = {};
  for (const row of (intentCounts || [])) {
    if (row.intent) {
      intents[row.intent] = (intents[row.intent] || 0) + 1;
    }
  }

  return {
    success: true,
    data: {
      todayConversations: todayCount || 0,
      intentBreakdown: intents,
    },
  };
}

// ─── Knowledge Entries ────────────────────────────────────────────────────────

const ADMIN_PAGE_SIZE = 20;

export async function getKnowledgeEntries(
  page: number = 0,
  filters?: { source?: string; category?: string; search?: string }
): Promise<ActionResult> {
  await requireAdmin();

  let query = (supabaseServer.from('rag_embeddings') as any)
    .select('id, source_table, source_id, content, metadata, updated_at');

  if (filters?.source && filters.source !== 'all') {
    query = query.eq('source_table', filters.source);
  }
  if (filters?.search) {
    query = query.ilike('content', `%${filters.search}%`);
  }

  const { data, error } = await query.order('updated_at', { ascending: false });

  if (error) return { success: false, error: 'Failed to fetch knowledge entries' };

  // Apply category filter from metadata
  let rows = (data || []).map((row: any) => ({
    id: row.id,
    title: row.metadata?.title || row.metadata?.name || row.source_id,
    content: row.content?.slice(0, 200) || '',
    source_table: row.source_table,
    source_id: row.source_id,
    category: row.metadata?.category || null,
    status: row.source_table === 'knowledge_chunks'
      ? 'review'
      : row.source_table === 'knowledge_entries'
        ? (row.metadata?.is_active === false ? 'inactive' : 'active')
        : 'synced',
    updated_at: row.updated_at,
  }));

  if (filters?.category) {
    rows = rows.filter((r: any) => r.category === filters.category);
  }

  // Also include documents (not in rag_embeddings until approved, or in 'review' status)
  const { data: docs } = await (supabaseServer.from('knowledge_documents') as any)
    .select('*')
    .order('created_at', { ascending: false });

  if (docs) {
    for (const doc of docs) {
      rows.push({
        id: doc.id,
        title: doc.filename,
        content: `${doc.chunk_count} chunks • ${doc.file_type.toUpperCase()}`,
        source_table: 'knowledge_documents',
        source_id: doc.id,
        category: null,
        status: doc.status === 'approved' ? 'active' : 'review',
        updated_at: doc.updated_at || doc.created_at,
      });
    }
  }

  // Sort by updated_at descending
  rows.sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  const total = rows.length;
  const paged = rows.slice(page * ADMIN_PAGE_SIZE, (page + 1) * ADMIN_PAGE_SIZE);

  return { success: true, data: { rows: paged, total, page, pageSize: ADMIN_PAGE_SIZE } };
}

export async function addKnowledgeEntry(input: KnowledgeEntryInput): Promise<ActionResult> {
  await requireAdmin();

  const parsed = knowledgeEntrySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || 'Validation failed' };

  const { data: entry, error } = await (supabaseServer.from('knowledge_entries') as any)
    .insert({
      title: parsed.data.title,
      content: parsed.data.content,
      category: parsed.data.category || null,
      is_active: parsed.data.is_active ?? true,
    })
    .select()
    .single();

  if (error || !entry) return { success: false, error: 'Failed to create knowledge entry' };

  syncEmbedding(
    'knowledge_entries',
    entry.id,
    buildKnowledgeEntryContent({ title: entry.title, content: entry.content }),
    { title: entry.title, category: entry.category, is_active: entry.is_active }
  ).catch((err) => console.error('[rag-sync] knowledge entry:', err));

  return { success: true, data: entry };
}

export async function updateKnowledgeEntry(id: string, input: KnowledgeEntryInput): Promise<ActionResult> {
  await requireAdmin();

  const parsed = knowledgeEntrySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || 'Validation failed' };

  const { data: entry, error } = await (supabaseServer.from('knowledge_entries') as any)
    .update({
      title: parsed.data.title,
      content: parsed.data.content,
      category: parsed.data.category || null,
      is_active: parsed.data.is_active ?? true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error || !entry) return { success: false, error: 'Failed to update knowledge entry' };

  if (entry.is_active) {
    syncEmbedding(
      'knowledge_entries',
      entry.id,
      buildKnowledgeEntryContent({ title: entry.title, content: entry.content }),
      { title: entry.title, category: entry.category, is_active: entry.is_active }
    ).catch((err) => console.error('[rag-sync] knowledge entry:', err));
  } else {
    removeEmbedding('knowledge_entries', entry.id).catch((err) =>
      console.error('[rag-sync] remove knowledge entry:', err)
    );
  }

  return { success: true, data: entry };
}

export async function deleteKnowledgeEntry(id: string): Promise<ActionResult> {
  await requireAdmin();

  const { error } = await (supabaseServer.from('knowledge_entries') as any).delete().eq('id', id);
  if (error) return { success: false, error: 'Failed to delete knowledge entry' };

  removeEmbedding('knowledge_entries', id).catch((err) =>
    console.error('[rag-sync] remove knowledge entry:', err)
  );

  return { success: true };
}
