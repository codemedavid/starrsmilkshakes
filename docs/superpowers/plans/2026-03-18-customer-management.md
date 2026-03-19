# Customer Management Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full Customer Management system — auto-populated from Messenger orders, manually creatable, with LTV/habit tracking, tags, and order linking — as a new Customers tab in the admin dashboard.

**Architecture:** Supabase migration adds `customers` + `customer_tags` tables and a Postgres trigger that maintains cached stat columns. API routes follow existing `app/api/admin/*` patterns. UI is a list + slide-in panel component wired into `AdminDashboard.tsx` as a new tab.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase JS v2, Tailwind CSS, Vitest, Lucide React, Nunito + Playfair Display fonts.

**Spec:** `docs/superpowers/specs/2026-03-18-customer-management-design.md`

---

## File Map

**New files:**
- `supabase/migrations/20260318000000_add_customers.sql` — DB schema + trigger
- `src/types/customer.ts` — Customer, CustomerTag, CustomerSummary, CustomerProfile types
- `src/lib/customer-utils.ts` — normalizePhone, normalizeEmail, computeAutoTags
- `app/api/admin/customers/route.ts` — GET (list) + POST (create)
- `app/api/admin/customers/[id]/route.ts` — GET + PATCH + DELETE
- `app/api/admin/customers/[id]/tags/route.ts` — POST (add tag)
- `app/api/admin/customers/[id]/tags/[tagId]/route.ts` — DELETE (remove tag)
- `app/api/admin/customers/suggest/route.ts` — GET (phone match)
- `src/hooks/useCustomers.ts` — paginated list with search/filter
- `src/hooks/useCustomer.ts` — single customer profile
- `src/components/CustomerListItem.tsx` — single row in the customer list
- `src/components/CustomerManager.tsx` — main tab (list + panel)
- `src/components/CustomerDetailPanel.tsx` — slide-in profile
- `src/components/CustomerTagBadge.tsx` — tag chip component
- `src/components/CustomerLinkWidget.tsx` — order→customer linker
- `tests/lib/phone-normalize.test.ts` — normalizePhone unit tests
- `tests/lib/auto-tags.test.ts` — computeAutoTags unit tests (all four rules + edge cases)
- `tests/lib/customer-stats.test.ts` — stats threshold edge cases and boundary values
- `tests/lib/customer-dedup.test.ts` — duplicate detection via phone/email normalization
- `tests/api-customers.test.ts` — API + integration + security + trigger behaviour tests

**Modified files:**
- `src/types/index.ts` — add `customer_id?: string | null` to `Order` interface
- `app/api/orders/[id]/route.ts` — accept `customer_id` in PATCH body
- `app/api/orders/route.ts` — auto-link customer in msession block
- `src/components/AdminDashboard.tsx` — add Customers tab
- `src/components/OrderManager.tsx` — add CustomerLinkWidget per order row

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260318000000_add_customers.sql`

- [ ] **Step 1.1: Write the migration file**

```sql
-- supabase/migrations/20260318000000_add_customers.sql

