# AI RAG Chatbot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI-powered RAG fallback to the Messenger bot so when keyword FAQ matching fails and the toggle is on, the bot uses NVIDIA's Qwen 3.5-397B model with full business context to answer questions and process conversational orders.

**Architecture:** NVIDIA API (OpenAI-compatible) for both chat completions and embeddings. Supabase pgvector stores embeddings of all business data (menu, FAQs, branches, loyalty, etc.). The Messenger handler gets a new AI fallback path after FAQ keyword matching. Real-time sync keeps embeddings fresh via fire-and-forget calls from existing server actions.

**Tech Stack:** Next.js 15 App Router, Supabase (pgvector), NVIDIA API (native fetch), Vitest, Zod v4, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-20-ai-rag-chatbot-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|---|---|
| `src/lib/nvidia-client.ts` | NVIDIA API wrapper — chat completion + embedding calls with timeout |
| `src/lib/rag-engine.ts` | Embed queries, search pgvector, build prompt context |
| `src/lib/rag-sync.ts` | Sync embeddings on data changes (fire-and-forget) |
| `src/lib/ai-intent-parser.ts` | Parse structured JSON from AI response (multi-strategy) |
| `src/lib/ai-menu-matcher.ts` | Fuzzy match AI-extracted item names to menu_items |
| `src/lib/ai-conversation.ts` | Conversation history CRUD with session logic |
| `src/lib/ai-rate-limiter.ts` | Per-PSID rate limiting for AI calls |
| `src/actions/ai.ts` | Server actions for admin (toggle, log queries) |
| `src/hooks/useAiLogs.ts` | Client hook for fetching AI conversation logs |
| `src/components/admin/AiToggle.tsx` | On/off switch for AI FAQ in settings |
| `src/components/admin/AiLogsTab.tsx` | Conversation log table with filters |
| `src/components/admin/AiLogDetail.tsx` | Expandable conversation thread view |
| `app/admin/ai-logs/page.tsx` | Admin AI logs page |
| `scripts/seed-embeddings.ts` | One-time script to embed all existing data |
| `tests/lib/nvidia-client.test.ts` | Tests for NVIDIA client |
| `tests/lib/ai-intent-parser.test.ts` | Tests for intent parser |
| `tests/lib/ai-menu-matcher.test.ts` | Tests for fuzzy menu matching |
| `tests/lib/ai-conversation.test.ts` | Tests for conversation manager |
| `tests/lib/rag-engine.test.ts` | Tests for RAG engine |
| `tests/lib/ai-rate-limiter.test.ts` | Tests for rate limiter |

### Modified Files

| File | Change |
|---|---|
| `src/types/index.ts` | Add `ai_faq_enabled` to `SiteSettings` interface |
| `src/lib/site-settings.ts` | Add `ai_faq_enabled` to `mapSiteSettingsRows` |
| `src/lib/validation.ts` | Add `ai_faq_enabled` to `siteSettingsSchema` |
| `src/lib/messenger-handler.ts` | Add AI fallback path in `handleTextMessage` |
| `src/actions/menu.ts` | Add fire-and-forget `syncEmbedding` calls |
| `src/actions/bundle-admin.ts` | Add fire-and-forget `syncEmbedding` calls |
| `src/actions/categories.ts` | Add fire-and-forget `syncEmbedding` calls |
| `src/actions/branches.ts` | Add fire-and-forget `syncEmbedding` calls |
| `src/actions/loyalty.ts` | Add fire-and-forget `syncEmbedding` calls |
| `src/actions/settings.ts` | Add fire-and-forget `syncEmbedding` calls |
| `src/lib/faq-service.ts` | Add fire-and-forget `syncEmbedding` calls to `upsertFaq`/`deleteFaq` |
| `src/components/admin/Sidebar.tsx` | Add AI Logs nav item |
| `src/components/admin/SettingsForm.tsx` | Add AI toggle section |

---

## Task 1: Database Migrations

**Files:**
- Create: `scripts/migrate-ai-rag.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- scripts/migrate-ai-rag.sql

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. RAG embeddings table
CREATE TABLE IF NOT EXISTS rag_embeddings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(1024) NOT NULL,
  content_hash TEXT,
  metadata JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source_table, source_id)
);

CREATE INDEX IF NOT EXISTS rag_embeddings_hnsw_idx
  ON rag_embeddings USING hnsw (embedding vector_cosine_ops);

-- 3. AI conversations table
CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL,
  psid TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  intent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_conversations_psid_idx
  ON ai_conversations (psid, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_conversations_session_idx
  ON ai_conversations (session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS ai_conversations_created_idx
  ON ai_conversations (created_at);

-- 4. AI rate limits table
CREATE TABLE IF NOT EXISTS ai_rate_limits (
  psid TEXT PRIMARY KEY,
  count INT NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. AI FAQ toggle in site_settings
INSERT INTO site_settings (id, value)
VALUES ('ai_faq_enabled', 'false')
ON CONFLICT (id) DO NOTHING;

-- 6. RLS policies
ALTER TABLE rag_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON rag_embeddings
  FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON ai_conversations
  FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE ai_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON ai_rate_limits
  FOR ALL USING (auth.role() = 'service_role');

-- 7. pgvector search function
CREATE OR REPLACE FUNCTION match_rag_embeddings(
  query_embedding VECTOR(1024),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    rag_embeddings.content,
    rag_embeddings.metadata,
    1 - (rag_embeddings.embedding <=> query_embedding) AS similarity
  FROM rag_embeddings
  WHERE 1 - (rag_embeddings.embedding <=> query_embedding) > match_threshold
  ORDER BY rag_embeddings.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- 8. Index on intent for admin log filtering
CREATE INDEX IF NOT EXISTS ai_conversations_intent_idx
  ON ai_conversations (intent);
```

- [ ] **Step 2: Run the migration in Supabase**

Run this SQL in the Supabase SQL Editor (Dashboard → SQL Editor → paste and run).

