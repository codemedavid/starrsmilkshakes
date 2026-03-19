import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isAdminSessionValid, createAdminSessionToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { isSuperAdminSessionValid, createSuperAdminSessionToken } from '@/lib/super-admin-auth';

// Mock next/headers and next/navigation for Server Action tests
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

const SECRET = 'test-session-secret-at-least-32-chars-long!!';
const SUPABASE_KEY = 'test-supabase-service-role-key-xxxxxxxxxxxxx';

describe('Auth bypass — isAdminSessionValid', () => {
  beforeEach(() => {
    process.env.ADMIN_SESSION_SECRET = SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_KEY;
  });

  it('rejects when no token is provided', () => {
    expect(isAdminSessionValid(undefined)).toBe(false);
    expect(isAdminSessionValid(null)).toBe(false);
    expect(isAdminSessionValid('')).toBe(false);
  });

  it('rejects an expired token', () => {
    // Create a token that expired 1ms ago
    const pastNow = Date.now() - 100;
    const token = createAdminSessionToken(pastNow - 1000 * 60 * 60 * 12 - 1);
    expect(isAdminSessionValid(token, Date.now())).toBe(false);
  });

  it('rejects a tampered token (altered signature)', () => {
    const token = createAdminSessionToken();
    const parts = token.split('.');
    // Flip last character of the signature
    const sig = parts[parts.length - 1];
    parts[parts.length - 1] = sig.slice(0, -1) + (sig.endsWith('a') ? 'b' : 'a');
    expect(isAdminSessionValid(parts.join('.'))).toBe(false);
  });

  it('rejects a tampered token (altered expiry)', () => {
    const token = createAdminSessionToken();
    const parts = token.split('.');
    // Extend expiry manually — signature no longer matches
    parts[0] = String(Date.now() + 1000 * 60 * 60 * 24 * 365);
    expect(isAdminSessionValid(parts.join('.'))).toBe(false);
  });

  it('accepts a freshly created valid token', () => {
    const token = createAdminSessionToken();
    expect(isAdminSessionValid(token)).toBe(true);
  });
});

describe('Auth bypass — isSuperAdminSessionValid', () => {
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_KEY;
  });

  it('rejects when no token is provided', () => {
    expect(isSuperAdminSessionValid(undefined).valid).toBe(false);
    expect(isSuperAdminSessionValid(null).valid).toBe(false);
    expect(isSuperAdminSessionValid('').valid).toBe(false);
  });

  it('rejects an expired super admin token', () => {
    const expiredNow = Date.now() - 1000 * 60 * 60 * 12 - 1;
    const token = createSuperAdminSessionToken('admin-uuid-001', expiredNow);
    expect(isSuperAdminSessionValid(token, Date.now()).valid).toBe(false);
  });

  it('rejects a tampered super admin token', () => {
    const token = createSuperAdminSessionToken('admin-uuid-001');
    const parts = token.split('.');
    const sig = parts[parts.length - 1];
    parts[parts.length - 1] = sig.slice(0, -1) + (sig.endsWith('a') ? 'b' : 'a');
    expect(isSuperAdminSessionValid(parts.join('.')).valid).toBe(false);
  });

  it('accepts a freshly created valid super admin token', () => {
    const token = createSuperAdminSessionToken('admin-uuid-001');
    const result = isSuperAdminSessionValid(token);
    expect(result.valid).toBe(true);
    expect(result.adminId).toBe('admin-uuid-001');
  });
});

describe('Auth bypass — requireAdmin Server Action gating', () => {
  beforeEach(() => {
    process.env.ADMIN_SESSION_SECRET = SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_KEY;
  });

  it('throws a redirect when no session cookies are present', async () => {
    const { cookies } = await import('next/headers');
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue(undefined),
    } as any);

    const { requireAdmin } = await import('@/lib/admin-guard');
    await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT:/admin/login');
  });

  it('throws a redirect when admin cookie has an invalid/expired token', async () => {
    const { cookies } = await import('next/headers');
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn((name: string) => {
        if (name === ADMIN_SESSION_COOKIE) return { value: 'not.a.valid.token' };
        return undefined;
      }),
    } as any);

    const { requireAdmin } = await import('@/lib/admin-guard');
    await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT:/admin/login');
  });

  it('resolves when admin cookie has a valid token', async () => {
    const { cookies } = await import('next/headers');
    const validToken = createAdminSessionToken();
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn((name: string) => {
        if (name === ADMIN_SESSION_COOKIE) return { value: validToken };
        return undefined;
      }),
    } as any);

    const { requireAdmin } = await import('@/lib/admin-guard');
    const result = await requireAdmin();
    expect(result.adminType).toBe('admin');
  });
});
