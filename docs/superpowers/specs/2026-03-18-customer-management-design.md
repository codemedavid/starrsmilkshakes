# Customer Management — Design Spec
**Date:** 2026-03-18
**Project:** Starr's Famous Shakes
**Status:** Approved

---

## 1. Overview

Build a Customer Management system inside the admin dashboard that:
- Auto-creates customer profiles from Messenger orders (by PSID)
- Allows manual customer creation (name required; email + phone optional)
- Tracks ordering habits, lifetime value (LTV), and average order value per customer
- Links customers to orders (orders can exist without a linked customer)
- Provides a dedicated **Customers** tab in the existing admin dashboard

---

## 2. UI/UX

### Placement
A new **Customers** tab added to the existing admin dashboard tab bar, alongside Orders, Menu, Categories, etc.

### Layout: List + Slide-in Detail Panel
- **Left pane (40%)**: searchable, filterable customer list with a 3-cell summary strip (Total Customers, Total LTV, At Risk count)
- **Right pane (60%)**: slide-in customer detail panel — shown when a customer row is clicked

### Branding
Matches Starr's Famous Shakes brand identity:
- **Primary color**: sage teal `#7BBFB5` (topbar, buttons, active states, profile header background)
- **Cream**: `#F0EBE0` (text on teal surfaces)
- **Deep teal**: `#3D8A80` (LTV values, key numbers, links)
- **Warm backgrounds**: `#FAFAF8` / `#F2EEE8` instead of cold gray
- **Typography**: Playfair Display for customer name headings; Nunito for all body, numbers, tags
- **Rounded corners** (12px cards, 10px inputs/buttons) — friendly, consistent with brand

### Customer List Row
Each row shows: name, contact info (phone/email), tags (auto + manual), LTV, order count, last order date. At-risk rows have a subtle red background tint.

### Customer Detail Panel
Sections (top to bottom):
1. **Teal profile header** — name (Playfair), source (Messenger dot or Manual), tag chips + Add Tag, Edit/Delete actions
2. **Contact row** — phone, email, PSID (if Messenger)
3. **Stats grid (2 rows × 3)** — LTV, Avg Order, Avg Frequency, Total Orders, Preferred Service Type, Last Order
4. **Top Items Ordered** — top 5 menu items with mini bar chart (count-based)
5. **Recent Orders** — last 5 orders with order number, amount, service type, date, status badge; "View all →" link

### Order Linking UI (in Order Manager)
- Each order row shows a customer chip if linked, or a "Link Customer" button if not
- Clicking opens a search box: admin types phone/name → live results (300ms debounce, minimum 2 characters before search fires)
- If phone matches an existing customer, a yellow suggestion banner appears ("Possible match: Maria Santos — confirm?")
- Admin confirms to link or dismisses

---

## 3. Data Model

### New table: `customers`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | Default `gen_random_uuid()` |
| `name` | `text NOT NULL` | Required for all customers |
| `email` | `text UNIQUE` | Nullable, normalized (lowercase, trimmed). PostgreSQL UNIQUE on nullable columns permits multiple NULL rows — only non-NULL values are deduplicated. |
| `phone` | `text UNIQUE` | Nullable, normalized (digits only, e.g. `09171234567`). Same NULL semantics as email. |
| `messenger_psid` | `text UNIQUE` | Nullable, set for Messenger customers |
| `messenger_name` | `text` | Nullable, from Facebook Graph API |
| `source` | `text` | `'messenger'` or `'manual'`; default `'manual'` |
| `notes` | `text` | Nullable, admin-editable free text |
| `total_spent` | `numeric` | Cached; sum of completed order totals. Default `0` |
| `order_count` | `int` | Cached; count of non-cancelled orders. Default `0` |
| `avg_order_value` | `numeric` | Cached; `total_spent / order_count`. Default `0` |
| `last_order_at` | `timestamptz` | Cached; most recent order `created_at` |
| `favorite_items` | `jsonb` | Cached; top 5 items: `[{id, name, count}]` |
| `preferred_service_type` | `text` | Cached; most frequent service type across orders |
| `preferred_branch_id` | `uuid → branches` | Cached; most frequent branch. Trigger must cast `orders.branch_id` to uuid safely — use `NULLIF` guard since some legacy rows may store branch_id as text. |
| `avg_order_interval_days` | `numeric` | Cached; avg days between consecutive orders. Set to `NULL` when `order_count <= 1` (no gap computable). Default `0` applies only at row creation; trigger must write `NULL` for the single-order case. |
| `created_at` | `timestamptz` | Default `now()` |
| `updated_at` | `timestamptz` | Updated via trigger |