Verify: Check that `rag_embeddings`, `ai_conversations`, and `ai_rate_limits` tables exist. Check that `ai_faq_enabled` appears in `site_settings`.

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-ai-rag.sql
git commit -m "feat(ai): add database migrations for RAG chatbot"
```

---

## Task 2: NVIDIA Client

**Files:**
- Create: `src/lib/nvidia-client.ts`
- Test: `tests/lib/nvidia-client.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/nvidia-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('nvidia-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv('NVIDIA_API_KEY', 'test-key');
  });

  describe('generateEmbedding', () => {
    it('calls NVIDIA embedding API and returns vector', async () => {
      const mockVector = Array(1024).fill(0.1);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ embedding: mockVector }] }),
      });

      const { generateEmbedding } = await import('../../src/lib/nvidia-client');
      const result = await generateEmbedding('test text');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://integrate.api.nvidia.com/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
        })
      );
      expect(result).toEqual(mockVector);
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });
      const { generateEmbedding } = await import('../../src/lib/nvidia-client');
      await expect(generateEmbedding('test')).rejects.toThrow();
    });
  });

  describe('chatCompletion', () => {
    it('calls NVIDIA chat API and returns parsed content', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"intent":"info","data":{"message":"Hello"}}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      });

      const { chatCompletion } = await import('../../src/lib/nvidia-client');
      const result = await chatCompletion([
        { role: 'system', content: 'You are a helper' },
        { role: 'user', content: 'Hi' },
      ]);

      expect(result.content).toBe('{"intent":"info","data":{"message":"Hello"}}');
      expect(result.usage).toEqual({ prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 });
    });
  });

  describe('sanitizeInput', () => {
    it('truncates input longer than 500 chars', async () => {
      const { sanitizeInput } = await import('../../src/lib/nvidia-client');
      const long = 'a'.repeat(600);
      expect(sanitizeInput(long).length).toBe(500);
    });

    it('strips control characters', async () => {
      const { sanitizeInput } = await import('../../src/lib/nvidia-client');
      expect(sanitizeInput('hello\x00world')).toBe('helloworld');
    });

    it('leaves short clean input unchanged', async () => {
      const { sanitizeInput } = await import('../../src/lib/nvidia-client');
      expect(sanitizeInput('hello')).toBe('hello');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/nvidia-client.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Uses native `fetch` (no axios dependency needed — consistent with the rest of the codebase). `enable_thinking` is NOT used because Qwen's thinking mode outputs `<think>...</think>` tags that would break JSON parsing.

```ts
// src/lib/nvidia-client.ts

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const CHAT_MODEL = 'qwen/qwen3.5-397b-a17b';
const EMBEDDING_MODEL = 'nvidia/nv-embedqa-e5-v5';
const TIMEOUT_MS = 10_000;
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

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetchWithTimeout(`${NVIDIA_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: [text] }),
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/nvidia-client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/nvidia-client.ts tests/lib/nvidia-client.test.ts
git commit -m "feat(ai): add NVIDIA API client for chat and embeddings"
```

---

## Task 3: AI Intent Parser

**Files:**
- Create: `src/lib/ai-intent-parser.ts`
- Test: `tests/lib/ai-intent-parser.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/ai-intent-parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseAiResponse, type AiResponse } from '../../src/lib/ai-intent-parser';

describe('ai-intent-parser', () => {
  it('parses valid JSON response', () => {
    const raw = '{"intent":"order","data":{"items":[{"name":"Chocolate Shake","size":"Large","quantity":1}],"message":"Great choice!"}}';
    const result = parseAiResponse(raw);
    expect(result.intent).toBe('order');
    expect(result.data.items).toHaveLength(1);
    expect(result.data.items![0].name).toBe('Chocolate Shake');
  });

  it('extracts JSON from markdown code fences', () => {
    const raw = '```json\n{"intent":"info","data":{"message":"We are open daily!"}}\n```';
    const result = parseAiResponse(raw);
    expect(result.intent).toBe('info');
    expect(result.data.message).toBe('We are open daily!');
  });

  it('extracts first JSON object from mixed text', () => {
    const raw = 'Sure! Here is the answer: {"intent":"browse","data":{"category":"shakes","message":"Check these out!"}} Hope that helps!';
    const result = parseAiResponse(raw);
    expect(result.intent).toBe('browse');
  });

  it('falls back to info intent on unparseable response', () => {
    const raw = 'I cannot understand that request.';
    const result = parseAiResponse(raw);
    expect(result.intent).toBe('info');
    expect(result.data.message).toBe('I cannot understand that request.');
  });

  it('falls back to info intent on invalid JSON structure', () => {
    const raw = '{"foo":"bar"}';
    const result = parseAiResponse(raw);
    expect(result.intent).toBe('info');
    expect(result.data.message).toContain('{');
  });

  it('handles empty string', () => {
    const result = parseAiResponse('');
    expect(result.intent).toBe('info');
    expect(result.data.message).toBe("Sorry, I couldn't process that. What are you craving?");
  });

  it('strips <think> tags from model thinking output', () => {
    const raw = '<think>The user wants a shake...</think>\n{"intent":"order","data":{"items":[{"name":"Chocolate Shake","quantity":1}],"message":"Coming right up!"}}';
    const result = parseAiResponse(raw);
    expect(result.intent).toBe('order');
    expect(result.data.items![0].name).toBe('Chocolate Shake');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/ai-intent-parser.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/ai-intent-parser.ts

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/ai-intent-parser.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-intent-parser.ts tests/lib/ai-intent-parser.test.ts
git commit -m "feat(ai): add multi-strategy intent parser for AI responses"
```

---

## Task 4: AI Menu Matcher

**Files:**
- Create: `src/lib/ai-menu-matcher.ts`
- Test: `tests/lib/ai-menu-matcher.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/ai-menu-matcher.test.ts
import { describe, it, expect } from 'vitest';
import { fuzzyMatchMenuItem, type MatchResult } from '../../src/lib/ai-menu-matcher';

const menuItems = [
  { id: '1', name: 'Chocolate Shake', base_price: 149 },
  { id: '2', name: 'Cookies and Cream Shake', base_price: 159 },
  { id: '3', name: 'Strawberry Shake', base_price: 149 },
  { id: '4', name: 'Mango Graham Shake', base_price: 169 },
  { id: '5', name: 'Classic Fries', base_price: 79 },
];

describe('ai-menu-matcher', () => {
  it('matches exact name (case-insensitive)', () => {
    const result = fuzzyMatchMenuItem('chocolate shake', menuItems);
    expect(result?.item.id).toBe('1');
    expect(result!.confidence).toBeGreaterThan(0.9);
  });

  it('matches partial name', () => {
    const result = fuzzyMatchMenuItem('cookies cream', menuItems);
    expect(result?.item.id).toBe('2');
    expect(result!.confidence).toBeGreaterThan(0.5);
  });

  it('matches with typo via Levenshtein', () => {
    const result = fuzzyMatchMenuItem('choclate shake', menuItems);
    expect(result?.item.id).toBe('1');
    expect(result!.confidence).toBeGreaterThan(0.5);
  });

  it('returns null for completely unrelated input', () => {
    const result = fuzzyMatchMenuItem('pizza margherita', menuItems);
    expect(result).toBeNull();
  });

  it('matches substring', () => {
    const result = fuzzyMatchMenuItem('mango', menuItems);
    expect(result?.item.id).toBe('4');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/ai-menu-matcher.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/ai-menu-matcher.ts

export interface MenuItemRow {
  id: string;
  name: string;
  base_price: number;
}

export interface MatchResult {
  item: MenuItemRow;
  confidence: number;
}

const MIN_CONFIDENCE = 0.3;

export function fuzzyMatchMenuItem(
  query: string,
  items: MenuItemRow[]
): MatchResult | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;

  let best: MatchResult | null = null;

  for (const item of items) {
    const name = item.name.toLowerCase();
    let confidence = 0;

    // Exact match
    if (name === q) {
      confidence = 1.0;
    }
    // Query is substring of name or name is substring of query
    else if (name.includes(q)) {
      confidence = 0.8 * (q.length / name.length);
    } else if (q.includes(name)) {
      confidence = 0.7 * (name.length / q.length);
    }
    // Word overlap scoring
    else {
      const queryWords = q.split(/\s+/);
      const nameWords = name.split(/\s+/);
      let matchedWords = 0;
      for (const qw of queryWords) {
        if (nameWords.some((nw) => nw.includes(qw) || qw.includes(nw))) {
          matchedWords++;
        }
      }
      if (matchedWords > 0) {
        confidence = 0.6 * (matchedWords / Math.max(queryWords.length, nameWords.length));
      }
    }

    // Levenshtein fallback for typos
    if (confidence < 0.5) {
      const dist = levenshtein(q, name);
      const maxLen = Math.max(q.length, name.length);
      const similarity = 1 - dist / maxLen;
      if (similarity > confidence) {
        confidence = similarity * 0.8; // Scale down Levenshtein matches
      }
    }

    if (confidence > (best?.confidence ?? 0)) {
      best = { item, confidence };
    }
  }

  if (!best || best.confidence < MIN_CONFIDENCE) return null;
  return best;
}

export function fuzzyMatchMenuItems(
  queries: { name: string; size?: string; quantity: number }[],
  items: MenuItemRow[]
): { matched: (MatchResult & { size?: string; quantity: number })[]; unmatched: string[] } {
  const matched: (MatchResult & { size?: string; quantity: number })[] = [];
  const unmatched: string[] = [];

  for (const q of queries) {
    const result = fuzzyMatchMenuItem(q.name, items);
    if (result && result.confidence >= 0.5) {
      matched.push({ ...result, size: q.size, quantity: q.quantity });
    } else {
      unmatched.push(q.name);
    }
  }

  return { matched, unmatched };
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/ai-menu-matcher.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-menu-matcher.ts tests/lib/ai-menu-matcher.test.ts
git commit -m "feat(ai): add fuzzy menu item matcher with Levenshtein"
```

---

## Task 5: AI Rate Limiter

**Files:**
- Create: `src/lib/ai-rate-limiter.ts`
- Test: `tests/lib/ai-rate-limiter.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/ai-rate-limiter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

import { supabaseServer } from '@/lib/supabase-server';

describe('ai-rate-limiter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('allows request when no existing rate limit record', async () => {
    const mockFrom = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    };
    (supabaseServer.from as any).mockReturnValue(mockFrom);

    const { checkAiRateLimit } = await import('../../src/lib/ai-rate-limiter');
    const result = await checkAiRateLimit('psid-123');
    expect(result.allowed).toBe(true);
  });

  it('blocks request when count exceeds limit', async () => {
    const now = new Date();
    const mockFrom = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { psid: 'psid-123', count: 10, window_start: now.toISOString() },
            error: null,
          }),
        }),
      }),
    };
    (supabaseServer.from as any).mockReturnValue(mockFrom);

    const { checkAiRateLimit } = await import('../../src/lib/ai-rate-limiter');
    const result = await checkAiRateLimit('psid-123');
    expect(result.allowed).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/ai-rate-limiter.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/ai-rate-limiter.ts
import { supabaseServer } from '@/lib/supabase-server';

const MAX_REQUESTS_PER_MINUTE = 10;
const WINDOW_MS = 60_000; // 1 minute

export interface RateLimitResult {
  allowed: boolean;
  remaining?: number;
}

export async function checkAiRateLimit(psid: string): Promise<RateLimitResult> {
  const now = new Date();

  const { data: existing } = await supabaseServer
    .from('ai_rate_limits')
    .select('*')
    .eq('psid', psid)
    .single();

  if (!existing) {
    // First request — create record
    await supabaseServer.from('ai_rate_limits').upsert({
      psid,
      count: 1,
      window_start: now.toISOString(),
    });
    return { allowed: true, remaining: MAX_REQUESTS_PER_MINUTE - 1 };
  }

  const windowStart = new Date(existing.window_start);
  const elapsed = now.getTime() - windowStart.getTime();

  if (elapsed > WINDOW_MS) {
    // Window expired — reset
    await supabaseServer
      .from('ai_rate_limits')
      .update({ count: 1, window_start: now.toISOString() })
      .eq('psid', psid);
    return { allowed: true, remaining: MAX_REQUESTS_PER_MINUTE - 1 };
  }

  if (existing.count >= MAX_REQUESTS_PER_MINUTE) {
    return { allowed: false, remaining: 0 };
  }

  // Increment
  await supabaseServer
    .from('ai_rate_limits')
    .update({ count: existing.count + 1 })
    .eq('psid', psid);

  return { allowed: true, remaining: MAX_REQUESTS_PER_MINUTE - existing.count - 1 };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/ai-rate-limiter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-rate-limiter.ts tests/lib/ai-rate-limiter.test.ts
git commit -m "feat(ai): add per-PSID rate limiter for AI calls"
```

---

## Task 6: AI Conversation Manager

**Files:**
- Create: `src/lib/ai-conversation.ts`
- Test: `tests/lib/ai-conversation.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/ai-conversation.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    from: vi.fn(),
  },
}));

vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => 'test-uuid-1234'),
}));

import { supabaseServer } from '@/lib/supabase-server';

describe('ai-conversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('getOrCreateSessionId', () => {
    it('creates new session when no previous messages', async () => {
      const mockFrom = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      };
      (supabaseServer.from as any).mockReturnValue(mockFrom);

      const { getOrCreateSessionId } = await import('../../src/lib/ai-conversation');
      const sessionId = await getOrCreateSessionId('psid-123');
      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(0);
    });

    it('reuses session when last message is recent', async () => {
      const recentDate = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
      const mockFrom = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [{ session_id: 'existing-session', created_at: recentDate }],
                error: null,
              }),
            }),
          }),
        }),
      };
      (supabaseServer.from as any).mockReturnValue(mockFrom);

      const { getOrCreateSessionId } = await import('../../src/lib/ai-conversation');
      const sessionId = await getOrCreateSessionId('psid-123');
      expect(sessionId).toBe('existing-session');
    });
  });

  describe('getSessionHistory', () => {
    it('returns last 10 messages for current session', async () => {
      const msgs = Array.from({ length: 12 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        created_at: new Date(Date.now() - (12 - i) * 1000).toISOString(),
      }));

      const mockFrom = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: msgs.slice(-10), error: null }),
              }),
            }),
          }),
        }),
      };
      (supabaseServer.from as any).mockReturnValue(mockFrom);

      const { getSessionHistory } = await import('../../src/lib/ai-conversation');
      const history = await getSessionHistory('session-123');
      expect(history.length).toBeLessThanOrEqual(10);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/ai-conversation.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/ai-conversation.ts
