'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_SESSION_COOKIE, isAdminSessionValid } from '@/lib/admin-auth';
import { SUPER_ADMIN_SESSION_COOKIE, isSuperAdminSessionValid } from '@/lib/super-admin-auth';

export async function requireAdmin(): Promise<{ adminType: 'admin' | 'super_admin' }> {
  const cookieStore = await cookies();

  // Check super admin first (higher privilege)
  const superToken = cookieStore.get(SUPER_ADMIN_SESSION_COOKIE)?.value;
  if (superToken) {
    const { valid } = isSuperAdminSessionValid(superToken);
    if (valid) return { adminType: 'super_admin' };
  }

  // Check regular admin
  const adminToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (adminToken && isAdminSessionValid(adminToken)) {
    return { adminType: 'admin' };
  }

  redirect('/admin/login');
}

export async function requireSuperAdmin(): Promise<{ adminId: string }> {
  const cookieStore = await cookies();
  const superToken = cookieStore.get(SUPER_ADMIN_SESSION_COOKIE)?.value;

  if (superToken) {
    const { valid, adminId } = isSuperAdminSessionValid(superToken);
    if (valid && adminId) return { adminId };
  }

  throw new Error('Super admin access required');
}

export async function getClientIPFromHeaders(): Promise<string> {
  const headerStore = await headers();
  const forwarded = headerStore.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headerStore.get('x-real-ip') || 'unknown';
}
