import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    from: vi.fn(),
  },
}));

import { supabaseServer } from '@/lib/supabase-server';

const mockRandomUUID = vi.fn(() => 'test-uuid-1234');

describe('ai-conversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockRandomUUID.mockReturnValue('test-uuid-1234');
    vi.stubGlobal('crypto', { randomUUID: mockRandomUUID });
  });

  describe('getOrCreateSessionId', () => {
    it('creates new session when no previous messages', async () => {
      const mockFrom = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      };
      (supabaseServer.from as any).mockReturnValue(mockFrom);

      const { getOrCreateSessionId } = await import('../../src/lib/ai-conversation');
      const sessionId = await getOrCreateSessionId('psid-123');
      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(0);
    });

    it('reuses session when last message is recent', async () => {
      const recentDate = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const mockFrom = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [{ session_id: 'existing-session', created_at: recentDate }],
                error: null,
              }),
            }),
          }),
        }),
      };
      (supabaseServer.from as any).mockReturnValue(mockFrom);

      const { getOrCreateSessionId } = await import('../../src/lib/ai-conversation');
      const sessionId = await getOrCreateSessionId('psid-123');
      expect(sessionId).toBe('existing-session');
    });

    it('creates new session when last message is older than 30 min', async () => {
      const oldDate = new Date(Date.now() - 35 * 60 * 1000).toISOString();
      const mockFrom = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [{ session_id: 'old-session', created_at: oldDate }],
                error: null,
              }),
            }),
          }),
        }),
      };
      (supabaseServer.from as any).mockReturnValue(mockFrom);

      const { getOrCreateSessionId } = await import('../../src/lib/ai-conversation');
      const sessionId = await getOrCreateSessionId('psid-123');
      expect(sessionId).not.toBe('old-session');
      expect(sessionId).toBe('test-uuid-1234');
    });
  });

  describe('logConversation', () => {
    it('inserts a conversation record', async () => {
      const insertMock = vi.fn().mockResolvedValue({ error: null });
      (supabaseServer.from as any).mockReturnValue({ insert: insertMock });

      const { logConversation } = await import('../../src/lib/ai-conversation');
      await logConversation('session-1', 'psid-123', 'user', 'hello', undefined, {});

      expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
        session_id: 'session-1',
        psid: 'psid-123',
        role: 'user',
        content: 'hello',
      }));
    });
  });
});
