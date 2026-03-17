// src/lib/customer-utils.ts
import type { AutoTagLabel } from '@/types/customer';

/** Strip all non-digit chars; handle +63 prefix -> 09XX format */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  let digits = phone.replace(/\D/g, '');
  // +63 country code -> prepend 0
  if (digits.startsWith('63') && digits.length === 12) {
    digits = '0' + digits.slice(2);
  }
  return digits;
}

/** Lowercase + trim email */
export function normalizeEmail(email: string | null | undefined): string {
  if (!email) return '';
  return email.trim().toLowerCase();
}

interface StatsForAutoTags {
  total_spent: number;
  order_count: number;
  last_order_at: string | null;
  avg_order_interval_days: number | null;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Derive auto-tags from cached stat columns — runs in application code, not stored in DB */
export function computeAutoTags(stats: StatsForAutoTags): AutoTagLabel[] {
  const tags: AutoTagLabel[] = [];

  if (stats.total_spent >= 5000) tags.push('VIP');
  if (stats.order_count >= 10) tags.push('Loyal');
  if (stats.order_count <= 2) tags.push('New');

  if (
    stats.order_count > 1 &&
    stats.last_order_at &&
    Date.now() - new Date(stats.last_order_at).getTime() > THIRTY_DAYS_MS
  ) {
    tags.push('At Risk');
  }

  return tags;
}
