export interface OrderItem {
  name: string;
  size?: string;
  quantity: number;
}

export interface AiResponseData {
  message: string;
  items?: OrderItem[];
  category?: string;
  search?: string;
}

export interface AiResponse {
  intent: 'order' | 'browse' | 'info';
  data: AiResponseData;
}

const VALID_INTENTS = new Set(['order', 'browse', 'info']);
const FALLBACK: AiResponse = {
  intent: 'info',
  data: { message: "Sorry, I couldn't process that. What are you craving?" },
};

export function parseAiResponse(raw: string): AiResponse {
  if (!raw || raw.trim().length === 0) return FALLBACK;

  // Strategy 0: Strip <think>...</think> tags (Qwen thinking mode output)
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  if (!cleaned) return FALLBACK;

  // Strategy 1: Strip markdown code fences
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Strategy 2: Try JSON.parse on cleaned text
  let parsed = tryParse(cleaned);

  // Strategy 3: Extract first {...} block
  if (!parsed) {
    const braceMatch = raw.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      parsed = tryParse(braceMatch[0]);
    }
  }

  // Strategy 4: Fall back to info intent with raw text
  if (!parsed || !isValidAiResponse(parsed)) {
    return {
      intent: 'info',
      data: { message: raw.trim() },
    };
  }

  return {
    intent: parsed.intent,
    data: {
      message: parsed.data?.message || '',
      items: parsed.data?.items,
      category: parsed.data?.category,
      search: parsed.data?.search,
    },
  };
}

function tryParse(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isValidAiResponse(obj: any): boolean {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.intent === 'string' &&
    VALID_INTENTS.has(obj.intent) &&
    obj.data &&
    typeof obj.data === 'object'
  );
}
