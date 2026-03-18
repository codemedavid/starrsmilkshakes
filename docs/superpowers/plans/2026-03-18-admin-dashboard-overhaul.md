# Admin Dashboard Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the admin dashboard from a single-page CSR tab app to a multi-page SSR-first architecture with Server Components, Server Actions, strengthened security, and full test coverage.

**Architecture:** Each admin section gets its own route under `app/admin/` with a shared sidebar layout. Server Components fetch data directly from Supabase. Mutations use Server Actions with Zod validation. Only the Orders page uses client-side real-time. Customer linking gets audit trail + super-admin-only unlinking.

**Tech Stack:** Next.js App Router, Supabase (PostgreSQL), Zod, Vitest, Tailwind CSS, Lucide icons

**Spec:** `docs/superpowers/specs/2026-03-18-admin-dashboard-overhaul-design.md`

---

## File Structure

```
# NEW FILES
src/lib/admin-guard.ts                    Auth guard for Server Components/Actions
src/lib/validation.ts                     Zod schemas for all mutations
src/actions/branches.ts                   Branch Server Actions
src/actions/categories.ts                 Category Server Actions
src/actions/settings.ts                   Site settings Server Actions
src/actions/payments.ts                   Payment method Server Actions
src/actions/menu.ts                       Menu Server Actions
src/actions/customers.ts                  Customer linking Server Actions
src/actions/facebook.ts                   Facebook Server Actions
src/components/admin/Sidebar.tsx          Sidebar navigation (client island)
src/components/admin/AdminErrorBoundary.tsx  Shared error boundary
src/components/admin/AdminSkeleton.tsx    Shared loading skeleton helpers
src/components/admin/BranchForm.tsx       Branch add/edit form (client island)
src/components/admin/CategoryReorderList.tsx  Category reorder (client island)
src/components/admin/PaymentReorderList.tsx   Payment reorder (client island)
src/components/admin/MenuItemForm.tsx     Menu item form (client island)
src/components/admin/SettingsForm.tsx     Settings form (client island)
src/components/admin/CustomerSearch.tsx   Customer search/pagination (client island)
app/(admin-auth)/admin/login/page.tsx     Login page (isolated from sidebar)
app/admin/layout.tsx                      Admin layout with sidebar + auth guard
app/admin/page.tsx                        Redirect to /admin/orders
app/admin/loading.tsx                     Root admin skeleton
app/admin/error.tsx                       Root admin error boundary
app/admin/not-found.tsx                   Admin 404
app/admin/branches/page.tsx              Branches page (Server Component)
app/admin/branches/loading.tsx           Branches skeleton
app/admin/branches/error.tsx             Branches error boundary
app/admin/categories/page.tsx            Categories page
app/admin/categories/loading.tsx
app/admin/categories/error.tsx
app/admin/settings/page.tsx              Settings page
app/admin/settings/loading.tsx
app/admin/settings/error.tsx
app/admin/payments/page.tsx              Payments page
app/admin/payments/loading.tsx
app/admin/payments/error.tsx
app/admin/menu/page.tsx                  Menu page
app/admin/menu/loading.tsx
app/admin/menu/error.tsx
app/admin/customers/page.tsx             Customers page
app/admin/customers/loading.tsx
app/admin/customers/error.tsx
app/admin/orders/page.tsx                Orders wrapper (Server Component)
app/admin/orders/OrdersContent.tsx       Orders client component
app/admin/orders/loading.tsx
app/admin/orders/error.tsx
app/admin/facebook/page.tsx              Facebook page
app/admin/facebook/loading.tsx
app/admin/facebook/error.tsx
tests/unit/lib/admin-guard.test.ts
tests/unit/lib/validation-schemas.test.ts
tests/unit/actions/branches.test.ts
tests/unit/actions/categories.test.ts
tests/unit/actions/settings.test.ts
tests/unit/actions/payments.test.ts
tests/unit/actions/menu.test.ts
tests/unit/actions/customers.test.ts
tests/unit/actions/facebook.test.ts
tests/unit/components/CustomerLinkWidget.test.tsx
tests/unit/components/MenuItemForm.test.tsx
tests/unit/components/CategoryReorderList.test.tsx
tests/integration/auth-flow.test.ts
tests/integration/customer-linking.test.ts
tests/integration/order-management.test.ts
tests/integration/menu-management.test.ts
tests/security/auth-bypass.test.ts
tests/security/input-validation.test.ts
tests/security/authorization.test.ts
tests/security/rate-limiting.test.ts

# MODIFIED FILES
src/hooks/useCustomers.ts               Remove adminFetch dependency
src/hooks/useCustomer.ts                Remove adminFetch dependency
src/components/CustomerLinkWidget.tsx    Add audit trail + reason dropdown
app/api/orders/[id]/route.ts            Add super-admin guard for unlinking

# DELETED FILES (after migration verified)
src/components/AdminDashboard.tsx
src/components/BranchManager.tsx         Orphan — only consumed by AdminDashboard
src/components/OrderManager.tsx          Orphan — replaced by orders/OrdersContent.tsx
src/components/CustomerManager.tsx       Orphan — replaced by customers page
src/components/SuperAdminLogin.tsx       Orphan — replaced by login page
src/components/FacebookConnect.tsx       Orphan — replaced by facebook page
src/hooks/useMenu.ts
src/hooks/useCategories.ts
src/hooks/usePaymentMethods.ts
src/hooks/useSiteSettings.ts
src/lib/admin-api.ts
app/api/admin/branches/route.ts
app/api/admin/branches/[id]/route.ts
app/api/admin/categories/route.ts
app/api/admin/categories/[id]/route.ts
app/api/admin/categories/reorder/route.ts
app/api/admin/payment-methods/route.ts
app/api/admin/payment-methods/[id]/route.ts
app/api/admin/payment-methods/reorder/route.ts
app/api/admin/site-settings/route.ts
app/api/admin/menu/route.ts
app/api/admin/menu/[id]/route.ts
app/api/admin/menu/bulk-messenger/route.ts
app/api/admin/facebook/connect/route.ts
app/api/admin/facebook/disconnect/route.ts
app/api/admin/facebook/status/route.ts
app/admin/page.tsx (old version, replaced)
```

---

## Phase 1: Foundation

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install zod and testing-library**

```bash
npm install zod
npm install -D @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Update vitest config for React component testing**

Add `jsdom` environment for component tests. Read `vitest.config.ts` first, then add:

```typescript
// vitest.config.ts — add test environment
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
});
```

- [ ] **Step 3: Create test setup file and type declarations**

Create `tests/setup.ts`:

```typescript
import '@testing-library/jest-dom';
```

Create `tests/tsconfig.json` to include jest-dom types:

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["./**/*.ts", "./**/*.tsx", "./setup.ts"]
}
```

- [ ] **Step 4: Verify setup**

```bash
npx vitest run --reporter=verbose 2>&1 | head -20
```

Expected: existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/setup.ts
git commit -m "chore: add zod, testing-library, configure jsdom for component tests"
```

---

### Task 2: Create Auth Guard (`admin-guard.ts`)

**Files:**
- Create: `src/lib/admin-guard.ts`
- Create: `tests/unit/lib/admin-guard.test.ts`
- Reference: `src/lib/admin-auth.ts` (lines 80-118 — `isAdminRequest`, `isAdminSessionValid`)
- Reference: `src/lib/super-admin-auth.ts` (lines 26-82 — `isSuperAdminRequest`, `isSuperAdminSessionValid`)

- [ ] **Step 1: Write failing tests for requireAdmin**

Create `tests/unit/lib/admin-guard.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}));

// Mock auth modules
vi.mock('@/lib/admin-auth', () => ({
  isAdminSessionValid: vi.fn(),
  ADMIN_SESSION_COOKIE: 'starrs_admin_session',
}));

