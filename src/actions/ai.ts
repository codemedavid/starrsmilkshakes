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

// ─── FAQ Entries ──────────────────────────────────────────────────────────────

export async function getFaqEntries(
  page: number = 0,
  filters?: { category?: string; search?: string }
): Promise<ActionResult> {
  await requireAdmin();

  let query = (supabaseServer.from('faq_entries') as any).select('*');

  if (filters?.category) {
    query = query.eq('category', filters.category);
  }
  if (filters?.search) {
    query = query.or(`question.ilike.%${filters.search}%,answer.ilike.%${filters.search}%`);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) return { success: false, error: 'Failed to fetch FAQs' };

  const total = (data || []).length;
  const paged = (data || []).slice(page * ADMIN_PAGE_SIZE, (page + 1) * ADMIN_PAGE_SIZE);

  return { success: true, data: { faqs: paged, total, page, pageSize: ADMIN_PAGE_SIZE } };
}

export async function addFaqEntry(input: FaqEntryInput): Promise<ActionResult> {
  await requireAdmin();

  const parsed = faqEntrySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || 'Validation failed' };

  const { data: faq, error } = await (supabaseServer.from('faq_entries') as any)
    .insert({
      question: parsed.data.question,
      answer: parsed.data.answer,
      category: parsed.data.category || null,
      is_active: true,
    })
    .select()
    .single();

  if (error || !faq) return { success: false, error: 'Failed to create FAQ' };

  syncEmbedding(
    'faq_entries',
    faq.id,
    buildFaqContent({ question: faq.question, answer: faq.answer }),
    { category: faq.category }
  ).catch((err) => console.error('[rag-sync] faq:', err));

  return { success: true, data: faq };
}

export async function updateFaqEntry(id: string, input: FaqEntryInput): Promise<ActionResult> {
  await requireAdmin();

  const parsed = faqEntrySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || 'Validation failed' };

  const { data: faq, error } = await (supabaseServer.from('faq_entries') as any)
    .update({
      question: parsed.data.question,
      answer: parsed.data.answer,
      category: parsed.data.category || null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error || !faq) return { success: false, error: 'Failed to update FAQ' };

  syncEmbedding(
    'faq_entries',
    faq.id,
    buildFaqContent({ question: faq.question, answer: faq.answer }),
    { category: faq.category }
  ).catch((err) => console.error('[rag-sync] faq:', err));

  return { success: true, data: faq };
}

export async function deleteFaqEntry(id: string): Promise<ActionResult> {
  await requireAdmin();

  const { error } = await (supabaseServer.from('faq_entries') as any).delete().eq('id', id);
  if (error) return { success: false, error: 'Failed to delete FAQ' };

  removeEmbedding('faq_entries', id).catch((err) =>
    console.error('[rag-sync] remove faq:', err)
  );

  return { success: true };
}

// ─── Chat Triggers ────────────────────────────────────────────────────────────

export async function getTriggers(
  page: number = 0,
  filters?: { search?: string }
): Promise<ActionResult> {
  await requireAdmin();

  let query = (supabaseServer.from('chat_triggers') as any)
    .select('*')
    .order('priority', { ascending: false })
    .order('name', { ascending: true });

  if (filters?.search) {
    query = query.ilike('name', `%${filters.search}%`);
  }

  const { data, error } = await query;

  if (error) return { success: false, error: 'Failed to fetch triggers' };

  const total = (data || []).length;
  const paged = (data || []).slice(page * ADMIN_PAGE_SIZE, (page + 1) * ADMIN_PAGE_SIZE);

  return { success: true, data: { triggers: paged, total, page, pageSize: ADMIN_PAGE_SIZE } };
}

