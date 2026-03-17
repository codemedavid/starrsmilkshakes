import { describe, it, expect, vi, beforeEach } from 'vitest';

global.fetch = vi.fn();

describe('messenger send helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sendTextMessage sends correct payload', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: () => ({ message_id: '123' }) });
    const { sendTextMessage } = await import('../../src/lib/messenger');
    await sendTextMessage('PSID_123', 'Hello!', 'PAGE_TOKEN');
    expect(fetch).toHaveBeenCalledWith(
      'https://graph.facebook.com/v21.0/me/messages',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"text":"Hello!"'),
      })
    );
  });

  it('buildCategoryQuickReplies builds correct format', async () => {
    const { buildCategoryQuickReplies } = await import('../../src/lib/messenger');
    const categories = [
      { id: 'coffee', name: 'Coffee', icon: '☕' },
      { id: 'desserts', name: 'Desserts', icon: '🍰' },
    ];
    const result = buildCategoryQuickReplies(categories);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      content_type: 'text',
      title: '☕ Coffee',
      payload: 'CATEGORY_coffee',
    });
  });

  it('buildProductCards builds generic template elements', async () => {
    const { buildProductCards } = await import('../../src/lib/messenger');
    const items = [{
      id: 'item-1',
      name: 'Iced Latte',
      description: 'Cold coffee',
      basePrice: 120,
      category: 'coffee',
      image: 'https://example.com/latte.jpg',
    }];
    const result = buildProductCards(items as any, 'https://mysite.com');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Iced Latte');
    expect(result[0].subtitle).toContain('120');
    expect(result[0].buttons).toHaveLength(2);
  });

  it('buildCartSummary formats cart correctly', async () => {
    const { buildCartSummary } = await import('../../src/lib/messenger');
    const cart = [
      { name: 'Iced Latte', variation: 'Large', quantity: 2, unitPrice: 150 },
      { name: 'Croissant', variation: null, quantity: 1, unitPrice: 85 },
    ];
    const result = buildCartSummary(cart);
    expect(result).toContain('Iced Latte');
    expect(result).toContain('385');
  });

  it('buildCartSummary handles empty cart', async () => {
    const { buildCartSummary } = await import('../../src/lib/messenger');
    expect(buildCartSummary([])).toBe('Your cart is empty.');
  });

  it('buildStatusMessage returns correct messages for each status', async () => {
    const { buildStatusMessage } = await import('../../src/lib/messenger');
    expect(buildStatusMessage('1001', 'confirmed')).toContain('#1001');
    expect(buildStatusMessage('1001', 'confirmed')).toContain('confirmed');
    expect(buildStatusMessage('1001', 'out_for_delivery', 'delivery', 'https://track.me/123')).toContain('https://track.me/123');
    expect(buildStatusMessage('1001', 'unknown_status')).toContain('unknown_status');
  });
});
