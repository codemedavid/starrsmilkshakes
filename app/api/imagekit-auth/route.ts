import { createHmac, randomUUID } from 'crypto';
import { NextResponse } from 'next/server';

export async function GET() {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!privateKey) {
    return NextResponse.json({ error: 'ImageKit not configured' }, { status: 500 });
  }

  const token = randomUUID();
  const expire = Math.floor(Date.now() / 1000) + 2400;
  const signature = createHmac('sha1', privateKey)
    .update(token + expire)
    .digest('hex');

  return NextResponse.json({ token, expire, signature });
}