import { supabaseServer } from '@/lib/supabase-server';
import { randomUUID } from 'crypto';

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
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

  return randomUUID();
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/ai-conversation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-conversation.ts tests/lib/ai-conversation.test.ts
git commit -m "feat(ai): add conversation manager with session logic and TTL"
```

---

## Task 7: RAG Engine

**Files:**
- Create: `src/lib/rag-engine.ts`
- Test: `tests/lib/rag-engine.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/rag-engine.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    rpc: vi.fn(),
  },
}));

vi.mock('@/lib/nvidia-client', () => ({
  generateEmbedding: vi.fn(),
}));

import { supabaseServer } from '@/lib/supabase-server';
import { generateEmbedding } from '@/lib/nvidia-client';

describe('rag-engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('searchRagContext', () => {
    it('embeds query and returns matched context', async () => {
      const mockVector = Array(1024).fill(0.1);
      (generateEmbedding as any).mockResolvedValue(mockVector);

      (supabaseServer.rpc as any).mockResolvedValue({
        data: [
          { content: 'Chocolate Shake - ₱149', metadata: { price: 149 }, similarity: 0.92 },
          { content: 'We deliver via Lalamove', metadata: {}, similarity: 0.85 },
        ],
        error: null,
      });

      const { searchRagContext } = await import('../../src/lib/rag-engine');
      const results = await searchRagContext('do you have chocolate?');

      expect(generateEmbedding).toHaveBeenCalledWith('do you have chocolate?');
      expect(results).toHaveLength(2);
      expect(results[0].content).toContain('Chocolate');
    });
  });

  describe('buildSystemPrompt', () => {
    it('includes RAG context and conversation history', async () => {
      const { buildSystemPrompt } = await import('../../src/lib/rag-engine');
      const context = [
        { content: 'Chocolate Shake - ₱149', metadata: {}, similarity: 0.9 },
      ];
      const history = [
        { role: 'user' as const, content: 'hi' },
        { role: 'assistant' as const, content: '{"intent":"info","data":{"message":"Hello!"}}' },
      ];

      const prompt = buildSystemPrompt(context, history);
      expect(prompt).toContain('Chocolate Shake');
      expect(prompt).toContain('CONVERSATION HISTORY');
      expect(prompt).toContain('hi');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/rag-engine.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

> Note: The `match_rag_embeddings` SQL function is already created in Task 1's migration script.

```ts
// src/lib/rag-engine.ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/lib/rag-engine.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/rag-engine.ts tests/lib/rag-engine.test.ts
git commit -m "feat(ai): add RAG engine with pgvector search and prompt builder"
```

---

## Task 8: RAG Sync

**Files:**
- Create: `src/lib/rag-sync.ts`

- [ ] **Step 1: Write the implementation**

This module is mostly side-effectful (calls NVIDIA API + Supabase upsert). Testing is covered by integration/e2e.

```ts
// src/lib/rag-sync.ts
import { supabaseServer } from '@/lib/supabase-server';
import { generateEmbedding } from '@/lib/nvidia-client';
import { createHash } from 'crypto';

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export async function syncEmbedding(
  sourceTable: string,
  sourceId: string,
  content: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const contentHash = hashContent(content);

  // Check if content is unchanged
  const { data: existing } = await supabaseServer
    .from('rag_embeddings')
    .select('content_hash')
    .eq('source_table', sourceTable)
    .eq('source_id', sourceId)
    .single();

  if (existing?.content_hash === contentHash) return; // No change

  const embedding = await generateEmbedding(content);

  await supabaseServer.from('rag_embeddings').upsert(
    {
      source_table: sourceTable,
      source_id: sourceId,
      content,
      embedding: JSON.stringify(embedding),
      content_hash: contentHash,
      metadata,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'source_table,source_id' }
  );
}

export async function removeEmbedding(
  sourceTable: string,
  sourceId: string
): Promise<void> {
  await supabaseServer
    .from('rag_embeddings')
    .delete()
    .match({ source_table: sourceTable, source_id: sourceId });
}

// ─── Content builders for each source ────────────────────────────────────────

export function buildMenuItemContent(item: {
  name: string;
  description?: string;
  base_price: number;
  discount_price?: number | null;
  discount_active?: boolean;
}): string {
  const price = item.discount_active && item.discount_price
    ? `₱${item.discount_price} (was ₱${item.base_price})`
    : `₱${item.base_price}`;
  return `${item.name} - ${item.description || 'No description'} - ${price}`;
}

export function buildBundleContent(bundle: {
  name: string;
  description?: string;
  price: number;
}): string {
  return `${bundle.name} Bundle - ${bundle.description || ''} - ₱${bundle.price}`;
}

export function buildBranchContent(branch: {
  name: string;
  address: string;
  phone: string;
  hours?: string;
}): string {
  const parts = [branch.name, branch.address, branch.phone];
  if (branch.hours) parts.push(`Hours: ${branch.hours}`);
  return parts.join(' - ');
}

export function buildFaqContent(faq: {
  question: string;
  answer: string;
}): string {
  return `Q: ${faq.question}\nA: ${faq.answer}`;
}

export function buildCategoryContent(cat: {
  name: string;
  description?: string;
}): string {
  return cat.description ? `Category: ${cat.name} - ${cat.description}` : `Category: ${cat.name}`;
}

export function buildAddOnContent(addOn: {
  name: string;
  price: number;
}): string {
  return `Add-on: ${addOn.name} - ₱${addOn.price}`;
}

export function buildLoyaltyContent(config: Record<string, unknown>, goals: { name: string; description: string }[]): string {
  const goalsText = goals.map((g) => `${g.name}: ${g.description}`).join('. ');
  return `Loyalty program: ${JSON.stringify(config)}. Rewards: ${goalsText}`;
}

export function buildPaymentMethodsContent(methods: { name: string; account_name: string; account_number: string }[]): string {
  return `Payment methods: ${methods.map((m) => `${m.name}: ${m.account_name} (${m.account_number})`).join('. ')}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/rag-sync.ts
git commit -m "feat(ai): add RAG sync module for real-time embedding updates"
```

---

## Task 9: Update SiteSettings Type + Validation

**Files:**
- Modify: `src/types/index.ts:76-96`
- Modify: `src/lib/site-settings.ts:27-48`
- Modify: `src/lib/validation.ts:99-122`

- [ ] **Step 1: Add `ai_faq_enabled` to `SiteSettings` interface**

In `src/types/index.ts`, add after line 95 (`header_scripts?: string;`):

```ts
  ai_faq_enabled?: string;
```

- [ ] **Step 2: Add to `mapSiteSettingsRows`**

In `src/lib/site-settings.ts`, add after `header_scripts: getValue('header_scripts', ''),` (line 46):

```ts
    ai_faq_enabled: getValue('ai_faq_enabled', 'false'),
```

- [ ] **Step 3: Add to `siteSettingsSchema`**

In `src/lib/validation.ts`, add after `header_scripts: z.string(),` (line 119):

```ts
    ai_faq_enabled: z.string().optional(),
```

- [ ] **Step 4: Run existing settings tests to verify no regression**

Run: `npx vitest run tests/unit/actions/settings.test.ts tests/unit/lib/validation-schemas.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/lib/site-settings.ts src/lib/validation.ts
git commit -m "feat(ai): add ai_faq_enabled to site settings type and validation"
```

---

## Task 10: Integrate AI Fallback into Messenger Handler

**Files:**
- Modify: `src/lib/messenger-handler.ts:64-90`

This is the core integration. The `handleTextMessage` function currently falls through to `showCategories` when FAQ matching fails. We add the AI path between FAQ miss and browse fallback.

- [ ] **Step 1: Add imports at top of `messenger-handler.ts`**

After the existing imports (line 16), add:

```ts
import { sanitizeInput, truncateResponse, chatCompletion, type ChatMessage } from '@/lib/nvidia-client';
import { searchRagContext, buildSystemPrompt } from '@/lib/rag-engine';
import { parseAiResponse } from '@/lib/ai-intent-parser';
import { fuzzyMatchMenuItems, type MenuItemRow } from '@/lib/ai-menu-matcher';
import { getOrCreateSessionId, getSessionHistory, logConversation, cleanupOldConversations } from '@/lib/ai-conversation';
import { checkAiRateLimit } from '@/lib/ai-rate-limiter';
import { supabaseServer } from '@/lib/supabase-server';
```

Note: `supabaseServer` is already imported — just add the new imports.

- [ ] **Step 2: Add `isAiEnabled` helper**

Add after the `PRODUCTS_PER_PAGE` constant (line 18):

```ts
async function isAiEnabled(): Promise<boolean> {
  const { data } = await supabaseServer
    .from('site_settings')
    .select('value')
    .eq('id', 'ai_faq_enabled')
    .single();
  return data?.value === 'true';
}
```

- [ ] **Step 3: Add `handleAiFallback` function**

Add before the `handlePostback` function:

```ts
async function handleAiFallback(psid: string, text: string, _session: MessengerSession, pageToken: string): Promise<boolean> {
  const startTime = Date.now();
  try {
    // Check toggle
    const enabled = await isAiEnabled();
    if (!enabled) return false;

    // Rate limit
    const rateLimit = await checkAiRateLimit(psid);
    if (!rateLimit.allowed) {
      await sendTextMessage(psid, "I'm getting a lot of messages! Give me a moment.", pageToken);
      await showCategories(psid, pageToken);
      return true;
    }

    // Cleanup old conversations (lightweight, fire-and-forget)
    cleanupOldConversations().catch(() => {});

    // Get/create session + history BEFORE logging user message
    const sessionId = await getOrCreateSessionId(psid);
    const sanitized = sanitizeInput(text);
    const history = await getSessionHistory(sessionId);

    // Log user message AFTER fetching history (avoids duplicate in prompt)
    await logConversation(sessionId, psid, 'user', sanitized);

    // RAG search + build prompt
    const ragContext = await searchRagContext(sanitized);
    const systemPrompt = buildSystemPrompt(ragContext, history);

    // Chat completion
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: sanitized },
    ];
    const result = await chatCompletion(messages);
    const parsed = parseAiResponse(result.content);
    const latencyMs = Date.now() - startTime;

    // Log assistant response
    await logConversation(sessionId, psid, 'assistant', result.content, parsed.intent, {
      tokens: result.usage,
      latency_ms: latencyMs,
    });

    // Truncate message to Messenger's 2000-char limit
    if (parsed.data.message) {
      parsed.data.message = truncateResponse(parsed.data.message);
    }

    // Handle by intent
    switch (parsed.intent) {
      case 'order':
        await handleOrderIntent(psid, parsed, pageToken);
        break;
      case 'browse':
        await handleBrowseIntent(psid, parsed, pageToken);
        break;
      case 'info':
      default:
        await sendTextMessage(psid, parsed.data.message, pageToken);
        break;
    }

    return true;
  } catch (err) {
    console.error('[ai-fallback] Error:', err);
    // Log error to ai_conversations for admin visibility
    try {
      const sessionId = await getOrCreateSessionId(psid);
      await logConversation(sessionId, psid, 'assistant', '', 'error', {
        error: err instanceof Error ? err.message : String(err),
        latency_ms: Date.now() - startTime,
      });
    } catch { /* don't fail on error logging */ }
    return false; // Fall through to browse
  }
}

async function handleOrderIntent(
  psid: string,
  parsed: ReturnType<typeof parseAiResponse>,
  pageToken: string
): Promise<void> {
  if (!parsed.data.items || parsed.data.items.length === 0) {
    await sendTextMessage(psid, parsed.data.message || "I'd love to help you order! What would you like?", pageToken);
    return;
  }

  // Fetch all available menu items for matching
  const { data: allItems } = await supabaseServer
    .from('menu_items')
    .select('id, name, base_price')
    .eq('available', true);

  if (!allItems) {
    await sendTextMessage(psid, "Sorry, I couldn't load the menu right now. Try browsing instead!", pageToken);
    await showCategories(psid, pageToken);
    return;
  }

  const { matched, unmatched } = fuzzyMatchMenuItems(
    parsed.data.items,
    allItems as MenuItemRow[]
  );

  // Send AI's friendly message first
  if (parsed.data.message) {
    await sendTextMessage(psid, truncateResponse(parsed.data.message), pageToken);
  }

  // Process ONLY the first matched item to avoid session state clobbering.
  // The interactive variation/add-on flow uses pending_item_id which gets
  // overwritten per item. Processing multiple items sequentially would
  // cause only the last item to be correctly pending.
  if (matched.length > 0) {
    const first = matched[0];
    const { data: variations } = await supabaseServer
      .from('variations')
      .select('id, name, price')
      .eq('menu_item_id', first.item.id);

    if (variations && variations.length > 0) {
      // Try to match AI-suggested size to a variation
      if (first.size) {
        const sizeMatch = variations.find(
          (v: any) => v.name.toLowerCase().includes(first.size!.toLowerCase())
        );
        if (sizeMatch) {
          await updateSession(psid, {
            pending_item_id: first.item.id,
            pending_variation_id: sizeMatch.id,
            pending_add_ons: [],
          } as any);
          await checkAndShowAddOns(psid, first.item.id, pageToken);
        } else {
          await handleAddToCart(psid, first.item.id, pageToken);
        }
      } else {
        await handleAddToCart(psid, first.item.id, pageToken);
      }
    } else {
      // No variations — add directly
      await updateSession(psid, {
        pending_item_id: first.item.id,
        pending_variation_id: null,
        pending_add_ons: [],
      } as any);
      await finalizeCartItem(psid, pageToken);
    }

    // If there are more items, let the customer know
    if (matched.length > 1) {
      const remaining = matched.slice(1).map((m) => m.item.name).join(', ');
      await sendTextMessage(psid, `I'll help you add ${remaining} next — just finish this one first!`, pageToken);
    }
  }

  // Report unmatched items
  if (unmatched.length > 0) {
    const unmatchedMsg = `I couldn't find: ${unmatched.join(', ')}. Try browsing the menu!`;
    await sendTextMessage(psid, unmatchedMsg, pageToken);
  }
}

async function handleBrowseIntent(
  psid: string,
  parsed: ReturnType<typeof parseAiResponse>,
  pageToken: string
): Promise<void> {
  // If category specified, try to find and show it
  if (parsed.data.category) {
    const { data: categories } = await supabaseServer
      .from('categories')
      .select('id, name')
      .eq('active', true);

    if (categories) {
      const match = categories.find(
        (c: any) => c.name.toLowerCase().includes(parsed.data.category!.toLowerCase())
      );
      if (match) {
        if (parsed.data.message) {
          await sendTextMessage(psid, parsed.data.message, pageToken);
        }
        await showProducts(psid, match.id, 0, pageToken);
        return;
      }
    }
  }

  // Default: show message + categories
  if (parsed.data.message) {
    await sendTextMessage(psid, parsed.data.message, pageToken);
  }
  await showCategories(psid, pageToken);
}
```

- [ ] **Step 4: Modify `handleTextMessage` to use AI fallback**

Replace the section at lines 86-89 (the default fallback):

```ts
  // Current code (lines 84-89):
  } catch (err) {
    console.error('FAQ matching failed, falling through to menu:', err);
  }

  // 3. Default fallback — show categories
  await showCategories(psid, pageToken);
```

With:

```ts
  } catch (err) {
    console.error('FAQ matching failed, falling through:', err);
  }

  // 3. AI fallback (if toggle is on)
  const aiHandled = await handleAiFallback(psid, text, _session, pageToken);
  if (aiHandled) return;

  // 4. Default fallback — show categories
  await showCategories(psid, pageToken);
