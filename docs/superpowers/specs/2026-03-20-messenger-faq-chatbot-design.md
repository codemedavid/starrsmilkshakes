# Messenger FAQ Chatbot & UX Improvements Design

**Date:** 2026-03-20
**Status:** Approved
**Branch:** feat/messenger-faq-chatbot

## Overview

Add a keyword-based FAQ bot to the Messenger chatbot, improve cart add responses with full cart summaries, fix loyalty card messaging, push website ordering throughout the flow, and set up persistent menus. Architecture is AI-ready for future RAG pipeline swap-in.

## Goals

1. FAQ bot using Supabase `faq_entries` table with keyword matching (swappable for RAG later)
2. Welcome message includes starrsmilkshake.com link and pushes website ordering
3. Cart add response shows full cart summary + checkout button (not just "X added! Cart: N items")
4. Loyalty card message includes session expiry note + "type Loyalty" instruction
5. Persistent menu: Order Online, Browse Menu, My Loyalty Card
6. Loyalty Card accessible via persistent menu, postback, quick replies at key moments
7. Website link pushed via buttons (welcome, persistent menu) and text (FAQs, cart, checkout)
8. Easy FAQ editing via admin API (future admin UI)

## Non-Goals

- AI/RAG pipeline (future — the FAQ service is the swap point)
- Admin dashboard UI for FAQ management (API only for now)
- NLU / intent classification (keyword matching is sufficient)
- Chatbot personality / conversational AI
- Multilingual FAQ support

---

## 1. Database: `faq_entries` Table

### Schema

```sql
CREATE TABLE faq_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  keywords TEXT[] NOT NULL,
  category TEXT,
  action_type TEXT DEFAULT 'text',
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_faq_entries_active ON faq_entries (is_active) WHERE is_active = TRUE;

-- Auto-update updated_at on row modification
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
```

### `action_type` Values

| Value | Behavior |
|-------|----------|
| `text` | Send the `answer` as a plain text message |
| `send_menu` | Call `showCategories()` to display the menu |
| `send_branches` | Send branch details with location info and contact buttons |
| `connect_human` | Send store contact info for human handoff |

### RLS

- Public: no access
- Admin (via service role): full CRUD
- Same pattern as existing admin-only tables

### Seed Data

All 23+ entries from `AI QUESTIONS AND ANSWERS.xlsx` will be seeded in the migration. Key mappings:

| Question | Keywords | Action Type |
|----------|----------|-------------|
| How much is the milkshake? | `{price, how much, milkshake, cost}` | `send_menu` | sort_order: 10 |
| How much is the snacks? | `{price, how much, snacks, snack, food}` | `send_menu` | sort_order: 11 |
| Can I order? | `{order, ordering, buy, purchase}` | `text` (answer includes website link) |
| Can I order for pick up? | `{pick up, pickup, takeout, take out}` | `text` |
| Do you deliver? | `{deliver, delivery, ship}` | `text` |
| Will it melt? | `{melt, melting, cold, warm}` | `text` |
| Is it free shipping? | `{free shipping, free delivery, shipping fee}` | `text` |
| How much is the delivery fee? | `{delivery fee, shipping fee, how much delivery}` | `text` (answer includes website link) |
| Location/Branches | `{branch, location, where, address, store, near}` | `send_branches` |
| Are you open? | `{open, closed}` | `text` | sort_order: 30 |
| What time are you open? | `{hours, time, schedule, what time, when}` | `text` | sort_order: 31 |
| Do you offer discount for PWD? | `{pwd, disability, disabled, discount}` | `text` |
| Do you offer discount for Senior Citizen? | `{senior, senior citizen, elderly, discount}` | `text` |
| Are you on FoodPanda and Grab? | `{grab, foodpanda, panda, food panda, online partner}` | `text` (answer includes website link) |
| How long will food take? | `{how long, prepare, preparation, wait, waiting}` | `text` |
| Can I see the menu? | `{menu, see menu, show menu, view menu}` | `send_menu` |
| Do you franchise? | `{franchise, franchising}` | `text` |
| Item marked delivered but not received | `{not received, missing, lost, delivered, where is}` | `connect_human` |
| Do you party or cater? | `{party, cater, catering, event, birthday, celebration}` | `text` |
| How to reserve for party? | `{reserve, reservation, book, booking, party}` | `text` |
| Best sellers / most ordered | `{best seller, popular, top, most ordered, recommend, recommendation, favorite}` | `text` | sort_order: 1 |
| What are best milkshake flavors? | `{flavor, flavors, milkshake flavor}` | `text` | sort_order: 2 |