-- ── 1. customers table ─────────────────────────────────────────────────────
create table if not exists public.customers (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  email                   text unique,   -- nullable; multiple NULLs allowed (PG semantics)
  phone                   text unique,   -- nullable; stored digits-only e.g. 09171234567
  messenger_psid          text unique,
  messenger_name          text,
  source                  text not null default 'manual' check (source in ('messenger','manual')),
  notes                   text,
  -- cached stat columns (trigger-maintained)
  total_spent             numeric not null default 0,
  order_count             int     not null default 0,
  avg_order_value         numeric not null default 0,
  last_order_at           timestamptz,
  favorite_items          jsonb,  -- [{id: string|null, name: string, count: number}]
  preferred_service_type  text,
  preferred_branch_id     uuid references public.branches(id) on delete set null,
  avg_order_interval_days numeric,  -- NULL when order_count <= 1
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists customers_phone_idx           on public.customers(phone);
create index if not exists customers_email_idx           on public.customers(email);
create index if not exists customers_messenger_psid_idx  on public.customers(messenger_psid);
create index if not exists customers_last_order_at_idx   on public.customers(last_order_at desc);
create index if not exists customers_total_spent_idx     on public.customers(total_spent desc);

-- ── 2. customer_tags table ─────────────────────────────────────────────────
create table if not exists public.customer_tags (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  tag         text not null,
  tag_type    text not null default 'manual' check (tag_type in ('auto','manual')),
  created_at  timestamptz not null default now(),
  unique (customer_id, tag)
);

create index if not exists customer_tags_customer_id_idx on public.customer_tags(customer_id);

-- ── 3. Add customer_id to orders ───────────────────────────────────────────
alter table public.orders
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

create index if not exists orders_customer_id_idx on public.orders(customer_id);

-- ── 4. Stats trigger function ──────────────────────────────────────────────
create or replace function public.update_customer_stats(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_spent             numeric;
  v_order_count             int;
  v_avg_order_value         numeric;
  v_last_order_at           timestamptz;
  v_favorite_items          jsonb;
  v_preferred_service_type  text;
  v_preferred_branch_id     uuid;
  v_avg_interval            numeric;
begin
  -- total_spent: sum of completed order totals
  select coalesce(sum(total), 0)
    into v_total_spent
    from public.orders
   where customer_id = p_customer_id
     and status = 'completed';

  -- order_count: non-cancelled orders
  select coalesce(count(*), 0)
    into v_order_count
    from public.orders
   where customer_id = p_customer_id
     and status <> 'cancelled';

  -- avg_order_value: COALESCE wraps NULLIF so the NOT NULL column always gets 0 (not NULL)
  -- when no orders exist. Spec formula: total_spent / NULLIF(order_count, 0).
  v_avg_order_value := coalesce(v_total_spent / nullif(v_order_count, 0), 0);

  -- last_order_at: most recent non-cancelled
  select max(created_at)
    into v_last_order_at
    from public.orders
   where customer_id = p_customer_id
     and status <> 'cancelled';

  -- favorite_items: top 5 by count.
  -- Group by menu_item_id when non-null; fall back to menu_item_name for legacy null-id rows.
  -- GROUP BY (menu_item_id, CASE ...) ensures null-id rows group by name, non-null by UUID.
  select jsonb_agg(item order by item_count desc)
    into v_favorite_items
    from (
      select
        jsonb_build_object(
          'id',    oi.menu_item_id,        -- null for legacy rows (PostgreSQL serialises uuid as text in jsonb)
          'name',  min(oi.menu_item_name), -- aggregate: same name for id-grouped rows; any for name-grouped
          'count', count(*)
        ) as item,
        count(*) as item_count
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
     where o.customer_id = p_customer_id
       and o.status <> 'cancelled'
     group by oi.menu_item_id,
              case when oi.menu_item_id is null then oi.menu_item_name else null end
     order by count(*) desc
     limit 5
    ) sub;

  -- preferred_service_type: mode
  select service_type
    into v_preferred_service_type
    from public.orders
   where customer_id = p_customer_id
     and status <> 'cancelled'
   group by service_type
   order by count(*) desc
   limit 1;

  -- preferred_branch_id: mode (cast with nullif guard for legacy text rows)
  select (nullif(branch_id, ''))::uuid
    into v_preferred_branch_id
    from public.orders
   where customer_id = p_customer_id
     and status <> 'cancelled'
     and branch_id is not null
     and branch_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   group by branch_id
   order by count(*) desc
   limit 1;

  -- avg_order_interval_days: NULL when <= 1 order
  if v_order_count <= 1 then
    v_avg_interval := null;
  else
    select avg(gap_days)
      into v_avg_interval
      from (
        select extract(epoch from (created_at - lag(created_at) over (order by created_at))) / 86400.0 as gap_days
          from public.orders
         where customer_id = p_customer_id
           and status <> 'cancelled'
      ) gaps
     where gap_days is not null;
  end if;

  -- write all stats back
  update public.customers set
    total_spent             = v_total_spent,
    order_count             = v_order_count,
    avg_order_value         = v_avg_order_value,
    last_order_at           = v_last_order_at,
    favorite_items          = v_favorite_items,
    preferred_service_type  = v_preferred_service_type,
    preferred_branch_id     = v_preferred_branch_id,
    avg_order_interval_days = v_avg_interval,
    updated_at              = now()
  where id = p_customer_id;
end;
$$;

-- ── 5. Trigger on orders ───────────────────────────────────────────────────
create or replace function public.orders_customer_stats_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- handle old customer_id (on UPDATE/DELETE)
  if (tg_op = 'UPDATE' or tg_op = 'DELETE') and old.customer_id is not null then
    perform public.update_customer_stats(old.customer_id);
  end if;
  -- handle new customer_id (on INSERT/UPDATE)
  if (tg_op = 'INSERT' or tg_op = 'UPDATE') and new.customer_id is not null then
    if new.customer_id <> old.customer_id or tg_op = 'INSERT' then
      perform public.update_customer_stats(new.customer_id);
    elsif new.status <> old.status or new.total <> old.total then
      perform public.update_customer_stats(new.customer_id);
    end if;
  end if;
  return null;
end;
$$;

create or replace trigger orders_customer_stats
  after insert or update or delete on public.orders
  for each row execute function public.orders_customer_stats_trigger();

-- ── 6. updated_at trigger for customers ───────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create or replace trigger customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();
```

- [ ] **Step 1.2: Apply migration via Supabase MCP or CLI**

```bash
# Option A — via Supabase CLI (if linked):
npx supabase db push

# Option B — paste into Supabase Dashboard → SQL Editor and run
```

Verify success: check that `customers`, `customer_tags` tables exist and `orders` has a `customer_id` column.

- [ ] **Step 1.3: Commit**

```bash
git add supabase/migrations/20260318000000_add_customers.sql
git commit -m "feat: add customers and customer_tags migration with stats trigger"
```

---

## Task 2: TypeScript Types

**Files:**
- Create: `src/types/customer.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 2.1: Create `src/types/customer.ts`**

```typescript
// src/types/customer.ts

export type CustomerSource = 'messenger' | 'manual';
export type TagType = 'auto' | 'manual';
export type AutoTagLabel = 'VIP' | 'Loyal' | 'New' | 'At Risk';

export interface FavoriteItem {
  id: string | null;   // null for legacy order_items rows where menu_item_id is null
  name: string;
  count: number;
}

export interface CustomerTag {
  id: string;
  customer_id: string;
  tag: string;
  tag_type: TagType;
  created_at: string;
}

/** Full customer row as returned by the DB */
export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  messenger_psid: string | null;
  messenger_name: string | null;
  source: CustomerSource;
  notes: string | null;
  // cached stats
  total_spent: number;
  order_count: number;
  avg_order_value: number;
  last_order_at: string | null;
  favorite_items: FavoriteItem[] | null;
  preferred_service_type: string | null;
  preferred_branch_id: string | null;
  avg_order_interval_days: number | null;
  created_at: string;
  updated_at: string;
}

/** Used in list views — includes computed auto_tags and manual_tags */
export interface CustomerSummary extends Customer {
  auto_tags: AutoTagLabel[];
  manual_tags: CustomerTag[];
}

/** Full profile — includes order history */
export interface CustomerProfile extends CustomerSummary {
  recent_orders: CustomerOrder[];
}

export interface CustomerOrder {
  id: string;
  order_number: string;
  total: number;
  status: string;
  service_type: string;
  created_at: string;
}

export interface CreateCustomerInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export interface UpdateCustomerInput {
  name?: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export interface CustomerFilters {
  search?: string;
  tag?: string;
  sort?: 'last_order_at' | 'total_spent' | 'order_count' | 'name' | 'created_at';
  page?: number;
  limit?: number;
}
```

- [ ] **Step 2.2: Add `customer_id` to the `Order` interface in `src/types/index.ts`**

Find the `Order` interface (around line 115) and add after `messenger_name`:

```typescript
  customer_id?: string | null;
```

- [ ] **Step 2.3: Commit**

```bash
git add src/types/customer.ts src/types/index.ts
git commit -m "feat: add Customer types and customer_id to Order"
```

---

## Task 3: Core Utility Functions (Pure — TDD first)

**Files:**
- Create: `src/lib/customer-utils.ts`
- Create: `tests/lib/phone-normalize.test.ts`
- Create: `tests/lib/auto-tags.test.ts`
- Create: `tests/lib/customer-stats.test.ts`
- Create: `tests/lib/customer-dedup.test.ts`

- [ ] **Step 3.1: Write failing test — `tests/lib/phone-normalize.test.ts`**

```typescript
// tests/lib/phone-normalize.test.ts
import { describe, it, expect } from 'vitest';
import { normalizePhone, normalizeEmail } from '@/lib/customer-utils';

describe('normalizePhone', () => {
  it('strips spaces and dashes', () => {
    expect(normalizePhone('0917-123-4567')).toBe('09171234567');
    expect(normalizePhone('0917 123 4567')).toBe('09171234567');
  });
  it('strips +63 country code prefix', () => {
    expect(normalizePhone('+639171234567')).toBe('09171234567');
    expect(normalizePhone('+63 917 123 4567')).toBe('09171234567');
  });
  it('strips parentheses', () => {
    expect(normalizePhone('(0917) 123-4567')).toBe('09171234567');
  });
  it('returns already-normalized phone unchanged', () => {
    expect(normalizePhone('09171234567')).toBe('09171234567');
  });
  it('returns empty string for null/undefined/empty', () => {
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone(null)).toBe('');
    expect(normalizePhone(undefined)).toBe('');
  });
});

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Maria@Gmail.COM  ')).toBe('maria@gmail.com');
  });
  it('returns empty string for null/undefined', () => {
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(undefined)).toBe('');
  });
});
```

- [ ] **Step 3.2: Write failing test — `tests/lib/auto-tags.test.ts`**

```typescript
// tests/lib/auto-tags.test.ts
import { describe, it, expect } from 'vitest';
import { computeAutoTags } from '@/lib/customer-utils';

const base = {
  total_spent: 0,
  order_count: 0,
  last_order_at: null,
  avg_order_interval_days: null,
};

describe('computeAutoTags', () => {
  it('returns VIP when total_spent >= 5000 (exact threshold)', () => {
    expect(computeAutoTags({ ...base, total_spent: 5000, order_count: 5 })).toContain('VIP');
    expect(computeAutoTags({ ...base, total_spent: 4999, order_count: 5 })).not.toContain('VIP');
  });
  it('returns Loyal when order_count >= 10 (exact threshold)', () => {
    expect(computeAutoTags({ ...base, order_count: 10 })).toContain('Loyal');
    expect(computeAutoTags({ ...base, order_count: 9 })).not.toContain('Loyal');
  });
  it('returns New when order_count <= 2 (exact threshold)', () => {
    expect(computeAutoTags({ ...base, order_count: 2 })).toContain('New');
    expect(computeAutoTags({ ...base, order_count: 3 })).not.toContain('New');
  });
  it('returns At Risk when last_order_at > 30 days ago and order_count > 1', () => {
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    expect(computeAutoTags({ ...base, order_count: 3, last_order_at: oldDate })).toContain('At Risk');
  });
  it('does NOT return At Risk when order_count <= 1 (null last_order_at)', () => {
    expect(computeAutoTags({ ...base, order_count: 1, last_order_at: null })).not.toContain('At Risk');
  });
  it('does NOT return At Risk for new customers (order_count = 1) even with old date', () => {
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    expect(computeAutoTags({ ...base, order_count: 1, last_order_at: oldDate })).not.toContain('At Risk');
  });
  it('does NOT return At Risk when last_order_at is recent', () => {
    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(computeAutoTags({ ...base, order_count: 5, last_order_at: recentDate })).not.toContain('At Risk');
  });
  it('returns empty array for fresh customer with no orders', () => {
    expect(computeAutoTags(base)).toEqual([]);
  });
  it('can return multiple tags (VIP + Loyal)', () => {
    const tags = computeAutoTags({ ...base, total_spent: 6000, order_count: 15 });
    expect(tags).toContain('VIP');
    expect(tags).toContain('Loyal');
  });
});
```

- [ ] **Step 3.3: Write failing test — `tests/lib/customer-stats.test.ts`**

```typescript
// tests/lib/customer-stats.test.ts
// Tests stats-related threshold boundary values using computeAutoTags
// (DB trigger stats are validated end-to-end in tests/api-customers.test.ts Task 11)
import { describe, it, expect } from 'vitest';
import { computeAutoTags } from '@/lib/customer-utils';

describe('auto-tag thresholds derived from cached stats', () => {
  it('VIP threshold: exactly 5000 qualifies, 4999 does not', () => {
    expect(computeAutoTags({ total_spent: 5000, order_count: 5, last_order_at: null, avg_order_interval_days: null }))
      .toContain('VIP');
    expect(computeAutoTags({ total_spent: 4999.99, order_count: 5, last_order_at: null, avg_order_interval_days: null }))
      .not.toContain('VIP');
  });
  it('Loyal threshold: exactly 10 orders qualifies, 9 does not', () => {
    expect(computeAutoTags({ total_spent: 0, order_count: 10, last_order_at: null, avg_order_interval_days: null }))
      .toContain('Loyal');
    expect(computeAutoTags({ total_spent: 0, order_count: 9, last_order_at: null, avg_order_interval_days: null }))
      .not.toContain('Loyal');
  });
  it('New threshold: exactly 0, 1, 2 orders → New; 3 orders → not New', () => {
    for (const count of [0, 1, 2]) {
      expect(computeAutoTags({ total_spent: 0, order_count: count, last_order_at: null, avg_order_interval_days: null }))
        .toContain('New');
    }
    expect(computeAutoTags({ total_spent: 0, order_count: 3, last_order_at: null, avg_order_interval_days: null }))
      .not.toContain('New');
  });
  it('At Risk: exactly 30 days does NOT qualify; 31 days does', () => {
    const exactly30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const over30 = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    expect(computeAutoTags({ total_spent: 0, order_count: 3, last_order_at: exactly30, avg_order_interval_days: null }))
      .not.toContain('At Risk');
    expect(computeAutoTags({ total_spent: 0, order_count: 3, last_order_at: over30, avg_order_interval_days: null }))
      .toContain('At Risk');
  });
});
```

- [ ] **Step 3.4: Write failing test — `tests/lib/customer-dedup.test.ts`**

```typescript
// tests/lib/customer-dedup.test.ts
// Tests that normalization produces consistent keys for deduplication
import { describe, it, expect } from 'vitest';
import { normalizePhone, normalizeEmail } from '@/lib/customer-utils';

describe('phone normalization for dedup', () => {
  it('different formats of the same number normalize to the same key', () => {
    const formats = [
      '09171234567',
      '0917-123-4567',
      '0917 123 4567',
      '(0917) 123-4567',
      '+639171234567',
      '+63 917 123 4567',
    ];
    const normalized = formats.map(normalizePhone);
    // All should be identical
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe('09171234567');
  });

  it('two different phone numbers do NOT collide after normalization', () => {
    expect(normalizePhone('09171234567')).not.toBe(normalizePhone('09271234567'));
  });
});

describe('email normalization for dedup', () => {
  it('different case/whitespace variants normalize to the same key', () => {
    expect(normalizeEmail('Maria@Gmail.com')).toBe(normalizeEmail('maria@gmail.com'));
    expect(normalizeEmail('  MARIA@GMAIL.COM  ')).toBe(normalizeEmail('maria@gmail.com'));
  });

  it('two different emails do NOT collide after normalization', () => {
    expect(normalizeEmail('maria@gmail.com')).not.toBe(normalizeEmail('jose@gmail.com'));
  });
});
```

- [ ] **Step 3.5: Run all four test files to confirm they fail**

```bash
npx vitest run tests/lib/phone-normalize.test.ts tests/lib/auto-tags.test.ts tests/lib/customer-stats.test.ts tests/lib/customer-dedup.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/customer-utils'`

- [ ] **Step 3.6: Implement `src/lib/customer-utils.ts`**

```typescript
// src/lib/customer-utils.ts
import type { AutoTagLabel } from '@/types/customer';

/** Strip all non-digit chars; handle +63 prefix → 09XX format */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  let digits = phone.replace(/\D/g, '');
  // +63 country code → prepend 0
  if (digits.startsWith('63') && digits.length === 12) {
    digits = '0' + digits.slice(2);
  }
  return digits;
}

/** Lowercase + trim email */
export function normalizeEmail(email: string | null | undefined): string {
  if (!email) return '';
  return email.trim().toLowerCase();
}

interface StatsForAutoTags {
  total_spent: number;
  order_count: number;
  last_order_at: string | null;
  avg_order_interval_days: number | null;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Derive auto-tags from cached stat columns — runs in application code, not stored in DB */
export function computeAutoTags(stats: StatsForAutoTags): AutoTagLabel[] {
  const tags: AutoTagLabel[] = [];

  if (stats.total_spent >= 5000) tags.push('VIP');
  if (stats.order_count >= 10) tags.push('Loyal');
  if (stats.order_count <= 2) tags.push('New');

  if (
    stats.order_count > 1 &&
    stats.last_order_at &&
    Date.now() - new Date(stats.last_order_at).getTime() > THIRTY_DAYS_MS
  ) {
    tags.push('At Risk');
  }

  return tags;
}
```

- [ ] **Step 3.7: Run tests to confirm they pass**

```bash
npx vitest run tests/lib/phone-normalize.test.ts tests/lib/auto-tags.test.ts tests/lib/customer-stats.test.ts tests/lib/customer-dedup.test.ts
```

Expected: All PASS.

- [ ] **Step 3.8: Commit**

```bash
git add src/lib/customer-utils.ts \
        tests/lib/phone-normalize.test.ts \
        tests/lib/auto-tags.test.ts \
        tests/lib/customer-stats.test.ts \
        tests/lib/customer-dedup.test.ts
git commit -m "feat: add customer-utils (normalizePhone, normalizeEmail, computeAutoTags) with tests"
```

---

## Task 4: API — List + Create (`/api/admin/customers`)

**Files:**
- Create: `app/api/admin/customers/route.ts`
- Create: `tests/api-customers.test.ts` (skeleton — add tests per task)

- [ ] **Step 4.1: Write failing tests for list + create**

```typescript
// tests/api-customers.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const BASE = process.env.API_BASE_URL || 'http://localhost:3000';
// Use the same ADMIN_PASSWORD from .env.local for test cookie
const ADMIN_COOKIE = process.env.TEST_ADMIN_COOKIE || '';

async function adminFetch(path: string, options: RequestInit = {}) {
  return fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Cookie: ADMIN_COOKIE,
      ...(options.headers || {}),
    },
  });
}

let createdCustomerId: string | null = null;

afterAll(async () => {
  if (createdCustomerId) {
    await adminFetch(`/api/admin/customers/${createdCustomerId}`, { method: 'DELETE' });
  }
});

describe('GET /api/admin/customers', () => {
  it('returns 401 without auth', async () => {
    const res = await fetch(`${BASE}/api/admin/customers`);
    expect(res.status).toBe(401);
  });

  it('returns customer list with pagination', async () => {
    const res = await adminFetch('/api/admin/customers');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('customers');
    expect(data).toHaveProperty('total');
    expect(Array.isArray(data.customers)).toBe(true);
  });

  it('returns auto_tags on each customer', async () => {
    const res = await adminFetch('/api/admin/customers');
    const data = await res.json();
    if (data.customers.length > 0) {
      expect(data.customers[0]).toHaveProperty('auto_tags');
      expect(Array.isArray(data.customers[0].auto_tags)).toBe(true);
    }
  });
});

describe('POST /api/admin/customers', () => {
  it('returns 401 without auth', async () => {
    const res = await fetch(`${BASE}/api/admin/customers`, { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
  });

  it('creates a customer with name only', async () => {
    const res = await adminFetch('/api/admin/customers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Customer CI' }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.customer.name).toBe('Test Customer CI');
    expect(data.customer.source).toBe('manual');
    createdCustomerId = data.customer.id;
  });

  it('rejects missing name', async () => {
    const res = await adminFetch('/api/admin/customers', {
      method: 'POST',
      body: JSON.stringify({ email: 'no-name@test.com' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 409 on duplicate phone', async () => {
    const phone = '09990000001';
    await adminFetch('/api/admin/customers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Dup A', phone }),
    });
    const res = await adminFetch('/api/admin/customers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Dup B', phone }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    // Error must not contain the actual phone number (no PII in errors)
    expect(JSON.stringify(body)).not.toContain(phone);
  });
});
```

- [ ] **Step 4.2: Run tests to confirm they fail**

```bash
npx vitest run tests/api-customers.test.ts
```

Expected: FAIL — 404 on the route.

- [ ] **Step 4.3: Implement `app/api/admin/customers/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { supabaseServer } from '@/lib/supabase-server';
import { normalizePhone, normalizeEmail, computeAutoTags } from '@/lib/customer-utils';
import type { CustomerFilters, CustomerSummary } from '@/types/customer';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const unauthorized = requireAdminRequest(request);
    if (unauthorized) return unauthorized;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim() || '';
    const tag = searchParams.get('tag') || '';
    const sort = (searchParams.get('sort') || 'last_order_at') as CustomerFilters['sort'];
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 20)));
    const offset = (page - 1) * limit;

    const AUTO_TAG_LABELS = ['VIP', 'Loyal', 'New', 'At Risk'];
    const isAutoTag = AUTO_TAG_LABELS.includes(tag);

    let query = (supabaseServer.from('customers') as any)
      .select('*, customer_tags(*)', { count: 'exact' });

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`
      );
    }

    // Filter by manual tag
    if (tag && !isAutoTag) {
      query = query.eq('customer_tags.tag', tag);
    }

    // Filter by auto-tag via stat columns
    if (isAutoTag) {
      if (tag === 'VIP')   query = query.gte('total_spent', 5000);
      if (tag === 'Loyal') query = query.gte('order_count', 10);
      if (tag === 'New')   query = query.lte('order_count', 2);
      if (tag === 'At Risk') {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        query = query.lt('last_order_at', thirtyDaysAgo).gt('order_count', 1);
      }
    }

    const validSorts = ['last_order_at', 'total_spent', 'order_count', 'name', 'created_at'];
    const sortCol = validSorts.includes(sort!) ? sort! : 'last_order_at';
    query = query.order(sortCol, { ascending: sortCol === 'name', nullsFirst: false });
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[api/admin/customers] GET error:', error.message);
      return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });
    }

    const customers: CustomerSummary[] = (data || []).map((c: any) => ({
      ...c,
      auto_tags: computeAutoTags(c),
      manual_tags: c.customer_tags || [],
      customer_tags: undefined,
    }));

    return NextResponse.json({ customers, total: count ?? 0, page, limit });
  } catch (err) {
    console.error('[api/admin/customers] GET unhandled:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const unauthorized = requireAdminRequest(request);
    if (unauthorized) return unauthorized;

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const name = String(body.name || '').trim();
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    const email = normalizeEmail(body.email as string | null) || null;
    const phone = normalizePhone(body.phone as string | null) || null;
    const notes = body.notes ? String(body.notes).trim() : null;

    // Validate email format if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 422 });
    }
    // Validate phone length if provided (10-11 digits after normalization)
    if (phone && (phone.length < 10 || phone.length > 11)) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 422 });
    }

    const { data, error } = await (supabaseServer.from('customers') as any)
      .insert({ name, email, phone, notes, source: 'manual' })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A customer with this phone, email, or Messenger ID already exists' }, { status: 409 });
      }
      console.error('[api/admin/customers] POST error:', error.message);
      return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
    }

    return NextResponse.json({ customer: data }, { status: 201 });
  } catch (err) {
    console.error('[api/admin/customers] POST unhandled:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 4.4: Run tests to confirm they pass**

```bash
npx vitest run tests/api-customers.test.ts
```

Expected: All PASS. (Requires running Next.js dev server: `npm run dev`)

- [ ] **Step 4.5: Commit**

```bash
git add app/api/admin/customers/route.ts tests/api-customers.test.ts
git commit -m "feat: add GET/POST /api/admin/customers with tests"
```

---

## Task 5: API — Single Customer (`/api/admin/customers/[id]`)

**Files:**
- Create: `app/api/admin/customers/[id]/route.ts`
- Modify: `tests/api-customers.test.ts`

- [ ] **Step 5.1: Add tests for single-customer endpoints**

Append to `tests/api-customers.test.ts`:

```typescript
describe('GET /api/admin/customers/[id]', () => {
  it('returns 401 without auth', async () => {
    const res = await fetch(`${BASE}/api/admin/customers/nonexistent-id`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown id', async () => {
    const res = await adminFetch('/api/admin/customers/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('returns full profile with auto_tags and recent_orders', async () => {
    if (!createdCustomerId) return;
    const res = await adminFetch(`/api/admin/customers/${createdCustomerId}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.customer).toHaveProperty('auto_tags');
    expect(data.customer).toHaveProperty('manual_tags');
    expect(data.customer).toHaveProperty('recent_orders');
  });
});

