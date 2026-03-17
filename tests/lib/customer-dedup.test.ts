// tests/lib/customer-dedup.test.ts
import { describe, it, expect } from 'vitest';
import { normalizePhone, normalizeEmail } from '@/lib/customer-utils';

describe('phone normalization for dedup', () => {
  it('different formats of the same number normalize to the same key', () => {
    const formats = [
      '09171234567',
      '0917-123-4567',
      '0917 123 4567',
      '(0917) 123-4567',
      '+639171234567',
      '+63 917 123 4567',
    ];
    const normalized = formats.map(normalizePhone);
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe('09171234567');
  });

  it('two different phone numbers do NOT collide after normalization', () => {
    expect(normalizePhone('09171234567')).not.toBe(normalizePhone('09271234567'));
  });
});

describe('email normalization for dedup', () => {
  it('different case/whitespace variants normalize to the same key', () => {
    expect(normalizeEmail('Maria@Gmail.com')).toBe(normalizeEmail('maria@gmail.com'));
    expect(normalizeEmail('  MARIA@GMAIL.COM  ')).toBe(normalizeEmail('maria@gmail.com'));
  });

  it('two different emails do NOT collide after normalization', () => {
    expect(normalizeEmail('maria@gmail.com')).not.toBe(normalizeEmail('jose@gmail.com'));
  });
});