> **Sort order for overlapping keywords:** Entries with overlapping keyword sets (e.g., "best" appears in both best sellers and best flavors) use `sort_order` for deterministic tie-breaking. Lower `sort_order` = higher priority. The seed migration assigns sort_order values in increments of 10 per category (products: 1-9, pricing: 10-19, ordering: 20-29, hours: 30-39, etc.) so new entries can be inserted between existing ones without renumbering.

### Answer Content Notes

- Answers referencing ordering include: "You can also order at starrsmilkshake.com"
- Answers about online partners include: "We have exclusive discounts and better prices at starrsmilkshake.com"
- Branch answers include actual branch details (address, contact). Operating hours are hardcoded in the FAQ answer text since the `branches` table has no hours field — this avoids schema changes for static info that rarely changes.
- Best sellers answer lists: Caramel Cookie Dough, Reeses Overload, Crunchy Cookie Butter, Strawberry Cheesecake, Mini Corndog, Mozzarella Poppers

---

## 2. FAQ Service: `src/lib/faq-service.ts`

### Interface

```typescript
interface FaqEntry {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  category: string | null;
  action_type: 'text' | 'send_menu' | 'send_branches' | 'connect_human';
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface FaqInput {
  id?: string;
  question: string;
  answer: string;
  keywords: string[];
  category?: string;
  action_type?: string;
  sort_order?: number;
}
```

### Functions

**`matchFaq(userText: string): Promise<FaqEntry | null>`**
1. Normalize user text: lowercase, trim, remove punctuation
2. Get active FAQ entries (from cache or DB)
3. For each entry, count how many of its keywords appear in the user text (word-boundary `includes()` on normalized text)
4. Return the entry with the highest score if score > 0
5. Ties broken by `sort_order` (lower = higher priority)
6. Return `null` if no match

**`buildFaqResponse(entry: FaqEntry, psid: string, pageToken: string, siteUrl: string): Promise<void>`**

The `siteUrl` parameter is derived from the existing `getSiteUrl()` helper in `messenger-handler.ts`.

Routes based on `action_type`:
- `text` → `sendButtonTemplate(psid, entry.answer, buttons, pageToken)` with buttons: [Browse Menu] (postback) + [Order Online] (web_url → siteUrl). Uses button template instead of plain text so we can include tappable web_url buttons.
- `send_menu` → `showCategories(psid, pageToken)` (existing function)
- `send_branches` → fetch branches from DB, format as text with address + contact info, send as button template with [Browse Menu] button
- `connect_human` → send button template with store contact info + [Browse Menu] button

**`getFaqEntries(): Promise<FaqEntry[]>`** (cached)
- Fetches all active entries from Supabase
- Caches in module-level variable with 5-minute TTL
- Returns cached entries if within TTL
- **Note:** In Vercel's serverless environment, the cache is per-instance and short-lived. The 5-minute TTL is a best-effort optimization to reduce DB queries within a warm function instance, not a guarantee of cross-instance consistency. This is acceptable since FAQ data changes infrequently.

**`invalidateFaqCache(): void`**
- Called by admin API after create/update/delete
- Clears the module-level cache

**`getAllFaqs(): Promise<FaqEntry[]>`**
- For admin API — all entries (including inactive), sorted by sort_order

**`upsertFaq(data: FaqInput): Promise<FaqEntry>`**
- Insert or update (upsert on id)
- Calls `invalidateFaqCache()` after

**`deleteFaq(id: string): Promise<void>`**
- Sets `is_active = false`
- Calls `invalidateFaqCache()` after

### Future RAG Swap Point

When adding RAG, only `matchFaq()` changes:
1. Add `embedding VECTOR(1536)` column to `faq_entries`
2. Replace keyword scoring with `pgvector` cosine similarity
3. Same return type (`FaqEntry | null`), same interface
4. Handler and admin API unchanged

---

## 3. Handler Changes: `messenger-handler.ts`

### 3.1 Welcome Message Update

**Two distinct flows:**

**`GET_STARTED` postback (first-time / returning via Get Started button):**
1. Button template (supports web_url buttons, unlike quick replies):
   ```
   Welcome to Starr's Famous Shakes!

   Order online at starrsmilkshake.com for the best experience, or browse our menu right here!

   How can I help you today?
   ```
   Buttons:
   - [Order Online] → web_url: `https://starrsmilkshake.com`
   - [Browse Menu] → postback: `MAIN_MENU`
