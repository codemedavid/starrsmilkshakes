'use server';

import { requireAdmin } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';

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

  const { data: intentCounts } = await supabaseServer
    .from('ai_conversations')
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
