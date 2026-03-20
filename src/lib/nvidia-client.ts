const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const CHAT_MODEL = 'qwen/qwen3.5-397b-a17b';
const EMBEDDING_MODEL = 'nvidia/nv-embedqa-e5-v5';
const TIMEOUT_MS = 30_000; // 30s — Qwen 397B is a large model
const MAX_INPUT_LENGTH = 500;
const MAX_RESPONSE_LENGTH = 2000; // Messenger character limit

function getApiKey(): string {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error('NVIDIA_API_KEY environment variable is not set');
  return key;
}

function getHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    'Content-Type': 'application/json',
  };
}

export function truncateInput(text: string): string {
  return text.length > MAX_INPUT_LENGTH ? text.slice(0, MAX_INPUT_LENGTH) : text;
}

export function truncateResponse(text: string): string {
  return text.length > MAX_RESPONSE_LENGTH ? text.slice(0, MAX_RESPONSE_LENGTH) : text;
}

export function stripControlChars(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

export function sanitizeInput(text: string): string {
  return truncateInput(stripControlChars(text.trim()));
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  content: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`NVIDIA API error ${response.status}: ${body}`);
    }
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function generateEmbedding(text: string, inputType: 'query' | 'passage' = 'query'): Promise<number[]> {
  const response = await fetchWithTimeout(`${NVIDIA_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: [text], input_type: inputType }),
  });
  const data = await response.json();
  return data.data[0].embedding;
}

export async function chatCompletion(messages: ChatMessage[]): Promise<ChatResult> {
  const response = await fetchWithTimeout(`${NVIDIA_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages,
      max_tokens: 2048,
      temperature: 0.60,
      top_p: 0.95,
      top_k: 20,
      stream: false,
    }),
  });

  const data = await response.json();
  const choice = data.choices[0];
  return {
    content: choice.message.content,
    usage: data.usage,
  };
}
