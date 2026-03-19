/**
 * Unit tests for src/lib/loyalty-hash.ts
 *
 * Requires: vitest (npm install --save-dev vitest)
 * Run:      npx vitest run src/__tests__/loyalty-hash.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateCardCode, isTokenExpired } from '@/lib/loyalty-hash';

// ---------------------------------------------------------------------------
// generateCardCode
// ---------------------------------------------------------------------------

const VALID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

describe('generateCardCode', () => {
  it('returns "STARR-XXXX" format with default length', () => {
    const code = generateCardCode();
    expect(code).toMatch(/^STARR-[A-Z2-9]{4}$/);
  });

  it('length parameter works (6 chars)', () => {
    const code = generateCardCode(6);
    expect(code).toMatch(/^STARR-[A-Z2-9]{6}$/);
  });

  it('length parameter works (1 char)', () => {
    const code = generateCardCode(1);
    expect(code).toMatch(/^STARR-[A-Z2-9]{1}$/);
  });

  it('only contains valid characters from the unambiguous set', () => {
    // Run multiple times to increase coverage of random output
    for (let i = 0; i < 50; i++) {
      const code = generateCardCode();
      const suffix = code.replace('STARR-', '');
      for (const ch of suffix) {
        expect(VALID_CHARS).toContain(ch);
      }
    }
  });

  it('does NOT contain ambiguous characters (I, O, 0, 1)', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateCardCode();
      expect(code).not.toMatch(/[IO01]/);
    }
  });

  it('always starts with "STARR-" prefix', () => {
    const code = generateCardCode(8);
    expect(code.startsWith('STARR-')).toBe(true);
  });

  it('different calls produce (likely) different codes', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      codes.add(generateCardCode());
    }
    // With 4-char codes from a 32-char set, probability of 20 collisions is negligible
    expect(codes.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// isTokenExpired
// ---------------------------------------------------------------------------

describe('isTokenExpired', () => {
  beforeEach(() => {
    // Fix Date.now to 2026-06-15T12:00:00Z for deterministic tests
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('past date → true', () => {
    expect(isTokenExpired('2026-06-15T11:00:00Z')).toBe(true);
  });

  it('far past date → true', () => {
    expect(isTokenExpired('2025-01-01T00:00:00Z')).toBe(true);
  });

  it('future date → false', () => {
    expect(isTokenExpired('2026-06-15T13:00:00Z')).toBe(false);
  });

  it('far future date → false', () => {
    expect(isTokenExpired('2027-12-31T23:59:59Z')).toBe(false);
  });

  it('exactly now (edge case) → not expired because getTime() < Date.now() is false for equal values', () => {
    // When expires_at is exactly now, getTime() < Date.now() → false → not expired
    expect(isTokenExpired('2026-06-15T12:00:00Z')).toBe(false);
  });

  it('one millisecond in the past → expired', () => {
    expect(isTokenExpired('2026-06-15T11:59:59.999Z')).toBe(true);
  });
});
