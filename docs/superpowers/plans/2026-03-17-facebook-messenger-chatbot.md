# Facebook Messenger Chatbot Integration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable Facebook Messenger chatbot for product browsing, cart management, and checkout linking with live order status updates.

**Architecture:** Direct Facebook Messenger Platform API integration within existing Next.js app. New Super Admin role for Page connection. Secure hash-based session linking between Messenger cart and website checkout. Webhook-driven conversation state machine stored in Supabase.

**Tech Stack:** Next.js 15 API routes, Supabase (PostgreSQL), Facebook Messenger Platform API, Facebook JS SDK, bcrypt, HMAC-SHA256

**Spec:** `docs/superpowers/specs/2026-03-17-facebook-messenger-chatbot-design.md`

---

## Team Structure

### Team A — Backend & API (Coordinator: Backend Lead)
- **Backend Dev:** Database migrations, server libs, Supabase queries
- **API Dev:** API route handlers, webhook logic, Facebook API calls
- **Tester:** Unit tests, integration tests for every task

### Team B — Review & Optimization (Coordinator: Review Lead)
- **Reviewer:** Code review after each task group
- **Optimizer:** Performance, security hardening, edge case coverage

**Communication:** Team A completes a task group → Team B reviews → fixes applied → next task group.

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260317000000_messenger_integration.sql` | All new tables + column additions |
| `scripts/create-super-admin.ts` | CLI for super admin provisioning |
| `src/lib/super-admin-auth.ts` | Super admin auth: bcrypt verify, session, middleware |
| `src/lib/messenger.ts` | Send API helpers, template builders |
| `src/lib/messenger-session.ts` | Cart hydration, checkout session hash logic |
| `src/lib/messenger-auth.ts` | Facebook token exchange, Page subscription |
| `app/api/admin/auth/super-login/route.ts` | Super admin login endpoint |
| `app/api/admin/facebook/connect/route.ts` | OAuth token exchange + webhook subscribe |
| `app/api/admin/facebook/disconnect/route.ts` | Unsubscribe + remove tokens |
| `app/api/admin/facebook/status/route.ts` | Connection status check |
| `app/api/messenger/webhook/route.ts` | Webhook verification + message handling |
| `app/api/messenger/session/[hash]/route.ts` | Validate checkout session, return hydrated cart |
| `src/components/FacebookConnect.tsx` | Facebook Login button + connection UI |
| `src/components/SuperAdminLogin.tsx` | Super admin login form |
| `tests/lib/super-admin-auth.test.ts` | Unit tests for super admin auth |
| `tests/lib/messenger.test.ts` | Unit tests for Send API helpers |
| `tests/lib/messenger-session.test.ts` | Unit tests for session hash + cart hydration |
| `tests/api/super-login.test.ts` | Integration tests for super admin login |
| `tests/api/facebook-connect.test.ts` | Integration tests for FB connection |
| `tests/api/messenger-webhook.test.ts` | Integration tests for webhook |
| `tests/api/messenger-checkout.test.ts` | Integration tests for checkout session |
| `tests/api/order-messenger-notify.test.ts` | Integration tests for status notifications |

### Modified Files
| File | Change |
|------|--------|
| `src/types/index.ts` | Add `show_in_messenger` to MenuItem, new Messenger types |
| `app/api/admin/menu/route.ts` | Accept `show_in_messenger` in POST |
| `app/api/admin/menu/[id]/route.ts` | Accept `show_in_messenger` in PUT |
| `app/api/orders/route.ts` | Handle `msession` param, create messenger_order_links |
| `app/api/orders/[id]/route.ts` | Send Messenger notification on status change |
| `src/components/AdminDashboard.tsx` | Super admin detection, Facebook Integration section |
| `src/components/MenuManager.tsx` | Show in Messenger toggle |
| `src/components/OrderManager.tsx` | Messenger badge + notification toggle |
| `src/contexts/CartContext.tsx` | Support loading cart from msession |
| `.env.local` | Add Facebook env vars |
| `package.json` | Add bcryptjs dependency |

---

## Task 1: Environment Setup & Dependencies

**Files:**
- Modify: `.env.local`
- Modify: `package.json`

- [ ] **Step 1: Add environment variables to `.env.local`**

```
FACEBOOK_APP_ID=1477113107453692
FACEBOOK_APP_SECRET=c081f1c89a0d806aa915bbd5d3bbfbf7
FACEBOOK_VERIFY_TOKEN=starrs_messenger_verify_2026
MESSENGER_SESSION_SECRET=starrs_messenger_session_secret_2026
SUPER_ADMIN_PASSWORD=SuperStarrs@2026
```

- [ ] **Step 2: Install bcryptjs**

Run: `npm install bcryptjs && npm install -D @types/bcryptjs`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json .env.local
git commit -m "chore: add Facebook Messenger env vars and bcryptjs dependency"
```

---

## Task 2: Database Migration

**Files:**
- Create: `supabase/migrations/20260317000000_messenger_integration.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Super Admins table
CREATE TABLE IF NOT EXISTS super_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Facebook config (super-admin-only)
CREATE TABLE IF NOT EXISTS facebook_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id text NOT NULL,
  page_name text NOT NULL,
  page_access_token text NOT NULL,
  app_id text NOT NULL,
  token_expires_at timestamptz,
  connected_at timestamptz DEFAULT now(),
  connected_by uuid REFERENCES super_admins(id)
);

-- Messenger conversation sessions
CREATE TABLE IF NOT EXISTS messenger_sessions (
  psid text PRIMARY KEY,
  state text NOT NULL DEFAULT 'idle' CHECK (state IN ('idle','browsing_categories','browsing_products','viewing_cart','selecting_variation','selecting_addons','selecting_branch')),
  current_category text,
  selected_branch text,
  current_page integer DEFAULT 0,
  pending_item_id text,
  pending_variation_id text,
  pending_add_ons jsonb DEFAULT '[]'::jsonb,
  cart jsonb DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now()
);

-- Messenger checkout sessions (secure hash linking)
CREATE TABLE IF NOT EXISTS messenger_checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hash text UNIQUE NOT NULL,
  psid text NOT NULL,
  cart jsonb NOT NULL,
  branch_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','expired')),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  order_id text
);

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_hash ON messenger_checkout_sessions(hash);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_status ON messenger_checkout_sessions(status, expires_at);

-- Messenger order links (for status notifications)
CREATE TABLE IF NOT EXISTS messenger_order_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text UNIQUE NOT NULL,
  psid text NOT NULL,
  notify_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_links_order_id ON messenger_order_links(order_id);

-- Add show_in_messenger to menu_items
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS show_in_messenger boolean DEFAULT false;

-- Trigger for messenger_sessions updated_at
CREATE TRIGGER update_messenger_sessions_updated_at
  BEFORE UPDATE ON messenger_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

- [ ] **Step 2: Apply migration**

Run: `npx supabase db push` (or apply via Supabase dashboard)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260317000000_messenger_integration.sql
git commit -m "feat: add database migration for Messenger integration tables"
```

---

## Task 3: TypeScript Types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add Messenger types to `src/types/index.ts`**

Add after existing types:

```typescript
// Add to MenuItem interface
// show_in_messenger?: boolean;

// Messenger types
export interface MessengerSession {
  psid: string;
  state: 'idle' | 'browsing_categories' | 'browsing_products' | 'viewing_cart' | 'selecting_variation' | 'selecting_addons' | 'selecting_branch';
  current_category: string | null;
  selected_branch: string | null;
  current_page: number;
  pending_item_id: string | null;
  pending_variation_id: string | null;
  pending_add_ons: string[];
  cart: MessengerCartItem[];
  updated_at: string;
}

export interface MessengerCartItem {
  menu_item_id: string;
  variation_id: string | null;
  add_on_ids: string[];
  quantity: number;
}

export interface MessengerCheckoutSession {
  id: string;
  hash: string;
  psid: string;
  cart: CartItem[];
  branch_id: string | null;
  status: 'pending' | 'completed' | 'expired';
  created_at: string;
  expires_at: string;
  order_id: string | null;
}

export interface MessengerOrderLink {
  id: string;
  order_id: string;
  psid: string;
  notify_enabled: boolean;
  created_at: string;
}

export interface FacebookConfig {
  id: string;
  page_id: string;
  page_name: string;
  page_access_token: string;
  app_id: string;
  token_expires_at: string | null;
  connected_at: string;
  connected_by: string;
}
```

- [ ] **Step 2: Add `show_in_messenger` to MenuItem interface**

In the existing `MenuItem` interface, add:
```typescript
show_in_messenger?: boolean;
```

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add TypeScript types for Messenger integration"
```

---

## Task 4: Super Admin Auth Library

**Files:**
- Create: `src/lib/super-admin-auth.ts`
- Create: `tests/lib/super-admin-auth.test.ts`

- [ ] **Step 1: Write failing tests for super admin auth**

```typescript
// tests/lib/super-admin-auth.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

