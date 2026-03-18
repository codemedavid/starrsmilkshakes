import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock admin-guard
vi.mock('@/lib/admin-guard', () => ({
  requireAdmin: vi.fn(),
}));

// Mock next/cache
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Build a chainable Supabase query mock
function makeQueryChain(result: { data: any; error: any }) {
  const chain: any = {};
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'order', 'single', 'limit']) {
    chain[method] = vi.fn(() => chain);
  }
  // Awaiting the chain resolves to { data, error }
  chain.then = (resolve: any) => resolve(result);
  return chain;
}

let queryChain: ReturnType<typeof makeQueryChain>;
const mockFrom = vi.fn((_table: string) => queryChain);

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === 'from') {
          return mockFrom;
        }
        return undefined;
      },
    },
  ),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import { requireAdmin } from '@/lib/admin-guard';
import { revalidatePath } from 'next/cache';
import {
  addPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  reorderPaymentMethods,
} from '@/actions/payments';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRevalidatePath = vi.mocked(revalidatePath);

// ─── Fixtures ────────────────────────────────────────────────────────────────

const validUUID = '550e8400-e29b-41d4-a716-446655440000';

const validPaymentMethodInput = {
  id: 'gcash',
  name: 'GCash',
  account_name: 'Starr Famous',
  account_number: '09171234567',
  qr_code_url: 'https://example.com/qr.png',
  active: true,
  sort_order: 1,
};

