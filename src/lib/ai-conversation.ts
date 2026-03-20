import { supabaseServer } from '@/lib/supabase-server';

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_HISTORY = 10;
const TTL_DAYS = 30;

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function getOrCreateSessionId(psid: string): Promise<string> {
  const { data: recent } = await supabaseServer
    .from('ai_conversations')
    .select('session_id, created_at')
    .eq('psid', psid)
    .order('created_at', { ascending: false })
    .limit(1);

  if (recent && recent.length > 0) {
    const lastMessageTime = new Date(recent[0].created_at).getTime();
    const elapsed = Date.now() - lastMessageTime;
    if (elapsed < SESSION_TIMEOUT_MS) {
      return recent[0].session_id;
    }
  }

  return crypto.randomUUID();
}

export async function getSessionHistory(sessionId: string): Promise<ConversationMessage[]> {
  // Get last MAX_HISTORY messages by querying DESC then reversing
  const { data } = await supabaseServer
    .from('ai_conversations')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(MAX_HISTORY);

  // Reverse to chronological order
  return (data || []).reverse().map((row: any) => ({
    role: row.role as 'user' | 'assistant',
    content: row.content,
  }));
}

export async function logConversation(
  sessionId: string,
  psid: string,
  role: 'user' | 'assistant',
  content: string,
  intent?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await supabaseServer.from('ai_conversations').insert({
    session_id: sessionId,
    psid,
    role,
    content,
    intent: intent ?? null,
    metadata: metadata ?? {},
  });
}

export async function cleanupOldConversations(): Promise<void> {
  const cutoff = new Date(Date.now() - TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await supabaseServer
    .from('ai_conversations')
    .delete()
    .lt('created_at', cutoff);
}
