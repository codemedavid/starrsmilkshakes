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
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'order', 'single']) {
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
import { addBranch, updateBranch, deleteBranch } from '@/actions/branches';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRevalidatePath = vi.mocked(revalidatePath);

// ─── Fixtures ────────────────────────────────────────────────────────────────

const validBranchInput = {
  name: 'Makati Branch',
  address: '123 Ayala Ave, Makati',
  phone: '+63 917 123 4567',
  latitude: '14.5547',
  longitude: '121.0244',
  is_active: true,
  is_main: false,
  messenger_username: null,
};

const validUUID = '550e8400-e29b-41d4-a716-446655440000';

const fakeBranch = {
  id: validUUID,
  ...validBranchInput,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Branch Server Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ adminType: 'admin' });
    queryChain = makeQueryChain({ data: fakeBranch, error: null });
  });

  // ── addBranch ────────────────────────────────────────────────────────────

  describe('addBranch', () => {
    it('returns success and calls revalidatePath on valid input', async () => {
      const result = await addBranch(validBranchInput);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(fakeBranch);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/branches');
      expect(mockFrom).toHaveBeenCalledWith('branches');
      expect(queryChain.insert).toHaveBeenCalled();
      expect(queryChain.select).toHaveBeenCalled();
      expect(queryChain.single).toHaveBeenCalled();
    });

    it('returns error on invalid input (missing name)', async () => {
      const result = await addBranch({ ...validBranchInput, name: '' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid input');
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('returns error on completely invalid input', async () => {
      const result = await addBranch('not-an-object');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid input');
    });

    it('returns error on DB failure', async () => {
      queryChain = makeQueryChain({ data: null, error: { code: '23505', message: 'unique violation' } });

      const result = await addBranch(validBranchInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to create branch');
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('throws (redirects) when auth fails', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT:/admin/login'));

      await expect(addBranch(validBranchInput)).rejects.toThrow('NEXT_REDIRECT:/admin/login');
    });
  });

  // ── updateBranch ─────────────────────────────────────────────────────────

  describe('updateBranch', () => {
    it('returns success on valid UUID and input', async () => {
      const result = await updateBranch(validUUID, validBranchInput);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(fakeBranch);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/branches');
      expect(mockFrom).toHaveBeenCalledWith('branches');
      expect(queryChain.update).toHaveBeenCalled();
      expect(queryChain.eq).toHaveBeenCalledWith('id', validUUID);
      expect(queryChain.select).toHaveBeenCalled();
      expect(queryChain.single).toHaveBeenCalled();
    });

    it('returns error on invalid UUID', async () => {
      const result = await updateBranch('not-a-uuid', validBranchInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid ID');
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('returns error on invalid input', async () => {
      const result = await updateBranch(validUUID, { name: '' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid input');
    });

    it('returns error on DB failure', async () => {
      queryChain = makeQueryChain({ data: null, error: { code: '42P01', message: 'relation does not exist' } });

      const result = await updateBranch(validUUID, validBranchInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to update branch');
    });
  });

  // ── deleteBranch ─────────────────────────────────────────────────────────

  describe('deleteBranch', () => {
    it('returns success on valid UUID', async () => {
      queryChain = makeQueryChain({ data: null, error: null });

      const result = await deleteBranch(validUUID);

      expect(result.success).toBe(true);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/branches');
      expect(mockFrom).toHaveBeenCalledWith('branches');
      expect(queryChain.delete).toHaveBeenCalled();
      expect(queryChain.eq).toHaveBeenCalledWith('id', validUUID);
    });

    it('returns error on invalid UUID', async () => {
      const result = await deleteBranch('not-a-uuid');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid ID');
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('returns error on DB failure', async () => {
      queryChain = makeQueryChain({ data: null, error: { code: '23503', message: 'fk violation' } });

      const result = await deleteBranch(validUUID);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to delete branch');
    });

    it('throws (redirects) when auth fails', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT:/admin/login'));

      await expect(deleteBranch(validUUID)).rejects.toThrow('NEXT_REDIRECT:/admin/login');
    });
  });
});
