type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __starrsRateLimitStore: Map<string, RateLimitEntry> | undefined;
}

const rateLimitStore =
  globalThis.__starrsRateLimitStore || (globalThis.__starrsRateLimitStore = new Map<string, RateLimitEntry>());

export const checkServerRateLimit = (
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): RateLimitResult => {
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });

    return {
      allowed: true,
      remaining: Math.max(limit - 1, 0),
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    };
  }

  if (entry.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(Math.ceil((entry.resetAt - now) / 1000), 1),
    };
  }

  entry.count += 1;
  rateLimitStore.set(key, entry);

  return {
    allowed: true,
    remaining: Math.max(limit - entry.count, 0),
    retryAfterSeconds: Math.max(Math.ceil((entry.resetAt - now) / 1000), 1),
  };
};