**Indexes:** `phone`, `email`, `messenger_psid` (all unique), `last_order_at` (for At Risk queries), `total_spent` (for sorting).

### New table: `customer_tags`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `customer_id` | `uuid → customers` | `ON DELETE CASCADE` |
| `tag` | `text NOT NULL` | e.g. `'VIP'`, `'Birthday Girl'` |
| `tag_type` | `text` | `'auto'` or `'manual'` |
| `created_at` | `timestamptz` | |

**Unique constraint:** `(customer_id, tag)` — no duplicate tags per customer.

### Modified table: `orders`

One new nullable column:

```sql
customer_id uuid REFERENCES customers(id) ON DELETE SET NULL
```

Orders persist if their linked customer is deleted.

### Auto-tag thresholds (computed on-the-fly from cached stats, not stored)

| Tag | Condition |
|-----|-----------|
| **VIP** | `total_spent >= 5000` |
| **Loyal** | `order_count >= 10` |
| **New** | `order_count <= 2` |
| **At Risk** | `last_order_at < now() - interval '30 days'` AND `order_count > 1` |

Auto-tags are returned by the API alongside manual tags; they are **not** stored in `customer_tags`.

### Stats trigger

A Postgres function `update_customer_stats(customer_id uuid)` recalculates all cached stat columns from `orders` and `order_items` JOINs. Called by a trigger on `orders` after `INSERT`, `UPDATE`, `DELETE` where `customer_id IS NOT NULL`.

- `total_spent` — sum of `total` where `status = 'completed'`
- `order_count` — count where `status NOT IN ('cancelled')`
- `avg_order_value` — `total_spent / NULLIF(order_count, 0)`
- `last_order_at` — max `created_at` (all non-cancelled)
- `favorite_items` — top 5 items by count from `order_items` JOIN. Group by `menu_item_id` where non-null; fall back to `menu_item_name` for legacy rows where `menu_item_id IS NULL`. Result shape: `[{id: string|null, name: string, count: number}]` — `id` is `null` for legacy rows. The `CustomerDetailPanel` bar chart component must guard against `null` id (use `name` as the React key fallback).
- `preferred_service_type` — mode of `service_type`
- `preferred_branch_id` — mode of `branch_id`; cast to uuid with `NULLIF` guard for legacy text rows
- `avg_order_interval_days` — avg gap between consecutive order dates; write `NULL` when `order_count <= 1`

The trigger runs as `SECURITY DEFINER` with a restricted `search_path`.

---

## 4. API Routes

