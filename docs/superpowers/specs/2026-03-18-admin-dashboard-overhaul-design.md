# Admin Dashboard Overhaul — Design Spec
**Date:** 2026-03-18
**Project:** Starr's Famous Shakes
**Status:** Draft

---

## 1. Overview

Overhaul the admin dashboard from a single-page tab-based CSR architecture to a multi-page SSR-first architecture with:
- Separate routes for each management section with a shared sidebar layout
- Server Components + Server Actions replacing client-side hooks and API routes for CRUD
- Real-time subscriptions only on the Orders page
- Strengthened security (auth guards, input validation, customer linking audit trail)
- Full test coverage (unit, integration, API, security)
- Consistent Starr's brand identity across all pages

**Functional scope:** Same features as today, with one change — customer linking gets security safeguards (reason required, super-admin-only unlinking, audit log).

### Prerequisites / New Dependencies

- `zod` — input validation for all Server Actions (not currently installed)
- `@testing-library/react` — component tests (not currently installed)

---

## 2. Route Structure

```
app/
├── (admin-auth)/
│   └── admin/
│       └── login/
│           └── page.tsx        Client Component: login form (regular + super admin)
└── admin/
    ├── layout.tsx              Server Component: sidebar nav + auth guard
    ├── page.tsx                Dashboard overview (redirect to /admin/orders)
    ├── loading.tsx             Skeleton for sidebar + content area
    ├── not-found.tsx           404 for invalid admin sub-routes
    ├── error.tsx               Client Component: error boundary for admin pages
    ├── orders/
    │   ├── page.tsx            Server Component wrapper → client OrdersContent
    │   ├── loading.tsx         Skeleton for orders table
    │   └── error.tsx           Error boundary
    ├── menu/
    │   ├── page.tsx            Server Component + client islands
    │   ├── loading.tsx         Skeleton for menu grid
    │   └── error.tsx           Error boundary
    ├── categories/
    │   ├── page.tsx            Server Component + client island for reorder
    │   ├── loading.tsx         Skeleton
    │   └── error.tsx           Error boundary
    ├── customers/
    │   ├── page.tsx            Server Component with client search island
    │   ├── loading.tsx         Skeleton
    │   └── error.tsx           Error boundary
    ├── branches/
    │   ├── page.tsx            Server Component
    │   ├── loading.tsx         Skeleton
    │   └── error.tsx           Error boundary
    ├── payments/
    │   ├── page.tsx            Server Component + client island for reorder
    │   ├── loading.tsx         Skeleton
    │   └── error.tsx           Error boundary
    ├── settings/
    │   ├── page.tsx            Server Component
    │   ├── loading.tsx         Skeleton
    │   └── error.tsx           Error boundary
    └── facebook/
        ├── page.tsx            Client Component (Facebook SDK needs browser)
        ├── loading.tsx         Skeleton
        └── error.tsx           Error boundary
```

### Login Page Isolation via Route Group

The login page lives under `app/(admin-auth)/admin/login/page.tsx` — a route group `(admin-auth)` that does NOT inherit the admin layout. This means `/admin/login` renders without the sidebar or auth guard. The `app/admin/layout.tsx` only wraps authenticated admin pages.

### Admin Layout (`app/admin/layout.tsx`)

- Server Component that reads the admin session cookie
- If no valid session → redirect to `/admin/login`
- If valid → renders sidebar + `{children}`
- Super-admin-only sections (Facebook) hidden from regular admins in the sidebar

**Admin type propagation:** Each page that needs to know the admin type calls `requireAdmin()` independently, which returns `{ adminType: 'admin' | 'super_admin' }`. This avoids the App Router limitation where layout cannot pass props to page children. The function reads from `cookies()` and is cached per-request by React's deduplication, so multiple calls in the same render are free.

### Error Boundaries (`error.tsx`)

Each section gets an `error.tsx` (Client Component) that catches server-side fetch failures and renders a branded error state with a "Retry" button. The root `app/admin/error.tsx` serves as the fallback. Error boundaries log the error server-side and display a generic "Something went wrong" message with Starr's branding.

