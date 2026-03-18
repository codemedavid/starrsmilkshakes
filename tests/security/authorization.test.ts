import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock next/headers and next/navigation before importing any server-side modules
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

// Mock supabaseServer so no real DB calls happen
vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

// Mock messenger-auth to avoid real HTTP calls in facebook actions
vi.mock('@/lib/messenger-auth', () => ({
  exchangeForLongLivedToken: vi.fn(),
  getPageAccessToken: vi.fn(),
  subscribePageToWebhook: vi.fn(),
  unsubscribePageFromWebhook: vi.fn(),
}));

const SUPABASE_KEY = 'test-supabase-service-role-key-xxxxxxxxxxxxx';
const ADMIN_SECRET = 'test-session-secret-at-least-32-chars-long!!';

describe('Authorization — requireSuperAdmin rejects regular admin', () => {
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_KEY;
    process.env.ADMIN_SESSION_SECRET = ADMIN_SECRET;
  });

  it('unlinkCustomer throws when only a regular admin cookie is present', async () => {
    const { createAdminSessionToken, ADMIN_SESSION_COOKIE } = await import('@/lib/admin-auth');
    const { cookies, headers } = await import('next/headers');

    const validAdminToken = createAdminSessionToken();
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn((name: string) => {
        if (name === ADMIN_SESSION_COOKIE) return { value: validAdminToken };
        return undefined;
      }),
    } as any);

    vi.mocked(headers).mockResolvedValue({
      get: vi.fn().mockReturnValue(null),
    } as any);

    const { unlinkCustomer } = await import('@/actions/customers');
    await expect(
      unlinkCustomer({
        order_id: '550e8400-e29b-41d4-a716-446655440000',
        reason: 'Incorrect match',
      }),
    ).rejects.toThrow('Super admin access required');
  });

  it('connectFacebook throws when only a regular admin cookie is present', async () => {
    const { createAdminSessionToken, ADMIN_SESSION_COOKIE } = await import('@/lib/admin-auth');
    const { cookies, headers } = await import('next/headers');

    const validAdminToken = createAdminSessionToken();
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn((name: string) => {
        if (name === ADMIN_SESSION_COOKIE) return { value: validAdminToken };
        return undefined;
      }),
    } as any);

    vi.mocked(headers).mockResolvedValue({
      get: vi.fn().mockReturnValue(null),
    } as any);

    const { connectFacebook } = await import('@/actions/facebook');
    await expect(connectFacebook('some-access-token')).rejects.toThrow(
      'Super admin access required',
    );
  });

  it('disconnectFacebook throws when only a regular admin cookie is present', async () => {
    const { createAdminSessionToken, ADMIN_SESSION_COOKIE } = await import('@/lib/admin-auth');
    const { cookies, headers } = await import('next/headers');

    const validAdminToken = createAdminSessionToken();
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn((name: string) => {
        if (name === ADMIN_SESSION_COOKIE) return { value: validAdminToken };
        return undefined;
      }),
    } as any);

    vi.mocked(headers).mockResolvedValue({
      get: vi.fn().mockReturnValue(null),
    } as any);

    const { disconnectFacebook } = await import('@/actions/facebook');
    await expect(disconnectFacebook()).rejects.toThrow('Super admin access required');
  });
});

describe('Authorization — super admin can call privileged actions', () => {
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_KEY;
    process.env.ADMIN_SESSION_SECRET = ADMIN_SECRET;
  });

  it('unlinkCustomer proceeds past auth check when super admin session is present', async () => {
    const { createSuperAdminSessionToken, SUPER_ADMIN_SESSION_COOKIE } = await import(
      '@/lib/super-admin-auth'
    );
    const { cookies, headers } = await import('next/headers');

    const superToken = createSuperAdminSessionToken('super-admin-uuid-001');
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn((name: string) => {
        if (name === SUPER_ADMIN_SESSION_COOKIE) return { value: superToken };
        return undefined;
      }),
    } as any);

    vi.mocked(headers).mockResolvedValue({
      get: vi.fn().mockReturnValue('127.0.0.1'),
    } as any);

    const { unlinkCustomer } = await import('@/actions/customers');
    // Passes auth — will fail at DB layer (mocked to return null), but no auth error thrown
    const result = await unlinkCustomer({
      order_id: '550e8400-e29b-41d4-a716-446655440000',
      reason: 'Incorrect match',
    });
    // Result may be { success: false, error: 'No linked customer' } — that's OK
    // The key assertion is that it does NOT throw 'Super admin access required'
    expect(result).toHaveProperty('success');
  });
});