export async function addTrigger(input: TriggerInput): Promise<ActionResult> {
  await requireAdmin();

  const parsed = triggerSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || 'Validation failed' };

  // Validate regex patterns if match_type is 'regex'
  if (parsed.data.match_type === 'regex') {
    for (const pattern of parsed.data.patterns) {
      const validation = validateRegexPattern(pattern);
      if (!validation.valid) {
        return { success: false, error: `Pattern "${pattern}": ${(validation as { valid: false; error: string }).error}` };
      }
    }
  }

  const { data: trigger, error } = await (supabaseServer.from('chat_triggers') as any)
    .insert({
      name: parsed.data.name,
      patterns: parsed.data.patterns,
      match_type: parsed.data.match_type,
      response: parsed.data.response,
      priority: parsed.data.priority ?? 0,
      is_active: parsed.data.is_active ?? true,
    })
    .select()
    .single();

  if (error || !trigger) return { success: false, error: 'Failed to create trigger' };

  return { success: true, data: trigger };
}

export async function updateTrigger(id: string, input: TriggerInput): Promise<ActionResult> {
  await requireAdmin();

  const parsed = triggerSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || 'Validation failed' };

  if (parsed.data.match_type === 'regex') {
    for (const pattern of parsed.data.patterns) {
      const validation = validateRegexPattern(pattern);
      if (!validation.valid) {
        return { success: false, error: `Pattern "${pattern}": ${(validation as { valid: false; error: string }).error}` };
      }
    }
  }

  const { data: trigger, error } = await (supabaseServer.from('chat_triggers') as any)
    .update({
      name: parsed.data.name,
      patterns: parsed.data.patterns,
      match_type: parsed.data.match_type,
      response: parsed.data.response,
      priority: parsed.data.priority ?? 0,
      is_active: parsed.data.is_active ?? true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error || !trigger) return { success: false, error: 'Failed to update trigger' };

  return { success: true, data: trigger };
}

export async function deleteTrigger(id: string): Promise<ActionResult> {
  await requireAdmin();

  const { error } = await (supabaseServer.from('chat_triggers') as any).delete().eq('id', id);
  if (error) return { success: false, error: 'Failed to delete trigger' };

  return { success: true };
}

// ─── Document Upload & Chunks ─────────────────────────────────────────────────

export async function uploadDocument(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const file = formData.get('file') as File | null;
  if (!file) return { success: false, error: 'No file provided' };

  const allowedTypes = ['text/plain', 'text/markdown', 'application/pdf'];
  const extMap: Record<string, string> = {
    'text/plain': 'txt',
    'text/markdown': 'md',
    'application/pdf': 'pdf',
  };

  if (!allowedTypes.includes(file.type)) {
    return { success: false, error: 'File type not supported. Use .txt, .md, or .pdf' };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { success: false, error: 'File too large. Maximum 10MB.' };
  }

  const fileType = extMap[file.type] || 'txt';

  // Upload to Supabase Storage
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabaseServer.storage
    .from('knowledge-docs')
    .upload(storagePath, fileBuffer, { contentType: file.type });

  if (uploadError) return { success: false, error: 'Failed to upload file' };

  const { data: urlData } = supabaseServer.storage
    .from('knowledge-docs')
    .getPublicUrl(storagePath);

  // Create document record
  const { data: doc, error: docError } = await (supabaseServer.from('knowledge_documents') as any)
    .insert({
      filename: file.name,
      file_url: urlData.publicUrl,
      storage_path: storagePath,
      file_type: fileType,
      file_size: file.size,
      status: 'processing',
    })
    .select()
    .single();

  if (docError || !doc) return { success: false, error: 'Failed to create document record' };

  // Extract text
  let text = '';
  try {
    if (fileType === 'pdf') {
      const parser = new PDFParse({ data: fileBuffer });
      const pdfData = await parser.getText();
      text = pdfData.text;
    } else {
      text = fileBuffer.toString('utf-8');
    }
  } catch (err) {
    await (supabaseServer.from('knowledge_documents') as any)
      .update({ status: 'error', error_message: 'Failed to extract text from file', updated_at: new Date().toISOString() })
      .eq('id', doc.id);
    return { success: false, error: 'Failed to extract text', data: { id: doc.id } };
  }

  // Smart chunk
  const chunks = smartChunk(text);

  if (chunks.length === 0) {
    await (supabaseServer.from('knowledge_documents') as any)
      .update({ status: 'error', error_message: 'No text content found in file', updated_at: new Date().toISOString() })
      .eq('id', doc.id);
    return { success: false, error: 'No text content found', data: { id: doc.id } };
  }

  // Insert chunks
  const chunkRows = chunks.map((c) => ({
    document_id: doc.id,
    chunk_index: c.chunk_index,
    content: c.content,
    section_header: c.section_header || null,
    is_approved: false,
  }));

  const { error: chunkError } = await (supabaseServer.from('knowledge_chunks') as any)
    .insert(chunkRows);

  if (chunkError) {
    await (supabaseServer.from('knowledge_documents') as any)
      .update({ status: 'error', error_message: 'Failed to save chunks', updated_at: new Date().toISOString() })
      .eq('id', doc.id);
    return { success: false, error: 'Failed to save chunks', data: { id: doc.id } };
  }

  // Update document status
  await (supabaseServer.from('knowledge_documents') as any)
    .update({ status: 'review', chunk_count: chunks.length, updated_at: new Date().toISOString() })
    .eq('id', doc.id);

  return { success: true, data: { id: doc.id } };
}