### Not Found (`not-found.tsx`)

`app/admin/not-found.tsx` handles invalid admin sub-routes (e.g., `/admin/nonexistent`) with a branded 404 page and link back to `/admin/orders`.

### Login Page (`app/(admin-auth)/admin/login/page.tsx`)

- Client Component (needs form interactivity)
- Handles both regular admin (password) and super admin (email/password) login
- On success, redirects to `/admin/orders`
- No sidebar — isolated via route group

### Dashboard Root (`app/admin/page.tsx`)

- Redirects to `/admin/orders` (the most frequently used section)
- Could later become a summary/stats overview page

---

## 3. Data Fetching & Rendering Strategy

### Server Components (Menu, Categories, Customers, Branches, Payments, Settings)

Each page fetches data directly from Supabase using the existing server client:

```typescript
// app/admin/menu/page.tsx (Server Component)
import { supabaseServer } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin-guard';

export default async function MenuPage() {
  await requireAdmin(); // validates cookie, throws redirect if invalid
  const { data: menuItems } = await supabaseServer
    .from('menu_items')
    .select('*, variations(*), add_ons(*)');

  return <MenuPageContent items={menuItems} />;
}
```

**Note:** The existing `supabaseServer` from `@/lib/supabase-server` is a proxy-based singleton using the service role key. This is appropriate for admin pages since all access is already gated by `requireAdmin()`.

No API route round-trip. Data is rendered as HTML on the server.

### Server Actions for Mutations

All create/update/delete operations become Server Actions:

```
src/actions/
├── menu.ts              addMenuItem, updateMenuItem, deleteMenuItem
├── categories.ts        addCategory, updateCategory, deleteCategory, reorderCategories
├── branches.ts          addBranch, updateBranch, deleteBranch
├── customers.ts         linkCustomer, unlinkCustomer (with audit logging)
├── payments.ts          addPaymentMethod, updatePaymentMethod, deletePaymentMethod, reorderPayments
├── settings.ts          updateSiteSettings
└── facebook.ts          connectFacebook, disconnectFacebook
```

Each Server Action:
1. Validates auth via `requireAdmin()` or `requireSuperAdmin()`
2. Validates input with a Zod schema
3. Performs the Supabase mutation
4. Calls `revalidatePath('/admin/...')` to refresh the page
5. Returns `{ success: boolean, error?: string }` — never leaks internal errors

### Orders Page (Client-Side Exception)

The Orders page uses a **Server Component wrapper** pattern:

```typescript
// app/admin/orders/page.tsx (Server Component)
import { supabaseServer } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin-guard';
import OrdersContent from './OrdersContent';

export default async function OrdersPage() {
  const { adminType } = await requireAdmin();
  const { data: initialOrders } = await supabaseServer
    .from('orders').select('*').order('created_at', { ascending: false }).limit(50);
  const { data: stats } = await supabaseServer.rpc('get_order_stats');

  return <OrdersContent initialOrders={initialOrders} initialStats={stats} adminType={adminType} />;
}
```

```typescript
// app/admin/orders/OrdersContent.tsx (Client Component)
'use client';
// Uses useOrders hook for real-time subscriptions
// Receives server-prefetched data as initial state
```

- `useOrders` hook stays but gets cleaned up (remove unused features, tighten types)
- Real-time Supabase subscriptions establish on client hydration
- Stats auto-refresh every 10 seconds (existing behavior)
- **Real-time cleanup:** The `useOrders` hook must properly tear down Supabase channels on unmount. This is already handled via `useRef<RealtimeChannel>` in the existing code, which works correctly with App Router soft navigation.

### Client Islands

Small `'use client'` components embedded within Server Component pages:

| Island | Page | Purpose |
|--------|------|---------|
| `MenuItemForm` | Menu | Inline add/edit form with image upload |
| `CategoryReorderList` | Categories | Drag-to-reorder |
| `PaymentReorderList` | Payments | Drag-to-reorder |
| `CustomerLinkWidget` | Orders | Customer linking with audit (refactored) |
| `CustomerSearch` | Customers | Search with debounce + pagination controls |
| `ImageUploadWidget` | Menu | Cloudinary upload |
| `BranchForm` | Branches | Add/edit form with location picker |
| `SettingsForm` | Settings | Form with save button |
| `FacebookConnectPanel` | Facebook | Full client component (SDK) |

These receive server-fetched data as props and call Server Actions for mutations.

---

## 4. What Gets Retired vs. Kept

### Retired (replaced by server fetches + Server Actions)

| File | Replacement |
|------|-------------|
| `src/components/AdminDashboard.tsx` (69KB monolith) | `app/admin/layout.tsx` + individual pages |
| `src/hooks/useMenu.ts` | Server fetch in `app/admin/menu/page.tsx` + `src/actions/menu.ts` |
| `src/hooks/useCategories.ts` | Server fetch + `src/actions/categories.ts` |
| `src/hooks/usePaymentMethods.ts` | Server fetch + `src/actions/payments.ts` |
| `src/hooks/useSiteSettings.ts` | Server fetch + `src/actions/settings.ts` |
| `src/lib/admin-api.ts` (`adminFetch`) | No longer needed |
| `app/api/admin/menu/route.ts` | `src/actions/menu.ts` |
| `app/api/admin/menu/[id]/route.ts` | `src/actions/menu.ts` |
| `app/api/admin/categories/route.ts` | `src/actions/categories.ts` |
| `app/api/admin/categories/[id]/route.ts` | `src/actions/categories.ts` |
| `app/api/admin/categories/reorder/route.ts` | `src/actions/categories.ts` |
| `app/api/admin/branches/route.ts` (GET/POST) | Server fetch + `src/actions/branches.ts` |
| `app/api/admin/branches/[id]/route.ts` | `src/actions/branches.ts` |
| `app/api/admin/payment-methods/route.ts` | `src/actions/payments.ts` |
| `app/api/admin/payment-methods/[id]/route.ts` | `src/actions/payments.ts` |
| `app/api/admin/payment-methods/reorder/route.ts` | `src/actions/payments.ts` |
| `app/api/admin/site-settings/route.ts` | `src/actions/settings.ts` |
| `app/api/admin/facebook/*` | `src/actions/facebook.ts` |

### Kept (still needed)

| File | Reason |
|------|--------|
| `src/hooks/useOrders.ts` | Real-time subscriptions for Orders page |
| `app/api/orders/*` | Needed for client-side real-time order updates |
| `app/api/admin/auth/*` | Login/logout/session endpoints for client auth flow |
| `app/api/admin/customers/suggest` | Client-side autocomplete in CustomerLinkWidget |
| `app/api/admin/customers/*` (GET endpoints) | Needed for client-side customer search in CustomerLinkWidget |
| `app/api/admin/customers/[id]/tags/*` | Customer tag management (add/remove) |
| `app/api/admin/menu/bulk-messenger/route.ts` | Bulk toggle messenger visibility — becomes Server Action `src/actions/menu.ts:bulkUpdateMessengerVisibility` |
| `app/api/messenger/*` | Messenger webhook/session endpoints (non-admin, external-facing) |
| `src/lib/admin-auth.ts` | Auth utilities, enhanced with `requireAdmin()` |
| `src/lib/super-admin-auth.ts` | Super admin auth |
| `src/components/CustomerLinkWidget.tsx` | Refactored in-place with audit trail (same file, enhanced) |
| `src/components/CustomerListItem.tsx` | Reused in customer page |
| `src/components/CustomerDetailPanel.tsx` | Reused in customer page |
| `src/components/ImageUpload.tsx` | Reused as client island |

### Refactored (kept but modified)

