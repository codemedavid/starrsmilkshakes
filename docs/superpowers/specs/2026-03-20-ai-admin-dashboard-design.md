# AI Admin Dashboard — Design Spec

**Date:** 2026-03-20
**Status:** Approved

## Overview

A unified AI management hub at `/admin/ai` with 4 tabs — Knowledge Base, FAQs, Triggers, and Logs — consolidating all chatbot administration into a single page. Document uploads with smart chunking get a dedicated sub-page for chunk review at `/admin/ai/documents/[id]`.

This replaces the standalone `/admin/ai-logs` page and the simple AI toggle in settings. The existing FAQ keyword-matching system is replaced by a proper Triggers system with flexible matching (exact, contains, regex).

## Architecture

```
/admin/ai (tabbed hub)
├── Knowledge Base tab — all RAG sources (custom + auto-synced + documents)
├── FAQs tab — CRUD for faq_entries (feeds RAG only, no keyword matching)
├── Triggers tab — CRUD for chat_triggers (instant keyword responses, bypass AI)
└── Logs tab — existing AI conversation logs (moved from /admin/ai-logs)

/admin/ai/documents/[id] (sub-page)
└── Document chunk review — edit, approve/skip, embed approved chunks
```

### Messenger Handler Flow (Updated)

```
handleTextMessage(psid, text)
  ↓
  checkTriggers(text)          ← NEW: check chat_triggers by priority
  ├── MATCH → send trigger.response (instant, no AI call)
  └── NO MATCH
      ↓
      isAiEnabled()?
      ├── OFF → "What are you craving?" + category quick replies
      └── ON → AI RAG pipeline (existing: embed → search → chat → parse)
```

The existing FAQ keyword matching is replaced by the trigger system. FAQs become pure knowledge entries that feed the RAG vector store.

## Data Model

### New Tables

#### `knowledge_entries` — Custom free-form knowledge

```sql
CREATE TABLE knowledge_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON knowledge_entries (is_active);
CREATE INDEX ON knowledge_entries (category);
```

Embedded into `rag_embeddings` with `source_table = 'knowledge_entries'`. Sync is fire-and-forget on create/update, remove on delete.

#### `knowledge_documents` — Uploaded file metadata

```sql
CREATE TABLE knowledge_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  filename TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,           -- 'pdf', 'txt', 'md'
  file_size INT NOT NULL,            -- bytes
  chunk_count INT DEFAULT 0,
  status TEXT DEFAULT 'processing',  -- 'processing', 'review', 'approved', 'error'
  error_message TEXT,                -- populated when status = 'error'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON knowledge_documents (status);
```

#### `knowledge_chunks` — Smart-chunked document pieces

```sql
CREATE TABLE knowledge_chunks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  section_header TEXT,
  is_approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON knowledge_chunks (document_id, chunk_index);
```

Each approved chunk is embedded into `rag_embeddings` with `source_table = 'knowledge_chunks'`.

#### `chat_triggers` — Keyword triggers (bypass AI)

```sql
CREATE TABLE chat_triggers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  patterns TEXT[] NOT NULL,          -- array of trigger phrases/words
  match_type TEXT DEFAULT 'contains', -- 'exact', 'contains', 'regex'
  response TEXT NOT NULL,
  priority INT DEFAULT 0,            -- higher = checked first
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON chat_triggers (is_active, priority DESC);
```

### Existing Tables

- **`faq_entries`** — Unchanged schema. Gets a proper admin CRUD UI. Keywords field becomes unused (triggers take over that role). Entries are embedded into RAG on create/update.
- **`rag_embeddings`** — Unchanged. Gains new source types: `knowledge_entries`, `knowledge_chunks`.
- **`ai_conversations`** — Unchanged. Logs tab reuses existing component.

### RLS Policies

All new tables: service role only (consistent with existing `rag_embeddings` and `ai_conversations`).

