# Messenger FAQ Chatbot & UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a keyword-based FAQ bot to the Messenger chatbot, improve cart add responses with full cart summaries, fix loyalty card messaging, push website ordering, and set up persistent menus.

**Architecture:** FAQ service layer (`faq-service.ts`) with keyword matching and 5-min caching, backed by a Supabase `faq_entries` table. Handler changes are surgical — welcome message split for GET_STARTED vs MAIN_MENU, FAQ fallback before default menu, cart response hydration, loyalty message updates. Admin CRUD API follows existing patterns.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL), Facebook Graph API v21.0, Vitest

**Spec:** `docs/superpowers/specs/2026-03-20-messenger-faq-chatbot-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| **New:** `supabase/migrations/20260320000000_faq_entries.sql` | Create `faq_entries` table, trigger, RLS, seed 23+ entries |
| **New:** `src/lib/faq-service.ts` | FAQ matching (keyword-based), caching, CRUD, response builder |
| **New:** `app/api/admin/faq/route.ts` | GET (list all) + POST (create) FAQ entries |
| **New:** `app/api/admin/faq/[id]/route.ts` | PATCH (update) + DELETE (soft delete) FAQ entries |
| **New:** `app/api/admin/messenger/setup-profile/route.ts` | POST to set persistent menu via Graph API |
| **New:** `tests/lib/faq-service.test.ts` | Unit tests for FAQ matching, caching, response routing |
| **Modify:** `src/types/index.ts` | Add `FaqEntry`, `FaqInput`, `FaqActionType` types |
| **Modify:** `src/lib/messenger.ts` | Add `setupMessengerProfile()` function |
| **Modify:** `src/lib/messenger-handler.ts` | Welcome flow, FAQ routing, cart response, loyalty messages |
| **Modify:** `tests/lib/messenger.test.ts` | Update tests for cart summary with add-on prices |

---

### Task 1: Database Migration — `faq_entries` table + seed data

**Files:**
- Create: `supabase/migrations/20260320000000_faq_entries.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260320000000_faq_entries.sql
-- FAQ entries for Messenger chatbot keyword-based matching

-- ── Table ────────────────────────────────────────────────────
CREATE TABLE faq_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  keywords TEXT[] NOT NULL,
  category TEXT,
  action_type TEXT NOT NULL DEFAULT 'text',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_faq_entries_active ON faq_entries (is_active) WHERE is_active = TRUE;

-- ── Auto-update updated_at ──────────────────────────────────
CREATE OR REPLACE FUNCTION update_faq_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_faq_updated_at
  BEFORE UPDATE ON faq_entries
  FOR EACH ROW EXECUTE FUNCTION update_faq_updated_at();

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE faq_entries ENABLE ROW LEVEL SECURITY;

-- No public access — all operations via service role (admin API)

-- ── Seed Data ───────────────────────────────────────────────
INSERT INTO faq_entries (question, answer, keywords, category, action_type, sort_order) VALUES
-- Products (sort_order 1-9)
('What are the most ordered milkshake flavors?',
 'Our most popular flavors are Caramel Cookie Dough, Reeses Overload, Crunchy Cookie Butter, and Strawberry Cheesecake!',
 ARRAY['best seller', 'popular', 'top', 'most ordered', 'recommend', 'recommendation', 'favorite'],
 'products', 'text', 1),

('What are the best milkshake flavors?',
 'Our top milkshake flavors are Caramel Cookie Dough, Reeses Overload, Crunchy Cookie Butter, and Strawberry Cheesecake! Check out our full menu to see all options.',
 ARRAY['flavor', 'flavors', 'milkshake flavor'],
 'products', 'text', 2),

('What are your best sellers?',
 'Our best sellers are Caramel Cookie Dough, Mini Corndog, and Mozzarella Poppers! Would you like to see our full menu?',
 ARRAY['best', 'seller', 'sellers'],
 'products', 'text', 3),

-- Pricing (sort_order 10-19)
('How much is the milkshake?',
 'Prices vary by flavor. Let me show you our menu with all the prices!',
 ARRAY['price', 'how much', 'milkshake', 'cost'],
 'pricing', 'send_menu', 10),

('How much is the snacks?',
 'Here''s our menu with all snack prices!',
 ARRAY['price', 'how much', 'snacks', 'snack', 'food'],
 'pricing', 'send_menu', 11),

-- Ordering (sort_order 20-29)
('Can I order?',
 'Yes! You can order right here or visit our website at starrsmilkshake.com for the best ordering experience. Let me show you our menu and branches!',
 ARRAY['order', 'ordering', 'buy', 'purchase'],
 'ordering', 'text', 20),

('Can I order for pick up?',
 'Yes! You can order for pick up. Let me show you our menu and branches!',
 ARRAY['pick up', 'pickup', 'takeout', 'take out'],
 'ordering', 'text', 21),

('Can I see the menu?',
 'Here you go! Our menu is also available online at starrsmilkshake.com',
 ARRAY['menu', 'see menu', 'show menu', 'view menu'],
 'ordering', 'send_menu', 22),

('How to order?',
 'You can order right here on Messenger, or visit our website at starrsmilkshake.com for the best experience. We are also available on Grab and FoodPanda!',
 ARRAY['how to order', 'how do i order', 'ordering process'],
 'ordering', 'text', 23),