```

- [ ] **Step 5: Run existing messenger tests to verify no regression**

Run: `npx vitest run tests/lib/messenger.test.ts tests/lib/faq-service.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/messenger-handler.ts
git commit -m "feat(ai): integrate AI RAG fallback into Messenger handler"
```

---

## Task 11: Hook Sync Calls into Existing Server Actions

**Files:**
- Modify: `src/actions/menu.ts`
- Modify: `src/actions/bundle-admin.ts`
- Modify: `src/actions/categories.ts`
- Modify: `src/actions/branches.ts`
- Modify: `src/actions/loyalty.ts`
- Modify: `src/actions/settings.ts`
- Modify: `src/lib/faq-service.ts`

The pattern is the same for all: add a fire-and-forget `syncEmbedding` call after successful CRUD operations. The sync call must NEVER block or fail the parent operation.

- [ ] **Step 1: Add sync to `menu.ts`**

At top of file, add import:
```ts
import { syncEmbedding, removeEmbedding, buildMenuItemContent } from '@/lib/rag-sync';
```

After `return { success: true, data: menuItem };` in `addMenuItem` (line 125), add before the return:
```ts
  // Fire-and-forget RAG sync
  syncEmbedding('menu_items', menuItem.id, buildMenuItemContent(menuItem), { category: menuItem.category, price: menuItem.base_price }).catch((err) => console.error('[rag-sync] menu add:', err));