describe('super-admin-auth', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  });

  it('createSuperAdminSessionToken returns a signed token', async () => {
    const { createSuperAdminSessionToken } = await import('../../src/lib/super-admin-auth');
    const token = createSuperAdminSessionToken('test-admin-id');
    expect(token).toMatch(/^\d+\..+\..+$/); // expiresAt.adminId.signature
  });

  it('isSuperAdminSessionValid validates a good token', async () => {
    const { createSuperAdminSessionToken, isSuperAdminSessionValid } = await import('../../src/lib/super-admin-auth');
    const token = createSuperAdminSessionToken('test-admin-id');
    const result = isSuperAdminSessionValid(token);
    expect(result).toEqual({ valid: true, adminId: 'test-admin-id' });
  });

  it('isSuperAdminSessionValid rejects expired token', async () => {
    const { createSuperAdminSessionToken, isSuperAdminSessionValid } = await import('../../src/lib/super-admin-auth');
    const pastTime = Date.now() - 100000;
    const token = createSuperAdminSessionToken('test-admin-id', pastTime);
    const result = isSuperAdminSessionValid(token);
    expect(result).toEqual({ valid: false, adminId: null });
  });

  it('isSuperAdminSessionValid rejects tampered token', async () => {
    const { isSuperAdminSessionValid } = await import('../../src/lib/super-admin-auth');
    const result = isSuperAdminSessionValid('99999999999.fake-id.badsignature');
    expect(result).toEqual({ valid: false, adminId: null });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/super-admin-auth.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Install vitest if not present**

Run: `npm install -D vitest`

- [ ] **Step 4: Implement super admin auth**

```typescript
// src/lib/super-admin-auth.ts
import { createHmac, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';

const SUPER_ADMIN_SESSION_COOKIE = 'starrs_super_admin_session';
const SUPER_ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function getSessionSecret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback-dev-secret';
}

function sign(data: string): string {
  return createHmac('sha256', getSessionSecret()).update(data).digest('hex');
}

export function createSuperAdminSessionToken(adminId: string, now?: number): string {
  const expiresAt = (now ?? Date.now()) + SUPER_ADMIN_SESSION_TTL_MS;
  const payload = `${expiresAt}.${adminId}`;
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function isSuperAdminSessionValid(token?: string | null, now?: number): { valid: boolean; adminId: string | null } {
  if (!token) return { valid: false, adminId: null };

  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, adminId: null };

  const [expiresAtStr, adminId, signature] = parts;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt)) return { valid: false, adminId: null };
  if ((now ?? Date.now()) > expiresAt) return { valid: false, adminId: null };

  const expected = sign(`${expiresAtStr}.${adminId}`);
  try {
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length) return { valid: false, adminId: null };
    if (!timingSafeEqual(sigBuf, expBuf)) return { valid: false, adminId: null };
  } catch {
    return { valid: false, adminId: null };
  }

  return { valid: true, adminId };
}

export async function verifySuperAdminPassword(inputPassword: string, storedHash: string): Promise<boolean> {
  return bcrypt.compare(inputPassword, storedHash);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function isSuperAdminRequest(request: NextRequest): { valid: boolean; adminId: string | null } {
  const cookieValue = request.cookies.get(SUPER_ADMIN_SESSION_COOKIE)?.value;
  return isSuperAdminSessionValid(cookieValue);
}

export function requireSuperAdminRequest(request: NextRequest): NextResponse | null {
  const { valid } = isSuperAdminRequest(request);
  if (!valid) {
    return NextResponse.json({ error: 'Super admin authentication required' }, { status: 401 });
  }
  return null;
}

export function setSuperAdminSessionCookie(response: NextResponse, adminId: string): void {
  const token = createSuperAdminSessionToken(adminId);
  response.cookies.set(SUPER_ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: SUPER_ADMIN_SESSION_TTL_MS / 1000,
    path: '/',
  });
}

export function clearSuperAdminSessionCookie(response: NextResponse): void {
  response.cookies.set(SUPER_ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  });
}

export { SUPER_ADMIN_SESSION_COOKIE };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/lib/super-admin-auth.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/super-admin-auth.ts tests/lib/super-admin-auth.test.ts
git commit -m "feat: add super admin auth library with unit tests"
```

---

## Task 5: Super Admin Login Endpoint

**Files:**
- Create: `app/api/admin/auth/super-login/route.ts`
- Create: `tests/api/super-login.test.ts`

- [ ] **Step 1: Write failing integration tests**

```typescript
// tests/api/super-login.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
vi.mock('../../src/lib/supabase-server', () => ({
  supabaseServer: {
    from: vi.fn(() => ({
      select: mockSelect.mockReturnValue({
        eq: mockEq.mockReturnValue({
          single: mockSingle,
        }),
      }),
    })),
  },
}));

vi.mock('../../src/lib/super-admin-auth', async () => {
  const actual = await vi.importActual('../../src/lib/super-admin-auth');
  return {
    ...actual,
    verifySuperAdminPassword: vi.fn(),
  };
});

describe('POST /api/admin/auth/super-login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for missing email or password', async () => {
    const { POST } = await import('../../app/api/admin/auth/super-login/route');
    const request = new Request('http://localhost/api/admin/auth/super-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '' }),
    });
    const response = await POST(request as any);
    expect(response.status).toBe(400);
  });

  it('returns 401 for non-existent email', async () => {
    mockSingle.mockResolvedValue({ data: null, error: null });
    const { POST } = await import('../../app/api/admin/auth/super-login/route');
    const request = new Request('http://localhost/api/admin/auth/super-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fake@test.com', password: 'wrong' }),
    });
    const response = await POST(request as any);
    expect(response.status).toBe(401);
  });

  it('returns 200 with cookie for valid credentials', async () => {
    const { verifySuperAdminPassword } = await import('../../src/lib/super-admin-auth');
    (verifySuperAdminPassword as any).mockResolvedValue(true);
    mockSingle.mockResolvedValue({
      data: { id: 'admin-uuid', email: 'admin@test.com', password_hash: '$2a$12$hash' },
      error: null,
    });

    const { POST } = await import('../../app/api/admin/auth/super-login/route');
    const request = new Request('http://localhost/api/admin/auth/super-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'correct' }),
    });
    const response = await POST(request as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/api/super-login.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement super admin login endpoint**

```typescript
// app/api/admin/auth/super-login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import {
  verifySuperAdminPassword,
  setSuperAdminSessionCookie,
} from '@/lib/super-admin-auth';

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const { data: admin, error } = await supabaseServer
    .from('super_admins')
    .select('id, email, password_hash')
    .eq('email', email)
    .single();

  if (error || !admin) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const passwordValid = await verifySuperAdminPassword(password, admin.password_hash);
  if (!passwordValid) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const response = NextResponse.json({ success: true, adminId: admin.id });
  setSuperAdminSessionCookie(response, admin.id);
  return response;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/api/super-login.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/auth/super-login/route.ts tests/api/super-login.test.ts
git commit -m "feat: add super admin login endpoint with integration tests"
```

---

## Task 6: Super Admin Provisioning Script

**Files:**
- Create: `scripts/create-super-admin.ts`

- [ ] **Step 1: Write provisioning script**

```typescript
// scripts/create-super-admin.ts
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

async function main() {
  const args = process.argv.slice(2);
  const emailIdx = args.indexOf('--email');
  const passwordIdx = args.indexOf('--password');

  if (emailIdx === -1 || passwordIdx === -1) {
    console.error('Usage: npx ts-node scripts/create-super-admin.ts --email <email> --password <password>');
    process.exit(1);
  }

  const email = args[emailIdx + 1];
  const password = args[passwordIdx + 1];

  if (!email || !password) {
    console.error('Email and password are required');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Password must be at least 8 characters');
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const passwordHash = await bcrypt.hash(password, 12);

  const { data, error } = await supabase
    .from('super_admins')
    .insert({ email: email.toLowerCase().trim(), password_hash: passwordHash })
    .select('id, email')
    .single();

  if (error) {
    console.error('Failed to create super admin:', error.message);
    process.exit(1);
  }

  console.log(`Super admin created: ${data.email} (ID: ${data.id})`);
}

main();
```

- [ ] **Step 2: Test manually**

Run: `npx ts-node scripts/create-super-admin.ts --email admin@starrs.com --password SuperStarrs@2026`
Expected: "Super admin created: admin@starrs.com (ID: ...)"

- [ ] **Step 3: Commit**

```bash
git add scripts/create-super-admin.ts
git commit -m "feat: add super admin provisioning CLI script"
```

---

## Task 7: Messenger Send API Helpers

**Files:**
- Create: `src/lib/messenger.ts`
- Create: `tests/lib/messenger.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/messenger.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

global.fetch = vi.fn();

describe('messenger send helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sendTextMessage sends correct payload', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: () => ({ message_id: '123' }) });
    const { sendTextMessage } = await import('../../src/lib/messenger');
    await sendTextMessage('PSID_123', 'Hello!', 'PAGE_TOKEN');
    expect(fetch).toHaveBeenCalledWith(
      'https://graph.facebook.com/v21.0/me/messages',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"text":"Hello!"'),
      })
    );
  });

  it('buildCategoryQuickReplies builds correct format', async () => {
    const { buildCategoryQuickReplies } = await import('../../src/lib/messenger');
    const categories = [
      { id: 'coffee', name: 'Coffee', icon: '☕', sort_order: 0, active: true },
      { id: 'desserts', name: 'Desserts', icon: '🍰', sort_order: 1, active: true },
    ];
    const result = buildCategoryQuickReplies(categories);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      content_type: 'text',
      title: '☕ Coffee',
      payload: 'CATEGORY_coffee',
    });
  });

  it('buildProductCards builds generic template elements', async () => {
    const { buildProductCards } = await import('../../src/lib/messenger');
    const items = [{
      id: 'item-1',
      name: 'Iced Latte',
      description: 'Cold coffee',
      basePrice: 120,
      category: 'coffee',
      image: 'https://example.com/latte.jpg',
    }];
    const result = buildProductCards(items as any, 'https://mysite.com');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Iced Latte');
    expect(result[0].subtitle).toContain('₱120');
    expect(result[0].buttons).toHaveLength(2); // Add to Cart + View Details
  });

  it('buildCartSummary formats cart correctly', async () => {
    const { buildCartSummary } = await import('../../src/lib/messenger');
    const cart = [
      { name: 'Iced Latte', variation: 'Large', quantity: 2, unitPrice: 150 },
      { name: 'Croissant', variation: null, quantity: 1, unitPrice: 85 },
    ];
    const result = buildCartSummary(cart);
    expect(result).toContain('Iced Latte');
    expect(result).toContain('₱385');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/messenger.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement messenger helpers**

```typescript
// src/lib/messenger.ts
const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// --- Send API Calls ---

export async function sendTextMessage(psid: string, text: string, pageToken: string): Promise<void> {
  await callSendAPI(psid, { text }, pageToken);
}

export async function sendQuickReplies(
  psid: string,
  text: string,
  quickReplies: QuickReply[],
  pageToken: string
): Promise<void> {
  await callSendAPI(psid, { text, quick_replies: quickReplies }, pageToken);
}

export async function sendGenericTemplate(
  psid: string,
  elements: GenericElement[],
  pageToken: string
): Promise<void> {
  await callSendAPI(psid, {
    attachment: {
      type: 'template',
      payload: { template_type: 'generic', elements },
    },
  }, pageToken);
}

export async function sendButtonTemplate(
  psid: string,
  text: string,
  buttons: Button[],
  pageToken: string
): Promise<void> {
  await callSendAPI(psid, {
    attachment: {
      type: 'template',
      payload: { template_type: 'button', text, buttons },
    },
  }, pageToken);
}

async function callSendAPI(psid: string, message: Record<string, unknown>, pageToken: string): Promise<void> {
  const response = await fetch(`${GRAPH_API_BASE}/me/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${pageToken}`,
    },
    body: JSON.stringify({
      recipient: { id: psid },
      messaging_type: 'RESPONSE',
      message,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error('Send API error:', error);
  }
}

// --- Template Builders ---

export interface QuickReply {
  content_type: 'text';
  title: string;
  payload: string;
}

export interface GenericElement {
  title: string;
  subtitle?: string;
  image_url?: string;
  buttons?: Button[];
}

export interface Button {
  type: 'postback' | 'web_url';
  title: string;
  payload?: string;
  url?: string;
  webview_height_ratio?: 'compact' | 'tall' | 'full';
}

export function buildCategoryQuickReplies(
  categories: Array<{ id: string; name: string; icon: string }>
): QuickReply[] {
  return categories.map((cat) => ({
    content_type: 'text' as const,
    title: `${cat.icon} ${cat.name}`,
    payload: `CATEGORY_${cat.id}`,
  }));
}

export function buildProductCards(
  items: Array<{
    id: string;
    name: string;
    description?: string;
    basePrice: number;
    image?: string;
    discountPrice?: number;
    discountActive?: boolean;
  }>,
  siteUrl: string
): GenericElement[] {
  return items.map((item) => {
    const price = item.discountActive && item.discountPrice ? item.discountPrice : item.basePrice;
    const priceText = item.discountActive && item.discountPrice
      ? `₱${item.discountPrice} (was ₱${item.basePrice})`
      : `₱${item.basePrice}`;

    return {
      title: item.name,
      subtitle: `${priceText}\n${(item.description || '').slice(0, 60)}`,
      image_url: item.image || undefined,
      buttons: [
        { type: 'postback' as const, title: 'Add to Cart', payload: `ADD_TO_CART_${item.id}` },
        { type: 'web_url' as const, title: 'View Details', url: `${siteUrl}/product/${item.id}` },
      ],
    };
  });
}

export function buildCartSummary(
  cart: Array<{ name: string; variation: string | null; quantity: number; unitPrice: number }>
): string {
  if (cart.length === 0) return 'Your cart is empty.';

  let total = 0;
  const lines = cart.map((item, i) => {
    const itemTotal = item.unitPrice * item.quantity;
    total += itemTotal;
    const variationStr = item.variation ? ` (${item.variation})` : '';
    return `${i + 1}. ${item.name}${variationStr} x${item.quantity} — ₱${itemTotal}`;
  });

  lines.push(`\nTotal: ₱${total}`);
  return lines.join('\n');
}

export function buildStatusMessage(
  orderNumber: string,
  status: string,
  serviceType?: string,
  trackingUrl?: string
): string {
  const messages: Record<string, string> = {
    confirmed: `Your order #${orderNumber} has been confirmed! We're getting it ready.`,
    preparing: `Your order #${orderNumber} is now being prepared.`,
    ready: `Your order #${orderNumber} is ready! ${serviceType === 'delivery' ? 'Your rider is on the way.' : 'Please proceed to pick it up.'}`,
    out_for_delivery: `Your order #${orderNumber} is out for delivery!${trackingUrl ? ` Track it here: ${trackingUrl}` : ''}`,
    completed: `Your order #${orderNumber} is complete. Thank you for ordering with Starr's Famous Shakes!`,
    cancelled: `Your order #${orderNumber} has been cancelled. Please contact us if you have questions.`,
  };
  return messages[status] || `Your order #${orderNumber} status has been updated to: ${status}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/messenger.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/messenger.ts tests/lib/messenger.test.ts
git commit -m "feat: add Messenger Send API helpers and template builders with tests"
```

---

## Task 8: Messenger Session & Checkout Hash Library

**Files:**
- Create: `src/lib/messenger-session.ts`
- Create: `tests/lib/messenger-session.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/messenger-session.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('messenger-session', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.MESSENGER_SESSION_SECRET = 'test-secret-key';
  });

  it('generateCheckoutHash creates a non-empty hash', async () => {
    const { generateCheckoutHash } = await import('../../src/lib/messenger-session');
    const hash = generateCheckoutHash();
    expect(hash).toBeTruthy();
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(20);
  });

  it('generateCheckoutHash creates unique hashes', async () => {
    const { generateCheckoutHash } = await import('../../src/lib/messenger-session');
    const hash1 = generateCheckoutHash();
    const hash2 = generateCheckoutHash();
    expect(hash1).not.toBe(hash2);
  });

  it('verifyWebhookSignature validates correct signature', async () => {
    const { verifyWebhookSignature } = await import('../../src/lib/messenger-session');
    const { createHmac } = await import('crypto');
    const body = '{"test":"data"}';
    const appSecret = 'test-app-secret';
    const sig = 'sha256=' + createHmac('sha256', appSecret).update(body).digest('hex');
    expect(verifyWebhookSignature(body, sig, appSecret)).toBe(true);
  });

  it('verifyWebhookSignature rejects bad signature', async () => {
    const { verifyWebhookSignature } = await import('../../src/lib/messenger-session');
    expect(verifyWebhookSignature('body', 'sha256=bad', 'secret')).toBe(false);
  });

  it('isCheckoutSessionExpired returns true for expired session', async () => {
    const { isCheckoutSessionExpired } = await import('../../src/lib/messenger-session');
    const past = new Date(Date.now() - 60000).toISOString();
    expect(isCheckoutSessionExpired(past)).toBe(true);
  });

  it('isCheckoutSessionExpired returns false for valid session', async () => {
    const { isCheckoutSessionExpired } = await import('../../src/lib/messenger-session');
    const future = new Date(Date.now() + 60000).toISOString();
    expect(isCheckoutSessionExpired(future)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/messenger-session.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement session helpers**

```typescript
// src/lib/messenger-session.ts
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

function getSessionSecret(): string {
  const secret = process.env.MESSENGER_SESSION_SECRET;
  if (!secret) throw new Error('MESSENGER_SESSION_SECRET not set');
  return secret;
}

export function generateCheckoutHash(): string {
  const uuid = randomUUID();
  const timestamp = Date.now().toString();
  const data = `${uuid}.${timestamp}`;
  const signature = createHmac('sha256', getSessionSecret()).update(data).digest('hex');
  return `${uuid}-${signature}`;
}

export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  appSecret: string
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const received = signatureHeader.replace('sha256=', '');
  try {
    const expBuf = Buffer.from(expected, 'hex');
    const recBuf = Buffer.from(received, 'hex');
    if (expBuf.length !== recBuf.length) return false;
    return timingSafeEqual(expBuf, recBuf);
  } catch {
    return false;
  }
}