-- Hours (sort_order 30-39)
('Are you open?',
 'Yes! We are open Monday to Sunday. Katipunan: 11AM-9PM, Holy Spirit: 12PM-10PM, Melting Pot: 12PM-10PM.',
 ARRAY['open', 'closed'],
 'hours', 'text', 30),

('What time are you open?',
 'Our operating hours are:\n• Katipunan Branch: 11:00 AM to 9:00 PM\n• Holy Spirit Branch: 12:00 PM to 10:00 PM\n• Melting Pot Branch: 12:00 PM to 10:00 PM',
 ARRAY['hours', 'time', 'schedule', 'what time', 'when'],
 'hours', 'text', 31),

-- Delivery (sort_order 40-49)
('Do you deliver?',
 'Yes! We deliver fresh, thick, and delicious milkshakes. We service areas deliverable within 20 minutes to guarantee quality. You can also order at starrsmilkshake.com for a smoother experience!',
 ARRAY['deliver', 'delivery', 'ship'],
 'delivery', 'text', 40),

('Will it melt?',
 'We deliver fresh, thick, and delicious milkshakes. We service areas deliverable within 20 minutes to guarantee quality milkshakes!',
 ARRAY['melt', 'melting', 'cold', 'warm'],
 'delivery', 'text', 41),

('Is it free shipping?',
 'Shipping fee depends on your location to our nearest branch. Thank you!',
 ARRAY['free shipping', 'free delivery', 'shipping fee'],
 'delivery', 'text', 42),

('How much is the delivery fee?',
 'Prices are exclusive of shipping fee. The fee depends on your distance to our nearest branch. Visit starrsmilkshake.com for more details and to place your order!',
 ARRAY['delivery fee', 'shipping fee', 'how much delivery'],
 'delivery', 'text', 43),

('How long will food take to prepare?',
 'It''ll be about 15-20 minutes. We''ll let you know when it''s ready!',
 ARRAY['how long', 'prepare', 'preparation', 'wait', 'waiting'],
 'delivery', 'text', 44),

-- Branches (sort_order 50-59)
('Where are your branches?',
 'Here are our branches:\n\n• Starrs Katipunan: The Xavier Residential — 09564551472\n• Starrs Holy Spirit: Holy Spirit Res. (Surge Fitness), 70 Holy Spirit Dr. Cor. Paraluman — 09457926631\n• Starrs Omega Ave: Melting Pot Bldg, 527 Omega Ave — 09564551474',
 ARRAY['branch', 'location', 'where', 'address', 'store', 'near'],
 'branches', 'send_branches', 50),

-- Discounts (sort_order 60-69)
('Do you offer discount for PWD?',
 'Yes, we offer PWD discounts! Please inform us when placing your order.',
 ARRAY['pwd', 'disability', 'disabled', 'discount'],
 'discounts', 'text', 60),

('Do you offer discount for Senior Citizen?',
 'Yes, we offer Senior Citizen discounts! Please inform us when placing your order.',
 ARRAY['senior', 'senior citizen', 'elderly', 'discount'],
 'discounts', 'text', 61),

-- Partners (sort_order 70-79)
('Are you on FoodPanda and Grab?',
 'Yes! We are on both FoodPanda and Grab. But we have exclusive discounts and better prices for orders on Messenger or our website at starrsmilkshake.com!',
 ARRAY['grab', 'foodpanda', 'panda', 'food panda', 'online partner'],
 'partners', 'text', 70),

-- Franchise (sort_order 80-89)
('Do you franchise?',
 'We are currently working on our franchise manual. We will let you know as soon as we are ready!',
 ARRAY['franchise', 'franchising'],
 'franchise', 'text', 80),

-- Issues (sort_order 90-99)
('My item is marked as delivered but I haven''t received it',
 'We''re sorry to hear that! Please contact the store branch directly for assistance.',
 ARRAY['not received', 'missing', 'lost', 'delivered', 'where is'],
 'issues', 'connect_human', 90),

-- Events (sort_order 100-109)
('Do you cater or have party services?',
 'Yes! We do party and catering services. Would you like to see our party menu? Contact us for more details!',
 ARRAY['party', 'cater', 'catering', 'event', 'birthday', 'celebration'],
 'events', 'text', 100),

('How to reserve for a party?',
 'Please provide the following details and we''ll check available slots for you:\n• Name\n• Contact Number\n• Email Address\n• Party Location\n• Date\n• Time\n\nWe''ll email you the party proposal. Thank you!',
 ARRAY['reserve', 'reservation', 'book', 'booking'],
 'events', 'text', 101);
```

- [ ] **Step 2: Verify migration file exists**

Run: `ls -la supabase/migrations/20260320000000_faq_entries.sql`
Expected: File exists with correct content

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260320000000_faq_entries.sql
git commit -m "feat(messenger): add faq_entries table migration with seed data"
```

---

### Task 2: Types — Add `FaqEntry` and `FaqInput` interfaces

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add the FAQ types at the end of the types file**

Append after the last interface in `src/types/index.ts`:

```typescript
// --- FAQ Types ---

export type FaqActionType = 'text' | 'send_menu' | 'send_branches' | 'connect_human';

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  category: string | null;
  action_type: FaqActionType;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FaqInput {
  id?: string;
  question: string;
  answer: string;
  keywords: string[];
  category?: string;
  action_type?: FaqActionType;
  sort_order?: number;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to FaqEntry or FaqInput

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(messenger): add FaqEntry and FaqInput types"
```

