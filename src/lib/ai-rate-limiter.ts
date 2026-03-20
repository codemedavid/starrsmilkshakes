import { supabaseServer } from '@/lib/supabase-server';

const MAX_REQUESTS_PER_MINUTE = 10;
const WINDOW_MS = 60_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining?: number;
}

export async function checkAiRateLimit(psid: string): Promise<RateLimitResult> {
  const now = new Date();

  const { data: existing } = await supabaseServer
    .from('ai_rate_limits')
    .select('*')
    .eq('psid', psid)
    .single();

  if (!existing) {
    await supabaseServer.from('ai_rate_limits').upsert({
      psid,
      count: 1,
      window_start: now.toISOString(),
    });
    return { allowed: true, remaining: MAX_REQUESTS_PER_MINUTE - 1 };
  }

  const windowStart = new Date(existing.window_start);
  const elapsed = now.getTime() - windowStart.getTime();

  if (elapsed > WINDOW_MS) {
    await supabaseServer
      .from('ai_rate_limits')
      .update({ count: 1, window_start: now.toISOString() })
      .eq('psid', psid);
    return { allowed: true, remaining: MAX_REQUESTS_PER_MINUTE - 1 };
  }

  if (existing.count >= MAX_REQUESTS_PER_MINUTE) {
    return { allowed: false, remaining: 0 };
  }

  await supabaseServer
    .from('ai_rate_limits')
    .update({ count: existing.count + 1 })
    .eq('psid', psid);

  return { allowed: true, remaining: MAX_REQUESTS_PER_MINUTE - existing.count - 1 };
}
