import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

describe('super-admin-auth', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  });

  it('createSuperAdminSessionToken returns a signed token', async () => {
    const { createSuperAdminSessionToken } = await import('../../src/lib/super-admin-auth');
    const token = createSuperAdminSessionToken('test-admin-id');
    expect(token).toMatch(/^\d+\..+\..+$/);
  });

  it('isSuperAdminSessionValid validates a good token', async () => {
    const { createSuperAdminSessionToken, isSuperAdminSessionValid } = await import('../../src/lib/super-admin-auth');
    const token = createSuperAdminSessionToken('test-admin-id');
    const result = isSuperAdminSessionValid(token);
    expect(result).toEqual({ valid: true, adminId: 'test-admin-id' });
  });

  it('isSuperAdminSessionValid rejects expired token', async () => {
    const { createSuperAdminSessionToken, isSuperAdminSessionValid } = await import('../../src/lib/super-admin-auth');
    // Create token with a "now" far enough in the past that the token has already expired
    const pastTime = Date.now() - (13 * 60 * 60 * 1000); // 13 hours ago (TTL is 12h)
    const token = createSuperAdminSessionToken('test-admin-id', pastTime);
    const result = isSuperAdminSessionValid(token);
    expect(result).toEqual({ valid: false, adminId: null });
  });

  it('isSuperAdminSessionValid rejects tampered token', async () => {
    const { isSuperAdminSessionValid } = await import('../../src/lib/super-admin-auth');
    const result = isSuperAdminSessionValid('99999999999.fake-id.badsignature');
    expect(result).toEqual({ valid: false, adminId: null });
  });

  it('isSuperAdminSessionValid rejects null/empty token', async () => {
    const { isSuperAdminSessionValid } = await import('../../src/lib/super-admin-auth');
    expect(isSuperAdminSessionValid(null)).toEqual({ valid: false, adminId: null });
    expect(isSuperAdminSessionValid('')).toEqual({ valid: false, adminId: null });
  });
});