export function isCheckoutSessionExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() < Date.now();
}

export function getCheckoutExpiresAt(): string {
  return new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/messenger-session.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/messenger-session.ts tests/lib/messenger-session.test.ts
git commit -m "feat: add Messenger session hash and webhook verification with tests"
```

---

## Task 9: Facebook Auth Library (Token Exchange)

**Files:**
- Create: `src/lib/messenger-auth.ts`

- [ ] **Step 1: Implement token exchange and Page subscription**

```typescript
// src/lib/messenger-auth.ts
const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export interface PageInfo {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  tokenExpiresAt: string | null;
}

export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<string> {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) throw new Error('Facebook app credentials not configured');

  const url = `${GRAPH_API_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Token exchange failed: ${JSON.stringify(err)}`);
  }
  const data = await res.json();
  return data.access_token;
}

export async function getPageAccessToken(userAccessToken: string): Promise<PageInfo[]> {
  const url = `${GRAPH_API_BASE}/me/accounts?access_token=${userAccessToken}&fields=id,name,access_token`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to get pages: ${JSON.stringify(err)}`);
  }
  const data = await res.json();
  return (data.data || []).map((page: any) => ({
    pageId: page.id,
    pageName: page.name,
    pageAccessToken: page.access_token,
    tokenExpiresAt: null, // Long-lived page tokens don't have a clear expiry via this endpoint
  }));
}

export async function subscribePageToWebhook(pageId: string, pageAccessToken: string): Promise<void> {
  const url = `${GRAPH_API_BASE}/${pageId}/subscribed_apps`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: pageAccessToken,
      subscribed_fields: ['messages', 'messaging_postbacks', 'messaging_optins'],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Webhook subscription failed: ${JSON.stringify(err)}`);
  }
}

