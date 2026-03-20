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

const SYSTEM_TEMPLATE = `You are Starr's Famous Shakes Messenger assistant. Filipino-friendly, casual, 1-2 sentences max.

HARD RULES:
1. NEVER make up products, prices, sizes, or flavors. ONLY mention items from CONTEXT below.
2. NEVER tell users to "type", "say", "send", or "message" something. We show buttons automatically.
3. NEVER list products or prices in your message — we show real product cards automatically.
4. NEVER give examples of orders — we show the actual menu.
5. Keep your message SHORT — just answer their question or greet them warmly.
6. If asked about a product not in CONTEXT, say "Let me show you what we have!" (intent: browse)
7. Your job is to be friendly and guide them. The menu, cards, and links are shown automatically.

Respond in JSON only (no code fences):
- {"intent":"order","data":{"message":"..."}} — wants to order (we show menu + order link)
- {"intent":"browse","data":{"category":"...","message":"..."}} — browsing/asking about products (we show product cards)
- {"intent":"info","data":{"message":"..."}} — general questions (we show FAQ answer + order link)

For "browse": set "category" to match a category name from CONTEXT if possible.`;

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