2. Quick replies for categories + [My Loyalty Card] quick reply (payload: `LOYALTY_CARD`)

**`MAIN_MENU` postback (returning from persistent menu, quick replies, etc.):**
- Skip the welcome spiel — go straight to `showCategories()` with category quick replies + [My Loyalty Card] quick reply
- This avoids repetitive welcome messages for users just navigating back to the menu

> **Note:** Facebook Quick Replies only support `content_type: 'text'` with a `payload` string — they cannot be `web_url`. The "Order Online" website link is delivered via Button Templates (which support `web_url`) or as text within messages. Quick replies are used only for navigation payloads like `MAIN_MENU` and `LOYALTY_CARD`.

### 3.2 Message Routing Change

**Current:** Unrecognized text → `showCategories()`

**New routing order:**
1. Check loyalty triggers ("loyalty", "loyalty card", "starr card", "my card") → loyalty flow
2. Call `matchFaq(userText)` → if match, `buildFaqResponse()` + append quick replies [Browse Menu]
3. No match → `showCategories()` (existing fallback)

This means the FAQ layer sits between loyalty triggers and the default menu, acting as a smart fallback.

**FAQ response delivery:** For `text` action_type, send the answer as a button template (not plain text) so we can include a [Browse Menu] postback button and [Order Online] web_url button alongside the answer. For `send_menu` and `send_branches`, the existing template functions handle buttons natively.

**Error handling:** If `matchFaq()` fails (DB error, network timeout), log the error and fall through to `showCategories()` as graceful degradation. The FAQ layer should never block the core ordering flow.

### 3.3 Cart Add Response Update

**Current (`finalizeCartItem`):**
```
"Iced Latte added! Cart: 2 item(s)"
+ quick replies: [Continue Shopping] [View Cart] [Checkout]
```

**New:**
1. Hydrate full cart — fetch `menu_items`, `variations`, and `add_ons` by IDs from the cart array. The unit price for each line item should include `base_price + variation.price + sum(add_on prices)` to show the true per-item cost. The existing `buildCartSummary()` currently excludes add-on prices from `unitPrice` — update it to include them.
2. Send text message:
   ```
   Added: Iced Latte (Large) - ₱180

   Your Cart:
   1x Caramel Cookie Dough (Regular) - ₱150
   1x Iced Latte (Large) - ₱180
   Total: ₱330

   For a smoother checkout, visit starrsmilkshake.com
   ```
3. Button template:
   - [Checkout] → postback: `CHECKOUT`
   - [Continue Shopping] → postback: `MAIN_MENU`

### 3.4 Loyalty Card Message Fix

**Current "has card" message:**
```
"⭐ Tap below to view your Starr Card!"
[View My Card] → /loyalty/card/{token}
```

**New:**
```
"⭐ Tap below to view your Starr Card!

This link expires in 30 minutes. Type 'Loyalty' anytime to get a new one."
[View My Card] → /loyalty/card/{token}
```

**Current "no card" message:**
```
"⭐ Earn starrs with every order! Tap below to get your loyalty card."
[Get My Starr Card] → /loyalty/register/{token}
```

**New:**
```
"⭐ Earn starrs with every order! Tap below to get your loyalty card.

This link expires in 30 minutes. Type 'Loyalty' anytime to get a new one."
[Get My Starr Card] → /loyalty/register/{token}
```

### 3.5 Postback Handler: `LOYALTY_CARD`

The `LOYALTY_CARD` postback handler already exists in `messenger-handler.ts` (currently triggers the loyalty card flow). No new handler is needed — the existing implementation already handles:
- Persistent menu "My Loyalty Card" tap
- Quick reply "My Loyalty Card" tap

The only change is updating the loyalty message text within this handler to include the session expiry note (Section 3.4).

---

## 4. Persistent Menu & Profile Setup

### `setupMessengerProfile(pageToken: string)`

New function in `src/lib/messenger.ts` that calls the Graph API to set:

**Persistent Menu:**
```json
{
  "persistent_menu": [
    {
      "locale": "default",
      "composer_input_disabled": false,
      "call_to_actions": [
        { "type": "web_url", "title": "Order Online", "url": "https://starrsmilkshake.com" },
        { "type": "postback", "title": "Browse Menu", "payload": "MAIN_MENU" },
        { "type": "postback", "title": "My Loyalty Card", "payload": "LOYALTY_CARD" }
      ]
    }
  ]
}
```

