// tests/loyalty-actions.test.ts
// Integration tests for Loyalty Server Actions (creditLoyalty, registerLoyaltyCard, redeemReward, lookupCard)

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/admin-guard', () => ({
  requireAdmin: vi.fn().mockResolvedValue({ adminType: 'admin' }),
  requireSuperAdmin: vi.fn().mockResolvedValue({ adminId: 'super-1' }),
  checkActionRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  getClientIPFromHeaders: vi.fn().mockResolvedValue('127.0.0.1'),
}));

vi.mock('@/lib/loyalty-hash', () => ({
  generateCardCode: vi.fn().mockReturnValue('STARR-TEST'),
}));

// ─── Chainable Supabase mock ─────────────────────────────────────────────────

type QueryResult = { data: any; error: any };

/**
 * Build a chainable mock that allows per-call overrides.
 * Each call to .from() returns a fresh chain whose terminal value
 * can be controlled by pushing to `results`.
 */
const callQueue: QueryResult[] = [];
let defaultResult: QueryResult = { data: null, error: null };

function nextResult(): QueryResult {
  if (callQueue.length > 0) return callQueue.shift()!;
  return defaultResult;
}

function makeChain(): any {
  const chain: any = {};
  const methods = [
    'select', 'insert', 'update', 'delete',
    'eq', 'is', 'order', 'limit',
    'ilike', 'or', 'single', 'maybeSingle',
  ];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  // Make the chain thenable so await resolves to the queued result
  chain.then = (resolve: any) => Promise.resolve(nextResult()).then(resolve);
  return chain;
}

const mockFrom = vi.fn((_table: string) => makeChain());
const mockRpc = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === 'from') return mockFrom;
        if (prop === 'rpc') return mockRpc;
        return undefined;
      },
    },
  ),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { revalidateTag } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { creditLoyalty } from '@/actions/loyalty';
import { registerLoyaltyCard } from '@/actions/loyalty';
import { redeemReward } from '@/actions/loyalty';
import { lookupCard } from '@/actions/loyalty';

const mockRevalidateTag = vi.mocked(revalidateTag);
const mockRequireAdmin = vi.mocked(requireAdmin);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_2 = '660e8400-e29b-41d4-a716-446655440001';
const VALID_UUID_3 = '770e8400-e29b-41d4-a716-446655440002';

function enqueue(...results: QueryResult[]) {
  callQueue.push(...results);
}

function enqueueSuccess(data: any) {
  callQueue.push({ data, error: null });
}

function enqueueError(error: any) {
  callQueue.push({ data: null, error });
}