All routes require `requireAdminRequest()` (admin or super-admin session). No public access.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/admin/customers` | List customers. Query params: `search`, `tag`, `page`, `limit`, `sort` |
| `POST` | `/api/admin/customers` | Create manual customer |
| `GET` | `/api/admin/customers/[id]` | Full profile: info + auto-tags + manual tags + order history |
| `PATCH` | `/api/admin/customers/[id]` | Update `name`, `email`, `phone`, `notes` |
| `DELETE` | `/api/admin/customers/[id]` | Hard delete (orders retain via `SET NULL`) |
| `POST` | `/api/admin/customers/[id]/tags` | Add manual tag |
| `DELETE` | `/api/admin/customers/[id]/tags/[tagId]` | Remove manual tag |
| `GET` | `/api/admin/customers/suggest` | Phone-based match for order linking. Query: `phone` |
| `PATCH` | `/api/orders/[id]` | Extended to accept `customer_id` (existing route — see extension rules below) |

**List endpoint** (`GET /api/admin/customers`):
- Default sort: `last_order_at DESC`
- Supports: `?search=maria` (name/phone/email prefix), `?tag=VIP` (includes auto-tags), `?sort=total_spent`
- Pagination: `?page=1&limit=20`
- Response includes computed `auto_tags[]` alongside `manual_tags[]`. Auto-tags are derived in application code from the cached stat columns already present in each query result row — no per-row subqueries required.

**Suggest endpoint** (`GET /api/admin/customers/suggest?phone=09171234567`):
- Normalizes the input phone (digits only) before comparing against the stored normalized `phone` column — do not match against `orders.contact_number` directly, as that column stores un-normalized values
- Returns top 1 customer matching normalized phone
- Used by Order Manager for the yellow match-suggestion banner
- Returns `null` if no match

**Route resolution note:** `suggest` is a static segment sibling of `[id]` (dynamic segment). Next.js 15 App Router resolves static paths before dynamic ones — no routing conflict exists. No path restructuring needed.

**`PATCH /api/orders/[id]` — `customer_id` extension rules:**
- Accepted values: a valid UUID string (link) or `null` (unlink)
- Input validation: if non-null, validate UUID format and confirm the customer exists — return `404` if not found
- Null/unlink is explicitly allowed: `{ "customer_id": null }` removes the link without deleting the customer
- If the order already has a `customer_id` set, the PATCH may overwrite it (no force-unlink step required — admin intent is clear)
- Return `200` with the updated order on success; `422` for invalid UUID format

---

## 5. Messenger Auto-Population

Inside the existing `POST /api/orders` route, the customer upsert must be inserted **inside the `msession` block**, after `messenger_psid` has been confirmed written to the order row. Concretely, the insertion point is after the existing `orders.update({ messenger_psid, messenger_name })` call that writes the PSID to the row — use `checkoutSession.psid` (not `orders.messenger_psid`) as the upsert key, since the PSID is reliably available from the checkout session at that point.

Steps:
1. Upsert into `customers` — match on `messenger_psid` using `checkoutSession.psid`; if no match, insert with `name = checkoutSession` user's name (from `messenger_name` on the order), `source = 'messenger'`
2. Set `orders.customer_id` to the resolved customer ID via a separate `UPDATE` call

**Important:** The existing route uses sequential Supabase client calls with no transaction wrapper — `BEGIN`/`COMMIT` is not available via the JS client. These two steps are therefore **best-effort**, not atomic:
- If the customer upsert succeeds but the `orders.customer_id` update fails: log the error with `order_id` and `customer_id` for manual reconciliation. Do **not** fail or roll back the order response — the order is valid, only the customer link is missing.
- If the customer upsert itself fails: log the error and continue. The order is created without a customer link. No retry loop.

The stats trigger fires only when `orders.customer_id` is non-null — a missed link means stats are not updated for that order. This is an acceptable best-effort trade-off for v1; atomic linking via a Postgres RPC is deferred to a future iteration.

---

## 6. Security

- **Auth gate**: `requireAdminRequest()` on every customer endpoint — same HMAC-token middleware as all other admin routes
- **Phone normalization**: strip all non-digit characters before storage and lookup to prevent duplicate bypass
- **Email normalization**: lowercase + trim before storage
- **Uniqueness enforcement**: `UNIQUE` DB constraints on `phone`, `email`, `messenger_psid` — API returns `409 Conflict` with a safe error message on violation (no PII in error body)
- **`customer_id` write protection**: the public `POST /api/orders` route never accepts `customer_id` from the client — only the internal Messenger auto-population path sets it. On the admin `PATCH /api/orders/[id]` route, `customer_id` is intentionally writable (for order linking); it must be validated (UUID format + customer existence check) before the DB write, and accepts `null` to unlink.
- **No PII in logs**: customer name, email, phone are never included in server-side log statements
- **Trigger hardening**: `SECURITY DEFINER` + restricted `search_path` on the stats function
- **Input validation**: all fields validated with Zod schemas before DB writes; email format, phone format (10–11 digits after normalization)
- **`ON DELETE SET NULL`**: deleting a customer never destroys order records

---

## 7. Testing Strategy

### Unit tests (`tests/lib/`)

| File | Coverage |
|------|----------|
| `customer-stats.test.ts` | Stat recalculation: LTV (completed only), order_count (non-cancelled), avg, favorite items algorithm, frequency |
| `auto-tags.test.ts` | All four auto-tag threshold rules; edge cases (exactly at threshold, null last_order_at) |
| `phone-normalize.test.ts` | Strip spaces, dashes, `+63` prefix, parentheses; empty string; already normalized |
| `customer-dedup.test.ts` | Duplicate detection across phone / email / PSID; partial matches |

### API / Integration tests (`tests/api-customers.test.ts`)

- **CRUD happy paths**: create, read, update, delete
- **Pagination + search**: verify filtered results, page boundaries
- **Duplicate rejection**: `409` on phone/email/PSID collision
- **Tag management**: add, remove, uniqueness constraint
- **Suggest endpoint**: phone match found / not found
- **Order linking**: `PATCH /api/orders/[id]` with `customer_id`

### Security tests (in same file)

- All endpoints return `401` with no session cookie
- `POST /api/orders` (public) ignores `customer_id` in body
- `409` error body contains no PII
- Soft-deleted orders still visible in order list after customer delete

### Trigger behaviour tests (inside `tests/api-customers.test.ts`)

Trigger behaviour is verified indirectly via the API using the existing fetch-to-localhost pattern — no separate DB client or `tests/db/` directory required:

- `POST /api/orders` with `customer_id` set → `GET /api/admin/customers/[id]` returns updated `total_spent`, `order_count`, `avg_order_value`
- Order with `status = 'cancelled'` → `total_spent` unchanged, `order_count` unchanged
- `DELETE /api/orders/[id]` → stats recalculate correctly (confirmed via subsequent GET)
- Messenger order (`messenger_psid` present) → customer auto-created, `GET /api/admin/customers/[id]` returns linked order
- Second order from same PSID → `GET /api/admin/customers` shows no duplicate customer

---

## 8. Component Structure

```
src/components/
  CustomerManager.tsx          # Main tab component (list + slide-in panel)
  CustomerListItem.tsx         # Single row in the list
  CustomerDetailPanel.tsx      # Slide-in profile view
  CustomerTagBadge.tsx         # Reusable tag chip (auto + manual variants)
  CustomerLinkWidget.tsx       # Order Manager widget for linking a customer

src/hooks/
  useCustomers.ts              # List fetching with search/filter/pagination
  useCustomer.ts               # Single customer profile fetch

app/api/admin/customers/
  route.ts                     # GET (list) + POST (create)
  [id]/route.ts                # GET + PATCH + DELETE
  [id]/tags/route.ts           # POST (add tag)
  [id]/tags/[tagId]/route.ts   # DELETE (remove tag)
  suggest/route.ts             # GET (phone match suggestion)

supabase/migrations/
  YYYYMMDDHHMMSS_add_customers.sql
```

---

## 9. Out of Scope (this iteration)

- Outbound Messenger messaging from customer profile
- Customer export (CSV)
- Configurable auto-tag thresholds via site settings
- Customer merge UI (duplicate customers detected but not mergeable in v1)
- Customer-facing account / login
- Time-of-day ordering pattern visualization (data collected, UI deferred)
