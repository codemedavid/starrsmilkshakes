import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock admin-guard
vi.mock('@/lib/admin-guard', () => ({
  checkActionRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  requireAdmin: vi.fn(),
}));

// Mock next/cache
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// Mock rag-sync (fire-and-forget — tests must not hit real embedding API)
vi.mock('@/lib/rag-sync', () => ({
  syncEmbedding: vi.fn().mockResolvedValue(undefined),
  removeEmbedding: vi.fn().mockResolvedValue(undefined),
  buildMenuItemContent: vi.fn().mockReturnValue('mocked content'),
}));

// Build a chainable Supabase query mock that tracks per-table chains
function makeQueryChain(result: { data: any; error: any }) {
  const chain: any = {};
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'gte', 'order', 'single']) {
    chain[method] = vi.fn(() => chain);
  }
  // Awaiting the chain resolves to { data, error }
  chain.then = (resolve: any) => resolve(result);
  return chain;
}

// Track per-table chains so we can assert which table was used
const tableChains: Record<string, any> = {};
let defaultResult = { data: null, error: null };

const mockFrom = vi.fn((table: string) => {
  if (!tableChains[table]) {
    tableChains[table] = makeQueryChain(defaultResult);
  }
  return tableChains[table];
});

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
  addMenuItem,
  updateMenuItem,
  deleteMenuItem,
  bulkUpdateMessengerVisibility,
} from '@/actions/menu';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRevalidatePath = vi.mocked(revalidatePath);

// ─── Fixtures ────────────────────────────────────────────────────────────────

const validUUID = '550e8400-e29b-41d4-a716-446655440000';

const validMenuItemInput = {
  name: 'Classic Vanilla Shake',
  basePrice: 120,
  category: 'milkshakes',
  description: 'A classic vanilla milkshake',
  popular: true,
  available: true,
  show_in_messenger: false,
  discountActive: false,
  variations: [
    { name: 'Regular', price: 120 },
    { name: 'Large', price: 150 },
  ],
  addOns: [
    { name: 'Whipped Cream', price: 20, category: 'toppings' },
  ],
};

const fakeMenuItem = {
  id: validUUID,
  name: 'Classic Vanilla Shake',
  base_price: 120,
  category: 'milkshakes',
  description: 'A classic vanilla milkshake',
  popular: true,
  available: true,
  show_in_messenger: false,
  created_at: '2026-01-01T00:00:00Z',
};

// ─── Test helpers ────────────────────────────────────────────────────────────

