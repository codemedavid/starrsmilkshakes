# AI RAG Chatbot for Messenger — Design Spec

**Date:** 2026-03-20
**Status:** Approved

## Overview

Enhance the existing Facebook Messenger bot with an AI-powered RAG (Retrieval-Augmented Generation) fallback. When keyword FAQ matching fails and the AI toggle is enabled, the bot queries a vector knowledge base built from all business data, then calls NVIDIA's Qwen 3.5-397B model to generate contextual, buying-ready responses.

## Architecture

```
Customer Message → Messenger Webhook
                      ↓
              Keyword FAQ Match?
              ├── YES → Send FAQ response (existing flow)
              └── NO → AI toggle ON?
                  ├── NO → "What are you craving?" + category quick replies (existing browse flow)
                  └── YES ↓
                    1. Embed query → pgvector search → build RAG context
                    2. NVIDIA Qwen chat completion
                    3. Parse intent:
                       ├── ORDER → extract items, add to cart, send confirmation
                       ├── BROWSE → send product cards
                       └── INFO → send text reply
                    4. Log conversation
```

### Key Decisions

- Existing keyword FAQ matching stays as the **first pass** (fast, cheap, no API call)
- AI is the **fallback** only when keywords don't match
- Conversation history stored per Messenger session for multi-turn context
- Response parsing uses structured JSON output from the model
- When toggle is OFF and no keyword match: fallback to "What are you craving?" browse flow (not a dead-end)

## AI Provider

- **Chat Completion:** NVIDIA API (`https://integrate.api.nvidia.com/v1/chat/completions`)
  - Model: `qwen/qwen3.5-397b-a17b`
  - OpenAI-compatible endpoint
  - Streaming supported
  - Parameters: temperature 0.60, top_p 0.95, top_k 20, max_tokens 2048 (Messenger caps at 2000 chars)
- **Embeddings:** NVIDIA API (`https://integrate.api.nvidia.com/v1/embeddings`)
  - Model: `nvidia/nv-embedqa-e5-v5`
  - 1024-dimension vectors
- **API Key:** Stored as `NVIDIA_API_KEY` environment variable (never hardcoded)

## RAG Pipeline

### Embedding Sources

| Source Table | What's Embedded | Example |
|---|---|---|
| `faq_entries` | question + answer combined | "What are your hours? We're open 10am-9pm daily" |
| `menu_items` | name + description + price + variations | "Chocolate Shake - rich creamy chocolate milkshake - ₱149 - S/M/L" |
| `bundles` | name + description + included items + price | "Shake Duo Bundle - 2 medium shakes - ₱249" |
| `add_ons` | name + price | "Whipped Cream - ₱25" |
| `branches` | name + address + hours + contact | "SM North EDSA - 2F Food Court - 10am-9pm" |
| `categories` | name + description | "Classic Shakes - our signature lineup" |
| `loyalty_config` + `loyalty_goals` | program description + rewards | "Earn 1 stamp per order, 10 stamps = free medium shake" |
| `site_settings` | delivery info, payment methods, policies | "We deliver via Lalamove within Metro Manila" |

### Vector Storage (Supabase pgvector)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE rag_embeddings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(1024) NOT NULL,
  content_hash TEXT,              -- SHA-256 of content, skip re-embedding if unchanged
  metadata JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source_table, source_id)
);

CREATE INDEX ON rag_embeddings USING hnsw (embedding vector_cosine_ops);
```

> **Why HNSW over IVFFlat:** HNSW supports incremental inserts without rebuilding and works on empty tables. IVFFlat requires pre-populated data and would fail during initial migration. Dataset is small (~200 rows across all sources), so HNSW is ideal.

### Search Flow

1. Embed customer's message → 1024-dim vector via NVIDIA embedding API
2. Query top 5 nearest neighbors from `rag_embeddings` using cosine similarity
3. Include matched `content` + `metadata` fields as context in the chat prompt

## Messenger Integration Changes

### Modified Flow in `messenger-handler.ts`

```
handleTextMessage(senderPsid, text)
  ↓
  matchFaq(text)
  ├── MATCH → send FAQ response (unchanged)
  └── NO MATCH
      ↓
      isAiEnabled() ← checks site_settings toggle
      ├── OFF → sendQuickReplies("What are you craving?", categories)
      └── ON ↓
          getSessionHistory(senderPsid)  ← last 10 messages
          embedQuery(text)               ← NVIDIA embedding
          searchRagContext(embedding)     ← pgvector top 5
          buildPrompt(system, context, history, text)
          callNvidiaChat(prompt)          ← Qwen 3.5-397B
          parseAiResponse(response)
          ├── ORDER_INTENT { items: [{name, size, quantity}] }
          │   → fuzzyMatchMenuItems(items)
          │   → For each matched item:
          │     ├── No variations → finalizeCartItem(session, item, qty)
          │     └── Has variations → sendVariationPicker(psid, item, aiSuggestedSize)
          │       (enters existing interactive flow for variation/add-on selection)
          │   → sendTextMessage(psid, ai.message) + sendCartSummary if items added
          └── BROWSE_INTENT { category?, search? }
          │   → sendProductCards(senderPsid, results)
          └── INFO_INTENT { message }
              → sendTextMessage(senderPsid, message)