---

### Task 3: FAQ Service — keyword matching, caching, CRUD

**Files:**
- Create: `src/lib/faq-service.ts`
- Create: `tests/lib/faq-service.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/faq-service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase
vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    from: vi.fn(),
  },
}));

// Mock messenger functions (for buildFaqResponse)
vi.mock('@/lib/messenger', () => ({
  sendButtonTemplate: vi.fn(),
  sendTextMessage: vi.fn(),
}));

import { supabaseServer } from '@/lib/supabase-server';
import { sendButtonTemplate } from '@/lib/messenger';

describe('faq-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module to clear cache between tests
    vi.resetModules();
  });

  describe('matchFaq', () => {
    const mockFaqs = [
      { id: '1', question: 'Do you deliver?', answer: 'Yes we deliver!', keywords: ['deliver', 'delivery', 'ship'], category: 'delivery', action_type: 'text', sort_order: 40, is_active: true, created_at: '', updated_at: '' },
      { id: '2', question: 'Are you open?', answer: 'Yes we are open!', keywords: ['open', 'closed'], category: 'hours', action_type: 'text', sort_order: 30, is_active: true, created_at: '', updated_at: '' },
      { id: '3', question: 'Where are your branches?', answer: 'Branch info...', keywords: ['branch', 'location', 'where', 'address'], category: 'branches', action_type: 'send_branches', sort_order: 50, is_active: true, created_at: '', updated_at: '' },
      { id: '4', question: 'Show menu', answer: 'Here is our menu', keywords: ['menu', 'see menu', 'show menu'], category: 'ordering', action_type: 'send_menu', sort_order: 22, is_active: true, created_at: '', updated_at: '' },
    ];

    function setupMockFaqs(faqs = mockFaqs) {
      (supabaseServer.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: faqs, error: null }),
          }),
        }),
      });
    }

    it('returns matching FAQ entry for exact keyword', async () => {
      setupMockFaqs();
      const { matchFaq } = await import('../../src/lib/faq-service');
      const result = await matchFaq('do you deliver?');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('1');
    });

    it('returns matching FAQ entry for partial keyword match', async () => {
      setupMockFaqs();
      const { matchFaq } = await import('../../src/lib/faq-service');
      const result = await matchFaq('is the delivery free?');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('1');
    });

    it('returns null for no keyword match', async () => {
      setupMockFaqs();
      const { matchFaq } = await import('../../src/lib/faq-service');
      const result = await matchFaq('hello there');
      expect(result).toBeNull();
    });

    it('returns highest scoring match when multiple entries match', async () => {
      setupMockFaqs();
      const { matchFaq } = await import('../../src/lib/faq-service');
      // "where is your branch location" matches branch entry with 3 keywords
      const result = await matchFaq('where is your branch location');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('3');
    });

    it('breaks ties by lower sort_order', async () => {
      const tieFaqs = [
        { id: 'a', question: 'Q1', answer: 'A1', keywords: ['test'], category: null, action_type: 'text', sort_order: 20, is_active: true, created_at: '', updated_at: '' },
        { id: 'b', question: 'Q2', answer: 'A2', keywords: ['test'], category: null, action_type: 'text', sort_order: 10, is_active: true, created_at: '', updated_at: '' },
      ];
      setupMockFaqs(tieFaqs);
      const { matchFaq } = await import('../../src/lib/faq-service');
      const result = await matchFaq('test');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('b');
    });

    it('handles case-insensitive matching', async () => {
      setupMockFaqs();
      const { matchFaq } = await import('../../src/lib/faq-service');
      const result = await matchFaq('DO YOU DELIVER?');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('1');
    });

    it('matches multi-word keywords', async () => {
      setupMockFaqs();
      const { matchFaq } = await import('../../src/lib/faq-service');
      const result = await matchFaq('can I see menu please');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('4');
    });
  });

  describe('buildFaqResponse', () => {
    it('sends button template for text action_type', async () => {
      const { buildFaqResponse } = await import('../../src/lib/faq-service');
      const entry = {
        id: '1', question: 'Q', answer: 'Test answer', keywords: [],
        category: null, action_type: 'text' as const, sort_order: 0,
        is_active: true, created_at: '', updated_at: '',
      };
      await buildFaqResponse(entry, 'PSID_123', 'TOKEN', 'https://starrsmilkshake.com');
      expect(sendButtonTemplate).toHaveBeenCalledWith(
        'PSID_123',
        'Test answer',
        expect.arrayContaining([
          expect.objectContaining({ type: 'postback', title: 'Browse Menu', payload: 'MAIN_MENU' }),
          expect.objectContaining({ type: 'web_url', title: 'Order Online', url: 'https://starrsmilkshake.com' }),
        ]),
        'TOKEN'
      );
    });

    it('logs warning for send_menu action_type', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { buildFaqResponse } = await import('../../src/lib/faq-service');
      const entry = {
        id: '2', question: 'Q', answer: 'Menu', keywords: [],
        category: null, action_type: 'send_menu' as const, sort_order: 0,
        is_active: true, created_at: '', updated_at: '',
      };
      await buildFaqResponse(entry, 'PSID_123', 'TOKEN', 'https://starrsmilkshake.com');
      expect(warnSpy).toHaveBeenCalled();
      expect(sendButtonTemplate).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('sends branch info for send_branches action_type', async () => {
      // Mock branches query
      (supabaseServer.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ name: 'Katipunan', address: '123 St', phone: '09123456789' }],
            error: null,
          }),
        }),
      });
      const { buildFaqResponse } = await import('../../src/lib/faq-service');
      const entry = {
        id: '3', question: 'Q', answer: 'Branch info', keywords: [],
        category: null, action_type: 'send_branches' as const, sort_order: 0,
        is_active: true, created_at: '', updated_at: '',
      };
      await buildFaqResponse(entry, 'PSID_123', 'TOKEN', 'https://starrsmilkshake.com');
      expect(sendButtonTemplate).toHaveBeenCalledWith(
        'PSID_123',
        expect.stringContaining('Katipunan'),
        expect.any(Array),
        'TOKEN'
      );
    });

    it('sends contact info for connect_human action_type', async () => {
      (supabaseServer.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ name: 'Katipunan', phone: '09123456789' }],
            error: null,
          }),
        }),
      });
      const { buildFaqResponse } = await import('../../src/lib/faq-service');
      const entry = {
        id: '4', question: 'Q', answer: 'Contact us', keywords: [],
        category: null, action_type: 'connect_human' as const, sort_order: 0,
        is_active: true, created_at: '', updated_at: '',
      };
      await buildFaqResponse(entry, 'PSID_123', 'TOKEN', 'https://starrsmilkshake.com');
      expect(sendButtonTemplate).toHaveBeenCalledWith(
        'PSID_123',
        expect.stringContaining('Contact us'),
        expect.any(Array),
        'TOKEN'
      );
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/faq-service.test.ts 2>&1 | tail -20`
Expected: FAIL — module `../../src/lib/faq-service` not found