**Get Started Button:** Already configured (payload: `GET_STARTED`).

**API endpoint:** `POST /api/admin/messenger/setup-profile`
- Calls `setupMessengerProfile()` with the stored page token
- Admin-only, idempotent
- Returns success/failure

### Quick Reply Additions

| Location | Added Quick Reply |
|----------|-------------------|
| Welcome message (GET_STARTED) | `[My Loyalty Card]` payload: `LOYALTY_CARD` (appended to category quick replies) |
| MAIN_MENU | `[My Loyalty Card]` payload: `LOYALTY_CARD` (appended to category quick replies) |
| Post-checkout confirmation | `[My Loyalty Card]` payload: `LOYALTY_CARD` |

> **Note:** "Order Online" links are delivered via Button Templates (web_url type), not Quick Replies. Quick Replies only support text payloads. FAQ responses use button templates with [Browse Menu] (postback) + [Order Online] (web_url) buttons.

---

## 5. Admin FAQ API

### Routes

**`app/api/admin/faq/route.ts`** — Collection operations:

**`GET /api/admin/faq`**
- Returns all FAQ entries (including inactive), sorted by `sort_order`
- Response: `{ faqs: FaqEntry[] }`

**`POST /api/admin/faq`**
- Body: `FaqInput` (question, answer, keywords required)
- Creates new entry
- Invalidates FAQ cache
- Response: `{ faq: FaqEntry }`

**`app/api/admin/faq/[id]/route.ts`** — Single-entry operations (follows existing admin pattern e.g. `app/api/orders/[id]/route.ts`):

**`PATCH /api/admin/faq/[id]`**
- Body: `{ ...partial FaqInput }` (id from URL param)
- Updates existing entry
- Invalidates FAQ cache
- Response: `{ faq: FaqEntry }`

**`DELETE /api/admin/faq/[id]`**
- Soft delete (sets `is_active = false`)
- Invalidates FAQ cache
- Response: `{ success: true }`

Protected by existing admin auth middleware (same pattern as other admin routes).

---

## 6. Website Push Points Summary

| Location | Type | Content |
|----------|------|---------|
| Welcome message | Button + text | "Order online at starrsmilkshake.com" + [Order Online] button |
| Persistent menu | Web URL button | "Order Online" → starrsmilkshake.com |
| Cart summary (after add) | Text | "For a smoother checkout, visit starrsmilkshake.com" |
| FAQ answers (ordering/delivery) | Text | "You can also order at starrsmilkshake.com" |
| FAQ answers (online partners) | Text | "We have exclusive discounts at starrsmilkshake.com" |
| FAQ responses | Button template (web_url) | [Order Online] button → starrsmilkshake.com |
| Post-checkout session | Text | "For a better experience next time, visit starrsmilkshake.com" |

---

## 7. File Changes Summary

| File | Change |
|------|--------|
| **New:** `supabase/migrations/YYYYMMDD_faq_entries.sql` | Create table + seed 23+ FAQ entries |
| **New:** `src/lib/faq-service.ts` | FAQ matching, caching, CRUD functions |
| **New:** `app/api/admin/faq/route.ts` | Admin FAQ list + create API |
| **New:** `app/api/admin/faq/[id]/route.ts` | Admin FAQ update + delete API |
| **New:** `app/api/admin/messenger/setup-profile/route.ts` | Persistent menu setup endpoint |
| **Modify:** `src/lib/messenger-handler.ts` | Welcome msg, FAQ routing, cart response, loyalty msg, LOYALTY_CARD postback |
| **Modify:** `src/lib/messenger.ts` | Add `setupMessengerProfile()`, update quick reply helpers |
| **Modify:** `src/types/index.ts` | Add `FaqEntry`, `FaqInput` types |
| **New:** `tests/lib/faq-service.test.ts` | FAQ matching and CRUD tests |

---

## 8. Testing Strategy

- **Unit tests:** FAQ keyword matching (exact match, partial match, no match, tie-breaking, inactive entries skipped)
- **Unit tests:** `buildFaqResponse` routes correctly by action_type
- **Unit tests:** Cart summary formatting with the new format
- **Unit tests:** Loyalty message includes expiry note
- **Integration:** Admin FAQ API CRUD operations
- **Manual:** Persistent menu appears in Messenger, quick replies work, FAQ responses trigger correctly
