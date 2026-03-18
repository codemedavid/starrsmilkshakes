import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock admin-guard — requireSuperAdmin returns { adminId } or throws
vi.mock('@/lib/admin-guard', () => ({
  requireSuperAdmin: vi.fn(),
}));

// Mock next/cache
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Mock messenger-auth helpers
vi.mock('@/lib/messenger-auth', () => ({
  exchangeForLongLivedToken: vi.fn(),
  getPageAccessToken: vi.fn(),
  subscribePageToWebhook: vi.fn(),
  unsubscribePageFromWebhook: vi.fn(),
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
        if (prop === 'from') return mockFrom;
        return undefined;
      },
    },
  ),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import { requireSuperAdmin } from '@/lib/admin-guard';
import { revalidatePath } from 'next/cache';
import {
  exchangeForLongLivedToken,
  getPageAccessToken,
  subscribePageToWebhook,
  unsubscribePageFromWebhook,
} from '@/lib/messenger-auth';
import { connectFacebook, disconnectFacebook } from '@/actions/facebook';

const mockRequireSuperAdmin = vi.mocked(requireSuperAdmin);
const mockRevalidatePath = vi.mocked(revalidatePath);
const mockExchangeToken = vi.mocked(exchangeForLongLivedToken);
const mockGetPages = vi.mocked(getPageAccessToken);
const mockSubscribe = vi.mocked(subscribePageToWebhook);
const mockUnsubscribe = vi.mocked(unsubscribePageFromWebhook);

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FAKE_ADMIN_ID = 'super-admin-uuid-001';
const SHORT_TOKEN = 'EAAshort123';
const LONG_TOKEN = 'EAAlong456';

const fakePage = {
  pageId: 'page-123',
  pageName: "Starr's Famous Shakes",
  pageAccessToken: 'page-token-abc',
  tokenExpiresAt: null,
};

const fakeConfig = {
  page_id: 'page-123',
  page_access_token: 'page-token-abc',
};

// ─── Tests: connectFacebook ──────────────────────────────────────────────────

describe('connectFacebook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSuperAdmin.mockResolvedValue({ adminId: FAKE_ADMIN_ID });
    mockExchangeToken.mockResolvedValue(LONG_TOKEN);
    mockGetPages.mockResolvedValue([fakePage]);
    mockSubscribe.mockResolvedValue(undefined);
    // Default chain: no existing configs, successful insert
    queryChain = makeQueryChain({ data: [], error: null });
  });

  it('requires super admin — rejects if called by a regular admin', async () => {
    mockRequireSuperAdmin.mockRejectedValue(new Error('Super admin access required'));

    await expect(connectFacebook(SHORT_TOKEN)).rejects.toThrow('Super admin access required');
  });

  it('returns error when accessToken is empty', async () => {
    const result = await connectFacebook('');

    expect(result.success).toBe(false);
    expect(result.error).toBe('accessToken is required');
    expect(mockExchangeToken).not.toHaveBeenCalled();
  });

  it('returns error when no Facebook pages are found', async () => {
    mockGetPages.mockResolvedValue([]);

    const result = await connectFacebook(SHORT_TOKEN);

    expect(result.success).toBe(false);
    expect(result.error).toBe('No Facebook Pages found for this account');
  });

  it('returns error when a specified pageId does not match any page', async () => {
    const result = await connectFacebook(SHORT_TOKEN, 'nonexistent-page-id');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Specified page not found');
  });

  it('returns success and revalidates on valid input (auto-selects first page)', async () => {
    // Two-call pattern: first call returns [] for select (no existing), second for insert returns null error
    let callCount = 0;
    mockFrom.mockImplementation((_table: string) => {
      callCount++;
      if (callCount === 1) {
        // First .from('facebook_config') — the SELECT for existing rows
        return makeQueryChain({ data: [], error: null });
      }
      // Subsequent calls — the INSERT
      return makeQueryChain({ data: null, error: null });
    });

    const result = await connectFacebook(SHORT_TOKEN);

    expect(result.success).toBe(true);
    expect(result.data.page).toEqual({ id: fakePage.pageId, name: fakePage.pageName });
    expect(mockExchangeToken).toHaveBeenCalledWith(SHORT_TOKEN);
    expect(mockGetPages).toHaveBeenCalledWith(LONG_TOKEN);
    expect(mockSubscribe).toHaveBeenCalledWith(fakePage.pageId, fakePage.pageAccessToken);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/facebook');
  });

  it('selects the correct page when pageId is provided', async () => {
    const secondPage = {
      pageId: 'page-456',
      pageName: 'Second Page',
      pageAccessToken: 'token-second',
      tokenExpiresAt: null,
    };
    mockGetPages.mockResolvedValue([fakePage, secondPage]);

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeQueryChain({ data: [], error: null });
      return makeQueryChain({ data: null, error: null });
    });

    const result = await connectFacebook(SHORT_TOKEN, 'page-456');

    expect(result.success).toBe(true);
    expect(result.data.page).toEqual({ id: 'page-456', name: 'Second Page' });
    expect(mockSubscribe).toHaveBeenCalledWith('page-456', 'token-second');
  });

  it('returns error on DB insert failure', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeQueryChain({ data: [], error: null });
      return makeQueryChain({ data: null, error: { code: '23505', message: 'unique violation' } });
    });

    const result = await connectFacebook(SHORT_TOKEN);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to save Facebook config');
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it('returns error when exchangeForLongLivedToken throws', async () => {
    mockExchangeToken.mockRejectedValue(new Error('Token exchange failed'));

    const result = await connectFacebook(SHORT_TOKEN);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Token exchange failed');
  });
});

// ─── Tests: disconnectFacebook ───────────────────────────────────────────────

describe('disconnectFacebook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSuperAdmin.mockResolvedValue({ adminId: FAKE_ADMIN_ID });
    mockUnsubscribe.mockResolvedValue(undefined);
    queryChain = makeQueryChain({ data: fakeConfig, error: null });
  });

  it('requires super admin — throws on auth failure', async () => {
    mockRequireSuperAdmin.mockRejectedValue(new Error('Super admin access required'));

    await expect(disconnectFacebook()).rejects.toThrow('Super admin access required');
  });

  it('succeeds and revalidates when a config exists', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // SELECT single
        return makeQueryChain({ data: fakeConfig, error: null });
      }
      // DELETE
      return makeQueryChain({ data: null, error: null });
    });

    const result = await disconnectFacebook();

    expect(result.success).toBe(true);
    expect(mockUnsubscribe).toHaveBeenCalledWith(fakeConfig.page_id, fakeConfig.page_access_token);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/facebook');
  });

  it('succeeds gracefully when no config exists (nothing to disconnect)', async () => {
    mockFrom.mockImplementation(() => makeQueryChain({ data: null, error: null }));

    const result = await disconnectFacebook();

    expect(result.success).toBe(true);
    expect(mockUnsubscribe).not.toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/facebook');
  });

  it('returns error when an unexpected exception is thrown', async () => {
    mockFrom.mockImplementation(() => {
      throw new Error('Unexpected DB error');
    });

    const result = await disconnectFacebook();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unexpected DB error');
  });
});