- [ ] **Step 3: Implement the FAQ service**

Create `src/lib/faq-service.ts`:

```typescript
import { supabaseServer } from '@/lib/supabase-server';
import { sendButtonTemplate, sendTextMessage } from '@/lib/messenger';
import type { FaqEntry, FaqInput } from '@/types';

// --- Cache ---
let cachedEntries: FaqEntry[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getFaqEntries(): Promise<FaqEntry[]> {
  const now = Date.now();
  if (cachedEntries && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedEntries;
  }

  const { data, error } = await supabaseServer
    .from('faq_entries')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

  if (error || !data) {
    console.error('Failed to fetch FAQ entries:', error);
    return cachedEntries || [];
  }

  cachedEntries = data as FaqEntry[];
  cacheTimestamp = now;
  return cachedEntries;
}

export function invalidateFaqCache(): void {
  cachedEntries = null;
  cacheTimestamp = 0;
}

// --- Matching ---
export async function matchFaq(userText: string): Promise<FaqEntry | null> {
  const normalized = userText.toLowerCase().trim().replace(/[?!.,;:'"]/g, '');
  const entries = await getFaqEntries();

  let bestMatch: FaqEntry | null = null;
  let bestScore = 0;

  for (const entry of entries) {
    let score = 0;
    for (const keyword of entry.keywords) {
      const normalizedKeyword = keyword.toLowerCase();
      if (normalized.includes(normalizedKeyword)) {
        score++;
      }
    }

    if (score > bestScore || (score === bestScore && score > 0 && entry.sort_order < (bestMatch?.sort_order ?? Infinity))) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  return bestScore > 0 ? bestMatch : null;
}

// --- Response Builder ---
export async function buildFaqResponse(
  entry: FaqEntry,
  psid: string,
  pageToken: string,
  siteUrl: string
): Promise<void> {
  switch (entry.action_type) {
    case 'text':
      await sendButtonTemplate(psid, entry.answer, [
        { type: 'postback', title: 'Browse Menu', payload: 'MAIN_MENU' },
        { type: 'web_url', title: 'Order Online', url: siteUrl },
      ], pageToken);
      break;

    case 'send_menu':
      // Handled by caller — handler checks for send_menu before calling buildFaqResponse
      console.warn('buildFaqResponse called with send_menu — this should be handled by the caller');
      break;

    case 'send_branches': {
      const { data: branches } = await supabaseServer
        .from('branches')
        .select('name, address, phone')
        .eq('active', true);

      if (branches && branches.length > 0) {
        const branchText = branches.map((b: any) =>
          `• ${b.name}: ${b.address} — ${b.phone}`
        ).join('\n');
        await sendButtonTemplate(psid, `Our branches:\n\n${branchText}`, [
          { type: 'postback', title: 'Browse Menu', payload: 'MAIN_MENU' },
          { type: 'web_url', title: 'Order Online', url: siteUrl },
        ], pageToken);
      } else {
        await sendTextMessage(psid, entry.answer, pageToken);
      }
      break;
    }

    case 'connect_human': {
      const { data: branches } = await supabaseServer
        .from('branches')
        .select('name, phone')
        .eq('active', true);

      const contactText = branches && branches.length > 0
        ? `${entry.answer}\n\nContact:\n${branches.map((b: any) => `• ${b.name}: ${b.phone}`).join('\n')}`
        : entry.answer;

      await sendButtonTemplate(psid, contactText, [
        { type: 'postback', title: 'Browse Menu', payload: 'MAIN_MENU' },
      ], pageToken);
      break;
    }
  }
}

// --- Admin CRUD ---
export async function getAllFaqs(): Promise<FaqEntry[]> {
  const { data, error } = await supabaseServer
    .from('faq_entries')
    .select('*')
    .order('sort_order');

  if (error || !data) return [];
  return data as FaqEntry[];
}

export async function upsertFaq(input: FaqInput): Promise<FaqEntry | null> {
  if (input.id) {
    const { data, error } = await supabaseServer
      .from('faq_entries')
      .update({
        question: input.question,
        answer: input.answer,
        keywords: input.keywords,
        category: input.category ?? null,
        action_type: input.action_type ?? 'text',
        sort_order: input.sort_order ?? 0,
      })
      .eq('id', input.id)
      .select()
      .single();

    if (error || !data) return null;
    invalidateFaqCache();
    return data as FaqEntry;
  }

  const { data, error } = await supabaseServer
    .from('faq_entries')
    .insert({
      question: input.question,
      answer: input.answer,
      keywords: input.keywords,
      category: input.category ?? null,
      action_type: input.action_type ?? 'text',
      sort_order: input.sort_order ?? 0,
    })
    .select()
    .single();

  if (error || !data) return null;
  invalidateFaqCache();
  return data as FaqEntry;
}

export async function deleteFaq(id: string): Promise<boolean> {
  const { error } = await supabaseServer
    .from('faq_entries')
    .update({ is_active: false })
    .eq('id', id);

  if (error) return false;
  invalidateFaqCache();
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/faq-service.test.ts 2>&1 | tail -20`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/faq-service.ts tests/lib/faq-service.test.ts
git commit -m "feat(messenger): add FAQ service with keyword matching and caching"
```

---

### Task 4: Admin FAQ API — CRUD endpoints

**Files:**
- Create: `app/api/admin/faq/route.ts`
- Create: `app/api/admin/faq/[id]/route.ts`

- [ ] **Step 1: Create the collection route (GET + POST)**

Create `app/api/admin/faq/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { getAllFaqs, upsertFaq } from '@/lib/faq-service';