export async function unsubscribePageFromWebhook(pageId: string, pageAccessToken: string): Promise<void> {
  const url = `${GRAPH_API_BASE}/${pageId}/subscribed_apps`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: pageAccessToken }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('Webhook unsubscription failed:', err);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/messenger-auth.ts
git commit -m "feat: add Facebook token exchange and Page subscription helpers"
```

---

## Task 10: Facebook Connect/Disconnect/Status Endpoints

**Files:**
- Create: `app/api/admin/facebook/connect/route.ts`
- Create: `app/api/admin/facebook/disconnect/route.ts`
- Create: `app/api/admin/facebook/status/route.ts`

- [ ] **Step 1: Implement connect endpoint**

```typescript
// app/api/admin/facebook/connect/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { requireSuperAdminRequest, isSuperAdminRequest } from '@/lib/super-admin-auth';
import { exchangeForLongLivedToken, getPageAccessToken, subscribePageToWebhook } from '@/lib/messenger-auth';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authError = requireSuperAdminRequest(request);
  if (authError) return authError;

  const { adminId } = isSuperAdminRequest(request);

  let body: { accessToken: string; pageId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.accessToken) {
    return NextResponse.json({ error: 'accessToken is required' }, { status: 400 });
  }

  try {
    // Exchange for long-lived token
    const longLivedToken = await exchangeForLongLivedToken(body.accessToken);

    // Get pages the user manages
    const pages = await getPageAccessToken(longLivedToken);
    if (pages.length === 0) {
      return NextResponse.json({ error: 'No Facebook Pages found for this account' }, { status: 400 });
    }

    // Use specified page or first page
    const page = body.pageId
      ? pages.find((p) => p.pageId === body.pageId)
      : pages[0];

    if (!page) {
      return NextResponse.json({ error: 'Specified page not found' }, { status: 400 });
    }

    // Subscribe page to webhook
    await subscribePageToWebhook(page.pageId, page.pageAccessToken);

    // Clear existing config and insert new
    await supabaseServer.from('facebook_config').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    const { error: insertError } = await supabaseServer.from('facebook_config').insert({
      page_id: page.pageId,
      page_name: page.pageName,
      page_access_token: page.pageAccessToken,
      app_id: process.env.FACEBOOK_APP_ID || '',
      connected_by: adminId,
    });

    if (insertError) {
      return NextResponse.json({ error: 'Failed to save config' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      page: { id: page.pageId, name: page.pageName },
      pages: pages.map((p) => ({ id: p.pageId, name: p.pageName })),
    });
  } catch (err: any) {
    console.error('Facebook connect error:', err);
    return NextResponse.json({ error: err.message || 'Connection failed' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Implement disconnect endpoint**

```typescript
// app/api/admin/facebook/disconnect/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { requireSuperAdminRequest } from '@/lib/super-admin-auth';
import { unsubscribePageFromWebhook } from '@/lib/messenger-auth';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authError = requireSuperAdminRequest(request);
  if (authError) return authError;

  try {
    const { data: config } = await supabaseServer
      .from('facebook_config')
      .select('page_id, page_access_token')
      .single();

    if (config) {
      await unsubscribePageFromWebhook(config.page_id, config.page_access_token);
      await supabaseServer.from('facebook_config').delete().eq('page_id', config.page_id);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Facebook disconnect error:', err);
    return NextResponse.json({ error: err.message || 'Disconnect failed' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Implement status endpoint**

```typescript
// app/api/admin/facebook/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { isAdminRequest } from '@/lib/admin-auth';
import { isSuperAdminRequest } from '@/lib/super-admin-auth';

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Both regular admin and super admin can check status
  const isAdmin = isAdminRequest(request);
  const { valid: isSuperAdmin } = isSuperAdminRequest(request);

  if (!isAdmin && !isSuperAdmin) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { data: config } = await supabaseServer
    .from('facebook_config')
    .select('page_id, page_name, app_id, connected_at, token_expires_at')
    .single();

  if (!config) {
    return NextResponse.json({ connected: false });
  }

  const tokenExpiring = config.token_expires_at
    ? new Date(config.token_expires_at).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000
    : false;

  return NextResponse.json({
    connected: true,
    pageName: config.page_name,
    pageId: config.page_id,
    connectedAt: config.connected_at,
    tokenExpiring,
    isSuperAdmin,
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/facebook/connect/route.ts app/api/admin/facebook/disconnect/route.ts app/api/admin/facebook/status/route.ts
git commit -m "feat: add Facebook connect/disconnect/status admin endpoints"
```

**--- TEAM B REVIEW CHECKPOINT 1 ---**
Review Tasks 1-10: Database migration, types, super admin auth, messenger helpers, Facebook auth.

---

## Task 11: Messenger Webhook Endpoint

**Files:**
- Create: `app/api/messenger/webhook/route.ts`
- Create: `tests/api/messenger-webhook.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/api/messenger-webhook.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('GET /api/messenger/webhook (verification)', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.FACEBOOK_VERIFY_TOKEN = 'test-verify-token';
  });

  it('returns challenge when verify_token matches', async () => {
    const { GET } = await import('../../app/api/messenger/webhook/route');
    const url = new URL('http://localhost/api/messenger/webhook');
    url.searchParams.set('hub.mode', 'subscribe');
    url.searchParams.set('hub.verify_token', 'test-verify-token');
    url.searchParams.set('hub.challenge', 'CHALLENGE_123');
    const request = new Request(url.toString());
    const response = await GET(request as any);
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).toBe('CHALLENGE_123');
  });

  it('returns 403 when verify_token does not match', async () => {
    const { GET } = await import('../../app/api/messenger/webhook/route');
    const url = new URL('http://localhost/api/messenger/webhook');
    url.searchParams.set('hub.mode', 'subscribe');
    url.searchParams.set('hub.verify_token', 'wrong-token');
    url.searchParams.set('hub.challenge', 'CHALLENGE_123');
    const request = new Request(url.toString());
    const response = await GET(request as any);
    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/api/messenger-webhook.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement webhook endpoint**

```typescript
// app/api/messenger/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { verifyWebhookSignature } from '@/lib/messenger-session';
import { handleMessengerEvent } from '@/lib/messenger-handler';

// Webhook verification
export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.FACEBOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse('Forbidden', { status: 403 });
}

// Incoming messages
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();

  // Verify signature
  const signature = request.headers.get('x-hub-signature-256') || '';
  const appSecret = process.env.FACEBOOK_APP_SECRET || '';
  if (!verifyWebhookSignature(rawBody, signature, appSecret)) {
    return new NextResponse('Invalid signature', { status: 403 });
  }

  // Get page token
  const { data: config } = await supabaseServer
    .from('facebook_config')
    .select('page_access_token')
    .single();

  if (!config) {
    console.error('No Facebook config found');
    return new NextResponse('OK', { status: 200 }); // Always 200 to Facebook
  }

  const body = JSON.parse(rawBody);

  if (body.object === 'page') {
    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        // Process asynchronously to respond quickly
        handleMessengerEvent(event, config.page_access_token).catch((err) =>
          console.error('Messenger event error:', err)
        );
      }
    }
  }

  return new NextResponse('OK', { status: 200 });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/api/messenger-webhook.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/messenger/webhook/route.ts tests/api/messenger-webhook.test.ts
git commit -m "feat: add Messenger webhook endpoint with verification tests"
```

---

## Task 12: Messenger Event Handler (Conversation State Machine)

**Files:**
- Create: `src/lib/messenger-handler.ts`

- [ ] **Step 1: Implement the conversation handler**

```typescript
// src/lib/messenger-handler.ts
import { supabaseServer } from '@/lib/supabase-server';
import {
  sendTextMessage,
  sendQuickReplies,
  sendGenericTemplate,
  sendButtonTemplate,
  buildCategoryQuickReplies,
  buildProductCards,
  buildCartSummary,
  type QuickReply,
} from '@/lib/messenger';
import { generateCheckoutHash, getCheckoutExpiresAt } from '@/lib/messenger-session';
import type { MessengerSession, MessengerCartItem } from '@/types';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://starrs.vercel.app';
const PRODUCTS_PER_PAGE = 10;

export async function handleMessengerEvent(event: any, pageToken: string): Promise<void> {
  const psid: string = event.sender?.id;
  if (!psid) return;

  // Get or create session
  let session = await getOrCreateSession(psid);

  if (event.message?.text) {
    await handleTextMessage(psid, event.message.text, session, pageToken);
  } else if (event.postback?.payload) {
    await handlePostback(psid, event.postback.payload, session, pageToken);
  } else if (event.message?.quick_reply?.payload) {
    await handlePostback(psid, event.message.quick_reply.payload, session, pageToken);
  }
}

async function getOrCreateSession(psid: string): Promise<MessengerSession> {
  const { data } = await supabaseServer
    .from('messenger_sessions')
    .select('*')
    .eq('psid', psid)
    .single();

  if (data) return data as MessengerSession;

  const newSession: Partial<MessengerSession> = {
    psid,
    state: 'idle',
    current_category: null,
    selected_branch: null,
    current_page: 0,
    pending_item_id: null,
    pending_variation_id: null,
    pending_add_ons: [],
    cart: [],
  };

  await supabaseServer.from('messenger_sessions').insert(newSession);
  return newSession as MessengerSession;
}

async function updateSession(psid: string, updates: Partial<MessengerSession>): Promise<void> {
  await supabaseServer.from('messenger_sessions').update(updates).eq('psid', psid);
}

async function handleTextMessage(psid: string, text: string, session: MessengerSession, pageToken: string): Promise<void> {
  // Any text message resets to category browsing
  await showCategories(psid, pageToken);
}

async function handlePostback(psid: string, payload: string, session: MessengerSession, pageToken: string): Promise<void> {
  if (payload === 'GET_STARTED' || payload === 'MAIN_MENU') {
    await showCategories(psid, pageToken);
  } else if (payload.startsWith('CATEGORY_')) {
    const categoryId = payload.replace('CATEGORY_', '');
    await showProducts(psid, categoryId, 0, pageToken);
  } else if (payload === 'MORE_PRODUCTS') {
    const session = await getOrCreateSession(psid);
    if (session.current_category) {
      await showProducts(psid, session.current_category, session.current_page + 1, pageToken);
    }
  } else if (payload.startsWith('ADD_TO_CART_')) {
    const itemId = payload.replace('ADD_TO_CART_', '');
    await handleAddToCart(psid, itemId, pageToken);
  } else if (payload.startsWith('SELECT_VARIATION_')) {
    const variationId = payload.replace('SELECT_VARIATION_', '');
    await handleSelectVariation(psid, variationId, pageToken);
  } else if (payload.startsWith('SELECT_ADDON_')) {
    const addonId = payload.replace('SELECT_ADDON_', '');
    await handleSelectAddon(psid, addonId, pageToken);
  } else if (payload === 'SKIP_ADDONS' || payload === 'DONE_ADDONS') {
    await finalizeCartItem(psid, pageToken);
  } else if (payload === 'VIEW_CART') {
    await showCart(psid, pageToken);
  } else if (payload === 'CONTINUE_SHOPPING') {
    await showCategories(psid, pageToken);
  } else if (payload === 'CLEAR_CART') {
    await updateSession(psid, { cart: [], state: 'idle' });
    await sendTextMessage(psid, 'Cart cleared!', pageToken);
    await showCategories(psid, pageToken);
  } else if (payload === 'CHECKOUT') {
    await handleCheckout(psid, pageToken);
  } else if (payload.startsWith('SELECT_BRANCH_')) {
    const branchId = payload.replace('SELECT_BRANCH_', '');
    await handleBranchSelected(psid, branchId, pageToken);
  } else if (payload.startsWith('REMOVE_ITEM_')) {
    const index = parseInt(payload.replace('REMOVE_ITEM_', ''), 10);
    await handleRemoveItem(psid, index, pageToken);
  }
}

async function showCategories(psid: string, pageToken: string): Promise<void> {
  const { data: categories } = await supabaseServer
    .from('categories')
    .select('id, name, icon')
    .eq('active', true)
    .order('sort_order');

  if (!categories || categories.length === 0) {
    await sendTextMessage(psid, 'No categories available right now.', pageToken);
    return;
  }

  await updateSession(psid, { state: 'browsing_categories', current_category: null, current_page: 0 });

  // Quick replies limited to 13 by Facebook
  const quickReplies = buildCategoryQuickReplies(categories.slice(0, 13));
  await sendQuickReplies(psid, 'Welcome to Starr\'s Famous Shakes! What are you craving?', quickReplies, pageToken);
}

async function showProducts(psid: string, categoryId: string, page: number, pageToken: string): Promise<void> {
  const offset = page * PRODUCTS_PER_PAGE;

  const { data: items, count } = await supabaseServer
    .from('menu_items')
    .select('id, name, description, base_price, image_url, discount_price, discount_active, discount_start_date, discount_end_date', { count: 'exact' })
    .eq('category', categoryId)
    .eq('available', true)
    .eq('show_in_messenger', true)
    .range(offset, offset + PRODUCTS_PER_PAGE - 1);

  if (!items || items.length === 0) {
    await sendTextMessage(psid, 'No items available in this category.', pageToken);
    await showCategories(psid, pageToken);
    return;
  }

  await updateSession(psid, { state: 'browsing_products', current_category: categoryId, current_page: page });

  const mapped = items.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    basePrice: item.base_price,
    image: item.image_url,
    discountPrice: item.discount_price,
    discountActive: item.discount_active,
  }));

  const cards = buildProductCards(mapped, SITE_URL);
  await sendGenericTemplate(psid, cards, pageToken);

  // Show "More" if there are more items
  const totalCount = count || 0;
  if (offset + PRODUCTS_PER_PAGE < totalCount) {
    await sendQuickReplies(psid, 'Want to see more?', [
      { content_type: 'text', title: 'More Products', payload: 'MORE_PRODUCTS' },
      { content_type: 'text', title: 'View Cart', payload: 'VIEW_CART' },
      { content_type: 'text', title: 'Back to Menu', payload: 'MAIN_MENU' },
    ], pageToken);
  }
}

async function handleAddToCart(psid: string, itemId: string, pageToken: string): Promise<void> {
  // Check if item has variations
  const { data: variations } = await supabaseServer
    .from('variations')
    .select('id, name, price')
    .eq('menu_item_id', itemId);

  if (variations && variations.length > 0) {
    await updateSession(psid, { state: 'selecting_variation', pending_item_id: itemId, pending_variation_id: null, pending_add_ons: [] });

    const quickReplies: QuickReply[] = variations.map((v) => ({
      content_type: 'text' as const,
      title: `${v.name} (+₱${v.price})`,
      payload: `SELECT_VARIATION_${v.id}`,
    }));
    await sendQuickReplies(psid, 'Choose a variation:', quickReplies, pageToken);
  } else {
    // No variations, check add-ons
    await updateSession(psid, { pending_item_id: itemId, pending_variation_id: null, pending_add_ons: [] });
    await checkAndShowAddOns(psid, itemId, pageToken);
  }
}

async function handleSelectVariation(psid: string, variationId: string, pageToken: string): Promise<void> {
  const session = await getOrCreateSession(psid);
  await updateSession(psid, { pending_variation_id: variationId });
  if (session.pending_item_id) {
    await checkAndShowAddOns(psid, session.pending_item_id, pageToken);
  }
}

async function checkAndShowAddOns(psid: string, itemId: string, pageToken: string): Promise<void> {
  const { data: addOns } = await supabaseServer
    .from('add_ons')
    .select('id, name, price')
    .eq('menu_item_id', itemId);

  if (addOns && addOns.length > 0) {
    await updateSession(psid, { state: 'selecting_addons' });
    const quickReplies: QuickReply[] = [
      ...addOns.slice(0, 10).map((a) => ({
        content_type: 'text' as const,
        title: `${a.name} (+₱${a.price})`,
        payload: `SELECT_ADDON_${a.id}`,
      })),
      { content_type: 'text' as const, title: 'Skip', payload: 'SKIP_ADDONS' },
    ];
    await sendQuickReplies(psid, 'Any extras? Tap to add, or skip.', quickReplies, pageToken);
  } else {
    await finalizeCartItem(psid, pageToken);
  }
}

async function handleSelectAddon(psid: string, addonId: string, pageToken: string): Promise<void> {
  const session = await getOrCreateSession(psid);
  const addOns = [...(session.pending_add_ons || []), addonId];
  await updateSession(psid, { pending_add_ons: addOns });

  // Show remaining add-ons or done option
  await sendQuickReplies(psid, 'Added! Want more extras?', [
    { content_type: 'text', title: 'Done', payload: 'DONE_ADDONS' },
  ], pageToken);
}

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

  // Check if same item+variation+addons exists, merge
  const existingIdx = cart.findIndex(
    (c) => c.menu_item_id === cartItem.menu_item_id &&
           c.variation_id === cartItem.variation_id &&
           JSON.stringify(c.add_on_ids.sort()) === JSON.stringify(cartItem.add_on_ids.sort())
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
  });

  // Get item name for confirmation
  const { data: item } = await supabaseServer.from('menu_items').select('name').eq('id', session.pending_item_id).single();
  const itemName = item?.name || 'Item';
  const totalItems = cart.reduce((sum, c) => sum + c.quantity, 0);

  await sendQuickReplies(psid, `${itemName} added! Cart: ${totalItems} item(s)`, [
    { content_type: 'text', title: 'Continue Shopping', payload: 'CONTINUE_SHOPPING' },
    { content_type: 'text', title: 'View Cart', payload: 'VIEW_CART' },
    { content_type: 'text', title: 'Checkout', payload: 'CHECKOUT' },
  ], pageToken);
}

async function showCart(psid: string, pageToken: string): Promise<void> {
  const session = await getOrCreateSession(psid);
  if (!session.cart || session.cart.length === 0) {
    await sendTextMessage(psid, 'Your cart is empty.', pageToken);
    await showCategories(psid, pageToken);
    return;
  }

  // Hydrate cart items for display
  const cartDisplay = [];
  for (const item of session.cart) {
    const { data: menuItem } = await supabaseServer.from('menu_items').select('name, base_price').eq('id', item.menu_item_id).single();
    let variationName = null;
    let variationPrice = 0;
    if (item.variation_id) {
      const { data: variation } = await supabaseServer.from('variations').select('name, price').eq('id', item.variation_id).single();
      variationName = variation?.name || null;
      variationPrice = variation?.price || 0;
    }
    const unitPrice = (menuItem?.base_price || 0) + variationPrice;
    cartDisplay.push({
      name: menuItem?.name || 'Unknown',
      variation: variationName,
      quantity: item.quantity,
      unitPrice,
    });
  }

  const summary = buildCartSummary(cartDisplay);
  await updateSession(psid, { state: 'viewing_cart' });

  await sendButtonTemplate(psid, summary, [
    { type: 'postback', title: 'Checkout', payload: 'CHECKOUT' },
    { type: 'postback', title: 'Clear Cart', payload: 'CLEAR_CART' },
    { type: 'postback', title: 'Continue Shopping', payload: 'CONTINUE_SHOPPING' },
  ], pageToken);
}

async function handleCheckout(psid: string, pageToken: string): Promise<void> {
  const session = await getOrCreateSession(psid);
  if (!session.cart || session.cart.length === 0) {
    await sendTextMessage(psid, 'Your cart is empty!', pageToken);
    return;
  }

  // Check if multiple branches exist
  const { data: branches } = await supabaseServer
    .from('branches')
    .select('id, name')
    .eq('active', true);

  if (branches && branches.length > 1 && !session.selected_branch) {
    await updateSession(psid, { state: 'selecting_branch' });
    const quickReplies: QuickReply[] = branches.map((b) => ({
      content_type: 'text' as const,
      title: b.name,
      payload: `SELECT_BRANCH_${b.id}`,
    }));
    await sendQuickReplies(psid, 'Which branch would you like to order from?', quickReplies, pageToken);
    return;
  }

  const branchId = session.selected_branch || (branches && branches.length === 1 ? branches[0].id : null);
  await createCheckoutSession(psid, session.cart, branchId, pageToken);
}

async function handleBranchSelected(psid: string, branchId: string, pageToken: string): Promise<void> {
  await updateSession(psid, { selected_branch: branchId });
  const session = await getOrCreateSession(psid);
  await createCheckoutSession(psid, session.cart, branchId, pageToken);
}

async function createCheckoutSession(psid: string, cart: MessengerCartItem[], branchId: string | null, pageToken: string): Promise<void> {
  // Hydrate cart for checkout session
  const hydratedCart = [];
  for (const item of cart) {
    const { data: menuItem } = await supabaseServer
      .from('menu_items')
      .select('*')
      .eq('id', item.menu_item_id)
      .single();

    if (!menuItem) continue;

    let selectedVariation = null;
    if (item.variation_id) {
      const { data: variation } = await supabaseServer.from('variations').select('*').eq('id', item.variation_id).single();
      if (variation) {
        selectedVariation = { id: variation.id, name: variation.name, price: variation.price };
      }
    }

    let selectedAddOns: any[] = [];
    if (item.add_on_ids.length > 0) {
      const { data: addOns } = await supabaseServer.from('add_ons').select('*').in('id', item.add_on_ids);
      selectedAddOns = (addOns || []).map((a) => ({ id: a.id, name: a.name, price: a.price, category: a.category }));
    }

    hydratedCart.push({
      id: menuItem.id,
      name: menuItem.name,
      description: menuItem.description,
      basePrice: menuItem.base_price,
      category: menuItem.category,
      image: menuItem.image_url,
      quantity: item.quantity,
      selectedVariation,
      selectedAddOns,
      menuItemId: menuItem.id,
    });
  }

  const hash = generateCheckoutHash();
  const expiresAt = getCheckoutExpiresAt();

  await supabaseServer.from('messenger_checkout_sessions').insert({
    hash,
    psid,
    cart: hydratedCart,
    branch_id: branchId,
    status: 'pending',
    expires_at: expiresAt,
  });

  // Reset session for next conversation
  await updateSession(psid, { selected_branch: null });

  const checkoutUrl = `${SITE_URL}/checkout?msession=${hash}`;

  await sendButtonTemplate(
    psid,
    'Ready to complete your order? Tap below to checkout.',
    [{ type: 'web_url', title: 'Complete Order', url: checkoutUrl }],
    pageToken
  );
}

async function handleRemoveItem(psid: string, index: number, pageToken: string): Promise<void> {
  const session = await getOrCreateSession(psid);
  const cart = [...(session.cart || [])];
  if (index >= 0 && index < cart.length) {
    cart.splice(index, 1);
    await updateSession(psid, { cart });
    await sendTextMessage(psid, 'Item removed.', pageToken);
  }
  await showCart(psid, pageToken);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/messenger-handler.ts
git commit -m "feat: add Messenger conversation state machine handler"
```

---

## Task 13: Checkout Session Validation Endpoint

**Files:**
- Create: `app/api/messenger/session/[hash]/route.ts`
- Create: `tests/api/messenger-checkout.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/api/messenger-checkout.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
vi.mock('../../src/lib/supabase-server', () => ({
  supabaseServer: {
    from: vi.fn(() => ({
      select: mockSelect.mockReturnValue({
        eq: mockEq.mockReturnValue({
          single: mockSingle,
        }),
      }),
    })),
  },
}));

describe('GET /api/messenger/session/[hash]', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 404 for non-existent session', async () => {
    mockSingle.mockResolvedValue({ data: null, error: null });
    const { GET } = await import('../../app/api/messenger/session/[hash]/route');
    const request = new Request('http://localhost/api/messenger/session/abc');
    const response = await GET(request as any, { params: Promise.resolve({ hash: 'abc' }) });
    expect(response.status).toBe(404);
  });

  it('returns 410 for expired session', async () => {
    mockSingle.mockResolvedValue({
      data: {
        hash: 'abc',
        status: 'pending',
        expires_at: new Date(Date.now() - 60000).toISOString(),
        cart: [],
        branch_id: null,
      },
      error: null,
    });
    const { GET } = await import('../../app/api/messenger/session/[hash]/route');
    const request = new Request('http://localhost/api/messenger/session/abc');
    const response = await GET(request as any, { params: Promise.resolve({ hash: 'abc' }) });
    expect(response.status).toBe(410);
  });

  it('returns 200 with cart for valid session', async () => {
    mockSingle.mockResolvedValue({
      data: {
        hash: 'abc',
        status: 'pending',
        expires_at: new Date(Date.now() + 60000).toISOString(),
        cart: [{ id: '1', name: 'Latte', quantity: 1 }],
        branch_id: 'branch-1',
      },
      error: null,
    });
    const { GET } = await import('../../app/api/messenger/session/[hash]/route');
    const request = new Request('http://localhost/api/messenger/session/abc');
    const response = await GET(request as any, { params: Promise.resolve({ hash: 'abc' }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.cart).toHaveLength(1);
    expect(body.branchId).toBe('branch-1');
  });
});
```

- [ ] **Step 2: Implement endpoint**

```typescript
// app/api/messenger/session/[hash]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { isCheckoutSessionExpired } from '@/lib/messenger-session';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ hash: string }> }
): Promise<NextResponse> {
  const { hash } = await params;

  const { data: session, error } = await supabaseServer
    .from('messenger_checkout_sessions')
    .select('hash, status, expires_at, cart, branch_id')
    .eq('hash', hash)
    .single();

  if (error || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  if (session.status === 'completed') {
    return NextResponse.json({ error: 'Session already used' }, { status: 410 });
  }

  if (session.status === 'expired' || isCheckoutSessionExpired(session.expires_at)) {
    return NextResponse.json({ error: 'Session expired. Please start again in Messenger.' }, { status: 410 });
  }

  return NextResponse.json({
    cart: session.cart,
    branchId: session.branch_id,
  });
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/api/messenger-checkout.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add app/api/messenger/session/[hash]/route.ts tests/api/messenger-checkout.test.ts
git commit -m "feat: add Messenger checkout session validation endpoint with tests"
```

**--- TEAM B REVIEW CHECKPOINT 2 ---**
Review Tasks 11-13: Webhook, conversation handler, checkout session.

---

## Task 14: Modify Order Creation for Messenger Integration

**Files:**
- Modify: `app/api/orders/route.ts`

- [ ] **Step 1: Add msession handling to POST /api/orders**

After the order is successfully created and the complete order is fetched (around line 500), add:

```typescript
// After order creation succeeds and we have the complete order

// Handle Messenger checkout session linking
const msession = body.msession || null;
if (msession && typeof msession === 'string') {
  // Atomically mark session as completed (prevents race condition)
  const { data: checkoutSession } = await supabaseServer
    .from('messenger_checkout_sessions')
    .update({ status: 'completed', order_id: completeOrder.id })
    .eq('hash', msession)
    .eq('status', 'pending')
    .select('psid')
    .single();

  if (checkoutSession) {
    // Create messenger order link for status notifications
    await supabaseServer.from('messenger_order_links').insert({
      order_id: completeOrder.id,
      psid: checkoutSession.psid,
      notify_enabled: true,
    });

    // Send receipt to Messenger (non-blocking)
    (async () => {
      try {
        const { data: config } = await supabaseServer
          .from('facebook_config')
          .select('page_access_token')
          .single();

        if (config) {
          const { sendTextMessage } = await import('@/lib/messenger');
          const itemLines = (completeOrder.order_items || [])
            .map((oi: any) => `${oi.item_name} x${oi.quantity} — ₱${oi.unit_price * oi.quantity}`)
            .join('\n');

          const receipt = [
            `Order #${completeOrder.order_number} confirmed!`,
            '',
            itemLines,
            '',
            `Total: ₱${completeOrder.total}`,
            `Payment: ${completeOrder.payment_method}`,
            `Service: ${completeOrder.service_type}`,
            '',
            'Thank you for your order!',
          ].join('\n');

          await sendTextMessage(checkoutSession.psid, receipt, config.page_access_token);
        }
      } catch (err) {
        console.error('Failed to send Messenger receipt:', err);
      }
    })();
  }
}
```

- [ ] **Step 2: Test manually by creating an order with msession param**

- [ ] **Step 3: Commit**

```bash
git add app/api/orders/route.ts
git commit -m "feat: integrate Messenger checkout session with order creation"
```

---

## Task 15: Add Messenger Notifications to Order Status Updates

**Files:**
- Modify: `app/api/orders/[id]/route.ts`
- Create: `tests/api/order-messenger-notify.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/api/order-messenger-notify.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildStatusMessage } from '../../src/lib/messenger';