function enqueueNull() {
  callQueue.push({ data: null, error: null });
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const fakeOrder = {
  id: VALID_UUID,
  customer_id: VALID_UUID_2,
  messenger_psid: 'psid-123',
};

const fakeOrderItems = [
  {
    menu_item_id: 'item-1',
    category_id: 'shakes',
    name: 'Classic Shake',
    quantity: 1,
    subtotal: 150,
  },
];

const fakeLoyaltyCard = {
  id: VALID_UUID_3,
  customer_id: VALID_UUID_2,
  card_code: 'STARR-ABCD',
  current_stamps: 3,
  current_points: 100,
  goal_reward_id: null,
  lifetime_stamps: 3,
  lifetime_points: 100,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const fakeLoyaltyConfig = {
  id: 1,
  stamps_enabled: true,
  points_enabled: true,
  points_per_peso: 0.1,
  stamps_per_order: 1,
  filter_mode: 'blocklist',
  filtered_item_ids: [],
  filtered_category_ids: [],
  claim_window_days: 7,
  updated_at: '2026-01-01T00:00:00Z',
};

const fakeSession = {
  id: VALID_UUID,
  token: 'valid-hash-token',
  psid: 'psid-123',
  purpose: 'registration',
  expires_at: new Date(Date.now() + 3600_000).toISOString(), // 1 hour from now
  used_at: null,
  created_at: '2026-01-01T00:00:00Z',
};

const fakeCustomer = {
  id: VALID_UUID_2,
  name: 'Test User',
  email: 'test@example.com',
  phone: '+639123456789',
  messenger_psid: 'psid-123',
};

const fakeReward = {
  id: VALID_UUID,
  name: 'Free Shake',
  stamps_required: 10,
  points_required: null,
  is_active: true,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  callQueue.length = 0;
  defaultResult = { data: null, error: null };
  mockRequireAdmin.mockResolvedValue({ adminType: 'admin' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// creditLoyalty
// ═══════════════════════════════════════════════════════════════════════════════

describe('creditLoyalty', () => {
  it('rejects invalid (non-UUID) order ID', async () => {
    const result = await creditLoyalty('not-a-uuid');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid order ID');
  });

  it('returns error when order is not found', async () => {
    // order lookup → null
    enqueueNull();

    const result = await creditLoyalty(VALID_UUID);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Order not found');
  });

  it('returns success no-op when customer has no loyalty card', async () => {
    // order found
    enqueueSuccess(fakeOrder);
    // order items
    enqueueSuccess(fakeOrderItems);
    // loyalty card by customer_id → null (no card)
    enqueueNull();
    // no messenger_psid fallback needed since card not found via customer_id

    const result = await creditLoyalty(VALID_UUID);
    expect(result.success).toBe(true);
    expect(result.data.stamps).toBe(0);
    expect(result.data.points).toBe(0);
    expect(result.data.goalReached).toBe(false);
    // should NOT revalidate since no card
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it('prevents double-crediting the same order', async () => {
    // order found
    enqueueSuccess(fakeOrder);
    // order items
    enqueueSuccess(fakeOrderItems);
    // loyalty card by customer_id → found
    enqueueSuccess(fakeLoyaltyCard);
    // existing transaction with same order_id and type='earn' → found (duplicate)
    enqueueSuccess({ id: 'tx-existing' });

    const result = await creditLoyalty(VALID_UUID);
    expect(result.success).toBe(true);
    // No earnings credited
    expect(result.data.stamps).toBe(0);
    expect(result.data.points).toBe(0);
  });

  it('credits stamps and points for a qualifying order', async () => {
    // order found
    enqueueSuccess(fakeOrder);
    // order items
    enqueueSuccess(fakeOrderItems);
    // loyalty card found
    enqueueSuccess(fakeLoyaltyCard);
    // no existing transaction (not a duplicate)
    enqueueNull();
    // loyalty config
    enqueueSuccess(fakeLoyaltyConfig);
    // active boosters → none
    enqueueSuccess([]);
    // update card → success
    enqueueSuccess(null);
    // insert transaction → success
    enqueueSuccess(null);
    // re-fetch updated card (for goal check) — no goal_reward_id set
    enqueueSuccess({ ...fakeLoyaltyCard, current_stamps: 4, current_points: 115 });

    const result = await creditLoyalty(VALID_UUID);
    expect(result.success).toBe(true);
    expect(result.data.stamps).toBe(1);  // stamps_per_order=1, no booster
    expect(result.data.points).toBe(15); // floor(150 * 0.1) = 15
    expect(result.data.goalReached).toBe(false);
    expect(mockRevalidateTag).toHaveBeenCalledWith('loyalty-cards');
    expect(mockRevalidateTag).toHaveBeenCalledWith('loyalty-transactions');
  });

  it('creates a redemption when the stamp goal is reached', async () => {
    const cardNearGoal = {
      ...fakeLoyaltyCard,
      current_stamps: 9,
      current_points: 0,
      goal_reward_id: VALID_UUID,
    };
    const updatedCard = {
      ...cardNearGoal,
      current_stamps: 10, // just reached goal
    };

    // order found
    enqueueSuccess(fakeOrder);
    // order items
    enqueueSuccess(fakeOrderItems);
    // loyalty card found
    enqueueSuccess(cardNearGoal);
    // no existing transaction
    enqueueNull();
    // loyalty config
    enqueueSuccess(fakeLoyaltyConfig);
    // boosters → none
    enqueueSuccess([]);
    // update card → success
    enqueueSuccess(null);
    // insert transaction → success
    enqueueSuccess(null);
    // re-fetch updated card
    enqueueSuccess(updatedCard);
    // fetch goal reward
    enqueueSuccess(fakeReward); // stamps_required=10
    // insert redemption → success
    enqueueSuccess(null);

    const result = await creditLoyalty(VALID_UUID);
    expect(result.success).toBe(true);
    expect(result.data.goalReached).toBe(true);
  });

  it('returns error when loyalty config is missing', async () => {
    // order found
    enqueueSuccess(fakeOrder);
    // order items
    enqueueSuccess(fakeOrderItems);
    // loyalty card found
    enqueueSuccess(fakeLoyaltyCard);
    // no existing transaction
    enqueueNull();
    // loyalty config → null
    enqueueNull();

    const result = await creditLoyalty(VALID_UUID);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Loyalty config not found');
  });

  it('returns no-op when order has no items', async () => {
    // order found
    enqueueSuccess(fakeOrder);
    // order items → empty array
    enqueueSuccess([]);

    const result = await creditLoyalty(VALID_UUID);
    expect(result.success).toBe(true);
    expect(result.data.stamps).toBe(0);
    expect(result.data.points).toBe(0);
  });

  it('returns error when card update fails', async () => {
    // order found
    enqueueSuccess(fakeOrder);
    // order items
    enqueueSuccess(fakeOrderItems);
    // loyalty card found
    enqueueSuccess(fakeLoyaltyCard);
    // no existing transaction
    enqueueNull();
    // loyalty config
    enqueueSuccess(fakeLoyaltyConfig);
    // boosters → none
    enqueueSuccess([]);
    // update card → DB error
    enqueueError({ code: '23514', message: 'check constraint violation' });

    const result = await creditLoyalty(VALID_UUID);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to update loyalty card');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// registerLoyaltyCard
// ═══════════════════════════════════════════════════════════════════════════════

describe('registerLoyaltyCard', () => {
  it('rejects an invalid email', async () => {
    const result = await registerLoyaltyCard('some-hash', 'not-an-email');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid email');
  });

  it('rejects an expired session', async () => {
    const expiredSession = {
      ...fakeSession,
      expires_at: new Date(Date.now() - 3600_000).toISOString(), // 1 hour ago
    };
    // session lookup → found but expired
    enqueueSuccess(expiredSession);

    const result = await registerLoyaltyCard('valid-hash', 'user@example.com');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Session has expired');
  });

  it('rejects when no session is found (invalid or used hash)', async () => {
    // session lookup → null
    enqueueNull();

    const result = await registerLoyaltyCard('bad-hash', 'user@example.com');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid or expired session');
  });

  it('returns existing card idempotently when customer already has one', async () => {
    // session found and valid
    enqueueSuccess(fakeSession);
    // customer found by PSID
    enqueueSuccess(fakeCustomer);
    // existing loyalty card found
    enqueueSuccess(fakeLoyaltyCard);
    // mark session as used
    enqueueSuccess(null);
    // fetch active rewards
    enqueueSuccess([]);

    const result = await registerLoyaltyCard('valid-hash', 'test@example.com');
    expect(result.success).toBe(true);
    expect(result.data.card).toEqual(fakeLoyaltyCard);
  });

  it('creates a new card for a customer found by PSID', async () => {
    // session found
    enqueueSuccess(fakeSession);
    // customer by PSID → found
    enqueueSuccess(fakeCustomer);
    // no existing loyalty card
    enqueueNull();
    // collision check → no collision (card code is unique)
    enqueueNull();
    // insert new loyalty card
    enqueueSuccess({ ...fakeLoyaltyCard, card_code: 'STARR-TEST' });
    // mark session as used
    enqueueSuccess(null);
    // fetch active rewards → 0 or 1 rewards
    enqueueSuccess([]);

    const result = await registerLoyaltyCard('valid-hash', 'test@example.com');
    expect(result.success).toBe(true);
    expect(result.data.card.card_code).toBe('STARR-TEST');
  });

  it('creates a customer if none found by PSID or email', async () => {
    const sessionWithoutPsid = { ...fakeSession, psid: null };
    // session found (no PSID)
    enqueueSuccess(sessionWithoutPsid);
    // customer by email → not found
    enqueueNull();
    // insert new customer
    enqueueSuccess({ ...fakeCustomer, id: VALID_UUID_3 });
    // no existing loyalty card
    enqueueNull();
    // collision check → no collision
    enqueueNull();
    // insert new loyalty card
    enqueueSuccess({ ...fakeLoyaltyCard, customer_id: VALID_UUID_3 });
    // mark session as used
    enqueueSuccess(null);
    // fetch active rewards
    enqueueSuccess([]);

    const result = await registerLoyaltyCard('valid-hash', 'newuser@example.com');
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('auto-sets goal when only one active reward exists', async () => {
    const oneReward = [{ id: VALID_UUID }];
    // session found
    enqueueSuccess(fakeSession);
    // customer by PSID → found
    enqueueSuccess(fakeCustomer);
    // no existing loyalty card
    enqueueNull();
    // collision check → unique
    enqueueNull();
    // insert new card
    enqueueSuccess({ ...fakeLoyaltyCard, goal_reward_id: null });
    // mark session as used
    enqueueSuccess(null);
    // fetch active rewards → exactly 1
    enqueueSuccess(oneReward);
    // auto-set goal
    enqueueSuccess(null);

    const result = await registerLoyaltyCard('valid-hash', 'test@example.com');
    expect(result.success).toBe(true);
    expect(result.data.shouldPickGoal).toBe(false); // auto-set, so no need to pick
  });

  it('sets shouldPickGoal=true when multiple active rewards exist', async () => {
    const multipleRewards = [{ id: VALID_UUID }, { id: VALID_UUID_2 }];
    // session found
    enqueueSuccess(fakeSession);
    // customer by PSID → found
    enqueueSuccess(fakeCustomer);
    // no existing loyalty card
    enqueueNull();
    // collision check → unique
    enqueueNull();
    // insert new card
    enqueueSuccess({ ...fakeLoyaltyCard, goal_reward_id: null });
    // mark session as used
    enqueueSuccess(null);
    // fetch active rewards → 2
    enqueueSuccess(multipleRewards);

    const result = await registerLoyaltyCard('valid-hash', 'test@example.com');
    expect(result.success).toBe(true);
    expect(result.data.shouldPickGoal).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// redeemReward
// ═══════════════════════════════════════════════════════════════════════════════

describe('redeemReward', () => {
  it('rejects invalid redemption UUID', async () => {
    const result = await redeemReward('not-a-uuid', VALID_UUID_2);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid redemption ID');
  });

  it('rejects invalid branch UUID', async () => {
    const result = await redeemReward(VALID_UUID, 'not-a-uuid');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid branch ID');
  });

  it('requires admin auth — throws when unauthenticated', async () => {
    mockRequireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT:/admin/login'));
    await expect(redeemReward(VALID_UUID, VALID_UUID_2)).rejects.toThrow('NEXT_REDIRECT:/admin/login');
  });

  it('calls the redeem_loyalty_reward RPC with correct params', async () => {
    mockRpc.mockResolvedValue({ error: null });

    const result = await redeemReward(VALID_UUID, VALID_UUID_2);
    expect(result.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('redeem_loyalty_reward', {
      p_redemption_id: VALID_UUID,
      p_branch_id: VALID_UUID_2,
      p_claimed_by: 'admin',
    });
  });

  it('revalidates correct cache tags on success', async () => {
    mockRpc.mockResolvedValue({ error: null });

    await redeemReward(VALID_UUID, VALID_UUID_2);

    expect(mockRevalidateTag).toHaveBeenCalledWith('loyalty-cards');
    expect(mockRevalidateTag).toHaveBeenCalledWith('loyalty-redemptions');
    expect(mockRevalidateTag).toHaveBeenCalledWith('loyalty-transactions');
  });

  it('returns error when RPC fails', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'Redemption not found or already claimed' } });

    const result = await redeemReward(VALID_UUID, VALID_UUID_2);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Redemption not found or already claimed');
  });

  it('returns rate-limit error when limit is exceeded', async () => {
    const { checkActionRateLimit } = await import('@/lib/admin-guard');
    vi.mocked(checkActionRateLimit).mockResolvedValueOnce({ allowed: false });

    const result = await redeemReward(VALID_UUID, VALID_UUID_2);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/too many requests/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// lookupCard
// ═══════════════════════════════════════════════════════════════════════════════

describe('lookupCard', () => {
  it('requires admin auth — throws when unauthenticated', async () => {
    mockRequireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT:/admin/login'));
    await expect(lookupCard('STARR-1234')).rejects.toThrow('NEXT_REDIRECT:/admin/login');
  });

  it('returns error for empty query string', async () => {
    const result = await lookupCard('');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid search query');
  });

  it('returns empty array when no cards match', async () => {
    // main query returns empty array
    enqueueSuccess([]);

    const result = await lookupCard('NONEXISTENT');
    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('returns enriched card data for matching results', async () => {
    const rawCard = {
      ...fakeLoyaltyCard,
      goal_reward_id: VALID_UUID,
      customers: {
        id: fakeCustomer.id,
        name: fakeCustomer.name,
        email: fakeCustomer.email,
        phone: fakeCustomer.phone,
        messenger_psid: fakeCustomer.messenger_psid,
      },
    };

    // main query → cards found
    enqueueSuccess([rawCard]);
    // goal reward fetch
    enqueueSuccess(fakeReward);
    // pending redemptions
    enqueueSuccess([]);

    const result = await lookupCard('STARR-ABCD');
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);

    const card = result.data[0];
    expect(card.customer_name).toBe(fakeCustomer.name);
    expect(card.customer_email).toBe(fakeCustomer.email);
    expect(card.goal_reward).toEqual(fakeReward);
    expect(card.pending_redemptions).toEqual([]);
    // nested join object should be stripped
    expect(card.customers).toBeUndefined();
  });

  it('returns error when DB query fails', async () => {
    enqueueError({ code: '42P01', message: 'relation does not exist' });

    const result = await lookupCard('STARR-1234');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to search cards');
  });
});
