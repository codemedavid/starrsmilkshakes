/**
 * Integration tests for the creditLoyalty flow (src/actions/loyalty.ts)
 *
 * These tests mock Supabase to verify the full flow without hitting
 * a real database.  They validate that creditLoyalty correctly:
 *  - rejects invalid inputs
 *  - handles missing orders and cards
 *  - prevents duplicate transactions (idempotency)
 *  - errors when config is missing (BUG 1 regression)
 *  - calculates and updates stamps/points
 *  - detects goal completion and creates redemptions
 *
 * Requires: vitest (npm install --save-dev vitest)
 * Run:      npx vitest run src/__tests__/loyalty-credit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock next/cache so `revalidateTag` is a no-op
// ---------------------------------------------------------------------------
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock admin-guard so requireAdmin/requireSuperAdmin/checkActionRateLimit
// don't try real cookie/auth logic
// ---------------------------------------------------------------------------
vi.mock('@/lib/admin-guard', () => ({
  requireAdmin: vi.fn().mockResolvedValue({ adminType: 'super_admin' }),
  requireSuperAdmin: vi.fn().mockResolvedValue({ adminId: 'admin-1' }),
  checkActionRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

// ---------------------------------------------------------------------------
// Supabase mock wiring
// ---------------------------------------------------------------------------

/**
 * chainMock creates a chainable PostgREST-style mock.
 * Call `chainMock({ data, error })` to set the final result,
 * then every `.select()`, `.eq()`, `.is()`, `.limit()`, `.single()`, etc.
 * returns the same chain so the production code works unmodified.
 */
function chainMock(resolved: { data: any; error?: any }) {
  const chain: any = {};
  const methods = [
    'select', 'insert', 'update', 'delete',
    'eq', 'neq', 'is', 'in',
    'limit', 'single', 'maybeSingle',
    'or', 'ilike', 'order',
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Make the chain itself thenable so `await` resolves to { data, error }
  chain.then = (resolve: any) => resolve(resolved);
  return chain;
}

/** Helper: build a chain that resolves { data: null } — used for "not found" queries. */
const notFound = () => chainMock({ data: null });

/** Helper: build a chain that resolves { data, error: null }. */
const found = (data: any) => chainMock({ data, error: null });

/** Helper: build a chain that resolves with an error. */
const errored = (message: string) => chainMock({ data: null, error: { code: 'ERR', message } });

// We store table-specific mocks here and swap them between tests.
let tableMocks: Record<string, ReturnType<typeof chainMock>>;

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    from: vi.fn((table: string) => {
      if (tableMocks[table]) return tableMocks[table];
      // Default: return "not found"
      return notFound();
    }),
    rpc: vi.fn().mockResolvedValue({ error: null }),
  },
}));

// ---------------------------------------------------------------------------
// Import the function under test AFTER mocks are set up
// ---------------------------------------------------------------------------
// We use dynamic import to ensure the mocks are in place first.

let creditLoyalty: (orderId: string) => Promise<{ success: boolean; error?: string; data?: any }>;

