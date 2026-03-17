import { createHmac, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';

const SUPER_ADMIN_SESSION_COOKIE = 'starrs_super_admin_session';
const SUPER_ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function getSessionSecret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback-dev-secret';
}

function sign(data: string): string {
  return createHmac('sha256', getSessionSecret()).update(data).digest('hex');
}

export function createSuperAdminSessionToken(adminId: string, now?: number): string {
  // When `now` is provided it is used as the expiry directly (enables testing with past timestamps)
  const expiresAt = now ?? (Date.now() + SUPER_ADMIN_SESSION_TTL_MS);
  const payload = `${expiresAt}.${adminId}`;
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function isSuperAdminSessionValid(token?: string | null, now?: number): { valid: boolean; adminId: string | null } {
  if (!token) return { valid: false, adminId: null };

  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, adminId: null };

  const [expiresAtStr, adminId, signature] = parts;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt)) return { valid: false, adminId: null };
  if ((now ?? Date.now()) > expiresAt) return { valid: false, adminId: null };

  const expected = sign(`${expiresAtStr}.${adminId}`);
  try {
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length) return { valid: false, adminId: null };
    if (!timingSafeEqual(sigBuf, expBuf)) return { valid: false, adminId: null };
  } catch {
    return { valid: false, adminId: null };
  }

  return { valid: true, adminId };
}

export async function verifySuperAdminPassword(inputPassword: string, storedHash: string): Promise<boolean> {
  return bcrypt.compare(inputPassword, storedHash);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function isSuperAdminRequest(request: NextRequest): { valid: boolean; adminId: string | null } {
  const cookieValue = request.cookies.get(SUPER_ADMIN_SESSION_COOKIE)?.value;
  return isSuperAdminSessionValid(cookieValue);
}

export function requireSuperAdminRequest(request: NextRequest): NextResponse | null {
  const { valid } = isSuperAdminRequest(request);
  if (!valid) {
    return NextResponse.json({ error: 'Super admin authentication required' }, { status: 401 });
  }
  return null;
}

export function setSuperAdminSessionCookie(response: NextResponse, adminId: string): void {
  const token = createSuperAdminSessionToken(adminId);
  response.cookies.set(SUPER_ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: SUPER_ADMIN_SESSION_TTL_MS / 1000,
    path: '/',
  });
}

export function clearSuperAdminSessionCookie(response: NextResponse): void {
  response.cookies.set(SUPER_ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  });
}

export { SUPER_ADMIN_SESSION_COOKIE };
