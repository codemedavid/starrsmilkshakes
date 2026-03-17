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
- Clicking opens a search box: admin types phone/name → live results
- If phone matches an existing customer, a yellow suggestion banner appears ("Possible match: Maria Santos — confirm?")
- Admin confirms to link or dismisses

---

## 3. Data Model

### New table: `customers`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | Default `gen_random_uuid()` |
| `name` | `text NOT NULL` | Required for all customers |
| `email` | `text UNIQUE` | Nullable, normalized (lowercase, trimmed) |
| `phone` | `text UNIQUE` | Nullable, normalized (digits only, e.g. `09171234567`) |
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
| `preferred_branch_id` | `uuid → branches` | Cached; most frequent branch |
| `avg_order_interval_days` | `numeric` | Cached; avg days between consecutive orders |
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
- `favorite_items` — top 5 `menu_item_name` by count from `order_items` JOIN
- `preferred_service_type` — mode of `service_type`
- `preferred_branch_id` — mode of `branch_id`
- `avg_order_interval_days` — avg gap between consecutive order dates

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
| `PATCH` | `/api/orders/[id]` | Extended to accept `customer_id` (existing route) |

**List endpoint** (`GET /api/admin/customers`):
- Default sort: `last_order_at DESC`
- Supports: `?search=maria` (name/phone/email prefix), `?tag=VIP` (includes auto-tags), `?sort=total_spent`
- Pagination: `?page=1&limit=20`
- Response includes computed `auto_tags[]` alongside `manual_tags[]`

**Suggest endpoint** (`GET /api/admin/customers/suggest?phone=09171234567`):
- Returns top 1 customer matching normalized phone
- Used by Order Manager for the yellow match-suggestion banner
- Returns `null` if no match

---

## 5. Messenger Auto-Population

Inside the existing `POST /api/orders` route, after a successful order insert:

1. If `messenger_psid` is present on the new order:
   - Upsert into `customers` — match on `messenger_psid`; if no match, insert with `name = messenger_name`, `source = 'messenger'`
   - Set `orders.customer_id` to the resolved customer ID
2. This runs within the same transaction as order creation — no orphan states

---

## 6. Security

- **Auth gate**: `requireAdminRequest()` on every customer endpoint — same HMAC-token middleware as all other admin routes
- **Phone normalization**: strip all non-digit characters before storage and lookup to prevent duplicate bypass
- **Email normalization**: lowercase + trim before storage
- **Uniqueness enforcement**: `UNIQUE` DB constraints on `phone`, `email`, `messenger_psid` — API returns `409 Conflict` with a safe error message on violation (no PII in error body)
- **`customer_id` write protection**: the public `POST /api/orders` route never accepts `customer_id` from the client — only the internal Messenger auto-population path sets it
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

### DB trigger tests (`tests/db/customer-trigger.test.ts`)

- Order completed → `total_spent` increases
- Order cancelled → `total_spent` unchanged, `order_count` unchanged
- Order deleted → stats recalculated correctly
- Messenger order created → customer auto-created, `orders.customer_id` set
- Second order from same PSID → existing customer found, no duplicate

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
