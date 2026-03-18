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

// Mock site-settings mapper
vi.mock('@/lib/site-settings', () => ({
  mapSiteSettingsRows: vi.fn((rows: any[]) => {
    const lookup: Record<string, string> = {};
    (rows || []).forEach((r: any) => { lookup[r.id] = r.value ?? ''; });
    return lookup;
  }),
}));

// Build a chainable Supabase query mock that supports multiple sequential calls
// (updateSiteSettings fires one update per key, then a final select)
function makeQueryChain(result: { data: any; error: any }) {
  const chain: any = {};
  for (const method of ['select', 'update', 'eq', 'order']) {
    chain[method] = vi.fn(() => chain);
  }
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
        if (prop === 'from') return mockFrom;
        return undefined;
      },
    },
  ),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import { requireAdmin } from '@/lib/admin-guard';
import { revalidatePath } from 'next/cache';
import { updateSiteSettings } from '@/actions/settings';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRevalidatePath = vi.mocked(revalidatePath);

// ─── Fixtures ────────────────────────────────────────────────────────────────

const validInput = {
  site_name: 'Starr\'s Famous Shakes',
  site_description: 'The best shakes in town',
  currency: 'PHP',
  currency_code: 'PHP',
};

const fakeSettingsRows = [
  { id: 'site_name', value: "Starr's Famous Shakes" },
  { id: 'site_description', value: 'The best shakes in town' },
  { id: 'currency', value: 'PHP' },
  { id: 'currency_code', value: 'PHP' },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('updateSiteSettings Server Action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ adminType: 'admin' });
    // Default: update calls succeed, select returns rows
    queryChain = makeQueryChain({ data: fakeSettingsRows, error: null });
  });

  // ── Happy path ───────────────────────────────────────────────────────────

  it('returns success and calls revalidatePath on valid partial input', async () => {
    const result = await updateSiteSettings(validInput);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/settings');
    expect(mockFrom).toHaveBeenCalledWith('site_settings');
    // One update call per key in validInput
    expect(queryChain.update).toHaveBeenCalledTimes(validInput ? Object.keys(validInput).length : 0);
  });

  it('returns success with a single field update', async () => {
    const result = await updateSiteSettings({ site_name: 'New Name' });

    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('site_settings');
    expect(queryChain.update).toHaveBeenCalledWith({ value: 'New Name' });
    expect(queryChain.eq).toHaveBeenCalledWith('id', 'site_name');
  });

  // ── Validation failures ──────────────────────────────────────────────────

  it('returns error for completely invalid input (not an object)', async () => {
    const result = await updateSiteSettings('not-an-object');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid input');
    expect(mockRevalidatePath).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns error for empty object (no updates)', async () => {
    const result = await updateSiteSettings({});

    expect(result.success).toBe(false);
    expect(result.error).toBe('No updates provided');
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  // ── Auth failure ─────────────────────────────────────────────────────────

  it('throws (redirects) when auth fails', async () => {
    mockRequireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT:/admin/login'));

    await expect(updateSiteSettings(validInput)).rejects.toThrow('NEXT_REDIRECT:/admin/login');
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  // ── DB error ─────────────────────────────────────────────────────────────

  it('returns error when a DB update fails', async () => {
    queryChain = makeQueryChain({ data: null, error: { code: '42P01', message: 'relation does not exist' } });

    const result = await updateSiteSettings(validInput);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to update site settings');
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it('returns error when DB refetch after update fails', async () => {
    // Simulate: updates succeed but the following select fails.
    // We track how many times 'from' is called to switch behavior on second call.
    let callCount = 0;
    mockFrom.mockImplementation((_table: string) => {
      callCount += 1;
      if (callCount <= Object.keys(validInput).length) {
        // update calls — succeed
        return makeQueryChain({ data: null, error: null });
      }
      // refetch select — fail
      return makeQueryChain({ data: null, error: { code: '08006', message: 'connection failure' } });
    });

    const result = await updateSiteSettings(validInput);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Settings updated but failed to reload');
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});