export async function GET(request: NextRequest) {
  try {
    const unauthorized = requireAdminRequest(request);
    if (unauthorized) return unauthorized;

    const faqs = await getAllFaqs();
    return NextResponse.json({ faqs });
  } catch (err) {
    console.error('GET /api/admin/faq error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const unauthorized = requireAdminRequest(request);
    if (unauthorized) return unauthorized;

    const body = await request.json();
    const { question, answer, keywords } = body;

    if (!question || !answer || !keywords || !Array.isArray(keywords)) {
      return NextResponse.json(
        { error: 'question, answer, and keywords (array) are required' },
        { status: 400 }
      );
    }

    const faq = await upsertFaq({
      question,
      answer,
      keywords,
      category: body.category,
      action_type: body.action_type,
      sort_order: body.sort_order,
    });

    if (!faq) {
      return NextResponse.json({ error: 'Failed to create FAQ entry' }, { status: 500 });
    }

    return NextResponse.json({ faq }, { status: 201 });
  } catch (err) {
    console.error('POST /api/admin/faq error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create the single-entry route (PATCH + DELETE)**

Create `app/api/admin/faq/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { upsertFaq, deleteFaq } from '@/lib/faq-service';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const unauthorized = requireAdminRequest(request);
    if (unauthorized) return unauthorized;

    const { id } = await params;
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 });
    }

    const body = await request.json();
    const { question, answer, keywords } = body;

    if (!question || !answer || !keywords || !Array.isArray(keywords)) {
      return NextResponse.json(
        { error: 'question, answer, and keywords (array) are required' },
        { status: 400 }
      );
    }

    const faq = await upsertFaq({
      id,
      question,
      answer,
      keywords,
      category: body.category,
      action_type: body.action_type,
      sort_order: body.sort_order,
    });

    if (!faq) {
      return NextResponse.json({ error: 'FAQ entry not found' }, { status: 404 });
    }

    return NextResponse.json({ faq });
  } catch (err) {
    console.error('PATCH /api/admin/faq/[id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const unauthorized = requireAdminRequest(request);
    if (unauthorized) return unauthorized;

    const { id } = await params;
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 });
    }

    const success = await deleteFaq(id);
    if (!success) {
      return NextResponse.json({ error: 'Failed to delete FAQ entry' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/faq/[id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/faq/route.ts app/api/admin/faq/\[id\]/route.ts
git commit -m "feat(messenger): add admin FAQ CRUD API endpoints"
```

---

### Task 5: Messenger Profile Setup — persistent menu + API

**Files:**
- Modify: `src/lib/messenger.ts`
- Create: `app/api/admin/messenger/setup-profile/route.ts`

- [ ] **Step 1: Add `setupMessengerProfile` to messenger.ts**

Append to the end of `src/lib/messenger.ts` (after the `buildStatusMessage` function, line 193):

```typescript
export async function setupMessengerProfile(pageToken: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Set persistent menu
    const menuResponse = await fetch(`${GRAPH_API_BASE}/me/messenger_profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pageToken}`,
      },
      body: JSON.stringify({
        persistent_menu: [
          {
            locale: 'default',
            composer_input_disabled: false,
            call_to_actions: [
              { type: 'web_url', title: 'Order Online', url: 'https://starrsmilkshake.com' },
              { type: 'postback', title: 'Browse Menu', payload: 'MAIN_MENU' },
              { type: 'postback', title: 'My Loyalty Card', payload: 'LOYALTY_CARD' },
            ],
          },
        ],
      }),
    });

    if (!menuResponse.ok) {
      const error = await menuResponse.json().catch(() => ({}));
      return { success: false, error: `Persistent menu failed: ${JSON.stringify(error)}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
```

- [ ] **Step 2: Create the setup-profile API endpoint**

Create `app/api/admin/messenger/setup-profile/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { supabaseServer } from '@/lib/supabase-server';
import { setupMessengerProfile } from '@/lib/messenger';

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) return unauthorized;

  // Get page token from facebook_config
  const { data: config } = await supabaseServer
    .from('facebook_config')
    .select('page_access_token')
    .limit(1)
    .single();

  if (!config?.page_access_token) {
    return NextResponse.json(
      { error: 'Facebook page not connected. Connect a page first.' },
      { status: 400 }
    );
  }

  const result = await setupMessengerProfile(config.page_access_token);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: 'Messenger profile updated successfully' });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/messenger.ts app/api/admin/messenger/setup-profile/route.ts