| File | Change |
|------|--------|
| `src/hooks/useCustomers.ts` | Currently imports `adminFetch` from `admin-api.ts`. Refactored to use direct `fetch()` with `credentials: 'include'` instead, removing the `adminFetch` dependency. Only used by the Customers page client island for search/pagination. |
| `src/hooks/useCustomer.ts` | Same refactor — replace `adminFetch` with direct `fetch()`. Used by CustomerDetailPanel. |
| `src/lib/admin-api.ts` | **Retired after hooks are refactored.** The `adminFetch` wrapper is removed once `useCustomers` and `useCustomer` no longer depend on it. |

---

## 5. Security Hardening

### Auth Defense in Depth

1. **Layout-level guard:** `app/admin/layout.tsx` validates session cookie on every request. Invalid → redirect to `/admin/login`.
2. **Server Action guard:** Every Server Action independently calls `await requireAdmin()` — never relies on layout auth alone.
3. **Super-admin gate:** Actions restricted to super admins (unlink customer, Facebook connect/disconnect) additionally call `await requireSuperAdmin()`.

### New Auth Utilities (`src/lib/admin-guard.ts`)

```typescript
// Reads cookies(), validates session, throws redirect if invalid
async function requireAdmin(): Promise<{ adminType: 'admin' | 'super_admin' }>

// Same but throws if not super admin
async function requireSuperAdmin(): Promise<{ adminId: string }>
```

These wrap the existing `isAdminRequest()` / `isSuperAdminRequest()` functions from `admin-auth.ts` and `super-admin-auth.ts`, adapted for Server Component/Action context (reading from `cookies()` instead of `NextRequest`).

### Input Validation (`src/lib/validation.ts`)

Zod schemas for every mutation:

```typescript
export const menuItemSchema = z.object({
  name: z.string().min(1).max(200),
  price: z.number().positive(),
  category_id: z.string().uuid(),
  // ... all fields validated
});

export const categorySchema = z.object({
  name: z.string().min(1).max(100),
  icon: z.string().max(50).optional(),
  // ...
});

// Similar for branches, payments, settings, customer linking
```

All input validated before it reaches Supabase. UUID params validated with strict pattern.

### CSRF Protection

- Server Actions have built-in CSRF protection in Next.js (origin header verification)
- Remaining API routes keep existing `isSameOriginRequest()` check

### Rate Limiting