```

### System Prompt

```
You are Starr's Famous Shakes assistant. You help customers order shakes,
browse the menu, and answer questions.

RULES:
- Always respond in valid JSON with { intent, data }
- intent: "order" | "browse" | "info"
- For "order": data = { items: [{ name, size, quantity }], message }
- For "browse": data = { category?, search?, message }
- For "info": data = { message }
- Be friendly, use the brand voice (fun, casual)
- If unsure about an item, suggest closest matches
- Always include a helpful message field
- Prices are in Philippine Pesos (₱)

CONTEXT:
{rag_context}

CONVERSATION HISTORY:
{last_10_messages}
```

### Buying-Ready Behavior

- **Conversational ordering:** When intent is clear ("I want a large chocolate shake"), the AI extracts item names, sizes, and quantities
  - Items without variations: added directly to the Messenger session cart via `finalizeCartItem`
  - Items with variations: the AI's suggested size is passed to `sendVariationPicker`, which enters the existing interactive variation/add-on selection flow. This reuses the current `handleAddToCart` → variation → add-on → `finalizeCartItem` pipeline
  - **Fuzzy matching:** `fuzzyMatchMenuItems` matches AI-extracted names against `menu_items` using case-insensitive substring + Levenshtein distance. Returns best match with confidence score. Low confidence (<0.5) triggers "Did you mean...?" with quick reply buttons
- **Browse fallback:** When browsing ("What shakes do you have?"), sends existing product card templates
- **Both modes coexist:** The AI determines which approach fits the customer's message

## Real-time Sync

Embedding updates are triggered directly from existing server actions — no cron needed.

### Trigger Points

| Action File | When | What to re-embed |
|---|---|---|
| `actions/menu.ts` | create/update/delete menu item | That item's embedding |
| `actions/menu.ts` | create/update/delete variation/add-on | Parent menu item's embedding |
| `actions/bundle-admin.ts` | create/update/delete bundle | That bundle's embedding |
| `actions/categories.ts` | create/update/delete category | That category's embedding |
| `actions/branches.ts` | create/update/delete branch | That branch's embedding |
| `actions/loyalty.ts` | update config/goals | Loyalty embedding |
| `actions/settings.ts` | update site settings | Settings embedding |
| `lib/faq-service.ts` | create/update/delete FAQ (via `upsertFaq`/`deleteFaq`) | That FAQ's embedding |

### Sync Pattern

Sync calls are **fire-and-forget** (non-blocking) — embedding failures must never break admin CRUD operations.

```ts
// src/lib/rag-sync.ts
async function syncEmbedding(sourceTable, sourceId, content, metadata) {
  const contentHash = hashContent(content);
  // Skip if content hasn't changed
  const existing = await supabase.from('rag_embeddings')
    .select('content_hash').match({ source_table: sourceTable, source_id: sourceId }).single();
  if (existing.data?.content_hash === contentHash) return;

  const embedding = await generateEmbedding(content);
  await supabase.from('rag_embeddings').upsert({
    source_table: sourceTable,
    source_id: sourceId,
    content, embedding, metadata,
    content_hash: contentHash,
    updated_at: new Date().toISOString()
  }, { onConflict: 'source_table,source_id' });
}

async function removeEmbedding(sourceTable, sourceId) {
  await supabase.from('rag_embeddings').delete()
    .match({ source_table: sourceTable, source_id: sourceId });
}

