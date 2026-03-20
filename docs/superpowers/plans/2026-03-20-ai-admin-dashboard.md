# AI Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified AI management admin page at `/admin/ai` with Knowledge Base, FAQs, Triggers, and Logs tabs, plus a document upload sub-page with smart chunking and chunk review.

**Architecture:** Single tabbed page consolidating all AI admin into `/admin/ai` with URL param sync. Knowledge tab queries `rag_embeddings` as source of truth for a unified view. New `chat_triggers` table replaces FAQ keyword matching in the Messenger handler. Document uploads go through a chunk → review → approve → embed pipeline on a sub-page at `/admin/ai/documents/[id]`.

**Tech Stack:** Next.js 15 App Router, Supabase (pgvector), Zod 4, Vitest, lucide-react icons, pdf-parse, safe-regex

**Spec:** `docs/superpowers/specs/2026-03-20-ai-admin-dashboard-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `scripts/migrate-ai-admin.sql` | Database migration (4 tables, indexes, RLS, data migration) |
| `src/lib/trigger-matcher.ts` | Check incoming messages against `chat_triggers` |
| `src/lib/document-chunker.ts` | Smart text chunking with overlap and header detection |
| `app/admin/ai/page.tsx` | AI hub server component (auth guard, render tabs) |
| `app/admin/ai/documents/[id]/page.tsx` | Document chunk review server component |
| `src/components/admin/AiHubTabs.tsx` | Client tab switcher with `?tab=` URL param sync |
| `src/components/admin/KnowledgeTab.tsx` | Knowledge base table with filters and source badges |
| `src/components/admin/KnowledgeEntryForm.tsx` | Modal form for custom knowledge entries |
| `src/components/admin/FaqTab.tsx` | FAQ CRUD table |
| `src/components/admin/FaqForm.tsx` | Modal form for FAQ entries |
| `src/components/admin/TriggerTab.tsx` | Triggers table with priority ordering |
| `src/components/admin/TriggerForm.tsx` | Modal with tag-style pattern input and match type radio |
| `src/components/admin/DocumentReview.tsx` | Chunk review client component |
| `src/hooks/useKnowledge.ts` | Hook for knowledge tab data fetching |
| `src/hooks/useFaqs.ts` | Hook for FAQ tab data fetching |
| `src/hooks/useTriggers.ts` | Hook for triggers tab data fetching |
| `tests/trigger-matcher.test.ts` | Tests for trigger matching logic |
| `tests/document-chunker.test.ts` | Tests for smart chunking logic |
| `tests/validation-ai-admin.test.ts` | Tests for new Zod schemas |
| `app/api/admin/settings/ai-status/route.ts` | API endpoint for AI toggle state |

### Modified Files
| File | Change |
|------|--------|
| `src/types/index.ts` | Add `KnowledgeEntry`, `KnowledgeDocument`, `KnowledgeChunk`, `ChatTrigger`, `KnowledgeRow` interfaces |
| `src/lib/validation.ts` | Add `knowledgeEntrySchema`, `faqEntrySchema`, `triggerSchema` + types. Export `sanitized`. |
| `src/lib/rag-sync.ts` | Add `buildKnowledgeEntryContent()` and `buildChunkContent()` helpers |
| `src/actions/ai.ts` | Add 17 new server actions for knowledge, FAQs, triggers, documents |
| `src/lib/messenger-handler.ts` | Add `checkTriggers()` call before AI fallback |
| `src/components/admin/Sidebar.tsx` | Replace "AI Logs" nav item with "AI Management" |
| `app/admin/ai-logs/page.tsx` | Replace with redirect to `/admin/ai?tab=logs` |
| `package.json` | Add `pdf-parse`, `safe-regex` dependencies |

---

## Task 1: Database Migration

**Files:**
- Create: `scripts/migrate-ai-admin.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- scripts/migrate-ai-admin.sql
-- AI Admin Dashboard: knowledge entries, documents, chunks, triggers

-- 1. knowledge_entries
CREATE TABLE IF NOT EXISTS knowledge_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_entries_active_idx
  ON knowledge_entries (is_active);
CREATE INDEX IF NOT EXISTS knowledge_entries_category_idx
  ON knowledge_entries (category);

ALTER TABLE knowledge_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON knowledge_entries
  FOR ALL USING (auth.role() = 'service_role');

-- 2. knowledge_documents
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  filename TEXT NOT NULL,
  file_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INT NOT NULL,
  chunk_count INT DEFAULT 0,
  status TEXT DEFAULT 'processing',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_documents_status_idx
  ON knowledge_documents (status);

ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON knowledge_documents
  FOR ALL USING (auth.role() = 'service_role');

-- 3. knowledge_chunks
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  section_header TEXT,
  is_approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_chunks_doc_idx
  ON knowledge_chunks (document_id, chunk_index);

ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON knowledge_chunks
  FOR ALL USING (auth.role() = 'service_role');

-- 4. chat_triggers
CREATE TABLE IF NOT EXISTS chat_triggers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  patterns TEXT[] NOT NULL,
  match_type TEXT DEFAULT 'contains',
  response TEXT NOT NULL,
  priority INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_triggers_active_priority_idx
  ON chat_triggers (is_active, priority DESC);

ALTER TABLE chat_triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON chat_triggers
  FOR ALL USING (auth.role() = 'service_role');

-- 5. Migrate existing faq_entries keywords into chat_triggers
-- For each FAQ with non-empty keywords, create a trigger
INSERT INTO chat_triggers (name, patterns, match_type, response, priority, is_active)
SELECT
  'FAQ: ' || LEFT(question, 50) AS name,
  string_to_array(keywords, ',') AS patterns,
  'contains' AS match_type,
  answer AS response,
  0 AS priority,
  is_active
FROM faq_entries
WHERE keywords IS NOT NULL AND keywords != ''
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Run the migration against Supabase**

Run: `NEXT_PUBLIC_SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." npx supabase db execute < scripts/migrate-ai-admin.sql`

Or run the SQL directly in the Supabase SQL editor.

- [ ] **Step 3: Re-embed FAQ entries**

The migration moves FAQ keywords into triggers, so FAQs now serve RAG only. Re-run the FAQ portion of the seed script to ensure embeddings are up to date:

Run: `NEXT_PUBLIC_SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." NVIDIA_API_KEY="..." npx tsx scripts/seed-embeddings.ts`

(The seed script is idempotent — it skips items with unchanged content_hash.)

- [ ] **Step 4: Create Supabase Storage bucket**

In Supabase Dashboard → Storage → New Bucket:
- Name: `knowledge-docs`
- Public: No
- File size limit: 10MB
- Allowed MIME types: `text/plain`, `text/markdown`, `application/pdf`

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-ai-admin.sql
git commit -m "feat(ai-admin): add database migration for knowledge, documents, chunks, triggers"
```

---

## Task 2: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install pdf-parse and safe-regex**

Run: `npm install pdf-parse safe-regex`

- [ ] **Step 2: Verify installation**

Run: `node -e "require('pdf-parse'); require('safe-regex'); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(ai-admin): add pdf-parse and safe-regex dependencies"
```

---

## Task 3: TypeScript Interfaces

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add interfaces at the end of the file**

Append to `src/types/index.ts`:

```typescript
// AI Admin Dashboard types

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  category?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeDocument {
  id: string;
  filename: string;
  file_url: string;
  storage_path: string;
  file_type: 'pdf' | 'txt' | 'md';
  file_size: number;
  chunk_count: number;
  status: 'processing' | 'review' | 'approved' | 'error';
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  section_header?: string;
  is_approved: boolean;
  created_at: string;
}

