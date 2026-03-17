// tests/lib/customer-stats.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeAutoTags } from '@/lib/customer-utils';

describe('auto-tag thresholds derived from cached stats', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  it('VIP threshold: exactly 5000 qualifies, 4999 does not', () => {
    expect(computeAutoTags({ total_spent: 5000, order_count: 5, last_order_at: null, avg_order_interval_days: null }))
      .toContain('VIP');
    expect(computeAutoTags({ total_spent: 4999.99, order_count: 5, last_order_at: null, avg_order_interval_days: null }))
      .not.toContain('VIP');
  });
  it('Loyal threshold: exactly 10 orders qualifies, 9 does not', () => {
    expect(computeAutoTags({ total_spent: 0, order_count: 10, last_order_at: null, avg_order_interval_days: null }))
      .toContain('Loyal');
    expect(computeAutoTags({ total_spent: 0, order_count: 9, last_order_at: null, avg_order_interval_days: null }))
      .not.toContain('Loyal');
  });
  it('New threshold: exactly 0, 1, 2 orders -> New; 3 orders -> not New', () => {
    for (const count of [0, 1, 2]) {
      expect(computeAutoTags({ total_spent: 0, order_count: count, last_order_at: null, avg_order_interval_days: null }))
        .toContain('New');
    }
    expect(computeAutoTags({ total_spent: 0, order_count: 3, last_order_at: null, avg_order_interval_days: null }))
      .not.toContain('New');
  });
  it('At Risk: exactly 30 days does NOT qualify; 31 days does', () => {
    const now = new Date('2025-06-15T12:00:00Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const exactly30 = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    const over30 = new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString();
    expect(computeAutoTags({ total_spent: 0, order_count: 3, last_order_at: exactly30, avg_order_interval_days: null }))
      .not.toContain('At Risk');
    expect(computeAutoTags({ total_spent: 0, order_count: 3, last_order_at: over30, avg_order_interval_days: null }))
      .toContain('At Risk');
  });
});
