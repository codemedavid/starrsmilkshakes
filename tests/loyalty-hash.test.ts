// tests/loyalty-hash.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('loyalty-hash', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // ─── generateCardCode ────────────────────────────────────────────────────────

  describe('generateCardCode', () => {
    it('matches the pattern /^STARR-[A-HJ-NP-Z2-9]{4}$/ by default', async () => {
      const { generateCardCode } = await import('../src/lib/loyalty-hash');
      const code = generateCardCode();
      expect(code).toMatch(/^STARR-[A-HJ-NP-Z2-9]{4}$/);
    });

    it('matches pattern with custom length', async () => {
      const { generateCardCode } = await import('../src/lib/loyalty-hash');
      const code = generateCardCode(8);
      expect(code).toMatch(/^STARR-[A-HJ-NP-Z2-9]{8}$/);
    });

    it('generates unique codes on repeated calls', async () => {
      const { generateCardCode } = await import('../src/lib/loyalty-hash');
      const codes = new Set(Array.from({ length: 50 }, () => generateCardCode()));
      // With ~800K combinations, 50 calls should be unique
      expect(codes.size).toBe(50);
    });

    it('never contains ambiguous characters I, O, 0, or 1', async () => {
      const { generateCardCode } = await import('../src/lib/loyalty-hash');
      for (let i = 0; i < 200; i++) {
        const suffix = generateCardCode().replace('STARR-', '');
        expect(suffix).not.toMatch(/[IO01]/);
      }
    });

    it('always starts with "STARR-"', async () => {
      const { generateCardCode } = await import('../src/lib/loyalty-hash');
      const code = generateCardCode();
      expect(code.startsWith('STARR-')).toBe(true);
    });

    it('suffix is exactly 4 uppercase alphanumeric chars from the allowed set (length=4)', async () => {
      const { generateCardCode } = await import('../src/lib/loyalty-hash');
      const code = generateCardCode(4);
      const suffix = code.replace('STARR-', '');
      expect(suffix).toHaveLength(4);
      expect(suffix).toMatch(/^[A-HJ-NP-Z2-9]+$/);
    });
  });

  // ─── generateLoyaltyToken ────────────────────────────────────────────────────

  describe('generateLoyaltyToken', () => {
    it('returns a non-empty string', async () => {
      vi.stubEnv('MESSENGER_SESSION_SECRET', 'test-secret-key');
      const { generateLoyaltyToken } = await import('../src/lib/loyalty-hash');
      const token = generateLoyaltyToken();
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
    });

    it('has format {uuid}-{16-char-hex}', async () => {
      vi.stubEnv('MESSENGER_SESSION_SECRET', 'test-secret-key');
      const { generateLoyaltyToken } = await import('../src/lib/loyalty-hash');
      const token = generateLoyaltyToken();
      // UUID v4 is 36 chars, then '-', then 16 hex chars
      expect(token).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[0-9a-f]{16}$/
      );
    });

    it('generates unique tokens on repeated calls', async () => {
      vi.stubEnv('MESSENGER_SESSION_SECRET', 'test-secret-key');
      const { generateLoyaltyToken } = await import('../src/lib/loyalty-hash');
      const t1 = generateLoyaltyToken();
      const t2 = generateLoyaltyToken();
      expect(t1).not.toBe(t2);
    });

    it('throws when MESSENGER_SESSION_SECRET is not set', async () => {
      vi.stubEnv('MESSENGER_SESSION_SECRET', '');
      const { generateLoyaltyToken } = await import('../src/lib/loyalty-hash');
      expect(() => generateLoyaltyToken()).toThrow('MESSENGER_SESSION_SECRET not set');
    });
  });

  // ─── getLoyaltySessionExpiry ─────────────────────────────────────────────────

  describe('getLoyaltySessionExpiry', () => {
    it('returns a valid ISO date string', async () => {
      const { getLoyaltySessionExpiry } = await import('../src/lib/loyalty-hash');
      const expiry = getLoyaltySessionExpiry();
      expect(() => new Date(expiry)).not.toThrow();
      expect(new Date(expiry).toISOString()).toBe(expiry);
    });

    it('returns a timestamp approximately 30 minutes in the future', async () => {
      const { getLoyaltySessionExpiry } = await import('../src/lib/loyalty-hash');
      const before = Date.now();
      const expiry = getLoyaltySessionExpiry();
      const after = Date.now();
      const expiryMs = new Date(expiry).getTime();
      const thirtyMin = 30 * 60 * 1000;
      expect(expiryMs).toBeGreaterThanOrEqual(before + thirtyMin);
      expect(expiryMs).toBeLessThanOrEqual(after + thirtyMin);
    });
  });

  // ─── isTokenExpired ───────────────────────────────────────────────────────────

  describe('isTokenExpired', () => {
    it('returns false for a future expiry', async () => {
      const { isTokenExpired } = await import('../src/lib/loyalty-hash');
      const future = new Date(Date.now() + 60_000).toISOString();
      expect(isTokenExpired(future)).toBe(false);
    });

    it('returns true for a past expiry', async () => {
      const { isTokenExpired } = await import('../src/lib/loyalty-hash');
      const past = new Date(Date.now() - 60_000).toISOString();
      expect(isTokenExpired(past)).toBe(true);
    });

    it('returns true for a timestamp exactly at the epoch (far past)', async () => {
      const { isTokenExpired } = await import('../src/lib/loyalty-hash');
      expect(isTokenExpired('1970-01-01T00:00:00.000Z')).toBe(true);
    });

    it('returns false for a timestamp one hour from now', async () => {
      const { isTokenExpired } = await import('../src/lib/loyalty-hash');
      const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      expect(isTokenExpired(oneHourFromNow)).toBe(false);
    });
  });
});