```sql
ALTER TABLE knowledge_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_triggers ENABLE ROW LEVEL SECURITY;

-- Service role only (matches existing rag_embeddings/ai_conversations pattern)
CREATE POLICY "Service role only" ON knowledge_entries FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role only" ON knowledge_documents FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role only" ON knowledge_chunks FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role only" ON chat_triggers FOR ALL USING (auth.role() = 'service_role');
```

## UI Design

### Design System

Matches existing admin pages:
- **Theme:** Light — warm stone/cream tones (`#FAFAF8` page bg, `white` card bg, `#E8E3DA` borders)
- **Typography:** `font-playfair` for page titles, `font-nunito` for body/labels
- **Colors:** `#7BBFB5` teal primary, `#3D8A80` hover, `#2C6E65` active
- **Inputs:** `rounded-[10px]`, `border-[#E8E3DA]`, `focus:ring-[#7BBFB5]/40`
- **Buttons:** `bg-[#7BBFB5] text-[#F0EBE0] rounded-[10px]`

### Page Header

- Title: "AI Management" (`font-playfair`)
- Subtitle: "Manage your chatbot's knowledge, responses, and behavior"
- AI toggle switch (reads/writes `ai_faq_enabled` from `site_settings`)
- Located at `/admin/ai`

### Tab Navigation

4 tabs with URL param sync (`?tab=knowledge`, `?tab=faqs`, `?tab=triggers`, `?tab=logs`):
- **Knowledge Base** (default)
- **FAQs**
- **Triggers**
- **Logs**

Active tab: `border-bottom: 2px solid #7BBFB5`, teal text. Inactive: `#a8a29e` text.

### Tab 1: Knowledge Base

**Unified view of all RAG sources** with source-type badges:

| Source Type | Badge | Color | Editable? |
|-------------|-------|-------|-----------|
| Custom entries | "Custom" | Purple (`#f3e8ff` bg, `#7c3aed` text) | Full CRUD |
| Documents | "Document" | Amber (`#fef3c7` bg, `#d97706` text) | Delete only (chunks on sub-page) |
| Menu items | "Menu" | Blue (`#dbeafe` bg, `#2563eb` text) | Read-only (link to /admin/menu) |
| Branches | "Branch" | Blue | Read-only (link to /admin/branches) |
| FAQs | "FAQ" | Blue | Read-only (link to FAQs tab) |
| Categories | "Category" | Blue | Read-only |
| Bundles | "Bundle" | Blue | Read-only |
| Loyalty | "Loyalty" | Blue | Read-only |
| Settings | "Settings" | Blue | Read-only |

**Status badges:**
- "Active" — green, entry is embedded and active
- "Synced" — green, auto-synced from source table
- "Inactive" — gray, disabled by admin
- "Review" — amber, document awaiting chunk approval

**Filter bar:**
- Source type dropdown (All, Custom, Document, Menu, Branch, FAQ, etc.)
- Category dropdown
- Search text input

**Action buttons:**
- "+ Add Entry" — opens `KnowledgeEntryForm` modal
- "↑ Upload Doc" — file picker, then redirect to chunk review sub-page

**Table columns:** Content (title + truncated text), Source (badge), Category, Status (badge), Actions (⋯ menu)

**Auto-synced items** are read-only in this table. The ⋯ menu shows "View in [source]" linking to the relevant admin page.

**Pagination:** 20 items per page (consistent with AI Logs).

#### Knowledge Entry Form (Modal)

- **Title** — text input, required
- **Content** — textarea, required
- **Category** — dropdown with free-text option (e.g., "Policies", "Brand", "Operations", "Custom")
- **Active** — toggle

On save: create/update `knowledge_entries` row + fire-and-forget `syncEmbedding('knowledge_entries', id, buildKnowledgeEntryContent(entry))` where `buildKnowledgeEntryContent` formats as `"{title}: {content}"` (consistent with existing `buildFaqContent`, `buildMenuItemContent` helpers in `rag-sync.ts`).

