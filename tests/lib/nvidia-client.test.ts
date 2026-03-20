import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('nvidia-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv('NVIDIA_API_KEY', 'test-key');
  });

  describe('generateEmbedding', () => {
    it('calls NVIDIA embedding API and returns vector', async () => {
      const mockVector = Array(1024).fill(0.1);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ embedding: mockVector }] }),
      });

      const { generateEmbedding } = await import('../../src/lib/nvidia-client');
      const result = await generateEmbedding('test text');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://integrate.api.nvidia.com/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
        })
      );
      expect(result).toEqual(mockVector);
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });
      const { generateEmbedding } = await import('../../src/lib/nvidia-client');
      await expect(generateEmbedding('test')).rejects.toThrow();
    });
  });

  describe('chatCompletion', () => {
    it('calls NVIDIA chat API and returns parsed content', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"intent":"info","data":{"message":"Hello"}}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      });

      const { chatCompletion } = await import('../../src/lib/nvidia-client');
      const result = await chatCompletion([
        { role: 'system', content: 'You are a helper' },
        { role: 'user', content: 'Hi' },
      ]);

      expect(result.content).toBe('{"intent":"info","data":{"message":"Hello"}}');
      expect(result.usage).toEqual({ prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 });
    });
  });

  describe('sanitizeInput', () => {
    it('truncates input longer than 500 chars', async () => {
      const { sanitizeInput } = await import('../../src/lib/nvidia-client');
      const long = 'a'.repeat(600);
      expect(sanitizeInput(long).length).toBe(500);
    });

    it('strips control characters', async () => {
      const { sanitizeInput } = await import('../../src/lib/nvidia-client');
      expect(sanitizeInput('hello\x00world')).toBe('helloworld');
    });

    it('leaves short clean input unchanged', async () => {
      const { sanitizeInput } = await import('../../src/lib/nvidia-client');
      expect(sanitizeInput('hello')).toBe('hello');
    });
  });
});