export interface ChatTrigger {
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

export interface KnowledgeRow {
  id: string;
  title: string;
  content: string;
  source_table: string;
  source_id: string;
  category?: string;
  status: 'active' | 'synced' | 'inactive' | 'review';
  updated_at: string;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to the new types.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(ai-admin): add TypeScript interfaces for knowledge, documents, chunks, triggers"
```

---

## Task 4: Validation Schemas

**Files:**
- Modify: `src/lib/validation.ts`
- Create: `tests/validation-ai-admin.test.ts`

- [ ] **Step 1: Export `sanitized` from validation.ts**

In `src/lib/validation.ts`, change:
```typescript
const sanitized = z.string().transform(sanitizeString);
```
to:
```typescript
export const sanitized = z.string().transform(sanitizeString);
```

- [ ] **Step 2: Add new schemas at the end of validation.ts**

Append to `src/lib/validation.ts`:

```typescript
// AI Admin Dashboard schemas

export const knowledgeEntrySchema = z.object({
  title: sanitized.pipe(z.string().min(1, 'Title is required').max(200, 'Title must be 200 characters or fewer')),
  content: sanitized.pipe(z.string().min(1, 'Content is required').max(10000, 'Content must be 10,000 characters or fewer')),
  category: sanitized.pipe(z.string().max(100)).optional(),
  is_active: z.boolean().optional(),
});

export type KnowledgeEntryInput = z.infer<typeof knowledgeEntrySchema>;

export const faqEntrySchema = z.object({
  question: sanitized.pipe(z.string().min(1, 'Question is required').max(500, 'Question must be 500 characters or fewer')),
  answer: sanitized.pipe(z.string().min(1, 'Answer is required').max(5000, 'Answer must be 5,000 characters or fewer')),
  category: sanitized.pipe(z.string().max(100)).optional(),
});

export type FaqEntryInput = z.infer<typeof faqEntrySchema>;

export const triggerSchema = z.object({
  name: sanitized.pipe(z.string().min(1, 'Name is required').max(200, 'Name must be 200 characters or fewer')),
  patterns: z.array(sanitized.pipe(z.string().min(1).max(200))).min(1, 'At least one pattern is required'),
  match_type: z.enum(['exact', 'contains', 'regex']),
  response: sanitized.pipe(z.string().min(1, 'Response is required').max(2000, 'Response must be 2,000 characters or fewer')),
  priority: z.number().int().min(0).max(1000).optional(),
  is_active: z.boolean().optional(),
});

export type TriggerInput = z.infer<typeof triggerSchema>;
```

- [ ] **Step 3: Write validation tests**

Create `tests/validation-ai-admin.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { knowledgeEntrySchema, faqEntrySchema, triggerSchema } from '@/lib/validation';

describe('knowledgeEntrySchema', () => {
  it('accepts valid input', () => {
    const result = knowledgeEntrySchema.safeParse({
      title: 'Refund Policy',
      content: 'We offer full refunds within 30 minutes.',
      category: 'Policies',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty title', () => {
    const result = knowledgeEntrySchema.safeParse({
      title: '',
      content: 'Some content',
    });
    expect(result.success).toBe(false);
  });

  it('strips HTML from title', () => {
    const result = knowledgeEntrySchema.safeParse({
      title: '<script>alert("xss")</script>Refund Policy',
      content: 'Content here',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('alert("xss")Refund Policy');
    }
  });
});

describe('faqEntrySchema', () => {
  it('accepts valid input', () => {
    const result = faqEntrySchema.safeParse({
      question: 'What are your hours?',
      answer: 'We are open 10am-9pm daily.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing answer', () => {
    const result = faqEntrySchema.safeParse({
      question: 'What are your hours?',
    });
    expect(result.success).toBe(false);
  });
});

describe('triggerSchema', () => {
  it('accepts valid contains trigger', () => {
    const result = triggerSchema.safeParse({
      name: 'Store Hours',
      patterns: ['hours', 'open', 'close'],
      match_type: 'contains',
      response: 'We are open 10am-9pm daily!',
      priority: 10,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty patterns array', () => {
    const result = triggerSchema.safeParse({
      name: 'Test',
      patterns: [],
      match_type: 'exact',
      response: 'Hello',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid match_type', () => {
    const result = triggerSchema.safeParse({
      name: 'Test',
      patterns: ['hello'],
      match_type: 'fuzzy',
      response: 'Hi',
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/validation-ai-admin.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation.ts tests/validation-ai-admin.test.ts
git commit -m "feat(ai-admin): add validation schemas for knowledge entries, FAQs, and triggers"
```

---

## Task 5: Content Builders in rag-sync.ts

**Files:**
- Modify: `src/lib/rag-sync.ts`

- [ ] **Step 1: Add content builder functions**

Add after the existing `buildMenuItemContent` function in `src/lib/rag-sync.ts`:

```typescript
export function buildKnowledgeEntryContent(entry: {
  title: string;
  content: string;
}): string {
  return `${entry.title}: ${entry.content}`;
}

export function buildChunkContent(chunk: {
  section_header?: string | null;
  content: string;
}): string {
  return chunk.section_header
    ? `${chunk.section_header}\n${chunk.content}`
    : chunk.content;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/rag-sync.ts
git commit -m "feat(ai-admin): add content builders for knowledge entries and chunks"
```

---

## Task 6: Document Chunker

**Files:**
- Create: `src/lib/document-chunker.ts`
- Create: `tests/document-chunker.test.ts`

- [ ] **Step 1: Write the tests first**

Create `tests/document-chunker.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { smartChunk } from '@/lib/document-chunker';

describe('smartChunk', () => {
  it('returns single chunk for short text', () => {
    const chunks = smartChunk('This is a short paragraph.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('This is a short paragraph.');
    expect(chunks[0].chunk_index).toBe(0);
  });

  it('splits on paragraph boundaries', () => {
    const text = 'A'.repeat(600) + '\n\n' + 'B'.repeat(600);
    const chunks = smartChunk(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].content).toContain('A');
    expect(chunks[1].content).toContain('B');
  });

  it('detects markdown section headers', () => {
    const text = '# Introduction\n\nThis is the intro paragraph. ' + 'More text. '.repeat(60) +
      '\n\n## Details\n\nThis is the details section. ' + 'More details. '.repeat(60);
    const chunks = smartChunk(text);
    const headerChunk = chunks.find(c => c.section_header === 'Introduction');
    expect(headerChunk).toBeDefined();
  });

  it('merges small chunks with previous', () => {
    const text = 'Normal paragraph here. '.repeat(30) + '\n\nTiny.\n\n' + 'Another paragraph. '.repeat(30);
    const chunks = smartChunk(text);
    // "Tiny." should be merged, not standalone
    const tinyChunk = chunks.find(c => c.content === 'Tiny.');
    expect(tinyChunk).toBeUndefined();
  });

  it('includes overlap between chunks', () => {
    const text = 'Sentence one. '.repeat(50) + '\n\n' + 'Sentence two. '.repeat(50);
    const chunks = smartChunk(text);
    if (chunks.length >= 2) {
      // Last 50 chars of chunk 0 should appear at start of chunk 1
      const endOfFirst = chunks[0].content.slice(-50);
      expect(chunks[1].content.startsWith(endOfFirst)).toBe(true);
    }
  });

  it('assigns sequential chunk_index values', () => {
    const text = ('Paragraph content here. '.repeat(40) + '\n\n').repeat(5);
    const chunks = smartChunk(text);
    chunks.forEach((chunk, i) => {
      expect(chunk.chunk_index).toBe(i);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/document-chunker.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the chunker**

Create `src/lib/document-chunker.ts`:

```typescript
export interface ChunkResult {
  chunk_index: number;
  content: string;
  section_header?: string;
}

const TARGET_MIN = 500;
const TARGET_MAX = 800;
const ABSOLUTE_MAX = 1200;
const MERGE_MIN = 100;
const OVERLAP = 50;

const HEADER_PATTERNS = [
  /^#{1,6}\s+(.+)$/,           // Markdown headings
  /^\*\*(.+)\*\*$/,             // Bold text on its own line
  /^([A-Z][A-Z\s]{4,})$/,      // ALL CAPS lines (5+ chars)
];

function detectHeader(line: string): string | null {
  const trimmed = line.trim();
  for (const pattern of HEADER_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

function splitAtSentence(text: string, maxLen: number): [string, string] {
  if (text.length <= maxLen) return [text, ''];

  // Find last sentence boundary before maxLen
  const sub = text.slice(0, maxLen);
  const lastPeriod = sub.lastIndexOf('. ');
  const lastQuestion = sub.lastIndexOf('? ');
  const lastExclaim = sub.lastIndexOf('! ');
  const splitAt = Math.max(lastPeriod, lastQuestion, lastExclaim);

  if (splitAt > MERGE_MIN) {
    return [text.slice(0, splitAt + 1).trim(), text.slice(splitAt + 1).trim()];
  }

  // Fallback: split at last space before maxLen
  const lastSpace = sub.lastIndexOf(' ');
  if (lastSpace > MERGE_MIN) {
    return [text.slice(0, lastSpace).trim(), text.slice(lastSpace).trim()];
  }

  // Hard split
  return [text.slice(0, maxLen).trim(), text.slice(maxLen).trim()];
}

export function smartChunk(text: string): ChunkResult[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  // Split into paragraphs
  const paragraphs = normalized.split(/\n{2,}/);
  const rawChunks: { content: string; header?: string }[] = [];
  let currentChunk = '';
  let currentHeader: string | undefined;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // Check if this paragraph is a header
    const firstLine = trimmed.split('\n')[0];
    const detectedHeader = detectHeader(firstLine);

    if (detectedHeader) {
      // Flush current chunk if it has content
      if (currentChunk.length >= MERGE_MIN) {
        rawChunks.push({ content: currentChunk.trim(), header: currentHeader });
        currentChunk = '';
      }
      currentHeader = detectedHeader;
      // Include the body after the header line
      const rest = trimmed.split('\n').slice(1).join('\n').trim();
      if (rest) {
        currentChunk += (currentChunk ? '\n\n' : '') + rest;
      }
      continue;
    }

    const wouldBe = currentChunk
      ? currentChunk.length + 2 + trimmed.length
      : trimmed.length;

    if (wouldBe <= TARGET_MAX) {
      currentChunk += (currentChunk ? '\n\n' : '') + trimmed;
    } else if (currentChunk.length >= TARGET_MIN) {
      // Current chunk is big enough, flush it
      rawChunks.push({ content: currentChunk.trim(), header: currentHeader });
      currentChunk = trimmed;
      currentHeader = undefined;
    } else {
      // Current chunk is too small but paragraph pushes past max
      currentChunk += (currentChunk ? '\n\n' : '') + trimmed;
    }
  }

  // Flush remaining
  if (currentChunk.trim()) {
    rawChunks.push({ content: currentChunk.trim(), header: currentHeader });
  }

  // Force-split any chunks exceeding ABSOLUTE_MAX
  const splitChunks: { content: string; header?: string }[] = [];
  for (const chunk of rawChunks) {
    if (chunk.content.length <= ABSOLUTE_MAX) {
      splitChunks.push(chunk);
    } else {
      let remaining = chunk.content;
      let first = true;
      while (remaining.length > 0) {
        const [piece, rest] = splitAtSentence(remaining, TARGET_MAX);
        splitChunks.push({
          content: piece,
          header: first ? chunk.header : undefined,
        });
        remaining = rest;
        first = false;
      }
    }
  }

  // Merge small trailing chunks
  const merged: { content: string; header?: string }[] = [];
  for (const chunk of splitChunks) {
    if (
      chunk.content.length < MERGE_MIN &&
      merged.length > 0 &&
      !chunk.header
    ) {
      merged[merged.length - 1].content += '\n\n' + chunk.content;
    } else {
      merged.push(chunk);
    }
  }

  // Apply overlap and build results
  const results: ChunkResult[] = [];
  for (let i = 0; i < merged.length; i++) {
    let content = merged[i].content;

    if (i > 0 && OVERLAP > 0) {
      const prevContent = merged[i - 1].content;
      const overlapText = prevContent.slice(-OVERLAP);
      content = overlapText + content;
    }

    results.push({
      chunk_index: i,
      content,
      section_header: merged[i].header,
    });
  }

  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/document-chunker.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/document-chunker.ts tests/document-chunker.test.ts
git commit -m "feat(ai-admin): add smart document chunker with overlap and header detection"
```

---

## Task 7: Trigger Matcher

**Files:**
- Create: `src/lib/trigger-matcher.ts`
- Create: `tests/trigger-matcher.test.ts`

- [ ] **Step 1: Write the tests first**

Create `tests/trigger-matcher.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { matchTrigger, validateRegexPattern } from '@/lib/trigger-matcher';
import type { ChatTrigger } from '@/types';

const makeTrigger = (overrides: Partial<ChatTrigger> = {}): ChatTrigger => ({
  id: '1',
  name: 'Test',
  patterns: ['hello'],
  match_type: 'contains',
  response: 'Hi there!',
  priority: 0,
  is_active: true,
  created_at: '',
  updated_at: '',
  ...overrides,
});

describe('matchTrigger', () => {
  it('matches contains pattern (case-insensitive)', () => {
    const triggers = [makeTrigger({ patterns: ['hours', 'open'] })];
    const result = matchTrigger('What are your HOURS?', triggers);
    expect(result).toEqual({ matched: true, response: 'Hi there!' });
  });

  it('matches exact pattern', () => {
    const triggers = [makeTrigger({ patterns: ['hi'], match_type: 'exact' })];
    expect(matchTrigger('hi', triggers).matched).toBe(true);
    expect(matchTrigger('hi there', triggers).matched).toBe(false);
  });

  it('matches regex pattern', () => {
    const triggers = [makeTrigger({ patterns: ['\\d+\\s*shakes?'], match_type: 'regex' })];
    expect(matchTrigger('I want 2 shakes', triggers).matched).toBe(true);
    expect(matchTrigger('I want shakes', triggers).matched).toBe(false);
  });

  it('returns first match by priority order', () => {
    const triggers = [
      makeTrigger({ name: 'Low', patterns: ['hello'], priority: 0, response: 'Low priority' }),
      makeTrigger({ name: 'High', patterns: ['hello'], priority: 10, response: 'High priority' }),
    ];
    // Triggers should be pre-sorted by priority DESC
    const sorted = [...triggers].sort((a, b) => b.priority - a.priority);
    const result = matchTrigger('hello', sorted);
    expect(result.response).toBe('High priority');
  });

  it('returns no match when nothing matches', () => {
    const triggers = [makeTrigger({ patterns: ['goodbye'] })];
    expect(matchTrigger('hello', triggers).matched).toBe(false);
  });

  it('handles invalid regex gracefully', () => {
    const triggers = [makeTrigger({ patterns: ['[invalid'], match_type: 'regex' })];
    expect(matchTrigger('test', triggers).matched).toBe(false);
  });
});

describe('validateRegexPattern', () => {
  it('accepts safe regex', () => {
    expect(validateRegexPattern('\\d+\\s+items?')).toEqual({ valid: true });
  });

  it('rejects invalid syntax', () => {
    const result = validateRegexPattern('[unclosed');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid');
  });

  it('rejects unsafe regex (catastrophic backtracking)', () => {
    const result = validateRegexPattern('(a+)+$');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('unsafe');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/trigger-matcher.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the trigger matcher**

Create `src/lib/trigger-matcher.ts`:

```typescript
import safeRegex from 'safe-regex';
import type { ChatTrigger } from '@/types';
import { supabaseServer } from '@/lib/supabase-server';

export function matchTrigger(
  text: string,
  triggers: ChatTrigger[]
): { matched: boolean; response?: string } {
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
          try {
            matched = new RegExp(normalizedPattern, 'i').test(normalizedText);
          } catch {
            matched = false;
          }
          break;
      }

      if (matched) return { matched: true, response: trigger.response };
    }
  }

  return { matched: false };
}

export function validateRegexPattern(
  pattern: string
): { valid: true } | { valid: false; error: string } {
  // Check syntax
  try {
    new RegExp(pattern);
  } catch (e: any) {
    return { valid: false, error: `Invalid regex syntax: ${e.message}` };
  }

  // Check for catastrophic backtracking
  if (!safeRegex(pattern)) {
    return {
      valid: false,
      error: 'Pattern is unsafe — it could cause catastrophic backtracking. Simplify the pattern.',
    };
  }

  return { valid: true };
}

export async function checkTriggers(
  text: string
): Promise<{ matched: boolean; response?: string }> {
  const { data: triggers } = await supabaseServer
    .from('chat_triggers')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: false });

  if (!triggers || triggers.length === 0) return { matched: false };

  return matchTrigger(text, triggers as ChatTrigger[]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/trigger-matcher.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trigger-matcher.ts tests/trigger-matcher.test.ts
git commit -m "feat(ai-admin): add trigger matcher with ReDoS protection"
```

---

## Task 8: Server Actions — Knowledge Entries

**Files:**
- Modify: `src/actions/ai.ts`

- [ ] **Step 1: Add knowledge entry server actions**

Add these imports at the top of `src/actions/ai.ts`:

```typescript
import { knowledgeEntrySchema, faqEntrySchema, triggerSchema } from '@/lib/validation';
import { syncEmbedding, removeEmbedding, buildKnowledgeEntryContent, buildFaqContent, buildChunkContent } from '@/lib/rag-sync';
import { validateRegexPattern } from '@/lib/trigger-matcher';
import type { KnowledgeEntryInput, FaqEntryInput, TriggerInput } from '@/lib/validation';
```

Then add the knowledge entry actions:

```typescript
const ADMIN_PAGE_SIZE = 20;

export async function getKnowledgeEntries(
  page: number = 0,
  filters?: { source?: string; category?: string; search?: string }
): Promise<ActionResult> {
  await requireAdmin();

  let query = supabaseServer
    .from('rag_embeddings')
    .select('id, source_table, source_id, content, metadata, updated_at');

  if (filters?.source && filters.source !== 'all') {
    query = query.eq('source_table', filters.source);
  }
  if (filters?.search) {
    query = query.ilike('content', `%${filters.search}%`);
  }

  const { data, error } = await query.order('updated_at', { ascending: false });

  if (error) return { success: false, error: 'Failed to fetch knowledge entries' };

  // Apply category filter from metadata
  let rows = (data || []).map((row: any) => ({
    id: row.id,
    title: row.metadata?.title || row.metadata?.name || row.source_id,
    content: row.content?.slice(0, 200) || '',
    source_table: row.source_table,
    source_id: row.source_id,
    category: row.metadata?.category || null,
    status: row.source_table === 'knowledge_chunks'
      ? 'review'
      : row.source_table === 'knowledge_entries'
        ? (row.metadata?.is_active === false ? 'inactive' : 'active')
        : 'synced',
    updated_at: row.updated_at,
  }));

  if (filters?.category) {
    rows = rows.filter((r: any) => r.category === filters.category);
  }

  // Also include documents (not in rag_embeddings until approved, or in 'review' status)
  const { data: docs } = await supabaseServer
    .from('knowledge_documents')
    .select('*')
    .order('created_at', { ascending: false });

  if (docs) {
    for (const doc of docs) {
      rows.push({
        id: doc.id,
        title: doc.filename,
        content: `${doc.chunk_count} chunks • ${doc.file_type.toUpperCase()}`,
        source_table: 'knowledge_documents',
        source_id: doc.id,
        category: null,
        status: doc.status === 'approved' ? 'active' : 'review',
        updated_at: doc.updated_at || doc.created_at,
      });
    }
  }

  // Sort by updated_at descending (total is calculated after all filters applied)
  rows.sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  const total = rows.length;  // After all filters
  const paged = rows.slice(page * ADMIN_PAGE_SIZE, (page + 1) * ADMIN_PAGE_SIZE);

  return { success: true, data: { rows: paged, total, page, pageSize: ADMIN_PAGE_SIZE } };
}

export async function addKnowledgeEntry(input: KnowledgeEntryInput): Promise<ActionResult> {
  await requireAdmin();

  const parsed = knowledgeEntrySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || 'Validation failed' };

  const { data: entry, error } = await supabaseServer
    .from('knowledge_entries')
    .insert({
      title: parsed.data.title,
      content: parsed.data.content,
      category: parsed.data.category || null,
      is_active: parsed.data.is_active ?? true,
    })
    .select()
    .single();

  if (error || !entry) return { success: false, error: 'Failed to create knowledge entry' };

  syncEmbedding(
    'knowledge_entries',
    entry.id,
    buildKnowledgeEntryContent({ title: entry.title, content: entry.content }),
    { title: entry.title, category: entry.category, is_active: entry.is_active }
  ).catch((err) => console.error('[rag-sync] knowledge entry:', err));

  return { success: true, data: entry };
}

export async function updateKnowledgeEntry(id: string, input: KnowledgeEntryInput): Promise<ActionResult> {
  await requireAdmin();

  const parsed = knowledgeEntrySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || 'Validation failed' };

  const { data: entry, error } = await supabaseServer
    .from('knowledge_entries')
    .update({
      title: parsed.data.title,
      content: parsed.data.content,
      category: parsed.data.category || null,
      is_active: parsed.data.is_active ?? true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error || !entry) return { success: false, error: 'Failed to update knowledge entry' };

  if (entry.is_active) {
    syncEmbedding(
      'knowledge_entries',
      entry.id,
      buildKnowledgeEntryContent({ title: entry.title, content: entry.content }),
      { title: entry.title, category: entry.category, is_active: entry.is_active }
    ).catch((err) => console.error('[rag-sync] knowledge entry:', err));
  } else {
    removeEmbedding('knowledge_entries', entry.id).catch((err) =>
      console.error('[rag-sync] remove knowledge entry:', err)
    );
  }

  return { success: true, data: entry };
}

export async function deleteKnowledgeEntry(id: string): Promise<ActionResult> {
  await requireAdmin();

  const { error } = await supabaseServer.from('knowledge_entries').delete().eq('id', id);
  if (error) return { success: false, error: 'Failed to delete knowledge entry' };

  removeEmbedding('knowledge_entries', id).catch((err) =>
    console.error('[rag-sync] remove knowledge entry:', err)
  );

  return { success: true };
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add src/actions/ai.ts
git commit -m "feat(ai-admin): add knowledge entry server actions with RAG sync"
```

---

## Task 9: Server Actions — FAQs & Triggers

**Files:**
- Modify: `src/actions/ai.ts`

- [ ] **Step 1: Add FAQ server actions**

Append to `src/actions/ai.ts`:

```typescript
export async function getFaqEntries(
  page: number = 0,
  filters?: { category?: string; search?: string }
): Promise<ActionResult> {
  await requireAdmin();

  let query = supabaseServer
    .from('faq_entries')
    .select('*');

  if (filters?.category) {
    query = query.eq('category', filters.category);
  }
  if (filters?.search) {
    query = query.or(`question.ilike.%${filters.search}%,answer.ilike.%${filters.search}%`);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) return { success: false, error: 'Failed to fetch FAQs' };

  const total = (data || []).length;
  const paged = (data || []).slice(page * ADMIN_PAGE_SIZE, (page + 1) * ADMIN_PAGE_SIZE);

  return { success: true, data: { faqs: paged, total, page, pageSize: ADMIN_PAGE_SIZE } };
}

export async function addFaqEntry(input: FaqEntryInput): Promise<ActionResult> {
  await requireAdmin();

  const parsed = faqEntrySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || 'Validation failed' };

  const { data: faq, error } = await supabaseServer
    .from('faq_entries')
    .insert({
      question: parsed.data.question,
      answer: parsed.data.answer,
      category: parsed.data.category || null,
      is_active: true,
    })
    .select()
    .single();

  if (error || !faq) return { success: false, error: 'Failed to create FAQ' };

  syncEmbedding(
    'faq_entries',
    faq.id,
    buildFaqContent({ question: faq.question, answer: faq.answer }),
    { category: faq.category }
  ).catch((err) => console.error('[rag-sync] faq:', err));

  return { success: true, data: faq };
}

export async function updateFaqEntry(id: string, input: FaqEntryInput): Promise<ActionResult> {
  await requireAdmin();

  const parsed = faqEntrySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || 'Validation failed' };

  const { data: faq, error } = await supabaseServer
    .from('faq_entries')
    .update({
      question: parsed.data.question,
      answer: parsed.data.answer,
      category: parsed.data.category || null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error || !faq) return { success: false, error: 'Failed to update FAQ' };

  syncEmbedding(
    'faq_entries',
    faq.id,
    buildFaqContent({ question: faq.question, answer: faq.answer }),
    { category: faq.category }
  ).catch((err) => console.error('[rag-sync] faq:', err));

  return { success: true, data: faq };
}

export async function deleteFaqEntry(id: string): Promise<ActionResult> {
  await requireAdmin();

  const { error } = await supabaseServer.from('faq_entries').delete().eq('id', id);
  if (error) return { success: false, error: 'Failed to delete FAQ' };

  removeEmbedding('faq_entries', id).catch((err) =>
    console.error('[rag-sync] remove faq:', err)
  );

  return { success: true };
}
```

- [ ] **Step 2: Add trigger server actions**

Append to `src/actions/ai.ts`:

```typescript
export async function getTriggers(
  page: number = 0,
  filters?: { search?: string }
): Promise<ActionResult> {
  await requireAdmin();

  let query = supabaseServer
    .from('chat_triggers')
    .select('*')
    .order('priority', { ascending: false })
    .order('name', { ascending: true });

  if (filters?.search) {
    query = query.ilike('name', `%${filters.search}%`);
  }

  const { data, error } = await query;

  if (error) return { success: false, error: 'Failed to fetch triggers' };

  const total = (data || []).length;
  const paged = (data || []).slice(page * ADMIN_PAGE_SIZE, (page + 1) * ADMIN_PAGE_SIZE);

  return { success: true, data: { triggers: paged, total, page, pageSize: ADMIN_PAGE_SIZE } };
}

export async function addTrigger(input: TriggerInput): Promise<ActionResult> {
  await requireAdmin();

  const parsed = triggerSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || 'Validation failed' };

  // Validate regex patterns if match_type is 'regex'
  if (parsed.data.match_type === 'regex') {
    for (const pattern of parsed.data.patterns) {
      const validation = validateRegexPattern(pattern);
      if (!validation.valid) {
        return { success: false, error: `Pattern "${pattern}": ${validation.error}` };
      }
    }
  }

  const { data: trigger, error } = await supabaseServer
    .from('chat_triggers')
    .insert({
      name: parsed.data.name,
      patterns: parsed.data.patterns,
      match_type: parsed.data.match_type,
      response: parsed.data.response,
      priority: parsed.data.priority ?? 0,
      is_active: parsed.data.is_active ?? true,
    })
    .select()
    .single();

  if (error || !trigger) return { success: false, error: 'Failed to create trigger' };

  return { success: true, data: trigger };
}

export async function updateTrigger(id: string, input: TriggerInput): Promise<ActionResult> {
  await requireAdmin();

  const parsed = triggerSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || 'Validation failed' };

  if (parsed.data.match_type === 'regex') {
    for (const pattern of parsed.data.patterns) {
      const validation = validateRegexPattern(pattern);
      if (!validation.valid) {
        return { success: false, error: `Pattern "${pattern}": ${validation.error}` };
      }
    }
  }

  const { data: trigger, error } = await supabaseServer
    .from('chat_triggers')
    .update({
      name: parsed.data.name,
      patterns: parsed.data.patterns,
      match_type: parsed.data.match_type,
      response: parsed.data.response,
      priority: parsed.data.priority ?? 0,
      is_active: parsed.data.is_active ?? true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error || !trigger) return { success: false, error: 'Failed to update trigger' };

  return { success: true, data: trigger };
}

export async function deleteTrigger(id: string): Promise<ActionResult> {
  await requireAdmin();

  const { error } = await supabaseServer.from('chat_triggers').delete().eq('id', id);
  if (error) return { success: false, error: 'Failed to delete trigger' };

  return { success: true };
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add src/actions/ai.ts
git commit -m "feat(ai-admin): add FAQ and trigger server actions"
```

---

## Task 10: Server Actions — Document Upload & Chunks

**Files:**
- Modify: `src/actions/ai.ts`

- [ ] **Step 1: Add document server actions**

Add at top of `src/actions/ai.ts`:

```typescript
import { smartChunk } from '@/lib/document-chunker';
import pdf from 'pdf-parse';
```

Then append document actions:

```typescript
export async function uploadDocument(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const file = formData.get('file') as File | null;
  if (!file) return { success: false, error: 'No file provided' };

  const allowedTypes = ['text/plain', 'text/markdown', 'application/pdf'];
  const extMap: Record<string, string> = {
    'text/plain': 'txt',
    'text/markdown': 'md',
    'application/pdf': 'pdf',
  };

  if (!allowedTypes.includes(file.type)) {
    return { success: false, error: 'File type not supported. Use .txt, .md, or .pdf' };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { success: false, error: 'File too large. Maximum 10MB.' };
  }

  const fileType = extMap[file.type] || 'txt';

  // Upload to Supabase Storage
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabaseServer.storage
    .from('knowledge-docs')
    .upload(storagePath, fileBuffer, { contentType: file.type });

  if (uploadError) return { success: false, error: 'Failed to upload file' };

  const { data: urlData } = supabaseServer.storage
    .from('knowledge-docs')
    .getPublicUrl(storagePath);

  // Create document record
  const { data: doc, error: docError } = await supabaseServer
    .from('knowledge_documents')
    .insert({
      filename: file.name,
      file_url: urlData.publicUrl,
      storage_path: storagePath,
      file_type: fileType,
      file_size: file.size,
      status: 'processing',
    })
    .select()
    .single();

  if (docError || !doc) return { success: false, error: 'Failed to create document record' };

  // Extract text
  let text = '';
  try {
    if (fileType === 'pdf') {
      const pdfData = await pdf(fileBuffer);
      text = pdfData.text;
    } else {
      text = fileBuffer.toString('utf-8');
    }
  } catch (err) {
    await supabaseServer
      .from('knowledge_documents')
      .update({ status: 'error', error_message: 'Failed to extract text from file', updated_at: new Date().toISOString() })
      .eq('id', doc.id);
    return { success: false, error: 'Failed to extract text', data: { id: doc.id } };
  }

  // Smart chunk
  const chunks = smartChunk(text);

  if (chunks.length === 0) {
    await supabaseServer
      .from('knowledge_documents')
      .update({ status: 'error', error_message: 'No text content found in file', updated_at: new Date().toISOString() })
      .eq('id', doc.id);
    return { success: false, error: 'No text content found', data: { id: doc.id } };
  }

  // Insert chunks
  const chunkRows = chunks.map((c) => ({
    document_id: doc.id,
    chunk_index: c.chunk_index,
    content: c.content,
    section_header: c.section_header || null,
    is_approved: false,
  }));

  const { error: chunkError } = await supabaseServer
    .from('knowledge_chunks')
    .insert(chunkRows);

  if (chunkError) {
    await supabaseServer
      .from('knowledge_documents')
      .update({ status: 'error', error_message: 'Failed to save chunks', updated_at: new Date().toISOString() })
      .eq('id', doc.id);
    return { success: false, error: 'Failed to save chunks', data: { id: doc.id } };
  }

  // Update document status
  await supabaseServer
    .from('knowledge_documents')
    .update({ status: 'review', chunk_count: chunks.length, updated_at: new Date().toISOString() })
    .eq('id', doc.id);

  return { success: true, data: { id: doc.id } };
}

export async function getDocumentWithChunks(id: string): Promise<ActionResult> {
  await requireAdmin();

  const { data: doc, error: docError } = await supabaseServer
    .from('knowledge_documents')
    .select('*')
    .eq('id', id)
    .single();

  if (docError || !doc) return { success: false, error: 'Document not found' };

  const { data: chunks, error: chunkError } = await supabaseServer
    .from('knowledge_chunks')
    .select('*')
    .eq('document_id', id)
    .order('chunk_index', { ascending: true });

  if (chunkError) return { success: false, error: 'Failed to fetch chunks' };

  return { success: true, data: { document: doc, chunks: chunks || [] } };
}

export async function updateChunks(
  docId: string,
  chunks: { id: string; content: string; is_approved: boolean }[]
): Promise<ActionResult> {
  await requireAdmin();

  for (const chunk of chunks) {
    const { error } = await supabaseServer
      .from('knowledge_chunks')
      .update({ content: chunk.content, is_approved: chunk.is_approved })
      .eq('id', chunk.id)
      .eq('document_id', docId);

    if (error) return { success: false, error: `Failed to update chunk ${chunk.id}` };
  }

  return { success: true };
}

export async function approveDocument(docId: string): Promise<ActionResult> {
  await requireAdmin();

  const { data: chunks } = await supabaseServer
    .from('knowledge_chunks')
    .select('*')
    .eq('document_id', docId)
    .eq('is_approved', true);

  if (!chunks || chunks.length === 0) {
    return { success: false, error: 'No approved chunks to embed' };
  }

  // Embed each approved chunk
  for (const chunk of chunks) {
    syncEmbedding(
      'knowledge_chunks',
      chunk.id,
      buildChunkContent({ section_header: chunk.section_header, content: chunk.content }),
      { document_id: docId, chunk_index: chunk.chunk_index, section_header: chunk.section_header }
    ).catch((err) => console.error('[rag-sync] chunk:', err));
  }

  // Update document status
  await supabaseServer
    .from('knowledge_documents')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', docId);

  return { success: true };
}

export async function deleteDocument(docId: string): Promise<ActionResult> {
  await requireAdmin();

  // Get document for storage path, and chunks for embedding cleanup
  const { data: doc } = await supabaseServer
    .from('knowledge_documents')
    .select('storage_path')
    .eq('id', docId)
    .single();

  const { data: chunks } = await supabaseServer
    .from('knowledge_chunks')
    .select('id')
    .eq('document_id', docId);

  if (chunks) {
    for (const chunk of chunks) {
      removeEmbedding('knowledge_chunks', chunk.id).catch((err) =>
        console.error('[rag-sync] remove chunk:', err)
      );
    }
  }

  // Delete file from storage
  if (doc?.storage_path) {
    await supabaseServer.storage
      .from('knowledge-docs')
      .remove([doc.storage_path]);
  }

  // Delete document (cascades to chunks)
  const { error } = await supabaseServer
    .from('knowledge_documents')
    .delete()
    .eq('id', docId);

  if (error) return { success: false, error: 'Failed to delete document' };

  return { success: true };
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add src/actions/ai.ts
git commit -m "feat(ai-admin): add document upload, chunk review, and approval server actions"
```

---

## Task 11: Messenger Handler — Add Trigger Check

**Files:**
- Modify: `src/lib/messenger-handler.ts`

- [ ] **Step 1: Add trigger check import**

Add to the imports in `src/lib/messenger-handler.ts`:

```typescript
import { checkTriggers } from '@/lib/trigger-matcher';
```

- [ ] **Step 2: Add trigger check in handleTextMessage**

Find the `handleTextMessage` function. Add the trigger check at the beginning of the function body, before the existing AI/FAQ fallback logic. The exact insertion point is after any loyalty card keyword checks and before the `isAiEnabled()` check:

```typescript
// Check triggers first (instant response, bypasses AI)
const triggerResult = await checkTriggers(text);
if (triggerResult.matched && triggerResult.response) {
  await sendTextMessage(psid, triggerResult.response, pageToken);
  return;
}
```

- [ ] **Step 3: Verify build compiles**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds (or pre-existing errors only).

- [ ] **Step 4: Commit**

```bash
git add src/lib/messenger-handler.ts
git commit -m "feat(ai-admin): add trigger check before AI fallback in messenger handler"
```

---

## Task 12: Client Hooks

**Files:**
- Create: `src/hooks/useKnowledge.ts`
- Create: `src/hooks/useFaqs.ts`
- Create: `src/hooks/useTriggers.ts`

- [ ] **Step 1: Create useKnowledge hook**

Create `src/hooks/useKnowledge.ts`:

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { getKnowledgeEntries } from '@/actions/ai';
import type { KnowledgeRow } from '@/types';

export function useKnowledge() {
  const [rows, setRows] = useState<KnowledgeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<{ source?: string; category?: string; search?: string }>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const result = await getKnowledgeEntries(page, filters);
    if (result.success) {
      setRows(result.data.rows);
      setTotal(result.data.total);
    }
    setLoading(false);
  }, [page, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { rows, loading, page, setPage, total, filters, setFilters, refetch: fetchData };
}
```

- [ ] **Step 2: Create useFaqs hook**

Create `src/hooks/useFaqs.ts`:

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { getFaqEntries } from '@/actions/ai';

export function useFaqs() {
  const [faqs, setFaqs] = useState<any[]>([]); // faq_entries schema varies, use any
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<{ category?: string; search?: string }>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const result = await getFaqEntries(page, filters);
    if (result.success) {
      setFaqs(result.data.faqs);
      setTotal(result.data.total);
    }
    setLoading(false);
  }, [page, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { faqs, loading, page, setPage, total, filters, setFilters, refetch: fetchData };
}
```

- [ ] **Step 3: Create useTriggers hook**

Create `src/hooks/useTriggers.ts`:

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { getTriggers } from '@/actions/ai';
import type { ChatTrigger } from '@/types';

export function useTriggers() {
  const [triggers, setTriggers] = useState<ChatTrigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<{ search?: string }>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const result = await getTriggers(page, filters);
    if (result.success) {
      setTriggers(result.data.triggers);
      setTotal(result.data.total);
    }
    setLoading(false);
  }, [page, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { triggers, loading, page, setPage, total, filters, setFilters, refetch: fetchData };
}
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useKnowledge.ts src/hooks/useFaqs.ts src/hooks/useTriggers.ts
git commit -m "feat(ai-admin): add client hooks for knowledge, FAQs, and triggers"
```

---

## Task 13: Sidebar Update & Route Redirect

**Files:**
- Modify: `src/components/admin/Sidebar.tsx`
- Modify: `app/admin/ai-logs/page.tsx`

- [ ] **Step 1: Update sidebar nav item**

In `src/components/admin/Sidebar.tsx`, find the nav items array and change:

```typescript
{ label: 'AI Logs', href: '/admin/ai-logs', icon: Bot },
```

to:

```typescript
{ label: 'AI Management', href: '/admin/ai', icon: Bot },
```

- [ ] **Step 2: Replace ai-logs page with redirect**

Replace the entire contents of `app/admin/ai-logs/page.tsx` with:

```typescript
import { redirect } from 'next/navigation';

export default function AiLogsRedirect() {
  redirect('/admin/ai?tab=logs');
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/Sidebar.tsx app/admin/ai-logs/page.tsx
git commit -m "feat(ai-admin): update sidebar nav and redirect old AI logs page"
```

---

## Task 14: AI Hub Page & Tab Switcher

**Files:**
- Create: `app/admin/ai/page.tsx`
- Create: `src/components/admin/AiHubTabs.tsx`

- [ ] **Step 1: Create the server page component**

Create `app/admin/ai/page.tsx`:

```typescript
import { Suspense } from 'react';
import { requireAdmin } from '@/lib/admin-guard';
import AiHubTabs from '@/components/admin/AiHubTabs';

export default async function AiManagementPage() {
  await requireAdmin();

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <Suspense>
        <AiHubTabs />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 2: Create the tab switcher component**

Create `src/components/admin/AiHubTabs.tsx`:

```typescript
'use client';

import { useState, useEffect, useTransition } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { updateSiteSettings } from '@/actions/settings';
import KnowledgeTab from './KnowledgeTab';
import FaqTab from './FaqTab';
import TriggerTab from './TriggerTab';
import AiLogsTab from './AiLogsTab';

const TABS = [
  { key: 'knowledge', label: 'Knowledge Base' },
  { key: 'faqs', label: 'FAQs' },
  { key: 'triggers', label: 'Triggers' },
  { key: 'logs', label: 'Logs' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function AiHubTabs() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>(
    (searchParams.get('tab') as TabKey) || 'knowledge'
  );
  const [aiEnabled, setAiEnabled] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    // Fetch current AI toggle state
    fetch('/api/admin/settings/ai-status')
      .then((r) => r.json())
      .then((d) => setAiEnabled(d.enabled))
      .catch(() => {});
  }, []);

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    router.replace(`/admin/ai?tab=${tab}`, { scroll: false });
  };

  const handleToggleAi = () => {
    const newVal = !aiEnabled;
    setAiEnabled(newVal);
    startTransition(async () => {
      await updateSiteSettings({ ai_faq_enabled: String(newVal) });
    });
  };

  return (
    <>
      {/* Header */}
      <div className="border-b border-[#E8E3DA] bg-white px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-playfair text-2xl font-semibold text-stone-900">
              AI Management
            </h1>
            <p className="font-nunito text-sm text-stone-500 mt-1">
              Manage your chatbot&apos;s knowledge, responses, and behavior
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleToggleAi}
              disabled={isPending}
              className="flex items-center gap-2"
            >
              <div
                className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${
                  aiEnabled ? 'bg-[#7BBFB5]' : 'bg-stone-300'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                    aiEnabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </div>
              <span className={`font-nunito text-sm font-medium ${aiEnabled ? 'text-[#7BBFB5]' : 'text-stone-400'}`}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : aiEnabled ? 'AI Enabled' : 'AI Disabled'}
              </span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mt-4 -mb-5">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`px-5 py-2.5 font-nunito text-sm font-medium transition-colors duration-200 border-b-2 ${
                activeTab === tab.key
                  ? 'border-[#7BBFB5] text-[#3D8A80]'
                  : 'border-transparent text-stone-400 hover:text-stone-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="p-6">
        {activeTab === 'knowledge' && <KnowledgeTab />}
        {activeTab === 'faqs' && <FaqTab />}
        {activeTab === 'triggers' && <TriggerTab />}
        {activeTab === 'logs' && <AiLogsTab />}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Create the AI status API endpoint**

Create `app/api/admin/settings/ai-status/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data } = await supabaseServer
    .from('site_settings')
    .select('value')
    .eq('id', 'ai_faq_enabled')
    .single();

  return NextResponse.json({ enabled: data?.value === 'true' });
}
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 5: Commit**

```bash
git add app/admin/ai/page.tsx src/components/admin/AiHubTabs.tsx app/api/admin/settings/ai-status/route.ts
git commit -m "feat(ai-admin): add AI hub page with tab switcher and AI toggle"
```

---

## Task 15: Knowledge Tab Component

**Files:**
- Create: `src/components/admin/KnowledgeTab.tsx`
- Create: `src/components/admin/KnowledgeEntryForm.tsx`

- [ ] **Step 1: Create KnowledgeTab**

Create `src/components/admin/KnowledgeTab.tsx`. This is a large component — follow the patterns from `AiLogsTab.tsx`:

- Use `useKnowledge()` hook for state
- Source badge colors: Custom=purple, Document=amber, Menu/Branch/FAQ/etc.=blue
- Status badges: active=green, synced=green, inactive=gray, review=amber
- Filter bar: source dropdown, category dropdown, search input
- Action buttons: "+ Add Entry", "↑ Upload Doc"
- Table with pagination
- "⋯" menu with Edit/Delete for custom entries, "View in [source]" for synced items
- Upload triggers file input → `uploadDocument()` server action → `router.push(/admin/ai/documents/[id])`

Use the exact design system classes from the existing admin components:
- `inputClass`, `labelClass` from SettingsForm pattern
- `Section`, `Field` sub-component pattern
- `font-playfair`, `font-nunito`, `bg-[#FAFAF8]`, `border-[#E8E3DA]`, `rounded-[10px]`

The component should be ~250-350 lines. Import `useRouter` from `next/navigation` for document upload redirect.

- [ ] **Step 2: Create KnowledgeEntryForm modal**

Create `src/components/admin/KnowledgeEntryForm.tsx`:

- Modal overlay with form
- Fields: Title (text input), Content (textarea), Category (select with free-text), Active (toggle)
- Submit calls `addKnowledgeEntry()` or `updateKnowledgeEntry()` server action
- Uses `useTransition` for pending state
- Success/error message display
- Calls `onClose()` and `onSaved()` callbacks

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/KnowledgeTab.tsx src/components/admin/KnowledgeEntryForm.tsx
git commit -m "feat(ai-admin): add Knowledge tab with unified source view and entry form"
```

---

## Task 16: FAQ Tab Component

**Files:**
- Create: `src/components/admin/FaqTab.tsx`
- Create: `src/components/admin/FaqForm.tsx`

- [ ] **Step 1: Create FaqTab**

Create `src/components/admin/FaqTab.tsx`:

- Use `useFaqs()` hook
- Table columns: Question (truncated), Answer (truncated), Category, Active toggle, Actions
- Filter bar: category dropdown, search input
- "+ Add FAQ" button
- Edit/Delete in ⋯ menu
- Pagination

- [ ] **Step 2: Create FaqForm modal**

Create `src/components/admin/FaqForm.tsx`:

- Modal with Question (text input), Answer (textarea), Category (select)
- Submit calls `addFaqEntry()` or `updateFaqEntry()`
- `useTransition` for pending state

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/FaqTab.tsx src/components/admin/FaqForm.tsx
git commit -m "feat(ai-admin): add FAQ tab with CRUD table and form"
```

---

## Task 17: Trigger Tab Component

**Files:**
- Create: `src/components/admin/TriggerTab.tsx`
- Create: `src/components/admin/TriggerForm.tsx`

- [ ] **Step 1: Create TriggerTab**

Create `src/components/admin/TriggerTab.tsx`:

- Use `useTriggers()` hook
- Table columns: Name, Patterns (comma-joined, max 3 + "+N more"), Match Type (badge), Priority, Active toggle, Actions
- Match type badges: Exact=stone, Contains=blue, Regex=amber
- Sorted by priority DESC
- "+ Add Trigger" button
- Edit/Delete in ⋯ menu

- [ ] **Step 2: Create TriggerForm modal**

Create `src/components/admin/TriggerForm.tsx`:

- Modal with:
  - Name (text input)
  - Patterns (tag-style input: text input + Enter to add, × to remove, displayed as pills)
  - Match Type (radio group: Exact, Contains, Regex)
  - Response (textarea)
  - Priority (number input)
  - Active (toggle)
- Submit calls `addTrigger()` or `updateTrigger()`
- If match_type is 'regex', show a hint: "Patterns are treated as regular expressions"
- Server-side validation handles unsafe regex rejection

The tag-style input pattern:
```typescript
const [patternInput, setPatternInput] = useState('');
const handlePatternKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter' && patternInput.trim()) {
    e.preventDefault();
    setForm((prev) => ({
      ...prev,
      patterns: [...prev.patterns, patternInput.trim()],
    }));
    setPatternInput('');
  }
};
const removePattern = (index: number) => {
  setForm((prev) => ({
    ...prev,
    patterns: prev.patterns.filter((_, i) => i !== index),
  }));
};
```

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/TriggerTab.tsx src/components/admin/TriggerForm.tsx
git commit -m "feat(ai-admin): add Trigger tab with tag-style pattern input and match type support"
```

---

## Task 18: Document Review Page

**Files:**
- Create: `app/admin/ai/documents/[id]/page.tsx`
- Create: `src/components/admin/DocumentReview.tsx`

- [ ] **Step 1: Create the server page**

Create `app/admin/ai/documents/[id]/page.tsx`:

```typescript
import { requireAdmin } from '@/lib/admin-guard';
import { getDocumentWithChunks } from '@/actions/ai';
import DocumentReview from '@/components/admin/DocumentReview';
import { redirect } from 'next/navigation';

export default async function DocumentReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const result = await getDocumentWithChunks(id);

  if (!result.success || !result.data) {
    redirect('/admin/ai?tab=knowledge');
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <DocumentReview
        document={result.data.document}
        initialChunks={result.data.chunks}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create DocumentReview component**

Create `src/components/admin/DocumentReview.tsx`:

- Header with back link to `/admin/ai?tab=knowledge`, filename, file type badge, chunk count, status
- Error state: show `error_message`, "Delete & Re-upload" button, "Retry" button
- Processing state: spinner + "Processing document..."
- Review state (default): list of chunk cards
  - Each card: section header label (if present), editable textarea for content, approve toggle, delete button
  - "Approve All" bulk action
  - "Save & Embed" button → calls `updateChunks()` then `approveDocument()`
- Approved state: success banner, chunks become read-only

Uses `useTransition`, `useState` for local chunk edits before saving.

Pattern for local chunk state:
```typescript
const [chunks, setChunks] = useState(initialChunks.map(c => ({
  ...c,
  content: c.content,
  is_approved: c.is_approved,
})));

const updateChunkContent = (id: string, content: string) => {
  setChunks(prev => prev.map(c => c.id === id ? { ...c, content } : c));
};

const toggleChunkApproval = (id: string) => {
  setChunks(prev => prev.map(c => c.id === id ? { ...c, is_approved: !c.is_approved } : c));
};

const approveAll = () => {
  setChunks(prev => prev.map(c => ({ ...c, is_approved: true })));
};
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add app/admin/ai/documents/[id]/page.tsx src/components/admin/DocumentReview.tsx
git commit -m "feat(ai-admin): add document chunk review page with approve/edit/embed flow"
```

---

## Task 19: Final Integration & Testing

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Build check**

Run: `npx next build 2>&1 | tail -30`
Expected: Build succeeds.

- [ ] **Step 3: Manual smoke test**

Start dev server: `npm run dev`

Verify:
1. Navigate to `/admin/ai` — tabs render, AI toggle works
2. Knowledge tab: shows existing RAG entries with correct source badges
3. Add a custom knowledge entry → appears in list
4. FAQs tab: add/edit/delete FAQ entries
5. Triggers tab: add a "contains" trigger, verify tag input works
6. Upload a `.txt` file → redirects to chunk review page
7. Review chunks, approve all, save & embed
8. Logs tab: existing AI logs display correctly
9. Old `/admin/ai-logs` URL redirects to `/admin/ai?tab=logs`
10. Sidebar shows "AI Management" instead of "AI Logs"

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(ai-admin): integration fixes from smoke testing"
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(ai-admin): complete AI admin dashboard with knowledge, FAQs, triggers, and document upload"
```