### Tab 2: FAQs

Standard CRUD table for `faq_entries`.

**Table columns:** Question (truncated), Answer (truncated), Category, Active toggle, Actions (edit/delete)

**Pagination:** 20 per page.

#### FAQ Form (Modal)

- **Question** — text input, required
- **Answer** — textarea, required
- **Category** — dropdown with free-text option

On save: create/update `faq_entries` row + fire-and-forget `syncEmbedding('faq_entries', id, buildFaqContent(faq))` using the existing `buildFaqContent` helper from `rag-sync.ts` which formats as `"Q: {question}\nA: {answer}"`.

### Tab 3: Triggers

CRUD table for `chat_triggers`.

**Table columns:** Name, Patterns (comma-joined preview, max 3 shown + "+N more"), Match Type (badge), Priority, Active toggle, Actions (edit/delete)

**Match type badges:**
- "Exact" — stone bg
- "Contains" — blue bg
- "Regex" — amber bg

**Sorted by:** Priority descending (highest first), then name alphabetical.

#### Trigger Form (Modal)

- **Name** — text input, required (admin label)
- **Patterns** — tag-style input (type phrase, press Enter to add, click × to remove)
- **Match Type** — radio group: Exact, Contains, Regex
  - Exact: customer message must exactly match one of the patterns (case-insensitive)
  - Contains: customer message must contain one of the patterns as a substring (case-insensitive)
  - Regex: patterns are treated as regular expressions
- **Response** — textarea, required (the message sent to the customer)
- **Priority** — number input (default 0, higher = checked first)
- **Active** — toggle

### Tab 4: Logs