vi.mock('@/lib/super-admin-auth', () => ({
  isSuperAdminSessionValid: vi.fn(),
  SUPER_ADMIN_SESSION_COOKIE: 'starrs_super_admin_session',
}));

import { cookies } from 'next/headers';
import { isAdminSessionValid } from '@/lib/admin-auth';
import { isSuperAdminSessionValid } from '@/lib/super-admin-auth';

describe('admin-guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requireAdmin', () => {
    it('returns adminType "super_admin" when super admin session is valid', async () => {
      const mockCookies = {
        get: vi.fn((name: string) => {
          if (name === 'starrs_super_admin_session') return { value: 'valid-super-token' };
          if (name === 'starrs_admin_session') return { value: 'valid-admin-token' };
          return undefined;
        }),
      };
      vi.mocked(cookies).mockResolvedValue(mockCookies as any);
      vi.mocked(isSuperAdminSessionValid).mockReturnValue({ valid: true, adminId: 'admin-123' });

      const { requireAdmin } = await import('@/lib/admin-guard');
      const result = await requireAdmin();
      expect(result).toEqual({ adminType: 'super_admin' });
    });

    it('returns adminType "admin" when regular admin session is valid', async () => {
      const mockCookies = {
        get: vi.fn((name: string) => {
          if (name === 'starrs_super_admin_session') return undefined;
          if (name === 'starrs_admin_session') return { value: 'valid-token' };
          return undefined;
        }),
      };
      vi.mocked(cookies).mockResolvedValue(mockCookies as any);
      vi.mocked(isSuperAdminSessionValid).mockReturnValue({ valid: false, adminId: null });
      vi.mocked(isAdminSessionValid).mockReturnValue(true);

      const { requireAdmin } = await import('@/lib/admin-guard');
      const result = await requireAdmin();
      expect(result).toEqual({ adminType: 'admin' });
    });

    it('throws redirect when no valid session', async () => {
      const mockCookies = {
        get: vi.fn(() => undefined),
      };
      vi.mocked(cookies).mockResolvedValue(mockCookies as any);
      vi.mocked(isSuperAdminSessionValid).mockReturnValue({ valid: false, adminId: null });
      vi.mocked(isAdminSessionValid).mockReturnValue(false);

      const { requireAdmin } = await import('@/lib/admin-guard');
      await expect(requireAdmin()).rejects.toThrow();
    });
  });

  describe('requireSuperAdmin', () => {
    it('returns adminId when super admin session is valid', async () => {
      const mockCookies = {
        get: vi.fn((name: string) => {
          if (name === 'starrs_super_admin_session') return { value: 'valid-super-token' };
          return undefined;
        }),
      };
      vi.mocked(cookies).mockResolvedValue(mockCookies as any);
      vi.mocked(isSuperAdminSessionValid).mockReturnValue({ valid: true, adminId: 'admin-123' });

      const { requireSuperAdmin } = await import('@/lib/admin-guard');
      const result = await requireSuperAdmin();
      expect(result).toEqual({ adminId: 'admin-123' });
    });

    it('throws when only regular admin session exists', async () => {
      const mockCookies = {
        get: vi.fn((name: string) => {
          if (name === 'starrs_admin_session') return { value: 'valid-token' };
          return undefined;
        }),
      };
      vi.mocked(cookies).mockResolvedValue(mockCookies as any);
      vi.mocked(isSuperAdminSessionValid).mockReturnValue({ valid: false, adminId: null });

      const { requireSuperAdmin } = await import('@/lib/admin-guard');
      await expect(requireSuperAdmin()).rejects.toThrow();
    });
  });

  describe('getClientIP', () => {
    it('extracts IP from x-forwarded-for header', async () => {
      const mockHeaders = {
        get: vi.fn((name: string) => {
          if (name === 'x-forwarded-for') return '1.2.3.4, 5.6.7.8';
          return null;
        }),
      };
      vi.mocked((await import('next/headers')).headers).mockResolvedValue(mockHeaders as any);

      const { getClientIPFromHeaders } = await import('@/lib/admin-guard');
      const ip = await getClientIPFromHeaders();
      expect(ip).toBe('1.2.3.4');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/lib/admin-guard.test.ts --reporter=verbose
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement admin-guard.ts**

Create `src/lib/admin-guard.ts`:

```typescript
'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isAdminSessionValid, ADMIN_SESSION_COOKIE } from './admin-auth';
import { isSuperAdminSessionValid, SUPER_ADMIN_SESSION_COOKIE } from './super-admin-auth';

export async function requireAdmin(): Promise<{ adminType: 'admin' | 'super_admin' }> {
  const cookieStore = await cookies();

  // Check super admin first (higher privilege)
  const superToken = cookieStore.get(SUPER_ADMIN_SESSION_COOKIE)?.value;
  if (superToken) {
    const { valid } = isSuperAdminSessionValid(superToken);
    if (valid) return { adminType: 'super_admin' };
  }

  // Check regular admin
  const adminToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (adminToken && isAdminSessionValid(adminToken)) {
    return { adminType: 'admin' };
  }

  redirect('/admin/login');
}

export async function requireSuperAdmin(): Promise<{ adminId: string }> {
  const cookieStore = await cookies();
  const superToken = cookieStore.get(SUPER_ADMIN_SESSION_COOKIE)?.value;

  if (superToken) {
    const { valid, adminId } = isSuperAdminSessionValid(superToken);
    if (valid && adminId) return { adminId };
  }

  throw new Error('Super admin access required');
}

export async function getClientIPFromHeaders(): Promise<string> {
  const headerStore = await headers();
  const forwarded = headerStore.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headerStore.get('x-real-ip') || 'unknown';
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/lib/admin-guard.test.ts --reporter=verbose
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-guard.ts tests/unit/lib/admin-guard.test.ts
git commit -m "feat: add admin-guard with requireAdmin, requireSuperAdmin for Server Components"
```

---

### Task 3: Create Validation Schemas

**Files:**
- Create: `src/lib/validation.ts`
- Create: `tests/unit/lib/validation-schemas.test.ts`
- Reference: `src/types/index.ts` (Branch type at lines 146-158, MenuItem at lines 16-36)

- [ ] **Step 1: Write failing tests for branch schema (pilot)**

Create `tests/unit/lib/validation-schemas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  branchSchema,
  categorySchema,
  menuItemSchema,
  paymentMethodSchema,
  siteSettingsSchema,
  customerLinkSchema,
  customerUnlinkSchema,
  uuidSchema,
} from '@/lib/validation';

describe('validation schemas', () => {
  describe('uuidSchema', () => {
    it('accepts valid UUID', () => {
      expect(uuidSchema.safeParse('a1b2c3d4-e5f6-7890-abcd-ef1234567890').success).toBe(true);
    });
    it('rejects invalid UUID', () => {
      expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false);
    });
    it('rejects SQL injection', () => {
      expect(uuidSchema.safeParse("'; DROP TABLE orders;--").success).toBe(false);
    });
  });

  describe('branchSchema', () => {
    it('accepts valid branch', () => {
      const result = branchSchema.safeParse({
        name: 'Main Branch',
        address: '123 Main St',
        phone: '09171234567',
        latitude: '14.5995',
        longitude: '120.9842',
        is_active: true,
      });
      expect(result.success).toBe(true);
    });
    it('rejects empty name', () => {
      expect(branchSchema.safeParse({ name: '', address: '123', phone: '091', latitude: '0', longitude: '0' }).success).toBe(false);
    });
    it('rejects name exceeding max length', () => {
      expect(branchSchema.safeParse({ name: 'x'.repeat(201), address: '123' }).success).toBe(false);
    });
    it('strips XSS from name', () => {
      const result = branchSchema.safeParse({
        name: '<script>alert("xss")</script>Branch',
        address: '123 Main St',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).not.toContain('<script>');
      }
    });
  });

  describe('categorySchema', () => {
    it('accepts valid category', () => {
      expect(categorySchema.safeParse({ name: 'Shakes', icon: '🥤' }).success).toBe(true);
    });
    it('rejects empty name', () => {
      expect(categorySchema.safeParse({ name: '' }).success).toBe(false);
    });
  });

  describe('menuItemSchema', () => {
    it('accepts valid menu item', () => {
      const result = menuItemSchema.safeParse({
        name: 'Classic Shake',
        price: 150,
        category_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      });
      expect(result.success).toBe(true);
    });
    it('rejects zero price', () => {
      expect(menuItemSchema.safeParse({ name: 'Item', price: 0, category_id: 'valid-uuid' }).success).toBe(false);
    });
    it('rejects negative price', () => {
      expect(menuItemSchema.safeParse({ name: 'Item', price: -10, category_id: 'valid-uuid' }).success).toBe(false);
    });
  });

  describe('customerLinkSchema', () => {
    it('accepts valid link request', () => {
      const result = customerLinkSchema.safeParse({
        order_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        customer_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567891',
        reason: 'Phone match',
      });
      expect(result.success).toBe(true);
    });
    it('rejects invalid reason', () => {
      expect(customerLinkSchema.safeParse({
        order_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        customer_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567891',
        reason: 'because I want to',
      }).success).toBe(false);
    });
  });

  describe('customerUnlinkSchema', () => {
    it('accepts valid unlink request', () => {
      const result = customerUnlinkSchema.safeParse({
        order_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        reason: 'Incorrect match',
      });
      expect(result.success).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/lib/validation-schemas.test.ts --reporter=verbose
```

- [ ] **Step 3: Implement validation.ts**

Create `src/lib/validation.ts`:

```typescript
import { z } from 'zod';

// Strip HTML tags for XSS prevention
const sanitizeString = (val: string) => val.replace(/<[^>]*>/g, '').trim();

export const uuidSchema = z.string().uuid();

export const branchSchema = z.object({
  name: z.string().min(1).max(200).transform(sanitizeString),
  address: z.string().min(1).max(500).transform(sanitizeString),
  phone: z.string().min(1).max(20),
  latitude: z.string().max(50),  // Stored as string in DB
  longitude: z.string().max(50), // Stored as string in DB
  is_active: z.boolean().optional().default(true),
  is_main: z.boolean().optional().default(false),
  messenger_username: z.string().max(100).optional().transform(val => val ? sanitizeString(val) : val),
});

export const categorySchema = z.object({
  name: z.string().min(1).max(100).transform(sanitizeString),
  icon: z.string().max(50).optional(),
  id_slug: z.string().max(100).regex(/^[a-z0-9-]+$/, 'Must be kebab-case').optional(),
});

export const menuItemSchema = z.object({
  name: z.string().min(1).max(200).transform(sanitizeString),
  price: z.number().positive(),
  category_id: uuidSchema,
  description: z.string().max(1000).optional().transform(val => val ? sanitizeString(val) : val),
  image_url: z.string().url().optional().nullable(),
  is_available: z.boolean().optional().default(true),
  show_in_messenger: z.boolean().optional().default(true),
});

export const paymentMethodSchema = z.object({
  name: z.string().min(1).max(200).transform(sanitizeString),
  type: z.string().max(50).optional(),
  account_name: z.string().max(200).optional().transform(val => val ? sanitizeString(val) : val),
  account_number: z.string().max(100).optional(),
  qr_code_url: z.string().url().optional().nullable(),
  is_active: z.boolean().optional().default(true),
});

export const siteSettingsSchema = z.object({
  store_name: z.string().min(1).max(200).optional().transform(val => val ? sanitizeString(val) : val),
  store_phone: z.string().max(20).optional(),
  delivery_fee: z.number().min(0).optional(),
  min_order_amount: z.number().min(0).optional(),
  is_open: z.boolean().optional(),
  announcement: z.string().max(500).optional().transform(val => val ? sanitizeString(val) : val),
}).partial();

const LINK_REASONS = ['Phone match', 'Messenger match', 'Manual identification', 'Other'] as const;
const UNLINK_REASONS = ['Incorrect match', 'Customer request', 'Duplicate resolution', 'Other'] as const;

export const customerLinkSchema = z.object({
  order_id: uuidSchema,
  customer_id: uuidSchema,
  reason: z.enum(LINK_REASONS),
});

export const customerUnlinkSchema = z.object({
  order_id: uuidSchema,
  reason: z.enum(UNLINK_REASONS),
});

export const reorderSchema = z.object({
  ids: z.array(uuidSchema).min(1),
});

export type BranchInput = z.infer<typeof branchSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type MenuItemInput = z.infer<typeof menuItemSchema>;
export type PaymentMethodInput = z.infer<typeof paymentMethodSchema>;
export type SiteSettingsInput = z.infer<typeof siteSettingsSchema>;
export type CustomerLinkInput = z.infer<typeof customerLinkSchema>;
export type CustomerUnlinkInput = z.infer<typeof customerUnlinkSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/lib/validation-schemas.test.ts --reporter=verbose
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation.ts tests/unit/lib/validation-schemas.test.ts
git commit -m "feat: add Zod validation schemas for all admin mutations"
```

---

### Task 4: Admin Layout, Sidebar, Login Page

**Files:**
- Create: `src/components/admin/Sidebar.tsx`
- Create: `app/admin/layout.tsx`
- Create: `app/admin/page.tsx`
- Create: `app/admin/loading.tsx`
- Create: `app/admin/error.tsx`
- Create: `app/admin/not-found.tsx`
- Create: `app/(admin-auth)/admin/login/page.tsx`
- Reference: `src/lib/admin-guard.ts` (requireAdmin)
- Reference: `src/components/AdminDashboard.tsx` (existing login UI at lines 1-80)
- Reference: `src/components/SuperAdminLogin.tsx` (super admin login)
- Reference: `src/components/CustomerManager.tsx` (branding reference — lines 168-230 for styling patterns)

**Important:** Read the spec Section 7 (UI/UX Design) for exact brand colors, fonts, and sidebar design.

- [ ] **Step 1: Create Sidebar component**

Create `src/components/admin/Sidebar.tsx` — a `'use client'` component with:
- Sidebar nav using the brand palette from spec Section 7
- Icons from lucide-react: `ClipboardList`, `UtensilsCrossed`, `LayoutGrid`, `Users`, `MapPin`, `CreditCard`, `Settings`, `MessageCircle`
- `usePathname()` from `next/navigation` for active state
- Props: `adminType: 'admin' | 'super_admin'` — hide Facebook for regular admins
- Mobile hamburger toggle with state
- Logout button at bottom calling `/api/admin/auth/logout`
- Active state: `bg-[#7BBFB5]/10 text-[#3D8A80] border-r-2 border-[#7BBFB5]`
- Logo text "starr's famous shakes" in teal at top

- [ ] **Step 2: Create admin layout**

Create `app/admin/layout.tsx`:

```typescript
import { requireAdmin } from '@/lib/admin-guard';
import { Sidebar } from '@/components/admin/Sidebar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { adminType } = await requireAdmin();

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex">
      <Sidebar adminType={adminType} />
      <main className="flex-1 lg:ml-60 min-h-screen">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Create admin root page (redirect)**

Create `app/admin/page.tsx`:

```typescript
import { redirect } from 'next/navigation';

export default function AdminPage() {
  redirect('/admin/orders');
}
```

- [ ] **Step 4: Create loading, error, not-found**

Create `app/admin/loading.tsx` — skeleton with sidebar bones + content area shimmer using `animate-pulse` and `bg-[#E8E3DA]`.

Create `app/admin/error.tsx`:

```typescript
'use client';

export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center p-8">
        <h2 className="text-xl font-playfair font-semibold text-stone-900 mb-2">Something went wrong</h2>
        <p className="text-sm font-nunito text-stone-500 mb-4">An error occurred while loading this page.</p>
        <button onClick={reset}
          className="px-4 py-2.5 bg-[#7BBFB5] text-[#F0EBE0] font-nunito font-semibold text-sm rounded-[10px] hover:bg-[#3D8A80] transition-all duration-200">
          Try again
        </button>
      </div>
    </div>
  );
}
```

Create `app/admin/not-found.tsx` — branded 404 with link to `/admin/orders`.

- [ ] **Step 5: Create login page (route group)**

Create `app/(admin-auth)/admin/login/page.tsx` — a `'use client'` component that:
- Combines regular admin login (password field) and super admin login (email + password, toggled via tab/link)
- Uses the existing login API endpoints: `POST /api/admin/auth/login` and `POST /api/admin/auth/super-login`
- On success: `router.push('/admin/orders')`
- Brand styling matching spec Section 7
- Read existing `src/components/SuperAdminLogin.tsx` and the login section of `src/components/AdminDashboard.tsx` for the current UI/logic to replicate

- [ ] **Step 6: Verify the layout renders**

```bash
npm run dev
```

Navigate to `/admin/login` — should see login form without sidebar.
Navigate to `/admin` — should redirect to login if no session, or show sidebar + redirect to `/admin/orders` if authenticated.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/ app/admin/ app/\(admin-auth\)/
git commit -m "feat: add admin layout with sidebar nav, login page, error/loading states"
```

---

### Task 5: Database Migration (customer_link_audit)

**Files:**
- Create: Supabase migration file

- [ ] **Step 1: Create migration**

Use the Supabase MCP tool or create the migration file directly. The SQL from spec Section 10:

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

ALTER TABLE customer_link_audit ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_customer_link_audit_order ON customer_link_audit(order_id);
CREATE INDEX idx_customer_link_audit_customer ON customer_link_audit(customer_id);
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

Or use the Supabase MCP `apply_migration` tool.

- [ ] **Step 3: Verify table exists**

Query: `SELECT * FROM customer_link_audit LIMIT 0;` — should return empty result with correct columns.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add customer_link_audit table for order linking audit trail"
```

---

## Phase 2: Pilot Migration (Branches — Simplest Section)

### Task 6: Branches Server Actions + Tests

**Files:**
- Create: `src/actions/branches.ts`
- Create: `tests/unit/actions/branches.test.ts`
- Reference: `app/api/admin/branches/route.ts` — current GET/POST logic
- Reference: `app/api/admin/branches/[id]/route.ts` — current PATCH/DELETE logic
- Reference: `src/components/BranchManager.tsx` — current branch UI logic
- Reference: `src/types/index.ts:146-158` — Branch type

- [ ] **Step 1: Write failing tests for branch actions**

Create `tests/unit/actions/branches.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/admin-guard', () => ({
  requireAdmin: vi.fn(),
  getClientIPFromHeaders: vi.fn().mockResolvedValue('127.0.0.1'),
}));

vi.mock('@/lib/supabase-server', () => {
  const mockFrom = vi.fn();
  return {
    supabaseServer: { from: mockFrom },
    __mockFrom: mockFrom,
  };
});

import { requireAdmin } from '@/lib/admin-guard';
import { revalidatePath } from 'next/cache';

describe('branch actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue({ adminType: 'admin' });
  });

  describe('addBranch', () => {
    it('validates input and creates branch', async () => {
      const { supabaseServer } = await import('@/lib/supabase-server');
      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: '123', name: 'Test' }, error: null }),
        }),
      });
      vi.mocked(supabaseServer.from).mockReturnValue({ insert: mockInsert } as any);

      const { addBranch } = await import('@/actions/branches');
      const result = await addBranch({ name: 'New Branch', address: '123 Main St' });

      expect(result.success).toBe(true);
      expect(requireAdmin).toHaveBeenCalled();
      expect(revalidatePath).toHaveBeenCalledWith('/admin/branches');
    });

    it('rejects invalid input', async () => {
      const { addBranch } = await import('@/actions/branches');
      const result = await addBranch({ name: '', address: '' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects unauthenticated request', async () => {
      vi.mocked(requireAdmin).mockRejectedValue(new Error('redirect'));

      const { addBranch } = await import('@/actions/branches');
      await expect(addBranch({ name: 'Test' })).rejects.toThrow();
    });
  });

  describe('updateBranch', () => {
    it('validates UUID and updates', async () => {
      const { supabaseServer } = await import('@/lib/supabase-server');
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: '123' }, error: null }),
          }),
        }),
      });
      vi.mocked(supabaseServer.from).mockReturnValue({ update: mockUpdate } as any);

      const { updateBranch } = await import('@/actions/branches');
      const result = await updateBranch('a1b2c3d4-e5f6-7890-abcd-ef1234567890', { name: 'Updated' });

      expect(result.success).toBe(true);
    });

    it('rejects invalid UUID', async () => {
      const { updateBranch } = await import('@/actions/branches');
      const result = await updateBranch('not-a-uuid', { name: 'Test' });

      expect(result.success).toBe(false);
    });
  });

  describe('deleteBranch', () => {
    it('deletes branch by valid UUID', async () => {
      const { supabaseServer } = await import('@/lib/supabase-server');
      const mockDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      vi.mocked(supabaseServer.from).mockReturnValue({ delete: mockDelete } as any);

      const { deleteBranch } = await import('@/actions/branches');
      const result = await deleteBranch('a1b2c3d4-e5f6-7890-abcd-ef1234567890');

      expect(result.success).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/actions/branches.test.ts --reporter=verbose
```

- [ ] **Step 3: Implement branches Server Actions**

Create `src/actions/branches.ts`:

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import { branchSchema, uuidSchema } from '@/lib/validation';

type ActionResult = { success: boolean; error?: string; data?: any };

export async function addBranch(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = branchSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const { data: branch, error } = await supabaseServer
    .from('branches')
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    console.error('[addBranch] DB error:', error.code);
    return { success: false, error: 'Failed to create branch' };
  }

  revalidatePath('/admin/branches');
  return { success: true, data: branch };
}

export async function updateBranch(id: unknown, input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success) return { success: false, error: 'Invalid branch ID' };

  const parsed = branchSchema.partial().safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const { data: branch, error } = await supabaseServer
    .from('branches')
    .update(parsed.data)
    .eq('id', idResult.data)
    .select()
    .single();

  if (error) {
    console.error('[updateBranch] DB error:', error.code);
    return { success: false, error: 'Failed to update branch' };
  }

  revalidatePath('/admin/branches');
  return { success: true, data: branch };
}

export async function deleteBranch(id: unknown): Promise<ActionResult> {
  await requireAdmin();
  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success) return { success: false, error: 'Invalid branch ID' };

  const { error } = await supabaseServer
    .from('branches')
    .delete()
    .eq('id', idResult.data);

  if (error) {
    console.error('[deleteBranch] DB error:', error.code);
    return { success: false, error: 'Failed to delete branch' };
  }

  revalidatePath('/admin/branches');
  return { success: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/actions/branches.test.ts --reporter=verbose
```

- [ ] **Step 5: Commit**

```bash
git add src/actions/branches.ts tests/unit/actions/branches.test.ts
git commit -m "feat: add branch Server Actions with Zod validation and tests"
```

---

### Task 7: Branches Page + Client Island

**Files:**
- Create: `src/components/admin/BranchForm.tsx`
- Create: `app/admin/branches/page.tsx`
- Create: `app/admin/branches/loading.tsx`
- Create: `app/admin/branches/error.tsx`
- Reference: `src/components/BranchManager.tsx` — replicate UI/functionality
- Reference: `src/components/LocationPicker.tsx` — reuse for lat/lng selection in BranchForm
- Reference: `src/types/index.ts:146-158` — Branch type
- Reference: spec Section 7 for brand styling

- [ ] **Step 1: Create BranchForm client island**

Create `src/components/admin/BranchForm.tsx` — a `'use client'` component that:
- Receives `branch?: Branch` prop (null for add, populated for edit)
- Has form fields matching existing BranchManager: name, address, messenger_username, is_active toggle
- Calls `addBranch()` or `updateBranch()` Server Actions on submit
- Shows loading state during submission
- Shows inline error on failure
- Closes on success (calls `onClose` prop)
- Uses Starr's brand styling from spec Section 7

- [ ] **Step 2: Create branches Server Component page**

Create `app/admin/branches/page.tsx`:

```typescript
import { requireAdmin } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import { BranchForm } from '@/components/admin/BranchForm';
import type { Branch } from '@/types';

export default async function BranchesPage() {
  await requireAdmin();

  const { data: branches } = await supabaseServer
    .from('branches')
    .select('*')
    .order('created_at', { ascending: true });

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-playfair font-semibold text-stone-900">Branches</h1>
        {/* Add button triggers BranchForm island */}
      </div>

      {/* Branch list — rendered server-side */}
      {/* Each row has edit/delete actions via BranchForm island */}
      {/* Empty state if no branches */}
    </div>
  );
}
```

Implement the full page with branch cards/table, edit/delete modals using the BranchForm island. Pattern the UI after the existing BranchManager styling but using the consistent page layout from spec Section 7.

- [ ] **Step 3: Create loading.tsx and error.tsx**

Create `app/admin/branches/loading.tsx` — skeleton matching the branches page layout.
Create `app/admin/branches/error.tsx` — reuse the pattern from `app/admin/error.tsx`.

- [ ] **Step 4: Verify branches page works**

```bash
npm run dev
```

Navigate to `/admin/branches`:
- Should see all branches from database
- Add branch form should work
- Edit branch should work
- Delete branch should work
- Page should show loading skeleton during navigation

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/BranchForm.tsx app/admin/branches/
git commit -m "feat: add branches page with Server Component + BranchForm client island"
```

---

## Phase 3: Remaining Section Migrations

**Note:** Tasks 8-14 follow the same pattern as Tasks 6-7. For each section:
1. Create Server Actions in `src/actions/` with tests
2. Create the page as a Server Component
3. Create client islands for interactive features
4. Create loading.tsx and error.tsx
5. Verify and commit

### Task 8: Categories — Server Actions + Page

**Files:**
- Create: `src/actions/categories.ts`
- Create: `tests/unit/actions/categories.test.ts`
- Create: `src/components/admin/CategoryReorderList.tsx` (client island for drag-to-reorder)
- Create: `app/admin/categories/page.tsx`
- Create: `app/admin/categories/loading.tsx`
- Create: `app/admin/categories/error.tsx`
- Reference: `src/hooks/useCategories.ts` — current logic to replicate in Server Actions
- Reference: `app/api/admin/categories/route.ts` — GET/POST logic
- Reference: `app/api/admin/categories/[id]/route.ts` — PATCH/DELETE logic
- Reference: `app/api/admin/categories/reorder/route.ts` — reorder logic

- [ ] **Step 1: Write failing tests for category actions**

Test `addCategory`, `updateCategory`, `deleteCategory`, `reorderCategories` — same patterns as branches tests. Include tests for: auth failure, validation failure, DB error, reorder with invalid IDs.

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Implement category Server Actions** in `src/actions/categories.ts`

Follow the exact pattern from `src/actions/branches.ts`. Read the existing `app/api/admin/categories/route.ts` for the specific Supabase queries. The `reorderCategories` action accepts an array of IDs and updates `sort_order` for each.

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Create CategoryReorderList client island**

`'use client'` component that renders categories in a draggable list. On reorder, calls `reorderCategories` Server Action. Uses existing category row UI from `src/components/AdminDashboard.tsx` (the categories tab section).

- [ ] **Step 6: Create categories page + loading + error**

Server Component that fetches categories from Supabase, renders them, embeds `CategoryReorderList` as a client island.

- [ ] **Step 7: Verify and commit**

```bash
git add src/actions/categories.ts tests/unit/actions/categories.test.ts src/components/admin/CategoryReorderList.tsx app/admin/categories/
git commit -m "feat: add categories page with Server Component, reorder island, and Server Actions"
```

---

### Task 9: Settings — Server Actions + Page

**Files:**
- Create: `src/actions/settings.ts`
- Create: `tests/unit/actions/settings.test.ts`
- Create: `src/components/admin/SettingsForm.tsx` (client island)
- Create: `app/admin/settings/page.tsx`
- Create: `app/admin/settings/loading.tsx`
- Create: `app/admin/settings/error.tsx`
- Reference: `src/hooks/useSiteSettings.ts` — current logic
- Reference: `app/api/admin/site-settings/route.ts` — GET/PATCH logic

- [ ] **Step 1: Write tests for settings action**
- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Implement settings Server Action** (`updateSiteSettings`) — validates with `siteSettingsSchema`, updates via Supabase, revalidates `/admin/settings`
- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Create SettingsForm client island** — form with all site settings fields, calls `updateSiteSettings` on save
- [ ] **Step 6: Create settings page** — Server Component fetching from `site_settings` table, passing data to `SettingsForm`
- [ ] **Step 7: Create loading + error files**
- [ ] **Step 8: Verify and commit**

---

### Task 10: Payments — Server Actions + Page

**Files:**
- Create: `src/actions/payments.ts`
- Create: `tests/unit/actions/payments.test.ts`
- Create: `src/components/admin/PaymentReorderList.tsx` (client island)
- Create: `app/admin/payments/page.tsx`
- Create: `app/admin/payments/loading.tsx`
- Create: `app/admin/payments/error.tsx`
- Reference: `src/hooks/usePaymentMethods.ts` — current logic
- Reference: `app/api/admin/payment-methods/route.ts` — GET/POST
- Reference: `app/api/admin/payment-methods/[id]/route.ts` — PATCH/DELETE
- Reference: `app/api/admin/payment-methods/reorder/route.ts` — reorder

- [ ] **Step 1-8: Same pattern as Categories** — Server Actions (add, update, delete, reorder) + tests + page + client island for reorder + QR code image upload using existing `ImageUpload.tsx` component
- [ ] **Step 9: Verify and commit**

---

### Task 11: Menu — Server Actions + Page

**Files:**
- Create: `src/actions/menu.ts`
- Create: `tests/unit/actions/menu.test.ts`
- Create: `src/components/admin/MenuItemForm.tsx` (client island)
- Create: `app/admin/menu/page.tsx`
- Create: `app/admin/menu/loading.tsx`
- Create: `app/admin/menu/error.tsx`
- Reference: `src/hooks/useMenu.ts` — current logic (most complex hook)
- Reference: `app/api/admin/menu/route.ts` — GET/POST with variations and add_ons
- Reference: `app/api/admin/menu/[id]/route.ts` — PATCH/DELETE
- Reference: `app/api/admin/menu/bulk-messenger/route.ts` — bulk visibility toggle
- Reference: `src/lib/menu-utils.ts` — `mapMenuRows()` transformer

**This is the most complex section.** The menu has variations and add-ons. Read the existing API routes and `useMenu` hook carefully before implementing.

- [ ] **Step 1: Write tests for menu actions** — include `addMenuItem` with variations, `updateMenuItem`, `deleteMenuItem`, `bulkUpdateMessengerVisibility`
- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Implement menu Server Actions** — handle variations and add-ons as nested creates/updates. Use `mapMenuRows()` from `src/lib/menu-utils.ts` for consistent data transformation.
- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Create MenuItemForm client island** — form with variation management, add-on management, image upload (reuses `ImageUpload.tsx`)
- [ ] **Step 6: Create menu page** — Server Component that fetches menu items with variations and add-ons, grouped by category. Uses `supabaseServer.from('menu_items').select('*, variations(*), add_ons(*)')`.
- [ ] **Step 7: Create loading + error files**
- [ ] **Step 8: Verify and commit**

---

### Task 12: Customers Page

**Files:**
- Create: `src/components/admin/CustomerSearch.tsx` (client island)
- Create: `app/admin/customers/page.tsx`
- Create: `app/admin/customers/loading.tsx`
- Create: `app/admin/customers/error.tsx`
- Reference: `src/components/CustomerManager.tsx` — replicate layout and styling
- Reference: `src/components/CustomerListItem.tsx` — reuse
- Reference: `src/components/CustomerDetailPanel.tsx` — reuse

**Note:** Customers page is a hybrid — server-rendered initial list with client-side search/pagination. The `useCustomers` hook is kept (refactored in Task 16).

- [ ] **Step 1: Create CustomerSearch client island** — wraps the search input, tag filter, pagination controls, and add customer button. Uses `useCustomers` hook for search/filter. Renders `CustomerListItem` for each result.

- [ ] **Step 2: Create customers page** — Server Component that fetches initial customers (first page), passes to `CustomerSearch` as `initialData`. Also renders `CustomerDetailPanel` in the right pane (this is already a client component).

The page layout matches existing `CustomerManager.tsx`: left pane (40%) with list + search, right pane (60%) with detail panel. Summary strip (Total Customers, Total LTV, At Risk) fetched server-side.

- [ ] **Step 3: Create loading + error files**
- [ ] **Step 4: Verify and commit**

---

### Task 13: Orders Page (Server Wrapper + Client Content)

**Files:**
- Create: `app/admin/orders/page.tsx` (Server Component wrapper)
- Create: `app/admin/orders/OrdersContent.tsx` (Client Component — extracted from OrderManager)
- Create: `app/admin/orders/loading.tsx`
- Create: `app/admin/orders/error.tsx`
- Reference: `src/components/OrderManager.tsx` — main content to extract
- Reference: `src/hooks/useOrders.ts` — kept, used by OrdersContent
- Reference: `src/components/CustomerLinkWidget.tsx` — embedded in order rows

- [ ] **Step 1: Create Server Component wrapper**

`app/admin/orders/page.tsx`:

```typescript
import { requireAdmin } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import OrdersContent from './OrdersContent';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const { adminType } = await requireAdmin();

  // Prefetch initial data
  const { data: initialOrders } = await supabaseServer
    .from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false })
    .limit(50);

  const { data: branches } = await supabaseServer
    .from('branches')
    .select('id, name');

  return (
    <OrdersContent
      initialOrders={initialOrders || []}
      branches={branches || []}
      adminType={adminType}
    />
  );
}
```

- [ ] **Step 2: Create OrdersContent client component**

Extract the core of `src/components/OrderManager.tsx` into `app/admin/orders/OrdersContent.tsx`. This is a `'use client'` component that:
- Receives `initialOrders`, `branches`, `adminType` as props
- Uses `useOrders({ admin: true })` for real-time subscriptions
- Initializes with server-prefetched data
- Contains all the existing order management UI: filters, status updates, bulk actions, stats, CustomerLinkWidget
- Passes `adminType` to CustomerLinkWidget for super-admin unlink control

- [ ] **Step 3: Create loading + error files**
- [ ] **Step 4: Verify real-time updates still work**

```bash
npm run dev
```

Navigate to `/admin/orders`. Create an order from the storefront. Verify it appears in real-time.

- [ ] **Step 5: Commit**

```bash
git add app/admin/orders/
git commit -m "feat: add orders page with Server Component wrapper + real-time client content"
```

---

### Task 14: Facebook Page

**Files:**
- Create: `app/admin/facebook/page.tsx`
- Create: `app/admin/facebook/loading.tsx`
- Create: `app/admin/facebook/error.tsx`
- Create: `src/actions/facebook.ts`
- Reference: `src/components/FacebookConnect.tsx` — replicate functionality
- Reference: `app/api/admin/facebook/*` — current API routes

- [ ] **Step 1: Write tests for facebook actions**

Create `tests/unit/actions/facebook.test.ts`:
- Test `connectFacebook` requires super admin
- Test `disconnectFacebook` requires super admin
- Test regular admin is rejected
- Test input validation

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Create facebook Server Actions** — `connectFacebook`, `disconnectFacebook` with `requireSuperAdmin()` guard. Read existing `app/api/admin/facebook/connect/route.ts` and `disconnect/route.ts` for the Supabase logic to replicate.
- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Create facebook page** — mostly client-side (Facebook SDK needs browser). Server Component wrapper that verifies super admin access, renders client `FacebookConnectPanel`
- [ ] **Step 6: Create loading + error files**
- [ ] **Step 7: Verify and commit**

---

## Phase 4: Customer Linking Security

### Task 15: Refactor CustomerLinkWidget + API Guard

**Files:**
- Modify: `src/components/CustomerLinkWidget.tsx`
- Create: `src/actions/customers.ts`
- Create: `tests/unit/actions/customers.test.ts`
- Modify: `app/api/orders/[id]/route.ts` — add super-admin guard for unlinking
- Reference: spec Section 6 for exact behavior

- [ ] **Step 1: Write tests for customer linking actions**

Create `tests/unit/actions/customers.test.ts`:

```typescript
describe('customer actions', () => {
  describe('linkCustomer', () => {
    it('creates audit log entry on successful link', async () => {
      // Mock Supabase to verify insert into customer_link_audit
    });
    it('requires a valid reason', async () => {
      // Verify invalid reasons are rejected
    });
    it('rejects if customer does not exist', async () => {
      // Verify 404-like error
    });
  });

  describe('unlinkCustomer', () => {
    it('requires super admin', async () => {
      // Regular admin should be rejected
    });
    it('creates audit log with IP address', async () => {
      // Verify IP is logged
    });
    it('requires a valid reason', async () => {
      // Verify invalid reasons rejected
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement customer linking Server Actions**

Create `src/actions/customers.ts`:

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin, requireSuperAdmin, getClientIPFromHeaders } from '@/lib/admin-guard';
import { supabaseServer } from '@/lib/supabase-server';
import { customerLinkSchema, customerUnlinkSchema } from '@/lib/validation';

export async function linkCustomer(input: unknown) {
  const { adminType } = await requireAdmin();
  const parsed = customerLinkSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  // Verify customer exists
  const { data: customer } = await supabaseServer
    .from('customers').select('id').eq('id', parsed.data.customer_id).single();
  if (!customer) return { success: false, error: 'Customer not found' };

  // Update order
  const { error } = await supabaseServer
    .from('orders').update({ customer_id: parsed.data.customer_id }).eq('id', parsed.data.order_id);
  if (error) return { success: false, error: 'Failed to link customer' };

  // Resolve performer identity — email for super admins, 'admin' for regular
  let performedBy = 'admin';
  if (adminType === 'super_admin') {
    const { adminId } = await requireSuperAdmin();
    const { data: sa } = await supabaseServer
      .from('super_admins').select('email').eq('id', adminId).single();
    performedBy = sa?.email || adminId;
  }

  // Audit log
  const ip = await getClientIPFromHeaders();
  await supabaseServer.from('customer_link_audit').insert({
    order_id: parsed.data.order_id,
    customer_id: parsed.data.customer_id,
    action: 'link',
    reason: parsed.data.reason,
    performed_by: performedBy,
    admin_type: adminType,
    ip_address: ip,
  });

  revalidatePath('/admin/orders');
  return { success: true };
}

export async function unlinkCustomer(input: unknown) {
  const { adminId } = await requireSuperAdmin(); // Only super admins
  const parsed = customerUnlinkSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  // Get current customer_id before unlinking
  const { data: order } = await supabaseServer
    .from('orders').select('customer_id').eq('id', parsed.data.order_id).single();
  if (!order?.customer_id) return { success: false, error: 'Order has no linked customer' };

  // Unlink
  const { error } = await supabaseServer
    .from('orders').update({ customer_id: null }).eq('id', parsed.data.order_id);
  if (error) return { success: false, error: 'Failed to unlink customer' };

  // Resolve super admin email for audit
  const { data: sa } = await supabaseServer
    .from('super_admins').select('email').eq('id', adminId).single();
  const performedBy = sa?.email || adminId;

  // Audit log
  const ip = await getClientIPFromHeaders();
  await supabaseServer.from('customer_link_audit').insert({
    order_id: parsed.data.order_id,
    customer_id: order.customer_id,
    action: 'unlink',
    reason: parsed.data.reason,
    performed_by: performedBy,
    admin_type: 'super_admin',
    ip_address: ip,
  });

  revalidatePath('/admin/orders');
  return { success: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Add super-admin guard to PATCH /api/orders/[id]**

Read `app/api/orders/[id]/route.ts`. Find the section where `customer_id: null` is handled (unlinking). Add a check:

```typescript
// When customer_id is explicitly set to null (unlinking), require super admin
if (body.customer_id === null) {
  const superAdminResult = await isSuperAdminRequest(request);
  if (!superAdminResult.valid) {
    return NextResponse.json({ error: 'Super admin required for unlinking' }, { status: 403 });
  }
}
```

- [ ] **Step 6: Refactor CustomerLinkWidget**

Modify `src/components/CustomerLinkWidget.tsx`:
- Add reason dropdown before the "Confirm" button in the link flow
- Replace `window.confirm` unlink with a proper modal that includes reason dropdown
- Accept `adminType` prop — hide unlink button for regular admins
- Call `linkCustomer` and `unlinkCustomer` Server Actions instead of direct `fetch()`
- Keep the existing search/suggest UX unchanged

- [ ] **Step 7: Verify end-to-end**

Test: link a customer (should require reason), unlink as super admin (should require reason + log), attempt unlink as regular admin (should be blocked).

- [ ] **Step 8: Commit**

```bash
git add src/actions/customers.ts tests/unit/actions/customers.test.ts src/components/CustomerLinkWidget.tsx app/api/orders/\[id\]/route.ts
git commit -m "feat: secure customer linking with audit trail, super-admin-only unlinking"
```

---

## Phase 5: Cleanup + Hook Refactoring

### Task 16: Refactor useCustomers/useCustomer to Remove adminFetch

**Files:**
- Modify: `src/hooks/useCustomers.ts`
- Modify: `src/hooks/useCustomer.ts`

- [ ] **Step 1: Read both hooks to understand adminFetch usage**

Read `src/hooks/useCustomers.ts` and `src/hooks/useCustomer.ts`. Find all imports of `adminFetch` and `parseApiResponse`.

- [ ] **Step 2: Replace adminFetch with direct fetch**

In both hooks, replace:
```typescript
import { adminFetch, parseApiResponse } from '@/lib/admin-api';
const res = await adminFetch('/api/admin/customers', { ... });
const data = await parseApiResponse<T>(res);
```

With:
```typescript
const res = await fetch('/api/admin/customers', {
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  ...
});
if (!res.ok) throw new Error('Failed to fetch');
const data = await res.json();
```

- [ ] **Step 3: Verify customer features still work**

Navigate to `/admin/customers` and `/admin/orders` — search, pagination, detail panel, and link widget should all work.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCustomers.ts src/hooks/useCustomer.ts
git commit -m "refactor: remove adminFetch dependency from customer hooks"
```

---

### Task 17: Delete Retired Files

**Files to delete:** See the "DELETED FILES" section at top of this plan.

**Important:** Only delete after ALL section migrations are verified working.

- [ ] **Step 1: Verify all new pages are working**

Navigate to each admin page and verify functionality:
- `/admin/orders` — real-time updates, filters, status changes
- `/admin/menu` — add/edit/delete items with variations
- `/admin/categories` — add/edit/delete/reorder
- `/admin/customers` — search, detail panel, tags
- `/admin/branches` — add/edit/delete
- `/admin/payments` — add/edit/delete/reorder with QR upload
- `/admin/settings` — update and save
- `/admin/facebook` — connect/disconnect (super admin only)

- [ ] **Step 2: Delete retired hooks**

```bash
git rm src/hooks/useMenu.ts src/hooks/useCategories.ts src/hooks/usePaymentMethods.ts src/hooks/useSiteSettings.ts
```

- [ ] **Step 3: Delete retired API routes**

```bash
git rm app/api/admin/branches/route.ts app/api/admin/branches/\[id\]/route.ts
git rm app/api/admin/categories/route.ts app/api/admin/categories/\[id\]/route.ts app/api/admin/categories/reorder/route.ts
git rm app/api/admin/payment-methods/route.ts app/api/admin/payment-methods/\[id\]/route.ts app/api/admin/payment-methods/reorder/route.ts
git rm app/api/admin/site-settings/route.ts
git rm app/api/admin/menu/route.ts app/api/admin/menu/\[id\]/route.ts app/api/admin/menu/bulk-messenger/route.ts
git rm app/api/admin/facebook/connect/route.ts app/api/admin/facebook/disconnect/route.ts app/api/admin/facebook/status/route.ts
```

- [ ] **Step 4: Delete admin-api.ts, AdminDashboard.tsx, and orphan components**

```bash
git rm src/lib/admin-api.ts
git rm src/components/AdminDashboard.tsx
git rm src/components/BranchManager.tsx
git rm src/components/OrderManager.tsx
git rm src/components/CustomerManager.tsx
git rm src/components/SuperAdminLogin.tsx
git rm src/components/FacebookConnect.tsx
```

- [ ] **Step 5: Delete old admin page**

The old `app/admin/page.tsx` was already replaced in Task 4.

- [ ] **Step 6: Run build to verify no broken imports**

```bash
npm run build 2>&1 | tail -30
```

Expected: successful build with no import errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove retired hooks, API routes, AdminDashboard monolith, and admin-api wrapper"
```

---

## Phase 6: Security + Integration Tests

### Task 18: Rate Limiting on Server Actions

**Files:**
- Modify: `src/actions/branches.ts`, `src/actions/categories.ts`, `src/actions/menu.ts`, `src/actions/payments.ts`, `src/actions/settings.ts`, `src/actions/customers.ts`, `src/actions/facebook.ts`
- Reference: `src/lib/server-rate-limit.ts` — existing `checkServerRateLimit(key, limit, windowMs)`
- Reference: `src/lib/admin-guard.ts` — `getClientIPFromHeaders()`

- [ ] **Step 1: Add rate limiting helper**

Add to `src/lib/admin-guard.ts`:

```typescript
import { checkServerRateLimit } from './server-rate-limit';

export async function checkActionRateLimit(): Promise<{ allowed: boolean }> {
  const ip = await getClientIPFromHeaders();
  const result = checkServerRateLimit(`action:${ip}`, 30, 60_000); // 30/min per IP
  return { allowed: !result.blocked };
}
```

- [ ] **Step 2: Add rate limit check to each mutation Server Action**

At the top of each mutation action (after `requireAdmin()`), add:

```typescript
const { allowed } = await checkActionRateLimit();
if (!allowed) return { success: false, error: 'Too many requests. Please try again later.' };
```

- [ ] **Step 3: Verify rate limiting works** — call an action 31 times rapidly, verify the 31st is rejected
- [ ] **Step 4: Commit**

```bash
git add src/lib/admin-guard.ts src/actions/
git commit -m "feat: add rate limiting to all mutation Server Actions (30/min/IP)"
```

---

### Task 19: Component Tests

**Files:**
- Create: `tests/unit/components/CustomerLinkWidget.test.tsx`
- Create: `tests/unit/components/MenuItemForm.test.tsx`
- Create: `tests/unit/components/CategoryReorderList.test.tsx`

- [ ] **Step 1: Write CustomerLinkWidget tests**

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import CustomerLinkWidget from '@/components/CustomerLinkWidget';

describe('CustomerLinkWidget', () => {
  it('shows link button when no customer linked', () => {
    render(<CustomerLinkWidget order={{ id: '1', contact_number: '091' }} />);
    expect(screen.getByText('Link Customer')).toBeInTheDocument();
  });

  it('shows customer name when linked', () => {
    render(<CustomerLinkWidget order={{ id: '1', contact_number: '091', customer_id: 'c1', customer_name: 'Maria' }} />);
    expect(screen.getByText('Maria')).toBeInTheDocument();
  });

  it('hides unlink button for regular admin', () => {
    render(<CustomerLinkWidget order={{ id: '1', contact_number: '091', customer_id: 'c1', customer_name: 'Maria' }} adminType="admin" />);
    expect(screen.queryByLabelText('Unlink customer')).not.toBeInTheDocument();
  });

  it('shows unlink button for super admin', () => {
    render(<CustomerLinkWidget order={{ id: '1', contact_number: '091', customer_id: 'c1', customer_name: 'Maria' }} adminType="super_admin" />);
    expect(screen.getByLabelText('Unlink customer')).toBeInTheDocument();
  });

  it('requires reason selection before linking', async () => {
    // Render, open dropdown, search, select customer, verify reason dropdown appears
  });
});
```

- [ ] **Step 2: Write MenuItemForm and CategoryReorderList tests** — similar pattern, render with mock data, simulate interactions
- [ ] **Step 3: Run component tests**

```bash
npx vitest run tests/unit/components/ --reporter=verbose
```

- [ ] **Step 4: Commit**

```bash
git add tests/unit/components/
git commit -m "test: add component tests for CustomerLinkWidget, MenuItemForm, CategoryReorderList"
```

---

### Task 20: Integration Tests

**Files:**
- Create: `tests/integration/auth-flow.test.ts`
- Create: `tests/integration/customer-linking.test.ts`
- Create: `tests/integration/order-management.test.ts`
- Create: `tests/integration/menu-management.test.ts`

- [ ] **Step 1: Write auth flow integration test**

```typescript
describe('auth flow', () => {
  it('login → session valid → access pages → logout → access denied', async () => {
    // POST /api/admin/auth/login → get session cookie
    // GET /api/admin/auth/session with cookie → 200
    // POST /api/admin/auth/logout → cookie cleared
    // GET /api/admin/auth/session without cookie → 401
  });

  it('unauthenticated requests to admin pages redirect to login', async () => {
    // Verify requireAdmin throws redirect for /admin/menu, /admin/orders, etc.
  });

  it('handles concurrent admin + super admin sessions', async () => {
    // Set both cookies, verify requireAdmin returns super_admin
  });
});
```

- [ ] **Step 2: Write customer linking integration test**

```typescript
describe('customer linking', () => {
  it('link → audit log created → unlink (super admin) → audit log created', async () => {
    // Call linkCustomer action → verify customer_link_audit row
    // Call unlinkCustomer action → verify second audit row
  });

  it('regular admin cannot unlink', async () => {
    // Mock regular admin session → call unlinkCustomer → expect rejection
  });

  it('revalidation works after link/unlink', async () => {
    // Verify revalidatePath was called
  });
});
```

- [ ] **Step 3: Write order and menu management integration tests**
- [ ] **Step 4: Run all integration tests**

```bash
npx vitest run tests/integration/ --reporter=verbose
```

- [ ] **Step 5: Commit**

```bash
git add tests/integration/
git commit -m "test: add integration tests for auth flow, customer linking, orders, and menu"
```

---

### Task 21: Security Test Suite

**Files:**
- Create: `tests/security/auth-bypass.test.ts`
- Create: `tests/security/input-validation.test.ts`
- Create: `tests/security/authorization.test.ts`
- Create: `tests/security/rate-limiting.test.ts`

- [ ] **Step 1: Write auth bypass tests**

```typescript
describe('auth bypass', () => {
  it('requireAdmin throws redirect when no cookies', async () => { ... });
  it('requireAdmin throws redirect with expired token', async () => { ... });
  it('requireAdmin throws redirect with tampered token', async () => { ... });
  it('Server Actions reject unauthenticated calls', async () => { ... });
});
```

- [ ] **Step 2: Write input validation tests**

```typescript
describe('input validation', () => {
  it('rejects SQL injection in branch name', async () => {
    const result = await addBranch({ name: "'; DROP TABLE branches;--", address: '123', phone: '091', latitude: '0', longitude: '0' });
    // Should succeed but with sanitized name (HTML tags stripped)
  });
  it('rejects XSS payload in menu item description', async () => { ... });
  it('rejects oversized payloads', async () => { ... });
  it('rejects malformed UUIDs', async () => { ... });
});
```

- [ ] **Step 3: Write authorization tests**

```typescript
describe('authorization', () => {
  it('regular admin cannot unlink customer', async () => { ... });
  it('regular admin cannot access Facebook connect', async () => { ... });
  it('PATCH /api/orders/:id returns 403 for regular admin unlinking', async () => { ... });
});
```

- [ ] **Step 4: Write rate limiting tests**

```typescript
describe('rate limiting', () => {
  it('allows 30 mutations within 1 minute', async () => { ... });
  it('blocks the 31st mutation within 1 minute', async () => { ... });
  it('allows mutations again after window expires', async () => { ... });
});
```

- [ ] **Step 5: Run all security tests**

```bash
npx vitest run tests/security/ --reporter=verbose
```

- [ ] **Step 6: Commit**

```bash
git add tests/security/
git commit -m "test: add security test suite for auth bypass, input validation, authorization, rate limiting"
```

---

### Task 22: Run Full Test Suite + Final Verification

- [ ] **Step 1: Run all tests**

```bash
npx vitest run --reporter=verbose
```

Expected: all tests pass.

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: successful build.

- [ ] **Step 3: Smoke test all pages**

Manual verification of every admin route. Verify loading skeletons, error states, empty states, and mobile responsiveness.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: admin dashboard overhaul complete — SSR-first, Server Actions, full test coverage"
```

---

## Task Dependency Graph

```
Task 1 (deps) ──→ Task 2 (guard) ──→ Task 4 (layout) ──→ Task 6-7 (branches pilot)
                  Task 3 (schemas) ─┘                      │
                  Task 5 (DB migration) ──────────────┐    │
                                                      │    ▼
Task 6-7 (branches) ──→ Task 8 (categories) ──┐      │
                        Task 9 (settings)     ─┤      │
                        Task 10 (payments)    ─┤      │
                        Task 11 (menu)        ─┤──→ Task 17 (cleanup) ──→ Task 22 (final)
                        Task 12 (customers)   ─┤      │
                        Task 13 (orders) ──────┤      │
                        Task 14 (facebook)    ─┘      │
                              │                       │
                              ▼                       │
                        Task 15 (linking security) ←──┘  (depends on Task 5 + Task 13)
                              │
                        Task 16 (hook refactor) ──→ Task 17 (cleanup)
                        Task 18 (rate limiting) ──→ Task 22 (final)
                        Task 19 (component tests) ──→ Task 22 (final)
                        Task 20 (integration tests) ──→ Task 22 (final)
                        Task 21 (security tests) ──→ Task 22 (final)
```

**Parallelizable:**
- Tasks 8-14 can run in parallel after Task 7 proves the pattern
- Task 5 can run in parallel with Tasks 1-4
- Tasks 18-21 (testing tasks) can run in parallel with each other and with Phase 3
- Task 15 depends on BOTH Task 5 (DB migration) AND Task 13 (Orders page)