function resetTableChains(menuItemResult?: { data: any; error: any }) {
  // Clear all table chains
  for (const key of Object.keys(tableChains)) {
    delete tableChains[key];
  }

  // Set default for menu_items table
  const itemResult = menuItemResult || { data: fakeMenuItem, error: null };
  tableChains['menu_items'] = makeQueryChain(itemResult);
  tableChains['variations'] = makeQueryChain({ data: null, error: null });
  tableChains['add_ons'] = makeQueryChain({ data: null, error: null });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Menu Server Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ adminType: 'admin' });
    resetTableChains();
  });

  // ── addMenuItem ──────────────────────────────────────────────────────────

  describe('addMenuItem', () => {
    it('returns success, inserts item + variations + add-ons, and revalidates', async () => {
      const result = await addMenuItem(validMenuItemInput);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(fakeMenuItem);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/menu');

      // Menu item was inserted
      expect(mockFrom).toHaveBeenCalledWith('menu_items');
      expect(tableChains['menu_items'].insert).toHaveBeenCalled();
      expect(tableChains['menu_items'].select).toHaveBeenCalled();
      expect(tableChains['menu_items'].single).toHaveBeenCalled();

      // Variations were inserted
      expect(mockFrom).toHaveBeenCalledWith('variations');
      expect(tableChains['variations'].insert).toHaveBeenCalled();
      const variationsArg = tableChains['variations'].insert.mock.calls[0][0];
      expect(variationsArg).toHaveLength(2);
      expect(variationsArg[0]).toEqual({
        menu_item_id: validUUID,
        name: 'Regular',
        price: 120,
        image_url: null,
      });

      // Add-ons were inserted
      expect(mockFrom).toHaveBeenCalledWith('add_ons');
      expect(tableChains['add_ons'].insert).toHaveBeenCalled();
      const addOnsArg = tableChains['add_ons'].insert.mock.calls[0][0];
      expect(addOnsArg).toHaveLength(1);
      expect(addOnsArg[0]).toEqual({
        menu_item_id: validUUID,
        name: 'Whipped Cream',
        price: 20,
        category: 'toppings',
      });
    });

    it('handles item with no variations or add-ons', async () => {
      const input = { ...validMenuItemInput, variations: [], addOns: [] };
      const result = await addMenuItem(input);

      expect(result.success).toBe(true);
      // Variations insert should NOT be called (empty array)
      expect(tableChains['variations'].insert).not.toHaveBeenCalled();
      expect(tableChains['add_ons'].insert).not.toHaveBeenCalled();
    });

    it('returns error on invalid input (missing name)', async () => {
      const result = await addMenuItem({ ...validMenuItemInput, name: '' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid input');
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('returns error on invalid input (negative price)', async () => {
      const result = await addMenuItem({ ...validMenuItemInput, basePrice: -10 });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid input');
    });

    it('returns error on completely invalid input', async () => {
      const result = await addMenuItem('not-an-object');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid input');
    });

    it('returns error on DB failure for menu item insert', async () => {
      resetTableChains({ data: null, error: { code: '23505', message: 'unique violation' } });

      const result = await addMenuItem(validMenuItemInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to create menu item');
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('returns error on DB failure for variations insert', async () => {
      resetTableChains();
      tableChains['variations'] = makeQueryChain({
        data: null,
        error: { code: '23503', message: 'fk violation' },
      });

      const result = await addMenuItem(validMenuItemInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to create variations');
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('returns error on DB failure for add-ons insert', async () => {
      resetTableChains();
      tableChains['add_ons'] = makeQueryChain({
        data: null,
        error: { code: '23503', message: 'fk violation' },
      });

      const result = await addMenuItem(validMenuItemInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to create add-ons');
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('throws (redirects) when auth fails', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT:/admin/login'));

      await expect(addMenuItem(validMenuItemInput)).rejects.toThrow('NEXT_REDIRECT:/admin/login');
    });
  });

  // ── updateMenuItem ─────────────────────────────────────────────────────

  describe('updateMenuItem', () => {
    it('returns success, replaces variations/add-ons, and revalidates', async () => {
      const result = await updateMenuItem(validUUID, validMenuItemInput);

      expect(result.success).toBe(true);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/menu');

      // Menu item was updated
      expect(mockFrom).toHaveBeenCalledWith('menu_items');
      expect(tableChains['menu_items'].update).toHaveBeenCalled();
      expect(tableChains['menu_items'].eq).toHaveBeenCalledWith('id', validUUID);

      // Old variations deleted, new ones inserted
      expect(tableChains['variations'].delete).toHaveBeenCalled();
      expect(tableChains['variations'].eq).toHaveBeenCalledWith('menu_item_id', validUUID);
      expect(tableChains['variations'].insert).toHaveBeenCalled();

      // Old add-ons deleted, new ones inserted
      expect(tableChains['add_ons'].delete).toHaveBeenCalled();
      expect(tableChains['add_ons'].eq).toHaveBeenCalledWith('menu_item_id', validUUID);
      expect(tableChains['add_ons'].insert).toHaveBeenCalled();
    });

    it('returns error on invalid UUID', async () => {
      const result = await updateMenuItem('not-a-uuid', validMenuItemInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid ID');
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('returns error on invalid input', async () => {
      const result = await updateMenuItem(validUUID, { name: '' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid input');
    });

    it('returns error on DB failure', async () => {
      resetTableChains({ data: null, error: { code: '42P01', message: 'relation does not exist' } });

      const result = await updateMenuItem(validUUID, validMenuItemInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to update menu item');
    });

    it('throws (redirects) when auth fails', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT:/admin/login'));

      await expect(updateMenuItem(validUUID, validMenuItemInput)).rejects.toThrow(
        'NEXT_REDIRECT:/admin/login',
      );
    });
  });

  // ── deleteMenuItem ─────────────────────────────────────────────────────

  describe('deleteMenuItem', () => {
    it('returns success on valid UUID', async () => {
      const result = await deleteMenuItem(validUUID);

      expect(result.success).toBe(true);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/menu');

      // Child rows deleted first
      expect(mockFrom).toHaveBeenCalledWith('variations');
      expect(mockFrom).toHaveBeenCalledWith('add_ons');
      // Then the menu item itself
      expect(mockFrom).toHaveBeenCalledWith('menu_items');
      expect(tableChains['menu_items'].delete).toHaveBeenCalled();
      expect(tableChains['menu_items'].eq).toHaveBeenCalledWith('id', validUUID);
    });

    it('returns error on invalid UUID', async () => {
      const result = await deleteMenuItem('not-a-uuid');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid ID');
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('returns error on DB failure', async () => {
      resetTableChains({ data: null, error: { code: '23503', message: 'fk violation' } });

      const result = await deleteMenuItem(validUUID);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to delete menu item');
    });

    it('throws (redirects) when auth fails', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT:/admin/login'));

      await expect(deleteMenuItem(validUUID)).rejects.toThrow('NEXT_REDIRECT:/admin/login');
    });
  });

  // ── bulkUpdateMessengerVisibility ──────────────────────────────────────

  describe('bulkUpdateMessengerVisibility', () => {
    it('updates specific IDs and returns count', async () => {
      resetTableChains();
      tableChains['menu_items'] = makeQueryChain({
        data: [{ id: validUUID }],
        error: null,
      });

      const result = await bulkUpdateMessengerVisibility({
        ids: [validUUID],
        show_in_messenger: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.updated).toBe(1);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/menu');
      expect(tableChains['menu_items'].update).toHaveBeenCalledWith({ show_in_messenger: true });
      expect(tableChains['menu_items'].in).toHaveBeenCalledWith('id', [validUUID]);
    });

    it('updates all items when ids is "all"', async () => {
      resetTableChains();
      tableChains['menu_items'] = makeQueryChain({
        data: [{ id: '1' }, { id: '2' }],
        error: null,
      });

      const result = await bulkUpdateMessengerVisibility({
        ids: 'all',
        show_in_messenger: false,
      });

      expect(result.success).toBe(true);
      expect(result.data?.updated).toBe(2);
      expect(tableChains['menu_items'].gte).toHaveBeenCalledWith('created_at', '1970-01-01');
    });

    it('returns success with 0 updated for empty array', async () => {
      const result = await bulkUpdateMessengerVisibility({
        ids: [],
        show_in_messenger: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.updated).toBe(0);
    });

    it('returns error on invalid input', async () => {
      const result = await bulkUpdateMessengerVisibility({
        ids: 'invalid',
        show_in_messenger: 'not-boolean',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid input');
    });

    it('returns error on DB failure', async () => {
      resetTableChains();
      tableChains['menu_items'] = makeQueryChain({
        data: null,
        error: { code: '42P01', message: 'relation does not exist' },
      });

      const result = await bulkUpdateMessengerVisibility({
        ids: [validUUID],
        show_in_messenger: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to update menu items');
    });
  });
});
