import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('messenger-session', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.MESSENGER_SESSION_SECRET = 'test-secret-key';
  });

  it('generateCheckoutHash creates a non-empty hash', async () => {
    const { generateCheckoutHash } = await import('../../src/lib/messenger-session');
    const hash = generateCheckoutHash();
    expect(hash).toBeTruthy();
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(20);
  });

  it('generateCheckoutHash creates unique hashes', async () => {
    const { generateCheckoutHash } = await import('../../src/lib/messenger-session');
    const hash1 = generateCheckoutHash();
    const hash2 = generateCheckoutHash();
    expect(hash1).not.toBe(hash2);
  });

  it('verifyWebhookSignature validates correct signature', async () => {
    const { verifyWebhookSignature } = await import('../../src/lib/messenger-session');
    const { createHmac } = await import('crypto');
    const body = '{"test":"data"}';
    const appSecret = 'test-app-secret';
    const sig = 'sha256=' + createHmac('sha256', appSecret).update(body).digest('hex');
    expect(verifyWebhookSignature(body, sig, appSecret)).toBe(true);
  });

  it('verifyWebhookSignature rejects bad signature', async () => {
    const { verifyWebhookSignature } = await import('../../src/lib/messenger-session');
    expect(verifyWebhookSignature('body', 'sha256=bad', 'secret')).toBe(false);
  });

  it('isCheckoutSessionExpired returns true for expired session', async () => {
    const { isCheckoutSessionExpired } = await import('../../src/lib/messenger-session');
    const past = new Date(Date.now() - 60000).toISOString();
    expect(isCheckoutSessionExpired(past)).toBe(true);
  });

  it('isCheckoutSessionExpired returns false for valid session', async () => {
    const { isCheckoutSessionExpired } = await import('../../src/lib/messenger-session');
    const future = new Date(Date.now() + 60000).toISOString();
    expect(isCheckoutSessionExpired(future)).toBe(false);
  });

  it('getCheckoutExpiresAt returns a future timestamp', async () => {
    const { getCheckoutExpiresAt } = await import('../../src/lib/messenger-session');
    const expiresAt = getCheckoutExpiresAt();
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});
