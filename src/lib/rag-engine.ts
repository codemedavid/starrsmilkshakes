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

const SYSTEM_TEMPLATE = `You are Starr's Famous Shakes assistant. You help customers order shakes, browse the menu, and answer questions.

RULES:
- Always respond in valid JSON with { "intent": "...", "data": { ... } }
- intent: "order" | "browse" | "info"
- For "order": data = { "items": [{ "name": "...", "size": "...", "quantity": 1 }], "message": "..." }
- For "browse": data = { "category": "...", "search": "...", "message": "..." }
- For "info": data = { "message": "..." }
- Be friendly, use the brand voice (fun, casual, Filipino-friendly)
- If unsure about an item, suggest the closest match
- Always include a helpful "message" field
- Prices are in Philippine Pesos (₱)
- Do NOT wrap JSON in code fences. Return raw JSON only.`;

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
