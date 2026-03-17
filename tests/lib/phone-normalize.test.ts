// tests/lib/phone-normalize.test.ts
import { describe, it, expect } from 'vitest';
import { normalizePhone, normalizeEmail } from '@/lib/customer-utils';

describe('normalizePhone', () => {
  it('strips spaces and dashes', () => {
    expect(normalizePhone('0917-123-4567')).toBe('09171234567');
    expect(normalizePhone('0917 123 4567')).toBe('09171234567');
  });
  it('strips +63 country code prefix', () => {
    expect(normalizePhone('+639171234567')).toBe('09171234567');
    expect(normalizePhone('+63 917 123 4567')).toBe('09171234567');
  });
  it('strips parentheses', () => {
    expect(normalizePhone('(0917) 123-4567')).toBe('09171234567');
  });
  it('returns already-normalized phone unchanged', () => {
    expect(normalizePhone('09171234567')).toBe('09171234567');
  });
  it('returns empty string for null/undefined/empty', () => {
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone(null)).toBe('');
    expect(normalizePhone(undefined)).toBe('');
  });
});

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Maria@Gmail.COM  ')).toBe('maria@gmail.com');
  });
  it('returns empty string for null/undefined', () => {
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(undefined)).toBe('');
  });
});
