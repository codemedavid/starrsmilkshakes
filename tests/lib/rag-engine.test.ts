import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    rpc: vi.fn(),
  },
}));

vi.mock('@/lib/nvidia-client', () => ({
  generateEmbedding: vi.fn(),
}));

import { supabaseServer } from '@/lib/supabase-server';
import { generateEmbedding } from '@/lib/nvidia-client';

describe('rag-engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('searchRagContext', () => {
    it('embeds query and returns matched context', async () => {
      const mockVector = Array(1024).fill(0.1);
      (generateEmbedding as any).mockResolvedValue(mockVector);

      (supabaseServer.rpc as any).mockResolvedValue({
        data: [
          { content: 'Chocolate Shake - ₱149', metadata: { price: 149 }, similarity: 0.92 },
          { content: 'We deliver via Lalamove', metadata: {}, similarity: 0.85 },
        ],
        error: null,
      });

      const { searchRagContext } = await import('../../src/lib/rag-engine');
      const results = await searchRagContext('do you have chocolate?');

      expect(generateEmbedding).toHaveBeenCalledWith('do you have chocolate?');
      expect(results).toHaveLength(2);
      expect(results[0].content).toContain('Chocolate');
    });

    it('returns empty array on RPC error', async () => {
      (generateEmbedding as any).mockResolvedValue(Array(1024).fill(0));
      (supabaseServer.rpc as any).mockResolvedValue({
        data: null,
        error: { message: 'RPC failed' },
      });

      const { searchRagContext } = await import('../../src/lib/rag-engine');
      const results = await searchRagContext('test');
      expect(results).toEqual([]);
    });
  });

  describe('buildSystemPrompt', () => {
    it('includes RAG context and conversation history', async () => {
      const { buildSystemPrompt } = await import('../../src/lib/rag-engine');
      const context = [
        { content: 'Chocolate Shake - ₱149', metadata: {}, similarity: 0.9 },
      ];
      const history = [
        { role: 'user' as const, content: 'hi' },
        { role: 'assistant' as const, content: '{"intent":"info","data":{"message":"Hello!"}}' },
      ];

      const prompt = buildSystemPrompt(context, history);
      expect(prompt).toContain('Chocolate Shake');
      expect(prompt).toContain('CONVERSATION HISTORY');
      expect(prompt).toContain('hi');
      expect(prompt).toContain('Starr\'s Famous Shakes');
    });

    it('handles empty context and history', async () => {
      const { buildSystemPrompt } = await import('../../src/lib/rag-engine');
      const prompt = buildSystemPrompt([], []);
      expect(prompt).toContain('Starr\'s Famous Shakes');
      expect(prompt).not.toContain('CONTEXT');
      expect(prompt).not.toContain('CONVERSATION HISTORY');
    });
  });
});
