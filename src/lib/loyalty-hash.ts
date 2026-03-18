import { createHmac, randomUUID } from 'crypto';

// Unambiguous character set: excludes I, O, 0, 1 to avoid visual confusion
const CARD_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function getLoyaltySecret(): string {
  const secret = process.env.MESSENGER_SESSION_SECRET;
  if (!secret) throw new Error('MESSENGER_SESSION_SECRET not set');
  return secret;
}

/**
 * Generates a loyalty card code in the format "STARR-XXXX".
 * Uses an unambiguous character set (no I, O, 0, 1).
 * Default length 4 yields ~800K unique combinations.
 */
export function generateCardCode(length = 4): string {
  const chars = Array.from({ length }, () => {
    const index = Math.floor(Math.random() * CARD_CHARSET.length);
    return CARD_CHARSET[index];
  });
  return `STARR-${chars.join('')}`;
}

/**
 * Generates a secure loyalty session token.
 * Format: `{uuid}-{16-char HMAC-SHA256 prefix}`
 * Uses MESSENGER_SESSION_SECRET for HMAC signing.
 */
export function generateLoyaltyToken(): string {
  const uuid = randomUUID();
  const timestamp = Date.now().toString();
  const data = `loyalty.${uuid}.${timestamp}`;
  const signature = createHmac('sha256', getLoyaltySecret()).update(data).digest('hex');
  return `${uuid}-${signature.slice(0, 16)}`;
}

/**
 * Returns an ISO timestamp 30 minutes from now.
 */
export function getLoyaltySessionExpiry(): string {
  return new Date(Date.now() + 30 * 60 * 1000).toISOString();
}

/**
 * Returns true if the provided ISO expiry timestamp is in the past.
 */
export function isTokenExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() < Date.now();
}