describe('buildStatusMessage', () => {
  it('returns confirmed message', () => {
    const msg = buildStatusMessage('1001', 'confirmed');
    expect(msg).toContain('#1001');
    expect(msg).toContain('confirmed');
  });

  it('returns out_for_delivery with tracking URL', () => {
    const msg = buildStatusMessage('1001', 'out_for_delivery', 'delivery', 'https://track.me/123');
    expect(msg).toContain('https://track.me/123');
  });

  it('returns generic message for unknown status', () => {
    const msg = buildStatusMessage('1001', 'unknown_status');
    expect(msg).toContain('unknown_status');
  });
});
```

- [ ] **Step 2: Run test to verify it passes** (already implemented in messenger.ts)

Run: `npx vitest run tests/api/order-messenger-notify.test.ts`
Expected: PASS

- [ ] **Step 3: Add Messenger notification to PATCH /api/orders/[id]**

After the order status is updated in the DB (after the existing Lalamove logic), add:

```typescript
// Send Messenger notification if applicable (non-blocking)
if (updateData.status) {
  (async () => {
    try {
      const { data: link } = await supabaseServer
        .from('messenger_order_links')
        .select('psid, notify_enabled')
        .eq('order_id', id)
        .single();

      if (link && link.notify_enabled) {
        const { data: config } = await supabaseServer
          .from('facebook_config')
          .select('page_access_token')
          .single();

        if (config) {
          const { sendTextMessage, buildStatusMessage } = await import('@/lib/messenger');
          const message = buildStatusMessage(
            currentOrder.order_number,
            updateData.status,
            currentOrder.service_type,
            updatedOrder.lalamove_tracking_url || undefined
          );
          await sendTextMessage(link.psid, message, config.page_access_token);
        }
      }
    } catch (err) {
      console.error('Failed to send Messenger status notification:', err);
    }
  })();
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/orders/[id]/route.ts tests/api/order-messenger-notify.test.ts
git commit -m "feat: send Messenger notifications on order status changes"
```

---

## Task 16: Modify Menu API for show_in_messenger

**Files:**
- Modify: `app/api/admin/menu/route.ts`
- Modify: `app/api/admin/menu/[id]/route.ts`

- [ ] **Step 1: Add show_in_messenger to normalizeMenuPayload in route.ts**

In `app/api/admin/menu/route.ts`, update `normalizeMenuPayload`:
```typescript
show_in_messenger: Boolean(body.showInMessenger),
```

- [ ] **Step 2: Add show_in_messenger to PUT normalizer in [id]/route.ts**

In `app/api/admin/menu/[id]/route.ts`, add to the selective update object:
```typescript
if (body.showInMessenger !== undefined) updateData.show_in_messenger = Boolean(body.showInMessenger);
```

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/menu/route.ts app/api/admin/menu/[id]/route.ts
git commit -m "feat: add show_in_messenger field to menu API endpoints"
```

**--- TEAM B REVIEW CHECKPOINT 3 ---**
Review Tasks 14-16: Order integration, status notifications, menu API.

---

## Task 17: Admin UI — Super Admin Login Component

**Files:**
- Create: `src/components/SuperAdminLogin.tsx`

- [ ] **Step 1: Implement component**

```typescript
// src/components/SuperAdminLogin.tsx
'use client';
import { useState } from 'react';
import { adminFetch } from '@/lib/admin-api';

interface SuperAdminLoginProps {
  onLogin: (adminId: string) => void;
  onBack: () => void;
}

export default function SuperAdminLogin({ onLogin, onBack }: SuperAdminLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await adminFetch('/api/admin/auth/super-login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }

      onLogin(data.adminId);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        <h2 className="text-2xl font-bold text-center mb-6">Super Admin Login</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="w-full py-2 text-gray-600 hover:text-gray-800 text-sm"
          >
            Back to Admin Login
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SuperAdminLogin.tsx
git commit -m "feat: add Super Admin login UI component"
```

---

## Task 18: Admin UI — Facebook Connect Component

**Files:**
- Create: `src/components/FacebookConnect.tsx`

- [ ] **Step 1: Implement component**

```typescript
// src/components/FacebookConnect.tsx
'use client';
import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/admin-api';

interface FacebookConnectProps {
  isSuperAdmin: boolean;
}

interface FBStatus {
  connected: boolean;
  pageName?: string;
  pageId?: string;
  connectedAt?: string;
  tokenExpiring?: boolean;
}

declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}

export default function FacebookConnect({ isSuperAdmin }: FacebookConnectProps) {
  const [status, setStatus] = useState<FBStatus>({ connected: false });
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/facebook/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch FB status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!isSuperAdmin) return;

    // Load Facebook SDK
    window.fbAsyncInit = () => {
      window.FB.init({
        appId: process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || '',
        cookie: true,
        xfbml: false,
        version: 'v21.0',
      });
      setSdkLoaded(true);
    };

    if (!document.getElementById('facebook-jssdk')) {
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    } else if (window.FB) {
      setSdkLoaded(true);
    }
  }, [isSuperAdmin]);

  const handleConnect = () => {
    if (!window.FB) return;
    setConnecting(true);

    window.FB.login(
      async (response: any) => {
        if (response.authResponse) {
          try {
            const res = await adminFetch('/api/admin/facebook/connect', {
              method: 'POST',
              body: JSON.stringify({ accessToken: response.authResponse.accessToken }),
            });
            if (res.ok) {
              await fetchStatus();
            } else {
              const err = await res.json();
              alert(err.error || 'Connection failed');
            }
          } catch {
            alert('Connection failed');
          }
        }
        setConnecting(false);
      },
      { scope: 'pages_manage_metadata,pages_messaging,pages_read_engagement' }
    );
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Facebook Page? Messenger chatbot will stop working.')) return;
    setConnecting(true);
    try {
      await adminFetch('/api/admin/facebook/disconnect', { method: 'POST' });
      await fetchStatus();
    } catch {
      alert('Disconnect failed');
    } finally {
      setConnecting(false);
    }
  };

  if (loading) return <div className="text-gray-500">Loading Facebook status...</div>;

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Facebook Messenger Integration</h3>

      {status.connected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-green-500 rounded-full" />
            <span className="font-medium">Connected to: {status.pageName}</span>
          </div>
          {status.tokenExpiring && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
              Page token expiring soon. Please reconnect to refresh.
            </div>
          )}
          {isSuperAdmin && (
            <button
              onClick={handleDisconnect}
              disabled={connecting}
              className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50"
            >
              {connecting ? 'Disconnecting...' : 'Disconnect Page'}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-gray-400 rounded-full" />
            <span className="text-gray-600">Not connected</span>
          </div>
          {isSuperAdmin ? (
            <button
              onClick={handleConnect}
              disabled={connecting || !sdkLoaded}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {connecting ? 'Connecting...' : 'Connect Facebook Page'}
            </button>
          ) : (
            <p className="text-sm text-gray-500">Only super admins can connect a Facebook Page.</p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add NEXT_PUBLIC_FACEBOOK_APP_ID to .env.local**

```
NEXT_PUBLIC_FACEBOOK_APP_ID=1477113107453692
```

- [ ] **Step 3: Commit**

```bash
git add src/components/FacebookConnect.tsx .env.local
git commit -m "feat: add Facebook Connect admin UI component"
```

---

## Task 19: Admin Dashboard Integration

**Files:**
- Modify: `src/components/AdminDashboard.tsx`
- Modify: `src/components/MenuManager.tsx`

- [ ] **Step 1: Add super admin state and Facebook section to AdminDashboard**

Add to state:
```typescript
const [isSuperAdmin, setIsSuperAdmin] = useState(false);
const [showSuperAdminLogin, setShowSuperAdminLogin] = useState(false);
```

Add lazy imports:
```typescript
const FacebookConnect = lazy(() => import('./FacebookConnect'));
const SuperAdminLogin = lazy(() => import('./SuperAdminLogin'));
```

Add super admin session check in the auth useEffect:
```typescript
// Check super admin session too
const superRes = await adminFetch('/api/admin/auth/super-login-check');
if (superRes.ok) setIsSuperAdmin(true);
```

Add to the settings view:
```typescript
{currentView === 'settings' && (
  <>
    {/* Existing site settings */}
    <Suspense fallback={<div>Loading...</div>}>
      <FacebookConnect isSuperAdmin={isSuperAdmin} />
    </Suspense>
  </>
)}
```

Add "Super Admin Login" link to login form:
```typescript
<button onClick={() => setShowSuperAdminLogin(true)} className="text-sm text-gray-500 hover:text-gray-700">
  Super Admin Login
</button>
```

- [ ] **Step 2: Add show_in_messenger toggle to MenuManager**

In the menu item form, add after the "available" toggle:
```typescript
<div className="flex items-center gap-2">
  <input
    type="checkbox"
    checked={formData.showInMessenger || false}
    onChange={(e) => setFormData({ ...formData, showInMessenger: e.target.checked })}
    className="w-4 h-4 text-blue-600 rounded"
  />
  <label className="text-sm font-medium text-gray-700">Show in Messenger</label>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/AdminDashboard.tsx src/components/MenuManager.tsx
git commit -m "feat: integrate Facebook Connect and show_in_messenger into admin UI"
```

---

## Task 20: Modify CartContext for Messenger Session Loading

**Files:**
- Modify: `src/contexts/CartContext.tsx`

- [ ] **Step 1: Add loadFromMessengerSession function**

Add to the CartContextType interface:
```typescript
loadFromMessengerSession: (cart: CartItem[]) => void;
```

Add implementation:
```typescript
const loadFromMessengerSession = (items: CartItem[]) => {
  setCartItems(items.map((item) => ({
    ...item,
    totalPrice: calculateTotalPrice(item),
  })));
};
```

Expose in the provider value.

- [ ] **Step 2: Commit**

```bash
git add src/contexts/CartContext.tsx
git commit -m "feat: add loadFromMessengerSession to CartContext"
```

---

## Task 21: Modify Checkout Page for msession Support

**Files:**
- Modify: `app/checkout/page.tsx` (or equivalent checkout component)

- [ ] **Step 1: Add msession detection and cart loading**

At the top of the checkout component:
```typescript
const searchParams = useSearchParams();
const msession = searchParams.get('msession');
const [messengerLoading, setMessengerLoading] = useState(!!msession);
const [messengerError, setMessengerError] = useState('');

useEffect(() => {
  if (!msession) return;
  (async () => {
    try {
      const res = await fetch(`/api/messenger/session/${msession}`);
      if (!res.ok) {
        const err = await res.json();
        setMessengerError(err.error || 'Session invalid');
        return;
      }
      const data = await res.json();
      cart.loadFromMessengerSession(data.cart);
      if (data.branchId) {
        // Pre-select branch
        setSelectedBranch(data.branchId);
      }
    } catch {
      setMessengerError('Failed to load your cart from Messenger');
    } finally {
      setMessengerLoading(false);
    }
  })();
}, [msession]);
```

**Important:** Suppress the empty-cart redirect when `msession` is present:
```typescript
// Change existing redirect logic from:
if (cartItems.length === 0) redirect('/');
// To:
if (cartItems.length === 0 && !msession && !messengerLoading) redirect('/');
```

Add `msession` to the order submission body so the API can link it:
```typescript
const orderPayload = {
  ...existingPayload,
  msession: msession || undefined,
};
```

- [ ] **Step 2: Commit**

```bash
git add app/checkout/page.tsx
git commit -m "feat: support Messenger checkout session loading on checkout page"
```

---

## Task 22: Add Messenger Badge to OrderManager

**Files:**
- Modify: `src/components/OrderManager.tsx`

- [ ] **Step 1: Add Messenger badge and notification toggle**

Fetch messenger link status alongside orders:
```typescript
// In order detail view, check if order has messenger link
const [messengerLinks, setMessengerLinks] = useState<Record<string, boolean>>({});

// When loading orders, also fetch messenger links
const fetchMessengerLinks = async (orderIds: string[]) => {
  const res = await adminFetch(`/api/admin/messenger-links?orderIds=${orderIds.join(',')}`);
  // ... or check per-order
};
```

Add badge to order cards:
```typescript
{order.messengerLinked && (
  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800">
    Messenger
  </span>
)}
```

Add notification toggle in order detail:
```typescript
<div className="flex items-center gap-2">
  <input
    type="checkbox"
    checked={order.notifyEnabled}
    onChange={() => toggleMessengerNotify(order.id)}
  />
  <label className="text-sm">Messenger Notifications</label>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/OrderManager.tsx
git commit -m "feat: add Messenger badge and notification toggle to OrderManager"
```

**--- TEAM B REVIEW CHECKPOINT 4 (FINAL) ---**
Review Tasks 17-22: All UI components, CartContext, checkout page integration.

---

## Task 23: End-to-End Verification

- [ ] **Step 1: Run all unit tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Manual E2E test checklist**

1. Create super admin via CLI script
2. Login as super admin in admin panel
3. Connect Facebook Page via Facebook Login
4. Enable "Show in Messenger" on a few menu items
5. Send a message to the Facebook Page
6. Browse categories → view products → add to cart → checkout
7. Complete order on website via msession link
8. Verify receipt appears in Messenger
9. Change order status in admin → verify Messenger notification
10. Toggle off Messenger notifications → verify no notification sent
11. Disconnect Facebook Page → verify chatbot stops responding

- [ ] **Step 3: Commit any fixes from E2E testing**

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete Facebook Messenger chatbot integration"
```