// Called from server actions as fire-and-forget:
// syncEmbedding(...).catch(err => console.error('[rag-sync]', err));
```

### Initial Seed

Script at `scripts/seed-embeddings.ts`, run via `npx tsx scripts/seed-embeddings.ts`:
- Processes all source tables in sequence
- Batches embedding calls (10 at a time) to respect NVIDIA rate limits
- Logs progress per table
- Skips items that already have an up-to-date embedding (via `content_hash`)
- Safe to re-run (idempotent via upsert)

## Admin Controls

### Toggle

- Stored in existing `site_settings` table: `id = 'ai_faq_enabled'`, `value = 'false'` (plain string, consistent with other settings)
- Off by default
- Simple switch in `/admin/settings` page
- Requires updating `SiteSettings` type, `mapSiteSettingsRows`, `siteSettingsSchema`, and admin settings page to include the new field

### Conversation Logs

New admin section at `/admin/ai-logs`:

- Table view: timestamp, customer PSID, message, AI response, intent, latency
- Filter by date range
- Filter by intent type (order/browse/info)
- Expandable rows to see full conversation thread
- Basic stats at top: total conversations today, most common intents
- Paginated (20 sessions per page)

### Admin Components

| Component | Purpose |
|---|---|
| `AiToggle.tsx` | On/off switch in settings page |
| `AiLogsTab.tsx` | Conversation log table with filters |
| `AiLogDetail.tsx` | Expanded view of a conversation thread |

## Data Model Changes

### New Tables

1. **`rag_embeddings`** — vector storage for all indexed business data
2. **`ai_conversations`** — conversation log for AI interactions

### ai_conversations Schema

```sql
CREATE TABLE ai_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL,    -- groups messages into threads (new session after 30min inactivity)
  psid TEXT NOT NULL,
  role TEXT NOT NULL,           -- 'user' or 'assistant'
  content TEXT NOT NULL,
  intent TEXT,                  -- 'order', 'browse', 'info'
  metadata JSONB DEFAULT '{}', -- token usage, model, latency
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON ai_conversations (psid, created_at DESC);
CREATE INDEX ON ai_conversations (session_id, created_at ASC);
CREATE INDEX ON ai_conversations (created_at);  -- for TTL cleanup
```

### Session Logic

- A new `session_id` is generated when a PSID's last AI conversation message is older than 30 minutes
- Conversation history for context uses "last 10 messages in the current session" (not across sessions)
- Admin logs UI groups messages by session for readability

### Conversation TTL

- Conversations older than 30 days are auto-deleted
- Cleanup runs as part of the AI response flow: before processing, delete rows where `created_at < now() - interval '30 days'` (lightweight, runs at most once per request)

### site_settings Addition

```sql
INSERT INTO site_settings (id, value)
VALUES ('ai_faq_enabled', 'false');
```

## New Files

| File | Purpose |
|---|---|
| `src/lib/nvidia-client.ts` | NVIDIA API wrapper (chat + embeddings) |
| `src/lib/rag-engine.ts` | Embed, search, build context |
| `src/lib/rag-sync.ts` | Real-time sync on data changes |
| `src/lib/ai-intent-parser.ts` | Parse structured JSON from AI response (multi-strategy) |
| `src/lib/ai-menu-matcher.ts` | Fuzzy match AI-extracted item names to menu_items |
| `src/lib/ai-conversation.ts` | Conversation history CRUD |
| `src/actions/ai.ts` | Server actions for AI admin (toggle, logs) |
| `src/hooks/useAiLogs.ts` | Hook for admin log fetching |
| `src/components/admin/AiToggle.tsx` | Settings toggle component |
| `src/components/admin/AiLogsTab.tsx` | Log table with filters |
| `src/components/admin/AiLogDetail.tsx` | Conversation detail view |
| `app/admin/ai-logs/page.tsx` | Admin AI logs page |
| `scripts/seed-embeddings.ts` | One-time initial embedding script |

## Modified Files

| File | Change |
|---|---|
| `src/lib/messenger-handler.ts` | Add AI fallback after FAQ match failure |
| `src/actions/menu.ts` | Add `syncEmbedding` calls on CRUD |
| `src/actions/bundle-admin.ts` | Add `syncEmbedding` calls on CRUD |
| `src/actions/categories.ts` | Add `syncEmbedding` calls on CRUD |
| `src/actions/branches.ts` | Add `syncEmbedding` calls on CRUD |
| `src/actions/loyalty.ts` | Add `syncEmbedding` calls on config changes |
| `src/actions/settings.ts` | Add `syncEmbedding` calls on settings changes |
| `src/lib/faq-service.ts` | Add `syncEmbedding` calls to `upsertFaq`/`deleteFaq` |
| `src/components/admin/Sidebar.tsx` | Add AI Logs nav item |
| `app/admin/settings/page.tsx` | Add AI toggle component |

## Environment Variables

```
NVIDIA_API_KEY=nvapi-...   # NVIDIA API key (rotated, never hardcoded)
```

## Error Handling & Resilience

### Timeout

- **10-second timeout** for the entire AI pipeline (embed + search + chat completion)
- If exceeded, fall back to the browse flow: "What are you craving?" + category quick replies
- NVIDIA API errors (5xx, network) also trigger the browse fallback
- Errors are logged to `ai_conversations` with `intent = 'error'` and error details in metadata

### JSON Parsing Strategy

The `ai-intent-parser.ts` module handles unreliable model output in this order:
1. Strip markdown code fences (`` ```json ... ``` ``) if present
2. Try `JSON.parse` on the full response
3. Try regex extraction of the first `{...}` block
4. Fall back to `INFO_INTENT` with the raw text as the message

### Rate Limiting

- Max 10 AI calls per PSID per minute
- Stored in Supabase: `ai_rate_limits(psid TEXT PRIMARY KEY, count INT, window_start TIMESTAMPTZ)`
- Checked before the AI pipeline; if exceeded, send "I'm getting a lot of messages! Give me a moment" + browse flow
- Rate limit rows auto-expire (delete where window_start < now() - 1 minute)

## Security

- API key stored as environment variable only
- Input sanitization: truncate messages > 500 chars, strip control characters
- AI responses validated against JSON schema before acting on intents
- Failed JSON parsing falls back to INFO_INTENT with raw text
- Log suspicious inputs (messages containing prompt injection patterns) in metadata
