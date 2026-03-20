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

const SYSTEM_TEMPLATE = `Starr's Famous Shakes chatbot. Respond ONLY with JSON. Max 15 words in "message".

{"intent":"order","data":{"message":"..."}}
{"intent":"browse","data":{"category":"...","message":"..."}}
{"intent":"info","data":{"message":"..."}}

Rules:
- message: short friendly reply ONLY (e.g. "Sure! Here's our menu 😊" or "We're open 10am-9pm!")
- NEVER mention product names, prices, sizes, or flavors in message
- NEVER say "sabihin", "type", "send", "order ako", or give ordering instructions
- NEVER give examples of how to order
- We show product cards, menus, and links AUTOMATICALLY after your message
- For browse: set category to match one from CONTEXT if possible`;

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
