import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './supabase';

// Lazy initialization to avoid build-time errors when env vars aren't available
let _supabaseServer: SupabaseClient<Database> | null = null;

/**
 * Get the server-side Supabase client with service role key
 * This bypasses RLS and should only be used in API routes
 * Uses lazy initialization to prevent build failures
 */
function getSupabaseServer(): SupabaseClient<Database> {
  if (_supabaseServer) {
    return _supabaseServer;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  }

  if (!supabaseServiceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  }

  _supabaseServer = createClient<Database>(
    supabaseUrl,
    supabaseServiceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );

  return _supabaseServer;
}

/**
 * Server-side Supabase client with service role key
 * This is a proxy that lazily initializes the client on first access
 */
export const supabaseServer = new Proxy({} as SupabaseClient<Database>, {
  get(_, prop) {
    const client = getSupabaseServer();
    const value = (client as any)[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  }
});

/**
 * Get client IP from request headers
 */
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');

  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  if (realIP) {
    return realIP;
  }

  // Fallback for development
  return '127.0.0.1';
}

/**
 * Admin password (should match client-side)
 */
const ADMIN_PASSWORD = 'Starrs@Admin!2025';

/**
 * Generate admin auth token from password
 * Simple hash for verification
 */
function generateAdminToken(): string {
  // Simple token generation - in production, use a more secure method
  // For now, using a base64-like encoding of the password
  return Buffer.from(ADMIN_PASSWORD).toString('base64');
}

/**
 * Check if a request is from an authenticated admin
 * Verifies the X-Admin-Auth header matches the admin token
 */
export function isAdminRequest(request: Request): boolean {
  const adminAuthHeader = request.headers.get('x-admin-auth');

  if (!adminAuthHeader) {
    return false;
  }

  // Verify the token matches
  const expectedToken = generateAdminToken();
  return adminAuthHeader === expectedToken;
}