const fakePaymentMethod = {
  id: validUUID,
  name: 'GCash',
  account_name: 'Starr Famous',
  account_number: '09171234567',
  qr_code_url: 'https://example.com/qr.png',
  active: true,
  sort_order: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Payment Method Server Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ adminType: 'admin' });
    queryChain = makeQueryChain({ data: fakePaymentMethod, error: null });
  });

  // ── addPaymentMethod ──────────────────────────────────────────────────────

  describe('addPaymentMethod', () => {
    it('returns success and calls revalidatePath on valid input', async () => {
      const result = await addPaymentMethod(validPaymentMethodInput);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(fakePaymentMethod);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/payments');
      expect(mockFrom).toHaveBeenCalledWith('payment_methods');
      expect(queryChain.insert).toHaveBeenCalled();
      expect(queryChain.select).toHaveBeenCalled();
      expect(queryChain.single).toHaveBeenCalled();
    });

    it('returns error on invalid input (missing name)', async () => {
      const result = await addPaymentMethod({ ...validPaymentMethodInput, name: '' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid input');
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('returns error on invalid input (missing account_number)', async () => {
      const result = await addPaymentMethod({ ...validPaymentMethodInput, account_number: '' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid input');
    });

    it('returns error on invalid input (missing qr_code_url)', async () => {
      const result = await addPaymentMethod({ ...validPaymentMethodInput, qr_code_url: '' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid input');
    });

    it('returns error on completely invalid input', async () => {
      const result = await addPaymentMethod('not-an-object');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid input');
    });

    it('returns error on DB failure', async () => {
      queryChain = makeQueryChain({ data: null, error: { code: '23505', message: 'unique violation' } });

      const result = await addPaymentMethod(validPaymentMethodInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to create payment method');
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('throws (redirects) when auth fails', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT:/admin/login'));

      await expect(addPaymentMethod(validPaymentMethodInput)).rejects.toThrow('NEXT_REDIRECT:/admin/login');
    });

    it('defaults active to true when not provided', async () => {
      const { active: _active, ...withoutActive } = validPaymentMethodInput;
      const result = await addPaymentMethod(withoutActive);

      expect(result.success).toBe(true);
      expect(queryChain.insert).toHaveBeenCalled();
    });
  });

  // ── updatePaymentMethod ───────────────────────────────────────────────────

  describe('updatePaymentMethod', () => {
    it('returns success on valid UUID and input', async () => {
      const result = await updatePaymentMethod(validUUID, validPaymentMethodInput);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(fakePaymentMethod);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/payments');
      expect(mockFrom).toHaveBeenCalledWith('payment_methods');
      expect(queryChain.update).toHaveBeenCalled();
      expect(queryChain.eq).toHaveBeenCalledWith('id', validUUID);
      expect(queryChain.select).toHaveBeenCalled();
      expect(queryChain.single).toHaveBeenCalled();
    });

    it('returns error on invalid UUID', async () => {
      const result = await updatePaymentMethod('not-a-uuid', validPaymentMethodInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid ID');
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('returns error on invalid input (empty name)', async () => {
      const result = await updatePaymentMethod(validUUID, { ...validPaymentMethodInput, name: '' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid input');
    });

    it('returns error on completely invalid input', async () => {
      const result = await updatePaymentMethod(validUUID, null);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid input');
    });

    it('returns error on DB failure', async () => {
      queryChain = makeQueryChain({ data: null, error: { code: '42P01', message: 'relation does not exist' } });

      const result = await updatePaymentMethod(validUUID, validPaymentMethodInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to update payment method');
    });

    it('throws (redirects) when auth fails', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT:/admin/login'));

      await expect(updatePaymentMethod(validUUID, validPaymentMethodInput)).rejects.toThrow(
        'NEXT_REDIRECT:/admin/login',
      );
    });
  });

  // ── deletePaymentMethod ───────────────────────────────────────────────────

  describe('deletePaymentMethod', () => {
    it('returns success on valid UUID', async () => {
      queryChain = makeQueryChain({ data: null, error: null });

      const result = await deletePaymentMethod(validUUID);

      expect(result.success).toBe(true);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/payments');
      expect(mockFrom).toHaveBeenCalledWith('payment_methods');
      expect(queryChain.delete).toHaveBeenCalled();
      expect(queryChain.eq).toHaveBeenCalledWith('id', validUUID);
    });

    it('returns error on invalid UUID', async () => {
      const result = await deletePaymentMethod('not-a-uuid');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid ID');
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('returns error on non-string ID', async () => {
      const result = await deletePaymentMethod(12345);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid ID');
    });

    it('returns error on DB failure', async () => {
      queryChain = makeQueryChain({ data: null, error: { code: '23503', message: 'fk violation' } });

      const result = await deletePaymentMethod(validUUID);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to delete payment method');
    });

    it('throws (redirects) when auth fails', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT:/admin/login'));

      await expect(deletePaymentMethod(validUUID)).rejects.toThrow('NEXT_REDIRECT:/admin/login');
    });
  });

  // ── reorderPaymentMethods ─────────────────────────────────────────────────

  describe('reorderPaymentMethods', () => {
    const uuid1 = '550e8400-e29b-41d4-a716-446655440001';
    const uuid2 = '550e8400-e29b-41d4-a716-446655440002';
    const uuid3 = '550e8400-e29b-41d4-a716-446655440003';

    it('returns success with valid ids array and calls revalidatePath', async () => {
      queryChain = makeQueryChain({ data: null, error: null });

      const result = await reorderPaymentMethods({ ids: [uuid1, uuid2, uuid3] });

      expect(result.success).toBe(true);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/payments');
      expect(mockFrom).toHaveBeenCalledWith('payment_methods');
      expect(queryChain.update).toHaveBeenCalledTimes(3);
    });

    it('assigns sort_order by position (1-indexed)', async () => {
      queryChain = makeQueryChain({ data: null, error: null });

      await reorderPaymentMethods({ ids: [uuid1, uuid2] });

      const updateCalls = queryChain.update.mock.calls;
      expect(updateCalls[0][0]).toEqual({ sort_order: 1 });
      expect(updateCalls[1][0]).toEqual({ sort_order: 2 });
    });

    it('returns error on invalid input (not an object)', async () => {
      const result = await reorderPaymentMethods('invalid');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid input');
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('returns error when ids contains non-UUID strings', async () => {
      const result = await reorderPaymentMethods({ ids: ['not-a-uuid', uuid2] });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid input');
    });

    it('returns error on DB failure during reorder', async () => {
      queryChain = makeQueryChain({ data: null, error: { code: '42P01', message: 'table not found' } });

      const result = await reorderPaymentMethods({ ids: [uuid1, uuid2] });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to reorder payment methods');
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('throws (redirects) when auth fails', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT:/admin/login'));

      await expect(reorderPaymentMethods({ ids: [uuid1] })).rejects.toThrow('NEXT_REDIRECT:/admin/login');
    });

    it('returns success with empty ids array (no-op)', async () => {
      queryChain = makeQueryChain({ data: null, error: null });

      const result = await reorderPaymentMethods({ ids: [] });

      expect(result.success).toBe(true);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/payments');
    });
  });
});