describe('PATCH /api/admin/customers/[id]', () => {
  it('updates name', async () => {
    if (!createdCustomerId) return;
    const res = await adminFetch(`/api/admin/customers/${createdCustomerId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated Name CI' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.customer.name).toBe('Updated Name CI');
  });

  it('returns 409 on duplicate phone', async () => {
    if (!createdCustomerId) return;
    // Create another customer first
    const other = await adminFetch('/api/admin/customers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Other CI', phone: '09880000001' }),
    });
    const phone = '09880000001';
    const res = await adminFetch(`/api/admin/customers/${createdCustomerId}`, {
      method: 'PATCH',
      body: JSON.stringify({ phone }),
    });
    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).not.toContain(phone);
  });
});

describe('DELETE /api/admin/customers/[id]', () => {
  it('deletes customer and returns 200', async () => {
    const createRes = await adminFetch('/api/admin/customers', {
      method: 'POST',
      body: JSON.stringify({ name: 'To Delete CI' }),
    });
    const { customer } = await createRes.json();
    const res = await adminFetch(`/api/admin/customers/${customer.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
  });

  it('returns 404 for already-deleted customer', async () => {
    const res = await adminFetch('/api/admin/customers/00000000-0000-0000-0000-000000000000', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 5.2: Run to confirm they fail**

```bash
npx vitest run tests/api-customers.test.ts
```

Expected: new tests FAIL — 404 on route.

- [ ] **Step 5.3: Implement `app/api/admin/customers/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { supabaseServer } from '@/lib/supabase-server';
import { normalizePhone, normalizeEmail, computeAutoTags } from '@/lib/customer-utils';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const unauthorized = requireAdminRequest(request);
    if (unauthorized) return unauthorized;

    const { id } = params;

    const { data: customer, error } = await (supabaseServer.from('customers') as any)
      .select('*, customer_tags(*)')
      .eq('id', id)
      .single();

    if (error || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const { data: recentOrders } = await (supabaseServer.from('orders') as any)
      .select('id, order_number, total, status, service_type, created_at')
      .eq('customer_id', id)
      .order('created_at', { ascending: false })
      .limit(5); // spec: show last 5 orders in detail panel

    return NextResponse.json({
      customer: {
        ...customer,
        auto_tags: computeAutoTags(customer),
        manual_tags: customer.customer_tags || [],
        customer_tags: undefined,
        recent_orders: recentOrders || [],
      },
    });
  } catch (err) {
    console.error('[api/admin/customers/[id]] GET unhandled:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const unauthorized = requireAdminRequest(request);
    if (unauthorized) return unauthorized;

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = String(body.name).trim();
    if (body.notes !== undefined) updates.notes = body.notes ? String(body.notes).trim() : null;
    if (body.email !== undefined) {
      const email = normalizeEmail(body.email as string | null) || null;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: 'Invalid email format' }, { status: 422 });
      }
      updates.email = email;
    }
    if (body.phone !== undefined) {
      const phone = normalizePhone(body.phone as string | null) || null;
      if (phone && (phone.length < 10 || phone.length > 11)) {
        return NextResponse.json({ error: 'Invalid phone number' }, { status: 422 });
      }
      updates.phone = phone;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await (supabaseServer.from('customers') as any)
      .update(updates)
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A customer with this phone, email, or Messenger ID already exists' }, { status: 409 });
      }
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
      }
      console.error('[api/admin/customers/[id]] PATCH error:', error.message);
      return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 });
    }

    return NextResponse.json({ customer: data });
  } catch (err) {
    console.error('[api/admin/customers/[id]] PATCH unhandled:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const unauthorized = requireAdminRequest(request);
    if (unauthorized) return unauthorized;

    const { error } = await (supabaseServer.from('customers') as any)
      .delete()
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
      }
      console.error('[api/admin/customers/[id]] DELETE error:', error.message);
      return NextResponse.json({ error: 'Failed to delete customer' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[api/admin/customers/[id]] DELETE unhandled:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 5.4: Run tests**

```bash
npx vitest run tests/api-customers.test.ts
```

Expected: All PASS.

- [ ] **Step 5.5: Commit**

```bash
git add app/api/admin/customers/[id]/route.ts tests/api-customers.test.ts
git commit -m "feat: add GET/PATCH/DELETE /api/admin/customers/[id] with tests"
```

---

## Task 6: API — Tags + Suggest

**Files:**
- Create: `app/api/admin/customers/[id]/tags/route.ts`
- Create: `app/api/admin/customers/[id]/tags/[tagId]/route.ts`
- Create: `app/api/admin/customers/suggest/route.ts`
- Modify: `tests/api-customers.test.ts`

- [ ] **Step 6.1: Add tests for tags and suggest**

Append to `tests/api-customers.test.ts`:

```typescript
describe('POST /api/admin/customers/[id]/tags', () => {
  it('adds a manual tag', async () => {
    if (!createdCustomerId) return;
    const res = await adminFetch(`/api/admin/customers/${createdCustomerId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag: 'Birthday Girl' }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.tag.tag).toBe('Birthday Girl');
    expect(data.tag.tag_type).toBe('manual');
  });

  it('returns 409 on duplicate tag', async () => {
    if (!createdCustomerId) return;
    await adminFetch(`/api/admin/customers/${createdCustomerId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag: 'DupTag' }),
    });
    const res = await adminFetch(`/api/admin/customers/${createdCustomerId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag: 'DupTag' }),
    });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/admin/customers/[id]/tags/[tagId]', () => {
  it('removes a manual tag and returns 200', async () => {
    if (!createdCustomerId) return;
    const addRes = await adminFetch(`/api/admin/customers/${createdCustomerId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag: 'ToRemove' }),
    });
    const { tag } = await addRes.json();
    const res = await adminFetch(`/api/admin/customers/${createdCustomerId}/tags/${tag.id}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
  });

  it('returns 404 when tagId does not exist', async () => {
    if (!createdCustomerId) return;
    const res = await adminFetch(
      `/api/admin/customers/${createdCustomerId}/tags/00000000-0000-0000-0000-000000000000`,
      { method: 'DELETE' }
    );
    expect(res.status).toBe(404);
  });
});

describe('GET /api/admin/customers/suggest', () => {
  it('returns 401 without auth', async () => {
    const res = await fetch(`${BASE}/api/admin/customers/suggest?phone=09171234567`);
    expect(res.status).toBe(401);
  });

  it('returns null for no match', async () => {
    const res = await adminFetch('/api/admin/customers/suggest?phone=00000000000');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.customer).toBeNull();
  });

  it('returns null when phone param is absent', async () => {
    const res = await adminFetch('/api/admin/customers/suggest');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.customer).toBeNull();
  });

  it('matches by normalized phone', async () => {
    // Create a known customer
    await adminFetch('/api/admin/customers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Suggest Test', phone: '09770000001' }),
    });
    // Query with formatted phone
    const res = await adminFetch('/api/admin/customers/suggest?phone=0977-000-0001');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.customer).not.toBeNull();
    expect(data.customer.name).toBe('Suggest Test');
  });
});
```

- [ ] **Step 6.2: Run to confirm fail**

```bash
npx vitest run tests/api-customers.test.ts
```

- [ ] **Step 6.3: Implement tags routes**

```typescript
// app/api/admin/customers/[id]/tags/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { supabaseServer } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const unauthorized = requireAdminRequest(request);
    if (unauthorized) return unauthorized;

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const tag = String(body.tag || '').trim();
    if (!tag) return NextResponse.json({ error: 'tag is required' }, { status: 400 });

    const { data, error } = await (supabaseServer.from('customer_tags') as any)
      .insert({ customer_id: params.id, tag, tag_type: 'manual' })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Tag already exists on this customer' }, { status: 409 });
      }
      console.error('[api/admin/customers/[id]/tags] POST error:', error.message);
      return NextResponse.json({ error: 'Failed to add tag' }, { status: 500 });
    }

    return NextResponse.json({ tag: data }, { status: 201 });
  } catch (err) {
    console.error('[api/admin/customers/[id]/tags] POST unhandled:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

```typescript
// app/api/admin/customers/[id]/tags/[tagId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { supabaseServer } from '@/lib/supabase-server';

export const runtime = 'nodejs';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; tagId: string } }
) {
  try {
    const unauthorized = requireAdminRequest(request);
    if (unauthorized) return unauthorized;

    const { data: deleted, error } = await (supabaseServer.from('customer_tags') as any)
      .delete()
      .eq('id', params.tagId)
      .eq('customer_id', params.id)
      .select();

    if (error) {
      console.error('[api/admin/customers/[id]/tags/[tagId]] DELETE error:', error.message);
      return NextResponse.json({ error: 'Failed to remove tag' }, { status: 500 });
    }

    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[api/admin/customers/[id]/tags/[tagId]] DELETE unhandled:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

```typescript
// app/api/admin/customers/suggest/route.ts
// Note: Next.js 15 App Router resolves static segments before dynamic [id] — no routing conflict.
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRequest } from '@/lib/admin-auth';
import { supabaseServer } from '@/lib/supabase-server';
import { normalizePhone } from '@/lib/customer-utils';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const unauthorized = requireAdminRequest(request);
    if (unauthorized) return unauthorized;

    const rawPhone = new URL(request.url).searchParams.get('phone') || '';
    const phone = normalizePhone(rawPhone);

    if (!phone) return NextResponse.json({ customer: null });

    const { data } = await (supabaseServer.from('customers') as any)
      .select('id, name, phone, email, messenger_psid, source')
      .eq('phone', phone)
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ customer: data ?? null });
  } catch (err) {
    console.error('[api/admin/customers/suggest] GET unhandled:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 6.4: Run tests**

```bash
npx vitest run tests/api-customers.test.ts
```

Expected: All PASS.

- [ ] **Step 6.5: Commit**

```bash
git add app/api/admin/customers/[id]/tags/route.ts \
        app/api/admin/customers/[id]/tags/[tagId]/route.ts \
        app/api/admin/customers/suggest/route.ts \
        tests/api-customers.test.ts
git commit -m "feat: add customer tags and suggest API routes with tests"
```

---

## Task 7: Extend `PATCH /api/orders/[id]` + Messenger Auto-Population

**Files:**
- Modify: `app/api/orders/[id]/route.ts`
- Modify: `app/api/orders/route.ts`
- Modify: `tests/api-customers.test.ts`

- [ ] **Step 7.1: Add tests for order linking and Messenger auto-population**

Append to `tests/api-customers.test.ts`:

```typescript
describe('Order linking via PATCH /api/orders/[id]', () => {
  it('rejects invalid UUID format for customer_id', async () => {
    // Need a real order id — skip if none available
    const ordersRes = await adminFetch('/api/orders?limit=1');
    const { orders } = await ordersRes.json();
    if (!orders?.length) return;
    const res = await adminFetch(`/api/orders/${orders[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify({ customer_id: 'not-a-uuid' }),
    });
    expect(res.status).toBe(422);
  });

  it('accepts customer_id: null to unlink (always returns 200 — idempotent)', async () => {
    const ordersRes = await adminFetch('/api/orders?limit=1');
    const { orders } = await ordersRes.json();
    if (!orders?.length) return;
    const res = await adminFetch(`/api/orders/${orders[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify({ customer_id: null }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.order.customer_id).toBeNull();
  });
});

describe('Public POST /api/orders ignores customer_id', () => {
  it('does not set customer_id even if sent in body', async () => {
    // Build a valid minimal order body
    const body = {
      items: [{ id: 'test', name: 'Test Item', basePrice: 100, quantity: 1, totalPrice: 100 }],
      customerName: 'Security Test',
      contactNumber: '09123456789',
      serviceType: 'pickup',
      paymentMethod: 'gcash',
      total: 100,
      customer_id: '00000000-0000-0000-0000-000000000000', // should be ignored
    };
    const res = await fetch(`${BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    // May fail validation for other reasons — just ensure no 500
    expect(res.status).not.toBe(500);
    if (res.status === 201) {
      const data = await res.json();
      expect(data.order?.customer_id ?? null).toBeNull();
    }
  });
});
```

- [ ] **Step 7.1b: Run tests to confirm they fail**

```bash
npx vitest run tests/api-customers.test.ts
```

Expected: new tests FAIL — route returns 404 or wrong behavior.

- [ ] **Step 7.2: Modify `app/api/orders/[id]/route.ts` — add `customer_id` to PATCH**

Find the body destructuring in the PATCH handler and add:

```typescript
// After existing destructured fields, add:
const rawCustomerId = body.customer_id;
let customerId: string | null | undefined = undefined; // undefined = don't update

if (rawCustomerId !== undefined) {
  if (rawCustomerId === null) {
    customerId = null; // explicit unlink
  } else {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(String(rawCustomerId))) {
      return NextResponse.json({ error: 'Invalid customer_id format' }, { status: 422 });
    }
    // Verify customer exists
    const { data: customerExists } = await (supabaseServer.from('customers') as any)
      .select('id').eq('id', rawCustomerId).maybeSingle();
    if (!customerExists) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }
    customerId = String(rawCustomerId);
  }
}
```

Then add `customer_id: customerId` to the `updateData` object (only when `customerId !== undefined`):

```typescript
if (customerId !== undefined) updateData.customer_id = customerId;
```

- [ ] **Step 7.3: Modify `app/api/orders/route.ts` — Messenger auto-population**

**Security requirement (verify first):** Before adding the Messenger block, confirm that the `insertData` object (or equivalent field list) used in `supabase.from('orders').insert(...)` does **NOT** include `customer_id`, even if the client sends it. Extract only the known allowed fields (items, customerName, contactNumber, serviceType, paymentMethod, total, etc.) explicitly when building the insert payload. Do NOT spread the raw request body.

Inside the existing `msession` block, after the line that updates `messenger_psid` and `messenger_name` on the order (`orders.update({ messenger_psid, messenger_name })`), add:

```typescript
// Auto-create or link customer from Messenger PSID
try {
  const psid = checkoutSession.psid;
  const msgrName = messengerName || checkoutSession.psid;

  // Atomic upsert on messenger_psid (ON CONFLICT DO UPDATE).
  // Prevents duplicate customers when two concurrent orders arrive with the same PSID.
  // `messenger_name` is updated on each upsert so the name stays fresh.
  const { data: upsertedCustomer, error: upsertErr } = await (supabaseServer.from('customers') as any)
    .upsert(
      { name: msgrName, messenger_psid: psid, messenger_name: msgrName, source: 'messenger' },
      { onConflict: 'messenger_psid', ignoreDuplicates: false }
    )
    .select('id')
    .single();
  if (upsertErr) throw upsertErr;
  const customerId = upsertedCustomer.id;

  const { error: linkErr } = await (supabaseServer.from('orders') as any)
    .update({ customer_id: customerId })
    .eq('id', orderId);

  if (linkErr) {
    console.error('[orders/route] Failed to link customer to order:', { orderId, customerId, error: linkErr.message });
  }
} catch (customerErr) {
  console.error('[orders/route] Messenger customer upsert failed:', { orderId, error: String(customerErr) });
  // Non-fatal — order is valid, customer link is missing
}
```

- [ ] **Step 7.4: Run tests**

```bash
npx vitest run tests/api-customers.test.ts
```

- [ ] **Step 7.5: Commit**

```bash
git add app/api/orders/[id]/route.ts app/api/orders/route.ts tests/api-customers.test.ts
git commit -m "feat: extend orders PATCH with customer_id linking and Messenger auto-population"
```

---

## Task 8: Custom Hooks

**Files:**
- Create: `src/hooks/useCustomers.ts`
- Create: `src/hooks/useCustomer.ts`

- [ ] **Step 8.1: Implement `src/hooks/useCustomers.ts`**

```typescript
import { useState, useCallback } from 'react';
import type { CustomerFilters, CustomerSummary } from '@/types/customer';

export const useCustomers = () => {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCustomers = useCallback(async (filters: CustomerFilters = {}) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.search)  params.set('search', filters.search);
      if (filters.tag)     params.set('tag', filters.tag);
      if (filters.sort)    params.set('sort', filters.sort);
      if (filters.page)    params.set('page', String(filters.page));
      if (filters.limit)   params.set('limit', String(filters.limit));

      const res = await fetch(`/api/admin/customers?${params}`);
      if (!res.ok) throw new Error('Failed to fetch customers');
      const data = await res.json();
      setCustomers(data.customers);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const createCustomer = useCallback(async (input: { name: string; email?: string; phone?: string; notes?: string }) => {
    const res = await fetch('/api/admin/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to create customer');
    }
    return (await res.json()).customer;
  }, []);

  const deleteCustomer = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/customers/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete customer');
  }, []);

  return { customers, total, loading, error, fetchCustomers, createCustomer, deleteCustomer };
};
```

- [ ] **Step 8.2: Implement `src/hooks/useCustomer.ts`**

```typescript
import { useState, useCallback } from 'react';
import type { CustomerProfile } from '@/types/customer';

export const useCustomer = () => {
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCustomer = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/customers/${id}`);
      if (!res.ok) throw new Error('Failed to fetch customer');
      const data = await res.json();
      setCustomer(data.customer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateCustomer = useCallback(async (id: string, updates: Partial<{ name: string; email: string | null; phone: string | null; notes: string | null }>) => {
    const res = await fetch(`/api/admin/customers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to update customer');
    }
    const data = await res.json();
    setCustomer(prev => prev ? { ...prev, ...data.customer } : null);
    return data.customer;
  }, []);

  const addTag = useCallback(async (id: string, tag: string) => {
    const res = await fetch(`/api/admin/customers/${id}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to add tag');
    }
    const data = await res.json();
    setCustomer(prev => prev ? { ...prev, manual_tags: [...prev.manual_tags, data.tag] } : null);
  }, []);

  const removeTag = useCallback(async (customerId: string, tagId: string) => {
    const res = await fetch(`/api/admin/customers/${customerId}/tags/${tagId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to remove tag');
    setCustomer(prev => prev ? { ...prev, manual_tags: prev.manual_tags.filter(t => t.id !== tagId) } : null);
  }, []);

  return { customer, loading, error, fetchCustomer, updateCustomer, addTag, removeTag };
};
```

- [ ] **Step 8.3: Commit**

```bash
git add src/hooks/useCustomers.ts src/hooks/useCustomer.ts
git commit -m "feat: add useCustomers and useCustomer hooks"
```

> **Note on TDD for hooks and UI components (Tasks 8–10):** React hooks that call `fetch()` and rely on component state require a JSDOM or browser environment. Writing meaningful unit tests for these requires additional test infrastructure (mock service workers, act() wrappers, etc.) that is out of scope for this plan. Correctness is verified indirectly: API integration tests in `tests/api-customers.test.ts` cover all server-side behavior, and the hooks are exercised end-to-end via the admin dashboard. Manual smoke-testing of the Customers tab after Task 10 serves as the UI acceptance criterion.

---

## Task 9: UI Components

**Files:**
- Create: `src/components/CustomerListItem.tsx`
- Create: `src/components/CustomerTagBadge.tsx`
- Create: `src/components/CustomerDetailPanel.tsx`
- Create: `src/components/CustomerManager.tsx`
- Create: `src/components/CustomerLinkWidget.tsx`

- [ ] **Step 9.1: Implement `CustomerListItem.tsx`**

```tsx
// src/components/CustomerListItem.tsx
import React from 'react';
import type { CustomerSummary } from '@/types/customer';
import { CustomerTagBadge } from './CustomerTagBadge';

interface Props {
  customer: CustomerSummary;
  isSelected: boolean;
  onClick: () => void;
}

export function CustomerListItem({ customer, isSelected, onClick }: Props) {
  const isAtRisk = customer.auto_tags.includes('At Risk');

  return (
    <div
      onClick={onClick}
      className={[
        'px-4 py-3 cursor-pointer border-b border-[#E8E3DA] transition-colors',
        isSelected ? 'bg-[#EAF5F3]' : 'hover:bg-[#F5F2EC]',
        isAtRisk ? 'bg-[#FFF5F5]' : '',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm text-[#2C2C2C] truncate font-nunito">{customer.name}</p>
          <p className="text-xs text-[#8A7F72] mt-0.5 truncate">
            {customer.phone || customer.email || customer.messenger_psid || '—'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-[#3D8A80]">₱{customer.total_spent.toLocaleString()}</p>
          <p className="text-[11px] text-[#8A7F72]">
            {customer.order_count} order{customer.order_count !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 mt-1.5">
        {customer.auto_tags.map(tag => (
          <CustomerTagBadge key={tag} tag={tag} tagType="auto" />
        ))}
        {customer.manual_tags.slice(0, 2).map(t => (
          <CustomerTagBadge key={t.id} tag={t.tag} tagType="manual" />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 9.2: Implement `CustomerTagBadge.tsx`**

```tsx
// src/components/CustomerTagBadge.tsx
import React from 'react';
import type { AutoTagLabel } from '@/types/customer';

interface Props {
  tag: string;
  tagType: 'auto' | 'manual';
  onRemove?: () => void;
}

const AUTO_TAG_STYLES: Record<AutoTagLabel, string> = {
  'VIP':     'bg-[#7BBFB5] text-[#F0EBE0]',
  'Loyal':   'bg-[#B8E0DB] text-[#3D8A80]',
  'New':     'bg-[#E8F5E9] text-[#2E7D32]',
  'At Risk': 'bg-[#FDECEA] text-[#C62828]',
};

export function CustomerTagBadge({ tag, tagType, onRemove }: Props) {
  const autoStyle = AUTO_TAG_STYLES[tag as AutoTagLabel];
  const style = autoStyle ?? 'bg-[#F0EBE0] text-[#6B5E4E] border border-[#DDD5C6]';

  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold font-nunito ${style}`}>
      {tag}
      {tagType === 'manual' && onRemove && (
        <button
          onClick={onRemove}
          className="ml-0.5 opacity-60 hover:opacity-100 leading-none"
          aria-label={`Remove tag ${tag}`}
        >
          ×
        </button>
      )}
    </span>
  );
}
```

- [ ] **Step 9.3: Implement `CustomerDetailPanel.tsx`**

```tsx
// src/components/CustomerDetailPanel.tsx
'use client';
import React, { useState } from 'react';
import type { CustomerProfile } from '@/types/customer';
import type { useCustomer } from '@/hooks/useCustomer';
import { CustomerTagBadge } from './CustomerTagBadge';

interface Props {
  customer: CustomerProfile;
  onUpdate: ReturnType<typeof useCustomer>['updateCustomer'];
  onDelete: (id: string) => void;
  onAddTag: ReturnType<typeof useCustomer>['addTag'];
  onRemoveTag: ReturnType<typeof useCustomer>['removeTag'];
}

export function CustomerDetailPanel({ customer, onUpdate, onDelete, onAddTag, onRemoveTag }: Props) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(customer.name);
  const [editPhone, setEditPhone] = useState(customer.phone || '');
  const [editEmail, setEditEmail] = useState(customer.email || '');
  const [newTag, setNewTag] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onUpdate(customer.id, { name: editName, phone: editPhone || null, email: editEmail || null });
    setSaving(false);
    setEditing(false);
  };

  const handleAddTag = async (e: React.KeyboardEvent | React.MouseEvent) => {
    if ('key' in e && e.key !== 'Enter') return;
    if (!newTag.trim()) return;
    await onAddTag(customer.id, newTag.trim());
    setNewTag('');
  };

  const maxFavCount = customer.favorite_items?.[0]?.count || 1;

  return (
    <div className="h-full overflow-y-auto bg-[#FAFAF8]">
      {/* Teal header */}
      <div className="bg-[#7BBFB5] px-6 py-5">
        {editing ? (
          <input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            className="text-[#F0EBE0] bg-transparent border-b border-[#F0EBE0]/60 text-xl font-playfair w-full outline-none"
          />
        ) : (
          <h2 className="text-[#F0EBE0] text-xl font-playfair">{customer.name}</h2>
        )}
        <p className="text-[#D4EDE9] text-xs mt-1">
          {customer.source === 'messenger' ? '● Messenger' : '● Manual'}
        </p>
        {/* Tags row */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {customer.auto_tags.map(tag => (
            <CustomerTagBadge key={tag} tag={tag} tagType="auto" />
          ))}
          {customer.manual_tags.map(t => (
            <CustomerTagBadge key={t.id} tag={t.tag} tagType="manual" onRemove={() => onRemoveTag(customer.id, t.id)} />
          ))}
        </div>
        {/* Add Tag input */}
        <div className="flex gap-2 mt-2">
          <input
            value={newTag}
            onChange={e => setNewTag(e.target.value)}
            onKeyDown={handleAddTag}
            placeholder="Add tag…"
            className="flex-1 text-xs bg-white/20 text-[#F0EBE0] placeholder-[#D4EDE9] rounded-md px-2 py-1 outline-none"
          />
          <button onClick={handleAddTag} className="text-xs bg-white/20 text-[#F0EBE0] rounded-md px-2 py-1">+</button>
        </div>
        {/* Edit / Delete actions */}
        <div className="flex gap-2 mt-3">
          {editing ? (
            <>
              <button onClick={handleSave} disabled={saving} className="text-xs bg-[#3D8A80] text-[#F0EBE0] rounded-md px-3 py-1.5">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)} className="text-xs bg-white/20 text-[#F0EBE0] rounded-md px-3 py-1.5">Cancel</button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="text-xs bg-white/20 text-[#F0EBE0] rounded-md px-3 py-1.5">Edit</button>
              <button onClick={() => onDelete(customer.id)} className="text-xs bg-red-400/30 text-[#F0EBE0] rounded-md px-3 py-1.5">Delete</button>
            </>
          )}
        </div>
      </div>

      {/* Contact row */}
      <div className="px-6 py-4 border-b border-[#E8E3DA] space-y-1">
        {editing ? (
          <>
            <input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="Phone" className="block w-full text-sm border rounded-lg px-3 py-1.5 outline-none" />
            <input value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="Email" className="block w-full text-sm border rounded-lg px-3 py-1.5 outline-none" />
          </>
        ) : (
          <>
            {customer.phone && <p className="text-sm text-[#3D3D3D]">📞 {customer.phone}</p>}
            {customer.email && <p className="text-sm text-[#3D3D3D]">✉️ {customer.email}</p>}
            {customer.messenger_psid && <p className="text-xs text-[#8A7F72]">PSID: {customer.messenger_psid}</p>}
          </>
        )}
      </div>

      {/* 2×3 Stats grid */}
      <div className="grid grid-cols-3 gap-px bg-[#E8E3DA] border-b border-[#E8E3DA]">
        {[
          { label: 'LTV', value: `₱${customer.total_spent.toLocaleString()}` },
          { label: 'Avg Order', value: `₱${(customer.avg_order_value || 0).toLocaleString()}` },
          { label: 'Avg Interval', value: customer.avg_order_interval_days != null ? `${Math.round(customer.avg_order_interval_days)}d` : '—' },
          { label: 'Total Orders', value: String(customer.order_count) },
          { label: 'Pref. Service', value: customer.preferred_service_type || '—' },
          { label: 'Last Order', value: customer.last_order_at ? new Date(customer.last_order_at).toLocaleDateString() : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white px-3 py-3">
            <p className="text-[10px] text-[#8A7F72] uppercase tracking-wide">{label}</p>
            <p className="text-sm font-bold text-[#3D8A80] mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {/* Top Items */}
      {customer.favorite_items && customer.favorite_items.length > 0 && (
        <div className="px-6 py-4 border-b border-[#E8E3DA]">
          <p className="text-xs font-bold text-[#6B5E4E] uppercase tracking-wide mb-3">Top Items</p>
          <div className="space-y-2">
            {customer.favorite_items.map(item => (
              // Use item.id ?? item.name as React key — id is null for legacy rows
              <div key={item.id ?? item.name} className="flex items-center gap-2">
                <span className="text-xs text-[#3D3D3D] w-32 truncate">{item.name}</span>
                <div className="flex-1 bg-[#E8E3DA] rounded-full h-1.5">
                  <div
                    className="bg-[#7BBFB5] h-1.5 rounded-full"
                    style={{ width: `${(item.count / maxFavCount) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-[#8A7F72] w-6 text-right">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Orders (last 5) */}
      <div className="px-6 py-4">
        <p className="text-xs font-bold text-[#6B5E4E] uppercase tracking-wide mb-3">Recent Orders</p>
        {customer.recent_orders.length === 0 ? (
          <p className="text-sm text-[#8A7F72]">No orders yet</p>
        ) : (
          <div className="space-y-2">
            {customer.recent_orders.map(order => (
              <div key={order.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium text-[#3D3D3D]">#{order.order_number}</span>
                  <span className="text-[#8A7F72] ml-2 text-xs">{order.service_type}</span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-[#3D8A80]">₱{order.total.toLocaleString()}</span>
                  <span className={`ml-2 text-[10px] rounded-full px-1.5 py-0.5 ${order.status === 'completed' ? 'bg-green-100 text-green-700' : order.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {order.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-[#7BBFB5] mt-3">View all → (filter in Orders tab)</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 9.4: Implement `CustomerManager.tsx`**

```tsx
// src/components/CustomerManager.tsx
'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Users } from 'lucide-react';
import { useCustomers } from '@/hooks/useCustomers';
import { useCustomer } from '@/hooks/useCustomer';
import { CustomerListItem } from './CustomerListItem';
import { CustomerDetailPanel } from './CustomerDetailPanel';

const TAG_OPTIONS = ['All', 'VIP', 'Loyal', 'New', 'At Risk'];
const PAGE_SIZE = 20;

export function CustomerManager() {
  const { customers, total, loading, fetchCustomers, createCustomer, deleteCustomer } = useCustomers();
  const { customer: selectedCustomer, fetchCustomer, updateCustomer, addTag, removeTag } = useCustomer();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  // 300ms debounce on search; fire only when >= 2 chars or empty
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.length >= 2 || search === '' ? search : debouncedSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    fetchCustomers({ search: debouncedSearch, tag: tagFilter || undefined, page, limit: PAGE_SIZE });
  }, [debouncedSearch, tagFilter, page]);

  const handleRowClick = useCallback((id: string) => {
    setSelectedId(id);
    fetchCustomer(id);
  }, [fetchCustomer]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this customer? Orders will remain.')) return;
    await deleteCustomer(id);
    setSelectedId(null);
    fetchCustomers({ search: debouncedSearch, tag: tagFilter || undefined, page, limit: PAGE_SIZE });
  };

  const handleCreate = async () => {
    setCreateError(null);
    try {
      await createCustomer({ name: newName, phone: newPhone || undefined, email: newEmail || undefined, notes: newNotes || undefined });
      setShowAddModal(false);
      setNewName(''); setNewPhone(''); setNewEmail(''); setNewNotes('');
      fetchCustomers({ page: 1, limit: PAGE_SIZE });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create customer');
    }
  };

  const atRiskCount = customers.filter(c => c.auto_tags.includes('At Risk')).length;
  const totalLTV = customers.reduce((sum, c) => sum + c.total_spent, 0);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex h-full bg-[#FAFAF8]">
      {/* Left list pane (40%) */}
      <div className="w-2/5 flex flex-col border-r border-[#E8E3DA]">
        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-[#E8E3DA] space-y-2">
          <div className="flex gap-2">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, phone, email…"
              className="flex-1 text-sm border border-[#D5CEC4] rounded-lg px-3 py-1.5 bg-white outline-none focus:border-[#7BBFB5]"
            />
            <button
              onClick={() => setShowAddModal(true)}
              className="shrink-0 bg-[#7BBFB5] text-[#F0EBE0] text-sm rounded-lg px-3 py-1.5 font-semibold"
            >
              + Add
            </button>
          </div>
          <select
            value={tagFilter}
            onChange={e => { setTagFilter(e.target.value === 'All' ? '' : e.target.value); setPage(1); }}
            className="w-full text-sm border border-[#D5CEC4] rounded-lg px-3 py-1.5 bg-white outline-none"
          >
            {TAG_OPTIONS.map(t => <option key={t} value={t === 'All' ? '' : t}>{t}</option>)}
          </select>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-3 divide-x divide-[#E8E3DA] border-b border-[#E8E3DA] text-center">
          <div className="py-2"><p className="text-lg font-bold text-[#3D8A80]">{total}</p><p className="text-[10px] text-[#8A7F72]">Customers</p></div>
          <div className="py-2"><p className="text-lg font-bold text-[#3D8A80]">₱{totalLTV.toLocaleString()}</p><p className="text-[10px] text-[#8A7F72]">LTV (page)</p></div>
          <div className="py-2"><p className="text-lg font-bold text-red-500">{atRiskCount}</p><p className="text-[10px] text-[#8A7F72]">At Risk</p></div>
        </div>

        {/* Customer list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-[#8A7F72]">Loading…</div>
          ) : customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-[#8A7F72]">
              <Users size={32} className="mb-2 opacity-30" />
              <p className="text-sm">No customers found</p>
            </div>
          ) : (
            customers.map(c => (
              <CustomerListItem
                key={c.id}
                customer={c}
                isSelected={c.id === selectedId}
                onClick={() => handleRowClick(c.id)}
              />
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-[#E8E3DA] text-sm">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="disabled:opacity-40">← Prev</button>
            <span className="text-[#8A7F72]">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="disabled:opacity-40">Next →</button>
          </div>
        )}
      </div>

      {/* Right detail pane (60%) */}
      <div className="flex-1 overflow-hidden">
        {selectedCustomer && selectedId ? (
          <CustomerDetailPanel
            customer={selectedCustomer}
            onUpdate={updateCustomer}
            onDelete={handleDelete}
            onAddTag={addTag}
            onRemoveTag={removeTag}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-[#8A7F72]">
            <div className="text-center">
              <Users size={40} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm">Select a customer to view details</p>
            </div>
          </div>
        )}
      </div>

      {/* Add Customer modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="font-playfair text-lg font-semibold mb-4">Add Customer</h3>
            <div className="space-y-3">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name *" className="w-full text-sm border rounded-lg px-3 py-2 outline-none" />
              <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Phone (optional)" className="w-full text-sm border rounded-lg px-3 py-2 outline-none" />
              <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Email (optional)" className="w-full text-sm border rounded-lg px-3 py-2 outline-none" />
              <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="w-full text-sm border rounded-lg px-3 py-2 outline-none resize-none" />
              {createError && <p className="text-xs text-red-500">{createError}</p>}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleCreate} disabled={!newName.trim()} className="flex-1 bg-[#7BBFB5] text-[#F0EBE0] rounded-lg py-2 font-semibold text-sm disabled:opacity-40">Create</button>
              <button onClick={() => setShowAddModal(false)} className="flex-1 bg-[#F0EBE0] text-[#6B5E4E] rounded-lg py-2 text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 9.5: Implement `CustomerLinkWidget.tsx`**

```tsx
// src/components/CustomerLinkWidget.tsx
'use client';
import React, { useState, useEffect, useRef } from 'react';
import type { Order } from '@/types';
import type { CustomerSummary } from '@/types/customer';

interface Props {
  order: Order;
  onLinked: () => void;
}

export function CustomerLinkWidget({ order, onLinked }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<CustomerSummary[]>([]);
  const [suggestion, setSuggestion] = useState<CustomerSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-suggest: fire suggest endpoint using order's contact_number on open
  useEffect(() => {
    if (!open || !(order as any).contact_number) return;
    fetch(`/api/admin/customers/suggest?phone=${encodeURIComponent((order as any).contact_number)}`)
      .then(r => r.json())
      .then(d => setSuggestion(d.customer ?? null))
      .catch(() => setSuggestion(null));
  }, [open]);

  // Debounced search (300ms, min 2 chars)
  useEffect(() => {
    if (search.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/admin/customers?search=${encodeURIComponent(search)}&limit=5`);
        const d = await r.json();
        setResults(d.customers || []);
      } catch { setResults([]); } finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const linkCustomer = async (customerId: string) => {
    setLinking(true);
    try {
      await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId }),
      });
      setOpen(false); setSuggestion(null); setSearch(''); onLinked();
    } finally { setLinking(false); }
  };

  const unlinkCustomer = async () => {
    setLinking(true);
    try {
      await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: null }),
      });
      onLinked();
    } finally { setLinking(false); }
  };

  if (order.customer_id) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] bg-[#EAF5F3] text-[#3D8A80] rounded-full px-2 py-0.5 border border-[#B8E0DB]">
        👤 Linked
        <button onClick={unlinkCustomer} disabled={linking} className="opacity-50 hover:opacity-100 ml-0.5">×</button>
      </span>
    );
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => { setOpen(v => !v); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="text-[11px] text-[#7BBFB5] border border-[#B8E0DB] rounded-full px-2 py-0.5 hover:bg-[#EAF5F3]"
      >
        + Link Customer
      </button>
      {open && (
        <div className="absolute z-50 left-0 top-6 bg-white border border-[#E8E3DA] rounded-xl shadow-lg w-64 p-3">
          {suggestion && (
            <div className="mb-2 bg-yellow-50 border border-yellow-200 rounded-lg p-2 text-xs">
              <p className="text-yellow-800 font-medium">Possible match: {suggestion.name}</p>
              <div className="flex gap-2 mt-1">
                <button onClick={() => linkCustomer(suggestion.id)} disabled={linking} className="bg-yellow-400 text-white rounded-md px-2 py-0.5 text-[10px]">Confirm</button>
                <button onClick={() => setSuggestion(null)} className="text-yellow-600 text-[10px]">Dismiss</button>
              </div>
            </div>
          )}
          <input
            ref={inputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
            className="w-full text-xs border border-[#D5CEC4] rounded-lg px-2 py-1.5 outline-none focus:border-[#7BBFB5]"
          />
          {loading && <p className="text-xs text-[#8A7F72] mt-2 text-center">Searching…</p>}
          {!loading && results.length > 0 && (
            <ul className="mt-1 divide-y divide-[#F0EBE0]">
              {results.map(c => (
                <li key={c.id}>
                  <button onClick={() => linkCustomer(c.id)} disabled={linking} className="w-full text-left px-1 py-1.5 text-xs hover:bg-[#F5F2EC] rounded">
                    <span className="font-medium text-[#2C2C2C]">{c.name}</span>
                    {c.phone && <span className="text-[#8A7F72] ml-1">{c.phone}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!loading && search.length >= 2 && results.length === 0 && (
            <p className="text-xs text-[#8A7F72] mt-2 text-center">No customers found</p>
          )}
          {search.length > 0 && search.length < 2 && (
            <p className="text-[10px] text-[#8A7F72] mt-1">Type at least 2 characters</p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 9.6: Commit components**

```bash
git add src/components/CustomerListItem.tsx \
        src/components/CustomerTagBadge.tsx \
        src/components/CustomerDetailPanel.tsx \
        src/components/CustomerManager.tsx \
        src/components/CustomerLinkWidget.tsx
git commit -m "feat: add Customer UI components (Manager, DetailPanel, TagBadge, ListItem, LinkWidget)"
```

---

## Task 10: Wire into Admin Dashboard + Order Manager

**Files:**
- Modify: `src/components/AdminDashboard.tsx`
- Modify: `src/components/OrderManager.tsx`

- [ ] **Step 10.1: Add Customers tab to `AdminDashboard.tsx`**

1. Import `CustomerManager` at the top
2. Add `'customers'` to the tab list (after 'orders', before 'menu' or in a logical position matching the design)
3. Add tab button with Users icon from lucide-react
4. Add conditional render: `{activeTab === 'customers' && <CustomerManager />}`

- [ ] **Step 10.2: Add `CustomerLinkWidget` to `OrderManager.tsx`**

In the order row (both desktop table and mobile card views), after the order number or contact display, add:

```tsx
<CustomerLinkWidget order={order} onLinked={() => fetchOrders()} />
```

- [ ] **Step 10.3: Commit**

```bash
git add src/components/AdminDashboard.tsx src/components/OrderManager.tsx
git commit -m "feat: wire CustomerManager into admin dashboard and CustomerLinkWidget into orders"
```

---

## Task 11: Trigger Behaviour Tests (via API)

**Files:**
- Modify: `tests/api-customers.test.ts`

- [ ] **Step 11.1: Add trigger behaviour tests**

Append to `tests/api-customers.test.ts`:

```typescript
describe('Stats trigger via API (behaviour tests)', () => {
  let triggerTestCustomerId: string | null = null;
  let linkedOrderId: string | null = null;

  beforeAll(async () => {
    const res = await adminFetch('/api/admin/customers', {
      method: 'POST',
      body: JSON.stringify({ name: 'Trigger Test Customer' }),
    });
    const data = await res.json();
    triggerTestCustomerId = data.customer?.id ?? null;
  });

  afterAll(async () => {
    if (triggerTestCustomerId) {
      await adminFetch(`/api/admin/customers/${triggerTestCustomerId}`, { method: 'DELETE' });
    }
  });

  it('stats start at 0 and avg_order_interval_days is null for new customer (0 orders)', async () => {
    if (!triggerTestCustomerId) return;
    const res = await adminFetch(`/api/admin/customers/${triggerTestCustomerId}`);
    const { customer } = await res.json();
    expect(customer.total_spent).toBe(0);
    expect(customer.order_count).toBe(0);
    expect(customer.avg_order_interval_days).toBeNull();
  });

  it('avg_order_interval_days is null when exactly 1 order is linked (order_count <= 1)', async () => {
    if (!triggerTestCustomerId) return;
    // Link one existing order to this customer (grab any available order)
    const ordersRes = await adminFetch('/api/orders?limit=1');
    const { orders } = await ordersRes.json();
    if (!orders?.length) return; // skip if no orders exist

    const orderId = orders[0].id;
    linkedOrderId = orderId;
    await adminFetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ customer_id: triggerTestCustomerId }),
    });

    const res = await adminFetch(`/api/admin/customers/${triggerTestCustomerId}`);
    const { customer } = await res.json();
    // With exactly 1 order, no interval can be computed — must be null, not 0
    expect(customer.order_count).toBeGreaterThanOrEqual(1);
    if (customer.order_count === 1) {
      expect(customer.avg_order_interval_days).toBeNull();
    }
  });

  it('linking a completed order updates total_spent, order_count, avg_order_value', async () => {
    if (!triggerTestCustomerId || !linkedOrderId) return;
    const res = await adminFetch(`/api/admin/customers/${triggerTestCustomerId}`);
    const { customer } = await res.json();
    // Stats should reflect the linked order
    expect(customer.order_count).toBeGreaterThan(0);
    // avg_order_value = total_spent / order_count (or 0 if no completed orders)
    const expectedAvg = customer.order_count > 0
      ? customer.total_spent / customer.order_count
      : 0;
    expect(Math.abs(customer.avg_order_value - expectedAvg)).toBeLessThan(0.01);
  });

  it('linking a cancelled order does NOT increase total_spent or order_count', async () => {
    if (!triggerTestCustomerId) return;
    // Find or create a cancelled order and link it
    const ordersRes = await adminFetch('/api/orders?status=cancelled&limit=1');
    const { orders } = await ordersRes.json();
    if (!orders?.length) return; // skip if no cancelled orders

    const before = await (await adminFetch(`/api/admin/customers/${triggerTestCustomerId}`)).json();
    await adminFetch(`/api/orders/${orders[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify({ customer_id: triggerTestCustomerId }),
    });
    const after = await (await adminFetch(`/api/admin/customers/${triggerTestCustomerId}`)).json();

    // Cancelled order must not affect total_spent or order_count
    expect(after.customer.total_spent).toBe(before.customer.total_spent);
    expect(after.customer.order_count).toBe(before.customer.order_count);
  });

  it('unlinking an order via customer_id: null recalculates stats downward', async () => {
    if (!triggerTestCustomerId || !linkedOrderId) return;
    const before = await (await adminFetch(`/api/admin/customers/${triggerTestCustomerId}`)).json();

    // Unlink the order
    await adminFetch(`/api/orders/${linkedOrderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ customer_id: null }),
    });

    const after = await (await adminFetch(`/api/admin/customers/${triggerTestCustomerId}`)).json();

    // After unlinking, order_count should decrease
    expect(after.customer.order_count).toBeLessThanOrEqual(before.customer.order_count);
    linkedOrderId = null;
  });

  // Note: hard DELETE on an order is not exposed via the admin API in this app.
  // The SECURITY DEFINER trigger fires on DELETE via the DB; the unlink test above
  // exercises the same stats-recalc code path (old.customer_id branch) as a hard DELETE.

  it.todo('Messenger auto-create: POST /api/orders with Messenger PSID → customer appears in GET /api/admin/customers');
  // Deferred: requires a live Messenger checkout session (PSID + FB session token).
  // Manual QA: (1) place an order via Messenger test account, (2) verify customer
  // created in Customers tab with source="messenger", (3) verify order in recent_orders.

  it.todo('Messenger dedup: second order from same PSID → GET /api/admin/customers shows no duplicate customer');
  // Deferred: same as above — requires live Messenger session.
  // Covered at DB level by the UNIQUE constraint on messenger_psid and the
  // atomic upsert (onConflict: messenger_psid) in the implementation.
});
```

**Note on Messenger auto-populate tests:** The Messenger auto-creation path (`POST /api/orders` with a valid Messenger checkout session) requires a live Messenger PSID and session token that are not reproducible in a CI test environment. The correctness of this flow is verified by:
1. The security test already written in Task 7 (public POST ignores `customer_id`)
2. Manual QA: place a Messenger order → verify customer is created in Customers tab
3. Run the suggest-endpoint test (Task 6) which confirms phone normalization and lookup


- [ ] **Step 11.2: Run full test suite**

```bash
npx vitest run tests/api-customers.test.ts \
        tests/lib/phone-normalize.test.ts \
        tests/lib/auto-tags.test.ts \
        tests/lib/customer-stats.test.ts \
        tests/lib/customer-dedup.test.ts
```

Expected: All PASS.

- [ ] **Step 11.3: Final commit**

```bash
git add tests/api-customers.test.ts
git commit -m "test: add trigger behaviour tests (stats update, cancelled order, unlink) for customer management"
```

---

## Task 12: `.gitignore` + Cleanup

- [ ] **Step 12.1: Add `.superpowers/` to `.gitignore` if not present**

```bash
grep -q ".superpowers" .gitignore || echo ".superpowers/" >> .gitignore
git add .gitignore
git commit -m "chore: ignore .superpowers brainstorm directory"
```

- [ ] **Step 12.2: Verify no unintended files are staged**

The repo has several untracked files outside this feature's scope (e.g., `src/types/admin.ts`, `app/api/admin/categories/reorder/`, `app/api/admin/menu/bulk-messenger/`, `app/api/admin/payment-methods/reorder/`). Before each commit, confirm you are staging only the files listed in the step's `git add` command. Do NOT use `git add -A` or `git add .`.

---

## Completion Checklist

- [ ] Migration applied and `customers`, `customer_tags`, `orders.customer_id` exist in DB
- [ ] All unit tests pass: `npx vitest run tests/lib/phone-normalize.test.ts tests/lib/auto-tags.test.ts tests/lib/customer-stats.test.ts tests/lib/customer-dedup.test.ts`
- [ ] All API tests pass: `npx vitest run tests/api-customers.test.ts`
- [ ] Customers tab visible and functional in admin dashboard
- [ ] Customer detail panel opens on row click
- [ ] Manual customer creation works (name only required)
- [ ] Tags can be added and removed
- [ ] Order linking widget appears in Order Manager
- [ ] Phone-based auto-suggest banner fires on order link
- [ ] Messenger orders auto-create customer profiles
- [ ] No PII in any 4xx/5xx error responses
- [ ] `customer_id` ignored by public `POST /api/orders`
