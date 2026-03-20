import { supabaseServer } from '@/lib/supabase-server';
import { generateEmbedding } from '@/lib/nvidia-client';
import type { ConversationMessage } from '@/lib/ai-conversation';

export interface RagResult {
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

const MATCH_THRESHOLD = 0.5;
const MATCH_COUNT = 5;

export async function searchRagContext(query: string): Promise<RagResult[]> {
  const embedding = await generateEmbedding(query);

  const { data, error } = await supabaseServer.rpc('match_rag_embeddings', {
    query_embedding: JSON.stringify(embedding),
    match_threshold: MATCH_THRESHOLD,
    match_count: MATCH_COUNT,
  });

  if (error) {
    console.error('[rag-engine] Search error:', error);
    return [];
  }

  return (data || []) as RagResult[];
}

const SYSTEM_TEMPLATE = `You are Starr's Famous Shakes assistant. Be friendly, casual, Filipino-friendly. Keep answers SHORT (1-2 sentences).

Respond in JSON only (no code fences):
- {"intent":"order","data":{"message":"..."}} — when customer wants to order/buy something
- {"intent":"browse","data":{"category":"...","message":"..."}} — when browsing menu
- {"intent":"info","data":{"message":"..."}} — for questions/info

Prices are in ₱. Always include a "message" field.`;

export function buildSystemPrompt(
  context: RagResult[],
  history: ConversationMessage[]
): string {
  const contextBlock = context.length > 0
    ? `\n\nCONTEXT:\n${context.map((c) => `- ${c.content}`).join('\n')}`
    : '';

  const historyBlock = history.length > 0
    ? `\n\nCONVERSATION HISTORY:\n${history.map((h) => `${h.role}: ${h.content}`).join('\n')}`
    : '';

  return `${SYSTEM_TEMPLATE}${contextBlock}${historyBlock}`;
}