git commit -m "feat(messenger): add persistent menu setup with admin API endpoint"
```

---

### Task 6: Handler — Welcome message split (GET_STARTED vs MAIN_MENU)

**Files:**
- Modify: `src/lib/messenger-handler.ts`

- [ ] **Step 1: Split the GET_STARTED and MAIN_MENU postback handling**

In `src/lib/messenger-handler.ts`, replace the combined handler at line 73-74:

```typescript
  if (payload === 'GET_STARTED' || payload === 'MAIN_MENU') {
    await showCategories(psid, pageToken);
```

With the split logic:

```typescript
  if (payload === 'GET_STARTED') {
    await showWelcome(psid, pageToken);
  } else if (payload === 'MAIN_MENU') {
    await showCategories(psid, pageToken);
```

- [ ] **Step 2: Add the `showWelcome` function**

Add this new function before `showCategories` (around line 113):

```typescript
async function showWelcome(psid: string, pageToken: string): Promise<void> {
  const siteUrl = getSiteUrl();

  // Send welcome button template with Order Online link
  await sendButtonTemplate(
    psid,
    "Welcome to Starr's Famous Shakes!\n\nOrder online at starrsmilkshake.com for the best experience, or browse our menu right here!\n\nHow can I help you today?",
    [
      { type: 'web_url', title: 'Order Online', url: siteUrl },
      { type: 'postback', title: 'Browse Menu', payload: 'MAIN_MENU' },
    ],
    pageToken
  );

  // Send category quick replies with loyalty card option
  const { data: categories } = await supabaseServer
    .from('categories')
    .select('id, name, icon')
    .eq('active', true)
    .order('sort_order');

  if (categories && categories.length > 0) {
    const quickReplies: QuickReply[] = [
      ...buildCategoryQuickReplies(categories.slice(0, 12)),
      { content_type: 'text', title: 'My Loyalty Card', payload: 'LOYALTY_CARD' },
    ];
    await sendQuickReplies(psid, 'Or browse by category:', quickReplies, pageToken);
  }

  await updateSession(psid, { state: 'browsing_categories', current_category: null, current_page: 0 } as any);
}
```

- [ ] **Step 3: Update `showCategories` to include loyalty quick reply**

In `showCategories` (line 114-131), replace line 129-130:

```typescript
  const quickReplies = buildCategoryQuickReplies(categories.slice(0, 13));
  await sendQuickReplies(psid, "Welcome to Starr's Famous Shakes! What are you craving?", quickReplies, pageToken);
```

With:

```typescript
  const quickReplies: QuickReply[] = [
    ...buildCategoryQuickReplies(categories.slice(0, 12)),
    { content_type: 'text', title: 'My Loyalty Card', payload: 'LOYALTY_CARD' },
  ];
  await sendQuickReplies(psid, 'What are you craving?', quickReplies, pageToken);
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/messenger-handler.ts
git commit -m "feat(messenger): split welcome flow for GET_STARTED vs MAIN_MENU"
```

---

### Task 7: Handler — FAQ routing fallback in text messages

**Files:**
- Modify: `src/lib/messenger-handler.ts`

- [ ] **Step 1: Add FAQ imports at the top of messenger-handler.ts**

Add to the imports at line 2-14:

```typescript
import { matchFaq, buildFaqResponse } from '@/lib/faq-service';
```

- [ ] **Step 2: Update `handleTextMessage` to include FAQ fallback**

Replace the `handleTextMessage` function (lines 63-70):

```typescript
async function handleTextMessage(psid: string, text: string, _session: MessengerSession, pageToken: string): Promise<void> {
  const lower = text.toLowerCase().trim();
  if (lower === 'loyalty' || lower === 'loyalty card' || lower === 'starr card' || lower === 'my card') {
    await handleLoyaltyCard(psid, pageToken);
  } else {
    await showCategories(psid, pageToken);
  }
}
```

With:

```typescript
async function handleTextMessage(psid: string, text: string, _session: MessengerSession, pageToken: string): Promise<void> {
  const lower = text.toLowerCase().trim();

  // 1. Loyalty triggers
  if (lower === 'loyalty' || lower === 'loyalty card' || lower === 'starr card' || lower === 'my card') {
    await handleLoyaltyCard(psid, pageToken);
    return;
  }

  // 2. FAQ matching (graceful degradation — fall through on error)
  try {
    const faqMatch = await matchFaq(text);
    if (faqMatch) {
      if (faqMatch.action_type === 'send_menu') {
        await showCategories(psid, pageToken);
      } else {
        await buildFaqResponse(faqMatch, psid, pageToken, getSiteUrl());
      }
      return;
    }
  } catch (err) {
    console.error('FAQ matching failed, falling through to menu:', err);
  }

  // 3. Default fallback — show categories
  await showCategories(psid, pageToken);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/messenger-handler.ts
git commit -m "feat(messenger): add FAQ matching fallback in text message routing"
```

---

### Task 8: Handler — Cart add response with full summary

**Files:**
- Modify: `src/lib/messenger-handler.ts`
- Modify: `src/lib/messenger.ts` (update `buildCartSummary` to support add-on display)

- [ ] **Step 1: Update `buildCartSummary` to accept add-on info**

In `src/lib/messenger.ts`, replace the `buildCartSummary` function (lines 145-160):

```typescript
export function buildCartSummary(
  cart: Array<{ name: string; variation: string | null; quantity: number; unitPrice: number; addOns?: string[] }>
): string {
  if (cart.length === 0) return 'Your cart is empty.';

  let total = 0;
  const lines = cart.map((item, i) => {
    const itemTotal = item.unitPrice * item.quantity;
    total += itemTotal;
    const variationStr = item.variation ? ` (${item.variation})` : '';
    const addOnStr = item.addOns && item.addOns.length > 0 ? ` + ${item.addOns.join(', ')}` : '';
    return `${i + 1}. ${item.name}${variationStr}${addOnStr} x${item.quantity} — ₱${itemTotal}`;
  });

  lines.push(`\nTotal: ₱${total}`);
  return lines.join('\n');
}
```

- [ ] **Step 2: Add shared `hydrateCartForDisplay` helper in messenger-handler.ts**

Add this helper function before `finalizeCartItem` (around line 248). Both `finalizeCartItem` and `showCart` will use it instead of duplicating hydration logic:

```typescript
interface CartDisplayItem {
  name: string;
  variation: string | null;
  quantity: number;
  unitPrice: number;
  addOns: string[];
}

async function hydrateCartForDisplay(cart: MessengerCartItem[]): Promise<CartDisplayItem[]> {
  const display: CartDisplayItem[] = [];

  for (const item of cart) {
    const { data: menuItem } = await supabaseServer
      .from('menu_items')
      .select('name, base_price')
      .eq('id', item.menu_item_id)
      .single();

    let variationName: string | null = null;
    let variationPrice = 0;
    if (item.variation_id) {
      const { data: variation } = await supabaseServer
        .from('variations')
        .select('name, price')
        .eq('id', item.variation_id)
        .single();
      variationName = variation?.name || null;
      variationPrice = variation?.price || 0;
    }

    let addOnTotal = 0;
    const addOnNames: string[] = [];
    if (item.add_on_ids.length > 0) {
      const { data: addOns } = await supabaseServer
        .from('add_ons')
        .select('name, price')
        .in('id', item.add_on_ids);
      if (addOns) {
        for (const addon of addOns) {
          addOnTotal += addon.price;
          addOnNames.push(addon.name);
        }
      }
    }

    const unitPrice = (menuItem?.base_price || 0) + variationPrice + addOnTotal;
    display.push({
      name: menuItem?.name || 'Unknown',
      variation: variationName,
      quantity: item.quantity,
      unitPrice,
      addOns: addOnNames,
    });
  }

  return display;
}
```

- [ ] **Step 3: Replace `finalizeCartItem` to use the shared helper**

Replace the `finalizeCartItem` function (lines 249-294):

```typescript
async function finalizeCartItem(psid: string, pageToken: string): Promise<void> {
  const session = await getOrCreateSession(psid);
  if (!session.pending_item_id) return;

  const cartItem: MessengerCartItem = {
    menu_item_id: session.pending_item_id,
    variation_id: session.pending_variation_id || null,
    add_on_ids: session.pending_add_ons || [],
    quantity: 1,
  };

  const cart = [...(session.cart || [])];

  // Merge identical items
  const existingIdx = cart.findIndex(
    (c: MessengerCartItem) =>
      c.menu_item_id === cartItem.menu_item_id &&
      c.variation_id === cartItem.variation_id &&
      JSON.stringify([...c.add_on_ids].sort()) === JSON.stringify([...cartItem.add_on_ids].sort())
  );

  if (existingIdx >= 0) {
    cart[existingIdx].quantity += 1;
  } else {
    cart.push(cartItem);
  }

  await updateSession(psid, {
    cart,
    state: 'idle',
    pending_item_id: null,
    pending_variation_id: null,
    pending_add_ons: [],
  } as any);

  // Get added item name for confirmation header
  const { data: addedItem } = await supabaseServer
    .from('menu_items')
    .select('name')
    .eq('id', session.pending_item_id)
    .single();
  const addedName = addedItem?.name || 'Item';

  // Hydrate full cart for summary using shared helper
  const cartDisplay = await hydrateCartForDisplay(cart);
  const summary = buildCartSummary(cartDisplay);

  // Send confirmation + full cart summary
  await sendTextMessage(
    psid,
    `${addedName} added!\n\nYour Cart:\n${summary}\n\nFor a smoother checkout, visit starrsmilkshake.com`,
    pageToken
  );

  // Checkout + continue buttons
  await sendButtonTemplate(psid, 'What would you like to do?', [
    { type: 'postback', title: 'Checkout', payload: 'CHECKOUT' },
    { type: 'postback', title: 'Continue Shopping', payload: 'MAIN_MENU' },
  ], pageToken);
}
```

- [ ] **Step 4: Update `showCart` to use the shared helper**

Replace the cart hydration loop in `showCart` (lines 304-332):

```typescript
  // Hydrate cart items for display using shared helper
  const cartDisplay = await hydrateCartForDisplay(session.cart);
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/messenger-handler.ts src/lib/messenger.ts
git commit -m "feat(messenger): show full cart summary with add-ons after adding item"
```

---

### Task 9: Handler — Loyalty card message fix + post-checkout quick reply

**Files:**
- Modify: `src/lib/messenger-handler.ts`

- [ ] **Step 1: Update loyalty card messages with expiry note**

In `handleLoyaltyCard` function (lines 471-516), replace the message text assignments (lines 509-511):

```typescript
  const buttonTitle = hasCard ? 'View My Card' : 'Get My Starr Card';
  const messageText = hasCard
    ? '⭐ Tap below to view your Starr Card!'
    : '⭐ Earn starrs with every order! Tap below to get your loyalty card.';
```

With:

```typescript
  const buttonTitle = hasCard ? 'View My Card' : 'Get My Starr Card';
  const messageText = hasCard
    ? "⭐ Tap below to view your Starr Card!\n\nThis link expires in 30 minutes. Type 'Loyalty' anytime to get a new one."
    : "⭐ Earn starrs with every order! Tap below to get your loyalty card.\n\nThis link expires in 30 minutes. Type 'Loyalty' anytime to get a new one.";
```

- [ ] **Step 2: Add loyalty quick reply after checkout session creation**

In `createCheckoutSession` function, after the existing `sendButtonTemplate` call (around line 452-457), add:

```typescript
  // Remind about loyalty card
  await sendQuickReplies(
    psid,
    'For a better experience next time, visit starrsmilkshake.com',
    [{ content_type: 'text', title: 'My Loyalty Card', payload: 'LOYALTY_CARD' }],
    pageToken
  );
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/messenger-handler.ts
git commit -m "fix(messenger): add session expiry note to loyalty card messages"
```

---

### Task 10: Update existing tests + final verification

**Files:**
- Modify: `tests/lib/messenger.test.ts`

- [ ] **Step 1: Update `buildCartSummary` test for new addOns field**

In `tests/lib/messenger.test.ts`, find the existing `buildCartSummary` test and update it to verify the new `addOns` parameter is optional and works:

Add a new test after the existing `buildCartSummary` tests:

```typescript
  it('buildCartSummary includes add-on names', async () => {
    const { buildCartSummary } = await import('../../src/lib/messenger');
    const cart = [
      { name: 'Iced Latte', variation: 'Large', quantity: 1, unitPrice: 200, addOns: ['Whip Cream', 'Extra Shot'] },
    ];
    const result = buildCartSummary(cart);
    expect(result).toContain('Iced Latte (Large) + Whip Cream, Extra Shot');
    expect(result).toContain('₱200');
  });

  it('buildCartSummary works without addOns', async () => {
    const { buildCartSummary } = await import('../../src/lib/messenger');
    const cart = [
      { name: 'Cookie Dough', variation: null, quantity: 2, unitPrice: 150 },
    ];
    const result = buildCartSummary(cart);
    expect(result).toContain('Cookie Dough x2');
    expect(result).toContain('₱300');
  });
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run 2>&1 | tail -30`
Expected: All tests PASS

- [ ] **Step 3: Run full TypeScript check**

Run: `npx tsc --noEmit --pretty 2>&1 | tail -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add tests/lib/messenger.test.ts
git commit -m "test(messenger): update cart summary tests for add-on support"
```

---

## Summary of All Tasks

| # | Task | Key Files |
|---|------|-----------|
| 1 | Database migration + seed | `supabase/migrations/20260320000000_faq_entries.sql` |
| 2 | FaqEntry/FaqInput types | `src/types/index.ts` |
| 3 | FAQ service (matching, caching, CRUD) + tests | `src/lib/faq-service.ts`, `tests/lib/faq-service.test.ts` |
| 4 | Admin FAQ API (GET/POST + PATCH/DELETE) | `app/api/admin/faq/route.ts`, `app/api/admin/faq/[id]/route.ts` |
| 5 | Persistent menu setup + API | `src/lib/messenger.ts`, `app/api/admin/messenger/setup-profile/route.ts` |
| 6 | Welcome message split (GET_STARTED vs MAIN_MENU) | `src/lib/messenger-handler.ts` |
| 7 | FAQ routing fallback in text messages | `src/lib/messenger-handler.ts` |
| 8 | Cart add response with full summary + add-ons | `src/lib/messenger-handler.ts`, `src/lib/messenger.ts` |
| 9 | Loyalty card message fix + post-checkout quick reply | `src/lib/messenger-handler.ts` |
| 10 | Update tests + final verification | `tests/lib/messenger.test.ts` |
