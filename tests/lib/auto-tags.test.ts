// tests/lib/auto-tags.test.ts
import { describe, it, expect } from 'vitest';
import { computeAutoTags } from '@/lib/customer-utils';

const base = {
  total_spent: 0,
  order_count: 0,
  last_order_at: null,
  avg_order_interval_days: null,
};

describe('computeAutoTags', () => {
  it('returns VIP when total_spent >= 5000 (exact threshold)', () => {
    expect(computeAutoTags({ ...base, total_spent: 5000, order_count: 5 })).toContain('VIP');
    expect(computeAutoTags({ ...base, total_spent: 4999, order_count: 5 })).not.toContain('VIP');
  });
  it('returns Loyal when order_count >= 10 (exact threshold)', () => {
    expect(computeAutoTags({ ...base, order_count: 10 })).toContain('Loyal');
    expect(computeAutoTags({ ...base, order_count: 9 })).not.toContain('Loyal');
  });
  it('returns New when order_count <= 2 (exact threshold)', () => {
    expect(computeAutoTags({ ...base, order_count: 2 })).toContain('New');
    expect(computeAutoTags({ ...base, order_count: 3 })).not.toContain('New');
  });
  it('returns At Risk when last_order_at > 30 days ago and order_count > 1', () => {
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    expect(computeAutoTags({ ...base, order_count: 3, last_order_at: oldDate })).toContain('At Risk');
  });
  it('does NOT return At Risk when order_count <= 1 (null last_order_at)', () => {
    expect(computeAutoTags({ ...base, order_count: 1, last_order_at: null })).not.toContain('At Risk');
  });
  it('does NOT return At Risk for new customers (order_count = 1) even with old date', () => {
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    expect(computeAutoTags({ ...base, order_count: 1, last_order_at: oldDate })).not.toContain('At Risk');
  });
  it('does NOT return At Risk when last_order_at is recent', () => {
    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(computeAutoTags({ ...base, order_count: 5, last_order_at: recentDate })).not.toContain('At Risk');
  });
  it('returns New for fresh customer with no orders', () => {
    expect(computeAutoTags(base)).toEqual(['New']);
  });
  it('can return multiple tags (VIP + Loyal)', () => {
    const tags = computeAutoTags({ ...base, total_spent: 6000, order_count: 15 });
    expect(tags).toContain('VIP');
    expect(tags).toContain('Loyal');
  });
});
