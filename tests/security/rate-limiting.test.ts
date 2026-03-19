import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkServerRateLimit } from '@/lib/server-rate-limit';

// ─── Unit tests for checkServerRateLimit ─────────────────────────────────────

describe('Rate limiting — checkServerRateLimit', () => {
  /**
   * We use a deterministic `now` value so tests are not affected by wall-clock
   * timing and the global in-memory store is isolated per test by using a unique
   * key prefix.
   */
  const BASE_NOW = 1_700_000_000_000; // Fixed point in time (ms)
  const WINDOW = 60_000; // 1 minute

  it('allows the first call', () => {
    const result = checkServerRateLimit('test:allow-first', 30, WINDOW, BASE_NOW);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(29);
  });

  it('allows up to the limit (30 calls)', () => {
    const key = 'test:up-to-limit';
    for (let i = 1; i <= 30; i++) {
      const result = checkServerRateLimit(key, 30, WINDOW, BASE_NOW);
      expect(result.allowed).toBe(true);
    }
  });

  it('blocks the 31st call', () => {
    const key = 'test:31st-blocked';
    for (let i = 1; i <= 30; i++) {
      checkServerRateLimit(key, 30, WINDOW, BASE_NOW);
    }
    const result = checkServerRateLimit(key, 30, WINDOW, BASE_NOW);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('resets after the window expires', () => {
    const key = 'test:window-reset';
    for (let i = 1; i <= 30; i++) {
      checkServerRateLimit(key, 30, WINDOW, BASE_NOW);
    }
    // 31st call is blocked
    expect(checkServerRateLimit(key, 30, WINDOW, BASE_NOW).allowed).toBe(false);

    // After window expires, first call of new window is allowed
    const afterWindow = BASE_NOW + WINDOW + 1;
    const result = checkServerRateLimit(key, 30, WINDOW, afterWindow);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(29);
  });

  it('returns a positive retryAfterSeconds when blocked', () => {
    const key = 'test:retry-after';
    for (let i = 1; i <= 30; i++) {
      checkServerRateLimit(key, 30, WINDOW, BASE_NOW);
    }
    const result = checkServerRateLimit(key, 30, WINDOW, BASE_NOW);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('tracks different IPs independently', () => {
    const ip1 = 'test:ip:1.2.3.4';
    const ip2 = 'test:ip:5.6.7.8';

    // Exhaust ip1
    for (let i = 1; i <= 30; i++) {
      checkServerRateLimit(ip1, 30, WINDOW, BASE_NOW);
    }
    expect(checkServerRateLimit(ip1, 30, WINDOW, BASE_NOW).allowed).toBe(false);

    // ip2 is still under limit
    expect(checkServerRateLimit(ip2, 30, WINDOW, BASE_NOW).allowed).toBe(true);
  });
});

// ─── Integration test: checkActionRateLimit wires up correctly ────────────────

describe('Rate limiting — checkActionRateLimit integration', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns { allowed: true } when under limit', async () => {
    // Mock next/headers to supply a stable IP
    vi.doMock('next/headers', () => ({
      cookies: vi.fn(),
      headers: vi.fn().mockResolvedValue({
        get: vi.fn((name: string) => {
          if (name === 'x-forwarded-for') return '10.0.0.1';
          return null;
        }),
      }),
    }));

    // Use a fresh rate-limit store key by isolating the module after vi.resetModules()
    const { checkActionRateLimit } = await import('@/lib/admin-guard');
    const result = await checkActionRateLimit();
    expect(result.allowed).toBe(true);
  });

  it('returns { allowed: false } when limit is exceeded (mocked rate limiter)', async () => {
    vi.doMock('next/headers', () => ({
      cookies: vi.fn(),
      headers: vi.fn().mockResolvedValue({
        get: vi.fn().mockReturnValue('10.0.0.99'),
      }),
    }));

    vi.doMock('@/lib/server-rate-limit', () => ({
      checkServerRateLimit: vi.fn().mockReturnValue({
        allowed: false,
        remaining: 0,
        retryAfterSeconds: 45,
      }),
    }));

    const { checkActionRateLimit } = await import('@/lib/admin-guard');
    const result = await checkActionRateLimit();
    expect(result.allowed).toBe(false);
  });
});