The existing `AiLogsTab` component moved from `/admin/ai-logs`. Includes:
- Stats bar (today's conversations, intent breakdown)
- Filter row (intent dropdown, date range)
- Expandable session table with `AiLogDetail`
- Pagination (20 per page)

No changes to the component itself — just relocated.

## Document Upload + Chunk Review Flow

### Upload Flow

1. Admin clicks "↑ Upload Doc" in Knowledge tab
2. File picker opens (accept: `.txt`, `.md`, `.pdf`)
3. Server action `uploadDocument(formData)`:
   a. Validate file type and size (max 10MB)
   b. Store file in Supabase Storage bucket `knowledge-docs`
   c. Extract text:
      - `.txt` / `.md`: read as UTF-8
      - `.pdf`: basic text extraction (use `pdf-parse` library)
   d. Smart chunk the text (see chunking logic below)
   e. Create `knowledge_documents` row with `status = 'review'`
   f. Create `knowledge_chunks` rows with `is_approved = false`
   g. Return document ID
4. Redirect to `/admin/ai/documents/[id]`

### Smart Chunking Logic

- **Target chunk size:** 500-800 characters
- **Split boundaries:** Paragraph breaks (`\n\n`), then sentence boundaries (`. `), then word boundaries
- **Overlap:** 50 characters from end of previous chunk prepended to next chunk
- **Section headers:** Detect markdown headings (`#`, `##`), ALL CAPS lines, and bold text (`**...**`). Store in `section_header` field.
- **Minimum chunk size:** 100 characters (merge small chunks with previous)
- **Maximum chunk size:** 1200 characters (force split at sentence boundary)

### Chunk Review Page (`/admin/ai/documents/[id]`)

**Header:**
- Back link to `/admin/ai?tab=knowledge`
- Document filename, file type, file size, upload date
- Chunk count, approval status

**Chunk list:**
Each chunk card shows:
- Section header (if detected) — displayed as a label above content
- Content — editable textarea (admin can fix extraction errors, clarify wording)
- Approve toggle — per-chunk
- Delete button — remove chunk entirely

**Bulk actions:**
- "Approve All" — toggle all chunks to approved
- "Save & Embed" — saves all edits, embeds approved chunks into `rag_embeddings` with `source_table = 'knowledge_chunks'`, sets document `status = 'approved'`

**States:**
- `processing` — file uploaded, chunking in progress (show spinner + "Processing document...")
- `review` — chunks ready for admin review (default state on page load)
- `approved` — all approved chunks embedded (show success banner, chunks become read-only)
- `error` — extraction or chunking failed. Show error banner with `error_message` from the database, a "Delete & Re-upload" button (deletes the document and redirects to `/admin/ai?tab=knowledge`), and a "Retry" button (re-runs extraction if file is still in storage)

## Trigger Matching Logic

New function in `src/lib/trigger-matcher.ts`:

```ts
async function checkTriggers(text: string): Promise<{ matched: boolean; response?: string }> {
  const triggers = await getActiveTriggers(); // fresh query per webhook request, sorted by priority DESC
  const normalizedText = text.toLowerCase().trim();

  for (const trigger of triggers) {
    for (const pattern of trigger.patterns) {
      const normalizedPattern = pattern.toLowerCase().trim();
      let matched = false;

      switch (trigger.match_type) {
        case 'exact':
          matched = normalizedText === normalizedPattern;
          break;
        case 'contains':
          matched = normalizedText.includes(normalizedPattern);
          break;
        case 'regex':
          try { matched = new RegExp(normalizedPattern, 'i').test(normalizedText); }
          catch { matched = false; }
          break;
      }

      if (matched) return { matched: true, response: trigger.response };
    }
  }

  return { matched: false };
}
```

### Trigger Caching Strategy

Triggers are fetched via a simple database query per webhook request (`SELECT * FROM chat_triggers WHERE is_active = true ORDER BY priority DESC`). Given low Messenger volume, this is performant and avoids stale cache issues. No application-level caching needed — the database query is lightweight with the composite index on `(is_active, priority DESC)`.

### ReDoS Protection

Regex patterns are validated on save (in the `addTrigger`/`updateTrigger` server actions):

1. **Max pattern length:** 200 characters (enforced by Zod schema)
2. **Syntax validation:** Test-compile with `new RegExp(pattern)` — reject if it throws
3. **Safety validation:** Use the `safe-regex` library to reject patterns with exponential backtracking (e.g., `(a+)+$`). Patterns flagged as unsafe are rejected with a user-friendly error.
4. **Runtime safety net:** The `checkTriggers` function wraps regex execution in a try/catch so a single bad pattern cannot crash the webhook handler.

## Routes

| Route | Type | Purpose |
|-------|------|---------|
| `/admin/ai/page.tsx` | Server component | Auth guard + render `AiHubTabs` |
| `/admin/ai/documents/[id]/page.tsx` | Server component | Auth guard + fetch doc + render `DocumentReview` |

**Removed route:** `/admin/ai-logs/page.tsx` — redirect to `/admin/ai?tab=logs` for backwards compat.

## Components

### New Components

| Component | Type | Purpose |
|-----------|------|---------|
| `AiHubTabs.tsx` | Client | Tab switcher with URL param sync (`?tab=`) |
| `KnowledgeTab.tsx` | Client | Knowledge base table with filters, source badges |
| `KnowledgeEntryForm.tsx` | Client | Modal form for custom knowledge entries |
| `FaqTab.tsx` | Client | FAQ CRUD table |
| `FaqForm.tsx` | Client | Modal form for FAQ entries |
| `TriggerTab.tsx` | Client | Triggers table with priority ordering |
| `TriggerForm.tsx` | Client | Modal with tag-style pattern input, match type radio |
| `DocumentReview.tsx` | Client | Chunk review page — editable chunks, approve/skip/delete |

### Existing Components (Moved/Reused)

| Component | Change |
|-----------|--------|
| `AiLogsTab.tsx` | Moved into Logs tab (no code changes) |
| `AiLogDetail.tsx` | No changes |
| `Sidebar.tsx` | Replace "AI Logs" nav item with "AI Management" → `/admin/ai` |

## Server Actions

Extend `src/actions/ai.ts`. All new server actions call `await requireAdmin()` at the top (consistent with existing actions in this file).

| Action | Purpose |
|--------|---------|
| `getKnowledgeEntries(page, filters)` | Paginated knowledge from all sources (see query strategy below) |
| `addKnowledgeEntry(input)` | Create custom entry + sync embedding |
| `updateKnowledgeEntry(id, input)` | Update + re-sync embedding |
| `deleteKnowledgeEntry(id)` | Delete + remove embedding |
| `uploadDocument(formData)` | Store file, extract text, smart-chunk, return doc ID |
| `getDocumentWithChunks(id)` | Fetch document + all chunks for review |
| `updateChunks(docId, chunks)` | Bulk update chunk content and approval status |
| `approveDocument(docId)` | Embed approved chunks, set document status = approved |
| `deleteDocument(docId)` | Delete document + chunks + embeddings |
| `getFaqEntries(page, filters)` | Paginated FAQ list |
| `addFaqEntry(input)` | Create + sync embedding |
| `updateFaqEntry(id, input)` | Update + re-sync embedding |
| `deleteFaqEntry(id)` | Delete + remove embedding |
| `getTriggers(page, filters)` | Paginated triggers (sorted by priority DESC) |
| `addTrigger(input)` | Create trigger + revalidate cache |
| `updateTrigger(id, input)` | Update + revalidate cache |
| `deleteTrigger(id)` | Delete + revalidate cache |

### `getKnowledgeEntries` Query Strategy

Rather than a complex multi-table union, query `rag_embeddings` as the single source of truth (it already has `source_table`, `source_id`, `content`, and `metadata` for every embedded item):

```sql
SELECT re.id, re.source_table, re.source_id, re.content, re.metadata, re.updated_at
FROM rag_embeddings re
WHERE ($1 = 'all' OR re.source_table = $1)  -- source filter
  AND ($2 IS NULL OR re.content ILIKE '%' || $2 || '%')  -- search filter
ORDER BY re.updated_at DESC
LIMIT 20 OFFSET $3;
```

For custom entries and documents, supplement with a left join or secondary query to get `title`, `is_active`, and `status`. The `metadata` JSONB column already carries category and display info for auto-synced items (set during `syncEmbedding` calls).

This avoids 8-table unions entirely. The Knowledge tab displays: title (from metadata or source), content (truncated), source_table (as badge), category (from metadata), and status.

## TypeScript Interfaces

Add to `src/types/index.ts`:

```ts
interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  category?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface KnowledgeDocument {
  id: string;
  filename: string;
  file_url: string;
  file_type: 'pdf' | 'txt' | 'md';
  file_size: number;
  chunk_count: number;
  status: 'processing' | 'review' | 'approved' | 'error';
  error_message?: string;
  created_at: string;
  updated_at: string;
}

interface KnowledgeChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  section_header?: string;
  is_approved: boolean;
  created_at: string;
}

interface ChatTrigger {
  id: string;
  name: string;
  patterns: string[];
  match_type: 'exact' | 'contains' | 'regex';
  response: string;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Unified row for Knowledge tab table
interface KnowledgeRow {
  id: string;
  title: string;
  content: string;         // truncated for display
  source_table: string;    // 'knowledge_entries' | 'knowledge_chunks' | 'menu_items' | etc.
  source_id: string;
  category?: string;
  status: 'active' | 'synced' | 'inactive' | 'review';
  updated_at: string;
}
```

## Validation (Zod Schemas)

Uses the existing `sanitized` string builder from `validation.ts` (strips HTML tags) for all user-facing text fields, consistent with the rest of the codebase.

```ts
const knowledgeEntrySchema = z.object({
  title: sanitized.pipe(z.string().min(1).max(200)),
  content: sanitized.pipe(z.string().min(1).max(10000)),
  category: sanitized.pipe(z.string().max(100)).optional(),
  is_active: z.boolean().optional(),
});

const faqEntrySchema = z.object({
  question: sanitized.pipe(z.string().min(1).max(500)),
  answer: sanitized.pipe(z.string().min(1).max(5000)),
  category: sanitized.pipe(z.string().max(100)).optional(),
});

const triggerPatternSchema = sanitized.pipe(
  z.string().min(1).max(200)
).refine((val) => {
  // For regex match_type, validate that the pattern compiles and is safe
  // This refinement is applied conditionally in the server action
  // when match_type === 'regex'
  return true;
});

const triggerSchema = z.object({
  name: sanitized.pipe(z.string().min(1).max(200)),
  patterns: z.array(triggerPatternSchema).min(1),
  match_type: z.enum(['exact', 'contains', 'regex']),
  response: sanitized.pipe(z.string().min(1).max(2000)),
  priority: z.number().int().min(0).max(1000).optional(),
  is_active: z.boolean().optional(),
});
```

When `match_type === 'regex'`, the server action additionally validates each pattern:
1. `new RegExp(pattern)` — must compile without throwing
2. `safeRegex(pattern)` — must pass `safe-regex` check (no catastrophic backtracking)
3. Reject with descriptive error if either check fails

## Migration Plan

### SQL Migration

1. Create `knowledge_entries`, `knowledge_documents`, `knowledge_chunks`, `chat_triggers` tables
2. Create indexes and RLS policies
3. Create Supabase Storage bucket `knowledge-docs`
4. Migrate existing `faq_entries` with keywords into `chat_triggers`:
   - For each `faq_entry` with non-empty `keywords`, create a `chat_trigger` with `match_type = 'contains'`, `patterns = keywords split by comma`, `response = answer`
5. Re-embed all `faq_entries` (they now serve RAG only, keywords field becomes unused)

### Sidebar Update

Replace "AI Logs" (`/admin/ai-logs`) with "AI Management" (`/admin/ai`).

### Redirect

Add redirect from `/admin/ai-logs` → `/admin/ai?tab=logs` for any bookmarks.

## New Dependencies

- `pdf-parse` — PDF text extraction (lightweight, no native deps)
- `safe-regex` — ReDoS detection for user-provided regex patterns in triggers

## File Summary

### New Files

| File | Purpose |
|------|---------|
| `app/admin/ai/page.tsx` | AI hub page (server component) |
| `app/admin/ai/documents/[id]/page.tsx` | Document chunk review page |
| `src/components/admin/AiHubTabs.tsx` | Tab switcher with URL param sync |
| `src/components/admin/KnowledgeTab.tsx` | Knowledge base table |
| `src/components/admin/KnowledgeEntryForm.tsx` | Custom entry form modal |
| `src/components/admin/FaqTab.tsx` | FAQ CRUD table |
| `src/components/admin/FaqForm.tsx` | FAQ form modal |
| `src/components/admin/TriggerTab.tsx` | Triggers table |
| `src/components/admin/TriggerForm.tsx` | Trigger form modal |
| `src/components/admin/DocumentReview.tsx` | Chunk review page |
| `src/lib/trigger-matcher.ts` | Trigger matching logic |
| `src/lib/document-chunker.ts` | Smart chunking logic |
| `scripts/migrate-ai-admin.sql` | Database migration |

### Modified Files

| File | Change |
|------|--------|
| `src/actions/ai.ts` | Add all new server actions |
| `src/lib/messenger-handler.ts` | Add trigger check before AI fallback |
| `src/components/admin/Sidebar.tsx` | Replace "AI Logs" with "AI Management" |
| `src/lib/validation.ts` | Add Zod schemas for new entities |
| `src/types/index.ts` | Add TypeScript interfaces |

### Removed/Redirected

| File | Change |
|------|--------|
| `app/admin/ai-logs/page.tsx` | Redirect to `/admin/ai?tab=logs` |
