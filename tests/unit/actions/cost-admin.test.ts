import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-guard', () => ({
  checkActionRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  requireAdmin: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

let callQueue: { data: any; error: any }[] = [];

function makeChain() {
  const chain: any = {};
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'gte', 'lte', 'ilike', 'order', 'single', 'maybeSingle']) {
    chain[method] = () => chain;
  }
  chain.then = (resolve: any) => resolve(callQueue.shift() ?? { data: null, error: null });
  return chain;
}

const mockFrom = vi.fn(() => makeChain());

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: new Proxy({}, {
    get(_, prop) {
      if (prop === 'from') return mockFrom;
      return undefined;
    },
  }),
}));

import { updateItemCost } from '@/actions/cost-admin';
import { checkActionRateLimit } from '@/lib/admin-guard';

// Valid RFC 4122 UUID (version 4, variant 1)
const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('updateItemCost', () => {
  beforeEach(() => {
    callQueue = [];
    mockFrom.mockClear();
    vi.mocked(checkActionRateLimit).mockResolvedValue({ allowed: true });
  });

  it('updates cost_price on a menu item', async () => {
    callQueue.push({ data: { id: VALID_UUID, cost_price: 35 }, error: null });
    const result = await updateItemCost({ itemId: VALID_UUID, costPrice: 35 });
    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('menu_items');
  });

  it('rejects invalid input', async () => {
    const result = await updateItemCost({ itemId: 'not-a-uuid', costPrice: -5 });
    expect(result.success).toBe(false);
  });

  it('allows setting cost to null', async () => {
    callQueue.push({ data: { id: VALID_UUID, cost_price: null }, error: null });
    const result = await updateItemCost({ itemId: VALID_UUID, costPrice: null });
    expect(result.success).toBe(true);
  });
});
