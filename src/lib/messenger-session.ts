import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

function getSessionSecret(): string {
  const secret = process.env.MESSENGER_SESSION_SECRET;
  if (!secret) throw new Error('MESSENGER_SESSION_SECRET not set');
  return secret;
}

export function generateCheckoutHash(): string {
  const uuid = randomUUID();
  const timestamp = Date.now().toString();
  const data = `${uuid}.${timestamp}`;
  const signature = createHmac('sha256', getSessionSecret()).update(data).digest('hex');
  return `${uuid}-${signature}`;
}

export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  appSecret: string
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const received = signatureHeader.replace('sha256=', '');
  try {
    const expBuf = Buffer.from(expected, 'hex');
    const recBuf = Buffer.from(received, 'hex');
    if (expBuf.length !== recBuf.length) return false;
    return timingSafeEqual(expBuf, recBuf);
  } catch {
    return false;
  }
}

export function isCheckoutSessionExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() < Date.now();
}

export function getCheckoutExpiresAt(): string {
  return new Date(Date.now() + 30 * 60 * 1000).toISOString();
}