```

After the update in `updateMenuItem` (after all variations/add-ons are saved, before the final return), add:
```ts
  // Fire-and-forget RAG sync
  const { data: updated } = await (supabaseServer.from('menu_items') as any).select('*').eq('id', idResult.data).single();
  if (updated) {
    syncEmbedding('menu_items', updated.id, buildMenuItemContent(updated), { category: updated.category, price: updated.base_price }).catch((err) => console.error('[rag-sync] menu update:', err));
  }
```

In `deleteMenuItem`, after successful delete, add:
```ts
  removeEmbedding('menu_items', idResult.data).catch((err) => console.error('[rag-sync] menu delete:', err));
```

- [ ] **Step 2: Add sync to `bundle-admin.ts`**

Same pattern — add import for `syncEmbedding`, `removeEmbedding`, `buildBundleContent`. After bundle create/update, call `syncEmbedding('bundles', ...)`. After delete, call `removeEmbedding`.

- [ ] **Step 3: Add sync to `categories.ts`**

Import `syncEmbedding`, `removeEmbedding`, `buildCategoryContent`. After category create/update, call `syncEmbedding('categories', ...)`. After delete, call `removeEmbedding`.

- [ ] **Step 4: Add sync to `branches.ts`**

Import `syncEmbedding`, `removeEmbedding`, `buildBranchContent`. After branch create/update, call `syncEmbedding('branches', ...)`. After delete, call `removeEmbedding`.

- [ ] **Step 5: Add sync to `faq-service.ts`**

Import `syncEmbedding`, `removeEmbedding`, `buildFaqContent`. In `upsertFaq`, after `invalidateFaqCache()` and before `return data`, add:
```ts
  syncEmbedding('faq_entries', data.id, buildFaqContent(data), { category: data.category }).catch((err) => console.error('[rag-sync] faq:', err));
```

In `deleteFaq`, after `invalidateFaqCache()`, add:
```ts
  removeEmbedding('faq_entries', id).catch((err) => console.error('[rag-sync] faq delete:', err));
```

- [ ] **Step 6: Add sync to `loyalty.ts` and `settings.ts`**

For loyalty: sync `loyalty_config` and `loyalty_goals` content when config is updated.
For settings: sync relevant settings (delivery info, payment methods) when settings are saved.

These are simpler — build a summary string and sync as `source_table: 'site_settings'` or `'loyalty_config'`.

- [ ] **Step 7: Run all existing action tests**

Run: `npx vitest run tests/unit/actions/`
Expected: PASS (sync calls are fire-and-forget, they won't affect test outcomes)

- [ ] **Step 8: Commit**

```bash
git add src/actions/menu.ts src/actions/bundle-admin.ts src/actions/categories.ts src/actions/branches.ts src/actions/loyalty.ts src/actions/settings.ts src/lib/faq-service.ts
git commit -m "feat(ai): hook RAG sync into all server actions (fire-and-forget)"
```

---

## Task 12: Admin AI Toggle in Settings

**Files:**
- Modify: `src/components/admin/SettingsForm.tsx`

- [ ] **Step 1: Read `SettingsForm.tsx` to understand current structure**

Read the file to find where to add the AI toggle section.

- [ ] **Step 2: Add AI FAQ toggle section**

Add a new section in the settings form (after the existing sections) with a toggle switch for `ai_faq_enabled`. Use the same styling patterns as the existing form.

```tsx
{/* AI FAQ Section */}
<div className="bg-white rounded-xl border border-[#E8E3DA] p-6 mt-6">
  <h3 className="font-playfair text-lg font-semibold text-stone-900 mb-4">
    AI Chatbot
  </h3>
  <p className="font-nunito text-sm text-stone-500 mb-4">
    When enabled, the Messenger bot will use AI to answer questions that don't match any FAQ keywords.
  </p>
  <label className="flex items-center gap-3 cursor-pointer">
    <input
      type="checkbox"
      checked={form.ai_faq_enabled === 'true'}
      onChange={(e) => setForm({ ...form, ai_faq_enabled: e.target.checked ? 'true' : 'false' })}
      className="w-5 h-5 rounded border-stone-300 text-[#3D8A80] focus:ring-[#3D8A80]"
    />
    <span className="font-nunito text-sm font-medium text-stone-700">
      Enable AI-powered FAQ responses
    </span>
  </label>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/SettingsForm.tsx
