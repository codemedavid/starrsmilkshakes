import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/admin-guard', () => ({
  requireAdmin: vi.fn(),
}));

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

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { requireAdmin } from '@/lib/admin-guard';
import { revalidatePath } from 'next/cache';
import {
  addCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
} from '@/actions/categories';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRevalidatePath = vi.mocked(revalidatePath);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const validCategoryInput = {
  name: 'Milkshakes',
  icon: '🥤',
};

const validUUID = '550e8400-e29b-41d4-a716-446655440000';
const validUUID2 = '660e8400-e29b-41d4-a716-446655440001';
const validUUID3 = '770e8400-e29b-41d4-a716-446655440002';

const fakeCategory = {
  id: validUUID,
  name: 'Milkshakes',
  icon: '🥤',
  sort_order: 1,
  active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Category Server Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ adminType: 'admin' } as any);
    queryChain = makeQueryChain({ data: fakeCategory, error: null });
  });

  // ── addCategory ────────────────────────────────────────────────────────────

  describe('addCategory', () => {
    it('returns success and calls revalidatePath on valid input', async () => {
      const result = await addCategory(validCategoryInput);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(fakeCategory);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/categories');
      expect(mockFrom).toHaveBeenCalledWith('categories');
      expect(queryChain.insert).toHaveBeenCalled();
      expect(queryChain.select).toHaveBeenCalled();
      expect(queryChain.single).toHaveBeenCalled();
    });

    it('returns error on invalid input (empty name)', async () => {
      const result = await addCategory({ ...validCategoryInput, name: '' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid input');
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('returns error on completely invalid input', async () => {
      const result = await addCategory('not-an-object');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid input');
    });

    it('returns error on DB failure', async () => {
      queryChain = makeQueryChain({ data: null, error: { code: '23505', message: 'unique violation' } });

      const result = await addCategory(validCategoryInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to create category');
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('throws (redirects) when auth fails', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT:/admin/login'));

      await expect(addCategory(validCategoryInput)).rejects.toThrow('NEXT_REDIRECT:/admin/login');
    });

    it('strips HTML tags from name (XSS protection)', async () => {
      const result = await addCategory({ name: '<script>alert(1)</script>Shakes', icon: '🥤' });

      // sanitizeString strips tags but keeps inner text; "<script>alert(1)</script>Shakes" → "alert(1)Shakes"
      expect(result.success).toBe(true);
      const insertCall = queryChain.insert.mock.calls[0][0];
      expect(insertCall.name).not.toContain('<script>');
      expect(insertCall.name).not.toContain('</script>');
      expect(insertCall.name).toBe('alert(1)Shakes');
    });
  });

  // ── updateCategory ─────────────────────────────────────────────────────────

  describe('updateCategory', () => {
    it('returns success on valid UUID and input', async () => {
      const result = await updateCategory(validUUID, validCategoryInput);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(fakeCategory);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/categories');
      expect(mockFrom).toHaveBeenCalledWith('categories');
      expect(queryChain.update).toHaveBeenCalled();
      expect(queryChain.eq).toHaveBeenCalledWith('id', validUUID);
      expect(queryChain.select).toHaveBeenCalled();
      expect(queryChain.single).toHaveBeenCalled();
    });

    it('returns error on invalid UUID', async () => {
      const result = await updateCategory('not-a-uuid', validCategoryInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid ID');
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('returns error on invalid input (empty name)', async () => {
      const result = await updateCategory(validUUID, { name: '' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid input');
    });

    it('returns error on DB failure', async () => {
      queryChain = makeQueryChain({ data: null, error: { code: '42P01', message: 'relation does not exist' } });

      const result = await updateCategory(validUUID, validCategoryInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to update category');
    });

    it('throws (redirects) when auth fails', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT:/admin/login'));

      await expect(updateCategory(validUUID, validCategoryInput)).rejects.toThrow('NEXT_REDIRECT:/admin/login');
    });
  });

  // ── deleteCategory ─────────────────────────────────────────────────────────

  describe('deleteCategory', () => {
    beforeEach(() => {
      // For deleteCategory we need two separate DB calls:
      // 1. menu_items check (returns empty array = safe to delete)
      // 2. categories delete (returns no error)
      // Override mockFrom to return different chains per table
      mockFrom.mockImplementation((table: string) => {
        if (table === 'menu_items') {
          return makeQueryChain({ data: [], error: null });
        }
        return makeQueryChain({ data: null, error: null });
      });
    });

    it('returns success on valid UUID when no menu items reference the category', async () => {
      const result = await deleteCategory(validUUID);

      expect(result.success).toBe(true);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/categories');
      expect(mockFrom).toHaveBeenCalledWith('menu_items');
      expect(mockFrom).toHaveBeenCalledWith('categories');
    });

    it('returns error when category has menu items', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'menu_items') {
          return makeQueryChain({ data: [{ id: 'some-item-id' }], error: null });
        }
        return makeQueryChain({ data: null, error: null });
      });

      const result = await deleteCategory(validUUID);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot delete a category that still contains menu items');
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('returns error on invalid UUID', async () => {
      const result = await deleteCategory('not-a-uuid');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid ID');
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('returns error when menu_items check fails', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'menu_items') {
          return makeQueryChain({ data: null, error: { code: '42P01', message: 'relation does not exist' } });
        }
        return makeQueryChain({ data: null, error: null });
      });

      const result = await deleteCategory(validUUID);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to validate category usage');
    });

    it('returns error on DB delete failure', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'menu_items') {
          return makeQueryChain({ data: [], error: null });
        }
        return makeQueryChain({ data: null, error: { code: '23503', message: 'fk violation' } });
      });

      const result = await deleteCategory(validUUID);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to delete category');
    });

    it('throws (redirects) when auth fails', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT:/admin/login'));

      await expect(deleteCategory(validUUID)).rejects.toThrow('NEXT_REDIRECT:/admin/login');
    });
  });

  // ── reorderCategories ──────────────────────────────────────────────────────

  describe('reorderCategories', () => {
    beforeEach(() => {
      // reorderCategories calls mockFrom once per ID — each returns no error
      queryChain = makeQueryChain({ data: null, error: null });
      mockFrom.mockReturnValue(queryChain);
    });

    it('returns success on valid ids array and calls revalidatePath', async () => {
      const result = await reorderCategories({ ids: [validUUID, validUUID2, validUUID3] });

      expect(result.success).toBe(true);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/categories');
      // Called once per ID
      expect(mockFrom).toHaveBeenCalledTimes(3);
      expect(mockFrom).toHaveBeenCalledWith('categories');
      // Each update sets sort_order by position (1-indexed)
      expect(queryChain.update).toHaveBeenCalledWith({ sort_order: 1 });
      expect(queryChain.update).toHaveBeenCalledWith({ sort_order: 2 });
      expect(queryChain.update).toHaveBeenCalledWith({ sort_order: 3 });
    });

    it('calls eq with each uuid', async () => {
      await reorderCategories({ ids: [validUUID, validUUID2] });

      expect(queryChain.eq).toHaveBeenCalledWith('id', validUUID);
      expect(queryChain.eq).toHaveBeenCalledWith('id', validUUID2);
    });

    it('returns error on invalid input (non-uuid in array)', async () => {
      const result = await reorderCategories({ ids: ['not-a-uuid'] });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid input');
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('returns error on completely invalid input', async () => {
      const result = await reorderCategories('bad-input');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid input');
    });

    it('returns error on DB failure during reorder', async () => {
      queryChain = makeQueryChain({ data: null, error: { code: 'XX000', message: 'internal error' } });
      mockFrom.mockReturnValue(queryChain);

      const result = await reorderCategories({ ids: [validUUID] });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to reorder categories');
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('throws (redirects) when auth fails', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT:/admin/login'));

      await expect(reorderCategories({ ids: [validUUID] })).rejects.toThrow('NEXT_REDIRECT:/admin/login');
    });
  });
});
