import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase
vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    from: vi.fn(),
  },
}));

// Mock messenger functions (for buildFaqResponse)
vi.mock('@/lib/messenger', () => ({
  sendButtonTemplate: vi.fn(),
  sendTextMessage: vi.fn(),
}));

import { supabaseServer } from '@/lib/supabase-server';
import { sendButtonTemplate } from '@/lib/messenger';

describe('faq-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('matchFaq', () => {
    const mockFaqs = [
      { id: '1', question: 'Do you deliver?', answer: 'Yes we deliver!', keywords: ['deliver', 'delivery', 'ship'], category: 'delivery', action_type: 'text', sort_order: 40, is_active: true, created_at: '', updated_at: '' },
      { id: '2', question: 'Are you open?', answer: 'Yes we are open!', keywords: ['open', 'closed'], category: 'hours', action_type: 'text', sort_order: 30, is_active: true, created_at: '', updated_at: '' },
      { id: '3', question: 'Where are your branches?', answer: 'Branch info...', keywords: ['branch', 'location', 'where', 'address'], category: 'branches', action_type: 'send_branches', sort_order: 50, is_active: true, created_at: '', updated_at: '' },
      { id: '4', question: 'Show menu', answer: 'Here is our menu', keywords: ['menu', 'see menu', 'show menu'], category: 'ordering', action_type: 'send_menu', sort_order: 22, is_active: true, created_at: '', updated_at: '' },
    ];

    function setupMockFaqs(faqs = mockFaqs) {
      (supabaseServer.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: faqs, error: null }),
          }),
        }),
      });
    }

    it('returns matching FAQ entry for exact keyword', async () => {
      setupMockFaqs();
      const { matchFaq } = await import('../../src/lib/faq-service');
      const result = await matchFaq('do you deliver?');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('1');
    });

    it('returns matching FAQ entry for partial keyword match', async () => {
      setupMockFaqs();
      const { matchFaq } = await import('../../src/lib/faq-service');
      const result = await matchFaq('is the delivery free?');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('1');
    });

    it('returns null for no keyword match', async () => {
      setupMockFaqs();
      const { matchFaq } = await import('../../src/lib/faq-service');
      const result = await matchFaq('hello there');
      expect(result).toBeNull();
    });

    it('returns highest scoring match when multiple entries match', async () => {
      setupMockFaqs();
      const { matchFaq } = await import('../../src/lib/faq-service');
      const result = await matchFaq('where is your branch location');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('3');
    });

    it('breaks ties by lower sort_order', async () => {
      const tieFaqs = [
        { id: 'a', question: 'Q1', answer: 'A1', keywords: ['test'], category: null, action_type: 'text', sort_order: 20, is_active: true, created_at: '', updated_at: '' },
        { id: 'b', question: 'Q2', answer: 'A2', keywords: ['test'], category: null, action_type: 'text', sort_order: 10, is_active: true, created_at: '', updated_at: '' },
      ];
      setupMockFaqs(tieFaqs);
      const { matchFaq } = await import('../../src/lib/faq-service');
      const result = await matchFaq('test');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('b');
    });

    it('handles case-insensitive matching', async () => {
      setupMockFaqs();
      const { matchFaq } = await import('../../src/lib/faq-service');
      const result = await matchFaq('DO YOU DELIVER?');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('1');
    });

    it('matches multi-word keywords', async () => {
      setupMockFaqs();
      const { matchFaq } = await import('../../src/lib/faq-service');
      const result = await matchFaq('can I see menu please');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('4');
    });
  });

  describe('buildFaqResponse', () => {
    it('sends button template for text action_type', async () => {
      const { buildFaqResponse } = await import('../../src/lib/faq-service');
      const entry = {
        id: '1', question: 'Q', answer: 'Test answer', keywords: [],
        category: null, action_type: 'text' as const, sort_order: 0,
        is_active: true, created_at: '', updated_at: '',
      };
      await buildFaqResponse(entry, 'PSID_123', 'TOKEN', 'https://starrsmilkshake.com');
      expect(sendButtonTemplate).toHaveBeenCalledWith(
        'PSID_123',
        'Test answer',
        expect.arrayContaining([
          expect.objectContaining({ type: 'postback', title: 'Browse Menu', payload: 'MAIN_MENU' }),
          expect.objectContaining({ type: 'web_url', title: 'Order Online', url: 'https://starrsmilkshake.com' }),
        ]),
        'TOKEN'
      );
    });

    it('logs warning for send_menu action_type', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { buildFaqResponse } = await import('../../src/lib/faq-service');
      const entry = {
        id: '2', question: 'Q', answer: 'Menu', keywords: [],
        category: null, action_type: 'send_menu' as const, sort_order: 0,
        is_active: true, created_at: '', updated_at: '',
      };
      await buildFaqResponse(entry, 'PSID_123', 'TOKEN', 'https://starrsmilkshake.com');
      expect(warnSpy).toHaveBeenCalled();
      expect(sendButtonTemplate).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('sends branch info for send_branches action_type', async () => {
      (supabaseServer.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ name: 'Katipunan', address: '123 St', phone: '09123456789' }],
            error: null,
          }),
        }),
      });
      const { buildFaqResponse } = await import('../../src/lib/faq-service');
      const entry = {
        id: '3', question: 'Q', answer: 'Branch info', keywords: [],
        category: null, action_type: 'send_branches' as const, sort_order: 0,
        is_active: true, created_at: '', updated_at: '',
      };
      await buildFaqResponse(entry, 'PSID_123', 'TOKEN', 'https://starrsmilkshake.com');
      expect(sendButtonTemplate).toHaveBeenCalledWith(
        'PSID_123',
        expect.stringContaining('Katipunan'),
        expect.any(Array),
        'TOKEN'
      );
    });

    it('sends contact info for connect_human action_type', async () => {
      (supabaseServer.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ name: 'Katipunan', phone: '09123456789' }],
            error: null,
          }),
        }),
      });
      const { buildFaqResponse } = await import('../../src/lib/faq-service');
      const entry = {
        id: '4', question: 'Q', answer: 'Contact us', keywords: [],
        category: null, action_type: 'connect_human' as const, sort_order: 0,
        is_active: true, created_at: '', updated_at: '',
      };
      await buildFaqResponse(entry, 'PSID_123', 'TOKEN', 'https://starrsmilkshake.com');
      expect(sendButtonTemplate).toHaveBeenCalledWith(
        'PSID_123',
        expect.stringContaining('Contact us'),
        expect.any(Array),
        'TOKEN'
      );
    });
  });
});