git commit -m "feat(ai): add AI FAQ toggle to admin settings form"
```

---

## Task 13: Admin AI Logs Page

**Files:**
- Create: `src/actions/ai.ts`
- Create: `src/hooks/useAiLogs.ts`
- Create: `src/components/admin/AiLogsTab.tsx`
- Create: `src/components/admin/AiLogDetail.tsx`
- Create: `app/admin/ai-logs/page.tsx`
- Modify: `src/components/admin/Sidebar.tsx`

- [ ] **Step 1: Create server actions for AI logs**

```ts
// src/actions/ai.ts
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
  let query = supabaseServer
    .from('ai_conversations')
    .select('session_id, psid, intent, created_at, metadata', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (filters?.intent) {
    query = query.eq('intent', filters.intent);
  }
  if (filters?.dateFrom) {
    query = query.gte('created_at', filters.dateFrom);
  }
  if (filters?.dateTo) {
    query = query.lte('created_at', filters.dateTo);
  }

  // Get distinct sessions with their latest message
  const { data, error, count } = await (query as any)
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

  if (error) return { success: false, error: 'Failed to fetch logs' };

  // Group by session_id
  const sessions = new Map<string, any>();
  for (const row of (data || [])) {
    if (!sessions.has(row.session_id)) {
      sessions.set(row.session_id, {
        session_id: row.session_id,
        psid: row.psid,
        latest_intent: row.intent,
        latest_at: row.created_at,
        message_count: 1,
      });
    } else {
      sessions.get(row.session_id).message_count++;
    }
  }

  return {
    success: true,
    data: {
      sessions: Array.from(sessions.values()),
      total: count || 0,
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
    .gte('created_at', today.toISOString());

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
```

- [ ] **Step 2: Create the `useAiLogs` hook**

```ts
// src/hooks/useAiLogs.ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAiConversationSessions, getAiSessionMessages, getAiStats } from '@/actions/ai';

export function useAiLogs() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<{ intent?: string; dateFrom?: string; dateTo?: string }>({});

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    const result = await getAiConversationSessions(page, filters);
    if (result.success) {
      setSessions(result.data.sessions);
      setTotal(result.data.total);
    }
    setLoading(false);
  }, [page, filters]);

  const fetchStats = useCallback(async () => {
    const result = await getAiStats();
    if (result.success) setStats(result.data);
  }, []);

  useEffect(() => {
    fetchSessions();
    fetchStats();
  }, [fetchSessions, fetchStats]);

  const fetchMessages = async (sessionId: string) => {
    const result = await getAiSessionMessages(sessionId);
    return result.success ? result.data : [];
  };

  return { sessions, stats, loading, page, setPage, total, filters, setFilters, fetchMessages };
}
```

- [ ] **Step 3: Create `AiLogsTab.tsx`**

Create the component following the existing admin table patterns (see `CustomerSearch.tsx` or similar). Show:
- Stats bar at top (today's conversations, intent breakdown)
- Filters: date range, intent type dropdown
- Table: session_id (truncated), PSID, latest intent, timestamp, message count
- Click to expand → shows `AiLogDetail`

Use the existing design system: `font-playfair` for headers, `font-nunito` for body, teal/cream/stone color palette, rounded-xl cards.

- [ ] **Step 4: Create `AiLogDetail.tsx`**

Show the full conversation thread for a session:
- User messages on the left (stone background)
- Assistant messages on the right (teal-tinted background)
- Show intent badge, timestamp for each message

- [ ] **Step 5: Create the admin page**

```tsx
// app/admin/ai-logs/page.tsx
import { requireAdmin } from '@/lib/admin-guard';
import AiLogsTab from '@/components/admin/AiLogsTab';