- Keep existing rate limiting on login endpoints (5 attempts / 15 min / IP)
- Add rate limiting to mutation Server Actions (30 mutations / minute / IP). Implementation: use `headers()` from `next/headers` to extract `x-forwarded-for` or `x-real-ip` in Server Actions, keyed by IP (not session, since session cookies aren't meaningful for rate key). Reuse the existing `checkServerRateLimit` pattern from `admin-auth.ts`.

### Session Security

- Keep existing HMAC-SHA256 signed cookie approach
- Ensure `SameSite=Strict` and `Secure` flags on all admin cookies in production
- 12-hour TTL (existing)

### Error Handling

- Server Actions return `{ success: boolean, error?: string }` — generic error messages only
- Database errors logged server-side with sanitized context (no PII)
- Stack traces never exposed to the client

---

## 6. Customer Linking Security (Functional Change)

### Current Problem

Customer linking/unlinking is a casual one-click operation with no audit trail. Any admin can link or unlink at any time with just a `window.confirm` dialog. This makes it easy to accidentally break customer-order relationships.

### New Behavior

**Linking a customer to an order:**
- Same search/suggest UX as today
- New: admin must select a reason from a dropdown: "Phone match", "Messenger match", "Manual identification", "Other"
- Action is logged to `customer_link_audit` table

**Unlinking a customer from an order:**
- Restricted to **super admins only** (regular admins see the linked chip but no unlink button)
- **Server-side enforcement:** The `PATCH /api/orders/:id` route must check for super admin session when `customer_id: null` is passed (unlinking). Client-side UI hiding alone is insufficient — the API route must reject unlink requests from regular admins with a `403` response.
- Requires selecting a reason: "Incorrect match", "Customer request", "Duplicate resolution", "Other"
- Confirmation dialog (proper modal, not `window.confirm`)
- Action is logged to `customer_link_audit` table

### New Database Table: `customer_link_audit`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | Default `gen_random_uuid()` |
| `order_id` | `uuid` | References `orders(id)` |
| `customer_id` | `uuid` | The customer being linked/unlinked. No FK constraint — intentionally allows audit records to survive customer deletion. |
| `action` | `text` | `'link'` or `'unlink'` |
| `reason` | `text` | Required reason from dropdown |
| `performed_by` | `text` | `'admin'` for regular admins, email for super admins. **Limitation:** regular admin actions are attributed generically since there's a shared password. IP address is logged alongside to aid identification when multiple people share the admin password. |
| `admin_type` | `text` | `'admin'` or `'super_admin'` |
| `ip_address` | `text` | Client IP for attribution when regular admin password is shared |
| `created_at` | `timestamptz` | Default `now()` |

**Index:** `order_id`, `customer_id` for lookup.

### Audit Log Visibility

- Visible on the Customer Detail Panel under a new "Link History" section
- Shows: order ID, action, reason, who performed it, when
- Read-only — no editing or deleting audit entries

---

## 7. UI/UX Design

### Brand Identity (Reference: CustomerManager.tsx)

All admin pages use the Starr's Famous Shakes palette:

| Token | Value | Usage |
|-------|-------|-------|
| Primary teal | `#7BBFB5` | Buttons, active sidebar item, badges |
| Deep teal | `#3D8A80` | Hover states, accent numbers, links |
| Active teal | `#2C6E65` | Pressed/active button state |
| Page background | `#FAFAF8` | Full page bg |
| Card/input background | `#F2EEE8` | Summary cards, input fields, secondary buttons |
| Button text | `#F0EBE0` | Text on teal buttons |
| Border | `#E8E3DA` | Card borders, dividers, input borders |
| Text | stone-400 to stone-900 | Standard text hierarchy |
| Heading font | Playfair Display | Page titles, section headings |
| Body font | Nunito | All UI text, numbers, tags, buttons |
| Focus ring | `ring-[#7BBFB5]/40` | Consistent focus indicator |
| Border radius | `rounded-xl` (cards), `rounded-[10px]` (inputs/buttons), `rounded-2xl` (modals) | Warm, friendly corners |

### Sidebar Navigation

- **Width:** 240px on desktop, collapsible to 60px (icon-only), hidden on mobile with hamburger toggle
- **Background:** white with `border-r border-[#E8E3DA]`
- **Logo:** Starr's Famous Shakes logo/text at the top in teal
- **Nav items:** Icon + label, `font-nunito font-medium text-sm`
  - Default: `text-stone-500 hover:bg-[#F2EEE8] hover:text-stone-900`
  - Active: `bg-[#7BBFB5]/10 text-[#3D8A80] border-r-2 border-[#7BBFB5]`
- **Sections with icons:**
  - Orders — `ClipboardList`
  - Menu — `UtensilsCrossed`
  - Categories — `LayoutGrid`
  - Customers — `Users`
  - Branches — `MapPin`
  - Payments — `CreditCard`
  - Settings — `Settings`
  - Facebook — `MessageCircle` (super admin only)
- **Orders badge:** Pending order count shown as a small teal badge
- **Bottom:** Admin type indicator + logout button

### Page Layout Pattern (Consistent Across All Sections)

```
┌─────────────────────────────────────────────────┐
│  Page Title (Playfair)         [Primary Action]  │
├─────────────────────────────────────────────────┤
│  Summary Strip (optional — stats cards)          │
├─────────────────────────────────────────────────┤
│  Filters / Search (optional)                     │
├─────────────────────────────────────────────────┤
│  Data Table / Card Grid                          │
│  (responsive: table on desktop, cards on mobile) │
├─────────────────────────────────────────────────┤
│  Pagination (where applicable)                   │
└─────────────────────────────────────────────────┘
```

- Page headers: `text-2xl font-playfair font-semibold text-stone-900`
- Primary action buttons: `bg-[#7BBFB5] text-[#F0EBE0] font-nunito font-semibold rounded-[10px]`
- Summary cards: `bg-[#F2EEE8] rounded-xl border border-[#E8E3DA]` with teal stat numbers
- Empty states: icon + descriptive text in `text-stone-400`
- Error states: red-50 background with red-700 text in rounded card
- Loading states: skeleton shimmer using `animate-pulse` with `bg-[#E8E3DA]` bones

### Loading States (`loading.tsx`)

Every section gets a `loading.tsx` with a skeleton that matches the page structure:
- Sidebar skeleton (gray bones for nav items)
- Content skeleton (header bone, filter bone, table rows with shimmer)
- Provides instant visual feedback during route transitions

### Mobile Responsiveness

- Sidebar: hidden by default, shown via hamburger menu
- Tables: convert to card layout below `lg` breakpoint
- Summary strips: stack vertically below `md` breakpoint
- Modals: full-width with `mx-4` margin on mobile

---

## 8. Testing Strategy

### Test Structure

```
tests/
├── unit/
│   ├── actions/
│   │   ├── menu.test.ts
│   │   ├── categories.test.ts
│   │   ├── branches.test.ts
│   │   ├── customers.test.ts
│   │   ├── payments.test.ts
│   │   ├── settings.test.ts
│   │   └── facebook.test.ts
│   ├── lib/
│   │   ├── admin-auth.test.ts
│   │   ├── super-admin-auth.test.ts
│   │   ├── admin-guard.test.ts
│   │   ├── validation-schemas.test.ts
│   │   └── ...existing tests (phone-normalize, auto-tags, etc.)
│   └── components/
│       ├── CustomerLinkWidget.test.tsx
│       ├── MenuItemForm.test.tsx
│       └── CategoryReorderList.test.tsx
├── integration/
│   ├── auth-flow.test.ts
│   ├── customer-linking.test.ts
│   ├── order-management.test.ts
│   └── menu-management.test.ts
├── api/
│   ├── orders.test.ts           (existing, expanded)
│   ├── customers.test.ts        (existing, expanded)
│   └── auth.test.ts
└── security/
    ├── auth-bypass.test.ts
    ├── input-validation.test.ts
    ├── rate-limiting.test.ts
    └── authorization.test.ts
```

### Unit Tests — Server Actions

Each Server Action tested by mocking Supabase client and cookies:
- **Happy path:** valid input → correct DB call → returns `{ success: true }`
- **Auth failure:** no session / expired session → returns error or throws redirect
- **Validation failure:** invalid input → returns `{ success: false, error: '...' }`
- **DB error:** Supabase error → returns generic error, no internal leak
- **Authorization:** regular admin calling super-admin action → rejected

### Unit Tests — Validation Schemas

- Valid inputs pass
- Invalid types rejected (string where number expected, etc.)
- Boundary values (max length, zero price, empty string)
- UUID format validation
- XSS payloads stripped or rejected
- SQL injection payloads rejected

### Unit Tests — Client Components

Using `@testing-library/react`:
- Render with mock data, verify correct display
- Simulate user interactions (click, type, submit)
- Verify Server Action calls with correct arguments
- Loading / error / empty states render correctly

### Integration Tests

End-to-end flows through real API endpoints:
- **Auth flow:** login → session valid → access pages → logout → access denied
- **Layout auth redirects:** unauthenticated GET to `/admin/menu`, `/admin/orders`, `/admin/customers`, etc. → all redirect to `/admin/login`
- **Concurrent sessions:** user with both regular admin and super admin cookies simultaneously → `requireAdmin()` returns correct admin type, actions respect the correct authorization level
- **Customer linking:** search → select → provide reason → link → verify audit log → super admin unlink → verify audit log → regular admin cannot unlink (403 from API)
- **Order management:** create order → update status → bulk update → verify stats
- **Menu management:** add item with variations → update → delete → verify cascade
- **Revalidation verification:** mutation via Server Action → subsequent page load returns updated data (tests that `revalidatePath` actually works)

### API Tests

Remaining API routes (orders, customers, auth):
- CRUD happy paths
- Error responses (404, 409, 422)
- Pagination and filtering
- Auth required on all endpoints

### Security Tests

Dedicated adversarial test suite:
- **Auth bypass:** access pages/actions without session, with expired token, with tampered token
- **Input validation:** SQL injection attempts, XSS payloads, oversized payloads, malformed UUIDs
- **Rate limiting:** exceed login attempt limit → verify lockout
- **Authorization escalation:** regular admin attempts super-admin-only actions
- **CSRF:** verify origin check on mutations

### Framework

- **Vitest** (already in use) for all tests
- **`@testing-library/react`** for component tests
- **Test utilities:** shared factories for creating mock admin sessions, mock Supabase responses, mock order/customer data

---

## 9. Performance Expectations

### Current Architecture (Baseline)

1. Navigate to `/admin`
2. Server prefetches some data, sends HTML shell
3. Browser downloads `AdminDashboard.tsx` (~69KB) + all hook code
4. Client hydrates, hooks fire, fetch all data client-side
5. User sees content after JS execution + API round-trips

### New Architecture

1. Navigate to `/admin/menu`
2. Server fetches menu data from Supabase directly
3. Server renders complete HTML with all data
4. Browser receives complete page — content visible immediately
5. Small client islands hydrate for interactive features only

**Expected improvements:**
- ~60-70% reduction in client JS for non-Orders pages
- Elimination of client-side data fetch waterfall
- Instant page transitions via `loading.tsx` skeletons
- No more loading entire dashboard JS for a single section

---

## 10. Database Migration

### New Table

```sql
CREATE TABLE customer_link_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  customer_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('link', 'unlink')),
  reason text NOT NULL,
  performed_by text NOT NULL,
  admin_type text NOT NULL CHECK (admin_type IN ('admin', 'super_admin')),
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: deny all direct access (service role key bypasses RLS; consistent with other tables)
ALTER TABLE customer_link_audit ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_customer_link_audit_order ON customer_link_audit(order_id);
CREATE INDEX idx_customer_link_audit_customer ON customer_link_audit(customer_id);
```

---

## 11. Agent Team Roles (Implementation Phase)

When executing the implementation plan, the following specialized subagent roles will be deployed:

| Role | Responsibility |
|------|---------------|
| **Coordinator** | Orchestrates execution order, manages dependencies between tasks |
| **Senior Engineer** | Architects shared infrastructure: layout, auth guard, validation, Server Action patterns |
| **Developer** | Implements individual pages, Server Actions, client islands |
| **UI/UX** | Ensures consistent branding, responsive design, loading/error/empty states |
| **Bug Hunter** | Proactive audit of existing code during migration, identifies edge cases |
| **Tester** | Writes unit, integration, API, and security tests for every module |
| **Reviewer** | Reviews completed work against spec, verifies security, performance, and code quality |

---

## 12. Migration Strategy

**Approach:** Section-by-section migration. Each section is migrated independently:

1. Build shared infrastructure first (layout, auth guard, validation, Server Action patterns)
2. Migrate one section at a time (e.g., Branches first — simplest, good test case)
3. For each section: create the new page → create Server Actions → create tests → verify → delete old API routes and hooks
4. Old API routes are deleted immediately after their replacement is verified — no deprecation period needed since the admin dashboard is the only consumer
5. The monolithic `AdminDashboard.tsx` is deleted last, after all sections are migrated

**Note on `CartProvider`:** The root `app/layout.tsx` wraps all children in `<CartProvider>`, which means admin pages currently inherit the cart context. This is unnecessary overhead but not a blocker. We will not address this in this overhaul to keep scope contained — it can be resolved later by extracting the storefront into a route group.

---

## 13. Out of Scope

- Redesign of visual aesthetics (keeping Starr's brand as-is)
- New features beyond customer linking security improvement
- Customer management functional changes (covered by existing spec)
- Public-facing pages (checkout, storefront)
- Infrastructure changes (hosting, Supabase configuration)
- Mobile app or PWA features
