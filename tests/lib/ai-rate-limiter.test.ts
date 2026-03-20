import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    from: vi.fn(),
  },
}));

import { supabaseServer } from '@/lib/supabase-server';

describe('ai-rate-limiter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('allows request when no existing rate limit record', async () => {
    const mockFrom = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    };
    (supabaseServer.from as any).mockReturnValue(mockFrom);

    const { checkAiRateLimit } = await import('../../src/lib/ai-rate-limiter');
    const result = await checkAiRateLimit('psid-123');
    expect(result.allowed).toBe(true);
  });

  it('blocks request when count exceeds limit', async () => {
    const now = new Date();
    const mockFrom = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { psid: 'psid-123', count: 10, window_start: now.toISOString() },
            error: null,
          }),
        }),
      }),
    };
    (supabaseServer.from as any).mockReturnValue(mockFrom);

    const { checkAiRateLimit } = await import('../../src/lib/ai-rate-limiter');
    const result = await checkAiRateLimit('psid-123');
    expect(result.allowed).toBe(false);
  });

  it('resets window when expired', async () => {
    const oldTime = new Date(Date.now() - 120_000).toISOString(); // 2 min ago
    const mockFrom = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { psid: 'psid-123', count: 10, window_start: oldTime },
            error: null,
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    };
    (supabaseServer.from as any).mockReturnValue(mockFrom);

    const { checkAiRateLimit } = await import('../../src/lib/ai-rate-limiter');
    const result = await checkAiRateLimit('psid-123');
    expect(result.allowed).toBe(true);
  });
});
