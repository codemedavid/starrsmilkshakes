import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

// Mock @/lib/admin-auth
vi.mock('@/lib/admin-auth', () => ({
  ADMIN_SESSION_COOKIE: 'starrs_admin_session',
  isAdminSessionValid: vi.fn(),
}));

// Mock @/lib/super-admin-auth
vi.mock('@/lib/super-admin-auth', () => ({
  SUPER_ADMIN_SESSION_COOKIE: 'starrs_super_admin_session',
  isSuperAdminSessionValid: vi.fn(),
}));

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isAdminSessionValid } from '@/lib/admin-auth';
import { isSuperAdminSessionValid } from '@/lib/super-admin-auth';

const mockCookies = vi.mocked(cookies);
const mockHeaders = vi.mocked(headers);
const mockIsAdminSessionValid = vi.mocked(isAdminSessionValid);
const mockIsSuperAdminSessionValid = vi.mocked(isSuperAdminSessionValid);

function makeCookieStore(values: Record<string, string>) {
  return {
    get: (name: string) => {
      const val = values[name];
      return val !== undefined ? { value: val } : undefined;
    },
  };
}

function makeHeaderStore(values: Record<string, string>) {
  return {
    get: (name: string) => values[name] ?? null,
  };
}

describe('admin-guard', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('requireAdmin()', () => {
    it('returns { adminType: "super_admin" } when super admin session is valid', async () => {
      mockCookies.mockResolvedValue(
        makeCookieStore({ starrs_super_admin_session: 'super-token' }) as any
      );
      mockIsSuperAdminSessionValid.mockReturnValue({ valid: true, adminId: 'admin-uuid-123' });

      const { requireAdmin } = await import('@/lib/admin-guard');
      const result = await requireAdmin();

      expect(result).toEqual({ adminType: 'super_admin' });
      expect(mockIsSuperAdminSessionValid).toHaveBeenCalledWith('super-token');
    });

    it('returns { adminType: "admin" } when regular admin session is valid', async () => {
      mockCookies.mockResolvedValue(
        makeCookieStore({ starrs_admin_session: 'admin-token' }) as any
      );
      mockIsSuperAdminSessionValid.mockReturnValue({ valid: false, adminId: null });
      mockIsAdminSessionValid.mockReturnValue(true);

      const { requireAdmin } = await import('@/lib/admin-guard');
      const result = await requireAdmin();

      expect(result).toEqual({ adminType: 'admin' });
      expect(mockIsAdminSessionValid).toHaveBeenCalledWith('admin-token');
    });

    it('redirects to /admin/login when no valid session exists', async () => {
      mockCookies.mockResolvedValue(makeCookieStore({}) as any);
      mockIsSuperAdminSessionValid.mockReturnValue({ valid: false, adminId: null });
      mockIsAdminSessionValid.mockReturnValue(false);

      const { requireAdmin } = await import('@/lib/admin-guard');

      await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT:/admin/login');
    });

    it('redirects when super token exists but is invalid and no admin token', async () => {
      mockCookies.mockResolvedValue(
        makeCookieStore({ starrs_super_admin_session: 'bad-token' }) as any
      );
      mockIsSuperAdminSessionValid.mockReturnValue({ valid: false, adminId: null });

      const { requireAdmin } = await import('@/lib/admin-guard');

      await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT:/admin/login');
    });
  });

  describe('requireSuperAdmin()', () => {
    it('returns { adminId } when super admin session is valid', async () => {
      mockCookies.mockResolvedValue(
        makeCookieStore({ starrs_super_admin_session: 'super-token' }) as any
      );
      mockIsSuperAdminSessionValid.mockReturnValue({ valid: true, adminId: 'admin-uuid-456' });

      const { requireSuperAdmin } = await import('@/lib/admin-guard');
      const result = await requireSuperAdmin();

      expect(result).toEqual({ adminId: 'admin-uuid-456' });
    });

    it('throws when only a regular admin session is present', async () => {
      mockCookies.mockResolvedValue(
        makeCookieStore({ starrs_admin_session: 'admin-token' }) as any
      );
      mockIsSuperAdminSessionValid.mockReturnValue({ valid: false, adminId: null });

      const { requireSuperAdmin } = await import('@/lib/admin-guard');

      await expect(requireSuperAdmin()).rejects.toThrow('Super admin access required');
    });

    it('throws when no session at all', async () => {
      mockCookies.mockResolvedValue(makeCookieStore({}) as any);
      mockIsSuperAdminSessionValid.mockReturnValue({ valid: false, adminId: null });

      const { requireSuperAdmin } = await import('@/lib/admin-guard');

      await expect(requireSuperAdmin()).rejects.toThrow('Super admin access required');
    });
  });

  describe('getClientIPFromHeaders()', () => {
    it('extracts the first IP from x-forwarded-for', async () => {
      mockHeaders.mockResolvedValue(
        makeHeaderStore({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }) as any
      );

      const { getClientIPFromHeaders } = await import('@/lib/admin-guard');
      const ip = await getClientIPFromHeaders();

      expect(ip).toBe('1.2.3.4');
    });

    it('falls back to x-real-ip when x-forwarded-for is absent', async () => {
      mockHeaders.mockResolvedValue(
        makeHeaderStore({ 'x-real-ip': '9.10.11.12' }) as any
      );

      const { getClientIPFromHeaders } = await import('@/lib/admin-guard');
      const ip = await getClientIPFromHeaders();

      expect(ip).toBe('9.10.11.12');
    });

    it('returns "unknown" when no IP headers are present', async () => {
      mockHeaders.mockResolvedValue(makeHeaderStore({}) as any);

      const { getClientIPFromHeaders } = await import('@/lib/admin-guard');
      const ip = await getClientIPFromHeaders();

      expect(ip).toBe('unknown');
    });
  });
});