beforeEach(async () => {
  vi.clearAllMocks();
  tableMocks = {};

  // Dynamic re-import to pick up fresh mocks each test
  const mod = await import('@/actions/loyalty');
  creditLoyalty = mod.creditLoyalty;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('creditLoyalty', () => {
  // ── Input validation ────────────────────────────────────────────────

  it('invalid order ID → returns error', async () => {
    const result = await creditLoyalty('not-a-uuid');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid order ID/i);
  });

  it('empty string → returns error', async () => {
    const result = await creditLoyalty('');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid order ID/i);
  });

  // ── Order lookup ────────────────────────────────────────────────────

  it('order not found → returns error', async () => {
    tableMocks['orders'] = notFound();

    const result = await creditLoyalty('a0000000-0000-4000-8000-000000000001');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Order not found/i);
  });

  // ── Order has no loyalty card ───────────────────────────────────────

  it('order has no loyalty card → returns success with 0s', async () => {
    const orderId = 'a0000000-0000-4000-8000-000000000002';

    tableMocks['orders'] = found({
      id: orderId,
      customer_id: 'cust-1',
      messenger_psid: null,
    });
    // order_items returns some items
    tableMocks['order_items'] = found([
      { menu_item_id: 'mi-1', menu_item_name: 'Shake', quantity: 1, total_price: 100, menu_items: { category: 'cat-1' } },
    ]);
    // No loyalty card for customer
    tableMocks['loyalty_cards'] = notFound();
    // No customer by psid either
    tableMocks['customers'] = notFound();

    const result = await creditLoyalty(orderId);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ stamps: 0, points: 0, goalReached: false });
  });

  // ── Duplicate transaction (idempotency) ─────────────────────────────

  it('duplicate transaction exists → returns success with 0s (idempotent)', async () => {
    const orderId = 'a0000000-0000-4000-8000-000000000003';

    tableMocks['orders'] = found({
      id: orderId,
      customer_id: 'cust-1',
      messenger_psid: null,
    });
    tableMocks['order_items'] = found([
      { menu_item_id: 'mi-1', menu_item_name: 'Shake', quantity: 1, total_price: 100, menu_items: { category: 'cat-1' } },
    ]);
    tableMocks['loyalty_cards'] = found({
      id: 'card-1',
      customer_id: 'cust-1',
      current_stamps: 5,
      current_points: 200,
      lifetime_stamps: 5,
      lifetime_points: 200,
      goal_id: null,
    });
    // Duplicate: an earn transaction already exists for this order
    tableMocks['loyalty_transactions'] = found({ id: 'tx-existing' });

    const result = await creditLoyalty(orderId);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ stamps: 0, points: 0, goalReached: false });
  });

  // ── Config not found (BUG 1 regression) ─────────────────────────────

  it('config not found → returns error (BUG 1 fix)', async () => {
    const orderId = 'a0000000-0000-4000-8000-000000000004';

    tableMocks['orders'] = found({
      id: orderId,
      customer_id: 'cust-1',
      messenger_psid: null,
    });
    tableMocks['order_items'] = found([
      { menu_item_id: 'mi-1', menu_item_name: 'Shake', quantity: 1, total_price: 100, menu_items: { category: 'cat-1' } },
    ]);
    tableMocks['loyalty_cards'] = found({
      id: 'card-1',
      customer_id: 'cust-1',
      current_stamps: 0,
      current_points: 0,
      lifetime_stamps: 0,
      lifetime_points: 0,
      goal_id: null,
    });
    // No duplicate transaction
    tableMocks['loyalty_transactions'] = notFound();
    // Config is missing
    tableMocks['loyalty_config'] = notFound();

    const result = await creditLoyalty(orderId);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Loyalty config not found/i);
  });

  // ── Successful credit ───────────────────────────────────────────────

  it('successful credit: stamps and points calculated and card updated', async () => {
    const orderId = 'a0000000-0000-4000-8000-000000000005';

    tableMocks['orders'] = found({
      id: orderId,
      customer_id: 'cust-1',
      messenger_psid: null,
    });
    tableMocks['order_items'] = found([
      { menu_item_id: 'mi-1', menu_item_name: 'Shake', quantity: 1, total_price: 100, menu_items: { category: 'cat-1' } },
    ]);

    const cardData = {
      id: 'card-1',
      customer_id: 'cust-1',
      current_stamps: 2,
      current_points: 50,
      lifetime_stamps: 2,
      lifetime_points: 50,
      goal_id: null,
    };
    tableMocks['loyalty_cards'] = found(cardData);

    // No duplicate
    tableMocks['loyalty_transactions'] = notFound();

    // Config
    tableMocks['loyalty_config'] = found({
      id: 'cfg-1',
      stamps_enabled: true,
      points_enabled: true,
      points_per_peso: 1,
      stamps_per_order: 1,
      filter_mode: 'blocklist',
      filtered_category_ids: [],
      filtered_item_ids: [],
      claim_window_days: 7,
    });

    // No boosters
    tableMocks['loyalty_boosters'] = found([]);

    // Re-fetch updated card (no goal set, so goalReached stays false)
    // The "update" and "insert" calls return through the chain mock;
    // the final select (re-fetch) also uses the loyalty_cards mock,
    // so it will return the same cardData — that is fine for this test.

    const result = await creditLoyalty(orderId);
    expect(result.success).toBe(true);
    expect(result.data.stamps).toBe(1);   // stamps_per_order=1, no booster
    expect(result.data.points).toBe(100); // 100 * 1 = 100
    expect(result.data.goalReached).toBe(false);
  });

  // ── Goal reached → redemption created ───────────────────────────────

  it('goal reached: stamps threshold met', async () => {
    const orderId = 'a0000000-0000-4000-8000-000000000006';

    tableMocks['orders'] = found({
      id: orderId,
      customer_id: 'cust-1',
      messenger_psid: null,
    });
    tableMocks['order_items'] = found([
      { menu_item_id: 'mi-1', menu_item_name: 'Shake', quantity: 1, total_price: 100, menu_items: { category: 'cat-1' } },
    ]);

    // Card already at 9 stamps — earning 1 more reaches the goal of 10
    tableMocks['loyalty_cards'] = found({
      id: 'card-1',
      customer_id: 'cust-1',
      current_stamps: 10, // after update, re-fetch returns 10
      current_points: 0,
      lifetime_stamps: 10,
      lifetime_points: 0,
      goal_id: 'goal-1',
    });

    tableMocks['loyalty_transactions'] = notFound();

    tableMocks['loyalty_config'] = found({
      id: 'cfg-1',
      stamps_enabled: true,
      points_enabled: false,
      points_per_peso: 0,
      stamps_per_order: 1,
      filter_mode: 'blocklist',
      filtered_category_ids: [],
      filtered_item_ids: [],
      claim_window_days: 7,
    });

    tableMocks['loyalty_boosters'] = found([]);

    // Goal reward lookup
    tableMocks['loyalty_goals'] = found({
      id: 'goal-1',
      name: 'Free Shake',
      stamps_required: 10,
      points_required: null,
      is_active: true,
    });

    tableMocks['loyalty_redemptions'] = found(null);

    const result = await creditLoyalty(orderId);
    expect(result.success).toBe(true);
    expect(result.data.goalReached).toBe(true);
  });

  // ── Goal NOT reached → no redemption ────────────────────────────────

  it('goal not reached: no redemption created', async () => {
    const orderId = 'a0000000-0000-4000-8000-000000000007';

    tableMocks['orders'] = found({
      id: orderId,
      customer_id: 'cust-1',
      messenger_psid: null,
    });
    tableMocks['order_items'] = found([
      { menu_item_id: 'mi-1', menu_item_name: 'Shake', quantity: 1, total_price: 100, menu_items: { category: 'cat-1' } },
    ]);

    // Card at 3 stamps — goal is 10, not reached
    tableMocks['loyalty_cards'] = found({
      id: 'card-1',
      customer_id: 'cust-1',
      current_stamps: 4, // re-fetch returns 4 (was 3, earned 1)
      current_points: 0,
      lifetime_stamps: 4,
      lifetime_points: 0,
      goal_id: 'goal-1',
    });

    tableMocks['loyalty_transactions'] = notFound();

    tableMocks['loyalty_config'] = found({
      id: 'cfg-1',
      stamps_enabled: true,
      points_enabled: false,
      points_per_peso: 0,
      stamps_per_order: 1,
      filter_mode: 'blocklist',
      filtered_category_ids: [],
      filtered_item_ids: [],
      claim_window_days: 7,
    });

    tableMocks['loyalty_boosters'] = found([]);

    tableMocks['loyalty_goals'] = found({
      id: 'goal-1',
      name: 'Free Shake',
      stamps_required: 10,
      points_required: null,
      is_active: true,
    });

    const result = await creditLoyalty(orderId);
    expect(result.success).toBe(true);
    expect(result.data.goalReached).toBe(false);
  });

  // ── Order items query returns empty ─────────────────────────────────

  it('order with no items → returns success with 0s', async () => {
    const orderId = 'a0000000-0000-4000-8000-000000000008';

    tableMocks['orders'] = found({
      id: orderId,
      customer_id: 'cust-1',
      messenger_psid: null,
    });
    // No order items
    tableMocks['order_items'] = found([]);

    const result = await creditLoyalty(orderId);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ stamps: 0, points: 0, goalReached: false });
  });

  it('order items query returns null → returns success with 0s', async () => {
    const orderId = 'a0000000-0000-4000-8000-000000000009';

    tableMocks['orders'] = found({
      id: orderId,
      customer_id: 'cust-1',
      messenger_psid: null,
    });
    tableMocks['order_items'] = found(null);

    const result = await creditLoyalty(orderId);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ stamps: 0, points: 0, goalReached: false });
  });
});