export async function getDocumentWithChunks(id: string): Promise<ActionResult> {
  await requireAdmin();

  const { data: doc, error: docError } = await (supabaseServer.from('knowledge_documents') as any)
    .select('*')
    .eq('id', id)
    .single();

  if (docError || !doc) return { success: false, error: 'Document not found' };

  const { data: chunks, error: chunkError } = await (supabaseServer.from('knowledge_chunks') as any)
    .select('*')
    .eq('document_id', id)
    .order('chunk_index', { ascending: true });

  if (chunkError) return { success: false, error: 'Failed to fetch chunks' };

  return { success: true, data: { document: doc, chunks: chunks || [] } };
}

export async function updateChunks(
  docId: string,
  chunks: { id: string; content: string; is_approved: boolean }[]
): Promise<ActionResult> {
  await requireAdmin();

  for (const chunk of chunks) {
    const { error } = await (supabaseServer.from('knowledge_chunks') as any)
      .update({ content: chunk.content, is_approved: chunk.is_approved })
      .eq('id', chunk.id)
      .eq('document_id', docId);

    if (error) return { success: false, error: `Failed to update chunk ${chunk.id}` };
  }

  return { success: true };
}

export async function approveDocument(docId: string): Promise<ActionResult> {
  await requireAdmin();

  const { data: chunks } = await (supabaseServer.from('knowledge_chunks') as any)
    .select('*')
    .eq('document_id', docId)
    .eq('is_approved', true);

  if (!chunks || chunks.length === 0) {
    return { success: false, error: 'No approved chunks to embed' };
  }

  // Embed each approved chunk
  for (const chunk of chunks) {
    syncEmbedding(
      'knowledge_chunks',
      chunk.id,
      buildChunkContent({ section_header: chunk.section_header, content: chunk.content }),
      { document_id: docId, chunk_index: chunk.chunk_index, section_header: chunk.section_header }
    ).catch((err) => console.error('[rag-sync] chunk:', err));
  }

  // Update document status
  await (supabaseServer.from('knowledge_documents') as any)
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', docId);

  return { success: true };
}

export async function deleteDocument(docId: string): Promise<ActionResult> {
  await requireAdmin();

  // Get document for storage path, and chunks for embedding cleanup
  const { data: doc } = await (supabaseServer.from('knowledge_documents') as any)
    .select('storage_path')
    .eq('id', docId)
    .single();

  const { data: chunks } = await (supabaseServer.from('knowledge_chunks') as any)
    .select('id')
    .eq('document_id', docId);

  if (chunks) {
    for (const chunk of chunks) {
      removeEmbedding('knowledge_chunks', chunk.id).catch((err) =>
        console.error('[rag-sync] remove chunk:', err)
      );
    }
  }

  // Delete file from storage
  if (doc?.storage_path) {
    await supabaseServer.storage
      .from('knowledge-docs')
      .remove([doc.storage_path]);
  }

  // Delete document (cascades to chunks)
  const { error } = await (supabaseServer.from('knowledge_documents') as any)
    .delete()
    .eq('id', docId);

  if (error) return { success: false, error: 'Failed to delete document' };

  return { success: true };
}