export default async function AiLogsPage() {
  await requireAdmin();

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="border-b border-[#E8E3DA] bg-white px-6 py-5">
        <h1 className="font-playfair text-2xl font-semibold text-stone-900">
          AI Chat Logs
        </h1>
        <p className="font-nunito text-sm text-stone-500 mt-1">
          View AI chatbot conversations and performance
        </p>
      </div>
      <div className="p-6">
        <AiLogsTab />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Add AI Logs to Sidebar**

In `src/components/admin/Sidebar.tsx`, add import for `Bot` icon:
```ts
import { ..., Bot } from 'lucide-react';
```

Add to `navItems` array (after the Settings entry):
```ts
  { label: 'AI Logs', href: '/admin/ai-logs', icon: Bot },
```

- [ ] **Step 7: Commit**

```bash
git add src/actions/ai.ts src/hooks/useAiLogs.ts src/components/admin/AiLogsTab.tsx src/components/admin/AiLogDetail.tsx app/admin/ai-logs/page.tsx src/components/admin/Sidebar.tsx
git commit -m "feat(ai): add admin AI logs page with conversation viewer"
```

---

## Task 14: Seed Script

**Files:**
- Create: `scripts/seed-embeddings.ts`

- [ ] **Step 1: Write the seed script**

```ts
// scripts/seed-embeddings.ts
// Run: NVIDIA_API_KEY=... npx tsx scripts/seed-embeddings.ts

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY!;
const BATCH_SIZE = 10;
const DELAY_MS = 1000; // Rate limit safety

async function embed(text: string): Promise<number[]> {
  const res = await fetch('https://integrate.api.nvidia.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NVIDIA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'nvidia/nv-embedqa-e5-v5', input: [text] }),
  });
  const data = await res.json();
  return data.data[0].embedding;
}

function hashContent(content: string): string {
  const { createHash } = require('crypto');
  return createHash('sha256').update(content).digest('hex');
}

async function upsertEmbedding(sourceTable: string, sourceId: string, content: string, metadata: any = {}) {
  const contentHash = hashContent(content);

  // Check if unchanged
  const { data: existing } = await supabase
    .from('rag_embeddings')
    .select('content_hash')
    .eq('source_table', sourceTable)
    .eq('source_id', sourceId)
    .single();

  if (existing?.content_hash === contentHash) {
    console.log(`  [skip] ${sourceTable}/${sourceId} — unchanged`);
    return;
  }

  const embedding = await embed(content);
  await supabase.from('rag_embeddings').upsert(
    {
      source_table: sourceTable,
      source_id: sourceId,
      content,
      embedding: JSON.stringify(embedding),
      content_hash: contentHash,
      metadata,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'source_table,source_id' }
  );
  console.log(`  [done] ${sourceTable}/${sourceId}`);
}

async function processBatch<T>(items: T[], fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(fn));
    if (i + BATCH_SIZE < items.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }
}

async function main() {
  console.log('=== Seeding RAG Embeddings ===\n');

  // 1. Menu items
  console.log('[menu_items]');
  const { data: items } = await supabase.from('menu_items').select('id, name, description, base_price, discount_price, discount_active, category').eq('available', true);
  await processBatch(items || [], async (item: any) => {
    const price = item.discount_active && item.discount_price ? `₱${item.discount_price} (was ₱${item.base_price})` : `₱${item.base_price}`;
    const content = `${item.name} - ${item.description || ''} - ${price}`;
    await upsertEmbedding('menu_items', item.id, content, { category: item.category, price: item.base_price });
  });

  // 2. Bundles
  console.log('\n[bundles]');
  const { data: bundles } = await supabase.from('bundles').select('id, name, description, price').eq('available', true);
  await processBatch(bundles || [], async (b: any) => {
    await upsertEmbedding('bundles', b.id, `${b.name} Bundle - ${b.description || ''} - ₱${b.price}`, { price: b.price });
  });

  // 3. Categories
  console.log('\n[categories]');
  const { data: categories } = await supabase.from('categories').select('id, name').eq('active', true);
  await processBatch(categories || [], async (c: any) => {
    await upsertEmbedding('categories', c.id, `Category: ${c.name}`, {});
  });

  // 4. Branches
  console.log('\n[branches]');
  const { data: branches } = await supabase.from('branches').select('id, name, address, phone').eq('active', true);
  await processBatch(branches || [], async (b: any) => {
    await upsertEmbedding('branches', b.id, `${b.name} - ${b.address} - ${b.phone}`, {});
  });

  // 5. FAQs
  console.log('\n[faq_entries]');
  const { data: faqs } = await supabase.from('faq_entries').select('id, question, answer, category').eq('is_active', true);
  await processBatch(faqs || [], async (f: any) => {
    await upsertEmbedding('faq_entries', f.id, `Q: ${f.question}\nA: ${f.answer}`, { category: f.category });
  });

  // 6. Add-ons
  console.log('\n[add_ons]');
  const { data: addOns } = await supabase.from('add_ons').select('id, name, price');
  await processBatch(addOns || [], async (a: any) => {
    await upsertEmbedding('add_ons', a.id, `Add-on: ${a.name} - ₱${a.price}`, { price: a.price });
  });

  // 7. Loyalty config
  console.log('\n[loyalty]');
  const { data: loyaltyConfig } = await supabase.from('loyalty_config').select('*').single();
  if (loyaltyConfig) {
    await upsertEmbedding('loyalty_config', 'config', `Loyalty program: earn stamps per order. ${JSON.stringify(loyaltyConfig)}`, {});
  }
  const { data: goals } = await supabase.from('loyalty_goals').select('*');
  if (goals && goals.length > 0) {
    const goalsText = goals.map((g: any) => `${g.name}: ${g.description}`).join('. ');
    await upsertEmbedding('loyalty_goals', 'all', `Loyalty rewards: ${goalsText}`, {});
  }

  // 8. Site settings (delivery, payments)
  console.log('\n[site_settings]');
  const { data: settings } = await supabase.from('site_settings').select('id, value');
  if (settings) {
    const relevant = settings.filter((s: any) => ['lalamove_market', 'currency'].includes(s.id));
    if (relevant.length > 0) {
      const settingsText = relevant.map((s: any) => `${s.id}: ${s.value}`).join('. ');
      await upsertEmbedding('site_settings', 'delivery_info', `Store settings: ${settingsText}`, {});
    }
  }

  // Payment methods
  const { data: payments } = await supabase.from('payment_methods').select('name, account_number, account_name').eq('active', true);
  if (payments && payments.length > 0) {
    const payText = payments.map((p: any) => `${p.name}: ${p.account_name} (${p.account_number})`).join('. ');
    await upsertEmbedding('site_settings', 'payment_methods', `Payment methods: ${payText}`, {});
  }

  console.log('\n=== Done! ===');

  // Count total embeddings
  const { count } = await supabase.from('rag_embeddings').select('*', { count: 'exact', head: true });
  console.log(`Total embeddings: ${count}`);
}

main().catch(console.error);
```

- [ ] **Step 2: Run the seed script**

```bash
NVIDIA_API_KEY=your-key NEXT_PUBLIC_SUPABASE_URL=your-url SUPABASE_SERVICE_ROLE_KEY=your-key npx tsx scripts/seed-embeddings.ts
```

Expected: All source tables processed, embeddings count printed.

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-embeddings.ts
git commit -m "feat(ai): add seed script for initial RAG embeddings"
```

---

## Task 15: Add NVIDIA_API_KEY Environment Variable

- [ ] **Step 1: Add to `.env.local`**

Add `NVIDIA_API_KEY=your-rotated-key` to `.env.local` (do NOT commit this file).

- [ ] **Step 2: Add to Vercel environment variables**

In Vercel Dashboard → Project Settings → Environment Variables, add:
- Key: `NVIDIA_API_KEY`
- Value: your rotated API key
- Environment: Production, Preview, Development

- [ ] **Step 3: Verify `.env.local` is in `.gitignore`**

Run: `grep '.env.local' .gitignore`
Expected: `.env*.local` or `.env.local` appears in the output.

---

## Task 16: End-to-End Verification

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify AI toggle in admin settings**

Navigate to `/admin/settings`, verify the AI Chatbot toggle appears, toggle it ON.

- [ ] **Step 3: Verify AI Logs page**

Navigate to `/admin/ai-logs`, verify the page loads with empty state.

- [ ] **Step 4: Test via Messenger**

Send a message to the Messenger bot that doesn't match any FAQ keyword (e.g., "I want a large chocolate shake"). Verify:
- AI processes the message
- Correct intent is parsed
- For ORDER: items are matched and cart flow starts
- For INFO: text response is sent
- Conversation appears in AI Logs

- [ ] **Step 5: Test toggle OFF behavior**

Toggle AI FAQ off in settings. Send a non-matching message. Verify it falls back to "What are you craving?" + categories.

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat(ai): complete AI RAG chatbot integration"
```
