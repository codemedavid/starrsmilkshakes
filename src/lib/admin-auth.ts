import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isSuperAdminRequest } from '@/lib/super-admin-auth';

export const ADMIN_SESSION_COOKIE = 'starrs_admin_session';
const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const INTERNAL_API_HEADER = 'x-starrs-internal-token';

const getAdminPassword = () => process.env.ADMIN_PASSWORD?.trim() || '';

const getAdminSessionSecret = () =>
  process.env.ADMIN_SESSION_SECRET?.trim() || '';

const getInternalApiSecret = () => getAdminSessionSecret();

const toBuffer = (value: string) => Buffer.from(value, 'utf8');

const constantTimeEquals = (left: string, right: string) => {
  const leftBuffer = toBuffer(left);
  const rightBuffer = toBuffer(right);
  const maxLength = Math.max(leftBuffer.length, rightBuffer.length);
  if (maxLength === 0) return true;
  const paddedLeft = Buffer.alloc(maxLength);
  const paddedRight = Buffer.alloc(maxLength);
  leftBuffer.copy(paddedLeft);
  rightBuffer.copy(paddedRight);
  return timingSafeEqual(paddedLeft, paddedRight) && leftBuffer.length === rightBuffer.length;
};

const signValue = (value: string, secret: string) =>
  createHmac('sha256', secret).update(value).digest('base64url');

export const isAdminAuthConfigured = () => {
  return Boolean(getAdminPassword() && getAdminSessionSecret());
};

export const verifyAdminPassword = (password: string) => {
  const adminPassword = getAdminPassword();
  if (!adminPassword) {
    return false;
  }

  return constantTimeEquals(password, adminPassword);
};

export const createAdminSessionToken = (now = Date.now()) => {
  const secret = getAdminSessionSecret();
  if (!secret) {
    throw new Error('Missing ADMIN_SESSION_SECRET');
  }

  const expiresAt = String(now + ADMIN_SESSION_TTL_MS);
  const nonce = randomBytes(16).toString('base64url');
  const payload = `${expiresAt}.${nonce}`;
  const signature = signValue(payload, secret);
  return `${payload}.${signature}`;
};

const parseAdminSessionToken = (token?: string | null) => {
  if (!token) {
    return null;
  }

  const parts = token.split('.');
  // Support new 3-part format: expiresAt.nonce.signature
  if (parts.length === 3) {
    const [expiresAt, nonce, signature] = parts;
    if (!expiresAt || !nonce || !signature) return null;
    return { expiresAt, nonce, signature, payload: `${expiresAt}.${nonce}` };
  }
  // Legacy 2-part format: expiresAt.signature (for existing sessions)
  if (parts.length === 2) {
    const [expiresAt, signature] = parts;
    if (!expiresAt || !signature) return null;
    return { expiresAt, nonce: null, signature, payload: expiresAt };
  }
  return null;
};

export const isAdminSessionValid = (token?: string | null, now = Date.now()) => {
  const parsed = parseAdminSessionToken(token);
  const secret = getAdminSessionSecret();

  if (!parsed || !secret) {
    return false;
  }

  const expectedSignature = signValue(parsed.payload, secret);
  const expiry = Number(parsed.expiresAt);

  if (!Number.isFinite(expiry) || expiry <= now) {
    return false;
  }

  return constantTimeEquals(parsed.signature, expectedSignature);
};

export const isAdminRequest = (request: NextRequest | Request) => {
  if ('cookies' in request) {
    return isAdminSessionValid(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  }

  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) {
    return false;
  }

  const sessionCookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`));

  if (!sessionCookie) {
    return false;
  }

  return isAdminSessionValid(sessionCookie.slice(ADMIN_SESSION_COOKIE.length + 1));
};

export const setAdminSessionCookie = (response: NextResponse, now = Date.now()) => {
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: createAdminSessionToken(now),
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: Math.floor(ADMIN_SESSION_TTL_MS / 1000),
    path: '/',
  });
};

export const clearAdminSessionCookie = (response: NextResponse) => {
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(0),
    path: '/',
  });
};

export const requireAdminRequest = (request: NextRequest) => {
  if (isAdminRequest(request)) {
    return null;
  }

  // Also accept super admin sessions
  try {
    const { valid } = isSuperAdminRequest(request);
    if (valid) return null;
  } catch {
    // isSuperAdminRequest can throw if SUPABASE_SERVICE_ROLE_KEY is missing;
    // fall through to 401 since regular admin check already failed
  }

  return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
};

export const createInternalApiToken = () => {
  const secret = getInternalApiSecret();
  if (!secret) {
    throw new Error('Missing internal API secret');
  }

  return signValue('starrs-internal', secret);
};

export const getInternalApiHeaders = () => ({
  [INTERNAL_API_HEADER]: createInternalApiToken(),
});

export const isTrustedInternalRequest = (request: NextRequest | Request) => {
  const secret = getInternalApiSecret();
  if (!secret) {
    return false;
  }

  const token = request.headers.get(INTERNAL_API_HEADER);
  if (!token) {
    return false;
  }

  return constantTimeEquals(token, signValue('starrs-internal', secret));
};

export const isSameOriginRequest = (request: NextRequest) => {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  const allowedOrigins = new Set<string>();

  // Always allow requests from the same host the server is running on
  allowedOrigins.add(request.nextUrl.origin);

  const explicitOrigins = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '',
  ];

  explicitOrigins.forEach((value) => {
    if (value) {
      allowedOrigins.add(value.replace(/\/$/, ''));
    }
  });

  if (origin) {
    return allowedOrigins.has(origin.replace(/\/$/, ''));
  }

  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      return allowedOrigins.has(refererOrigin);
    } catch {
      return false;
    }
  }

  return false;
};
