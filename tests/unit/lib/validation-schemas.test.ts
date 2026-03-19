import { describe, it, expect } from 'vitest';
import {
  uuidSchema,
  branchSchema,
  categorySchema,
  menuItemSchema,
  paymentMethodSchema,
  siteSettingsSchema,
  customerLinkSchema,
  customerUnlinkSchema,
  reorderSchema,
} from '../../../src/lib/validation';

// ─── uuidSchema ───────────────────────────────────────────────────────────────

describe('uuidSchema', () => {
  it('accepts a valid UUID v4', () => {
    const result = uuidSchema.safeParse('550e8400-e29b-41d4-a716-446655440000');
    expect(result.success).toBe(true);
  });

  it('rejects a non-UUID string', () => {
    const result = uuidSchema.safeParse('not-a-uuid');
    expect(result.success).toBe(false);
  });

  it('rejects a SQL injection string', () => {
    const result = uuidSchema.safeParse("1' OR '1'='1");
    expect(result.success).toBe(false);
  });

  it('rejects an empty string', () => {
    const result = uuidSchema.safeParse('');
    expect(result.success).toBe(false);
  });
});

// ─── branchSchema ─────────────────────────────────────────────────────────────

describe('branchSchema', () => {
  const validBranch = {
    name: 'Main Branch',
    address: '123 Shake Street',
    phone: '+63 917 123 4567',
    latitude: '14.5995',
    longitude: '120.9842',
  };

  it('accepts a valid branch with all required fields', () => {
    const result = branchSchema.safeParse(validBranch);
    expect(result.success).toBe(true);
  });

  it('accepts a branch with all optional fields', () => {
    const result = branchSchema.safeParse({
      ...validBranch,
      is_active: true,
      is_main: false,
      messenger_username: 'starrshakes',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a branch with an empty name', () => {
    const result = branchSchema.safeParse({ ...validBranch, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a name longer than 200 characters', () => {
    const result = branchSchema.safeParse({ ...validBranch, name: 'A'.repeat(201) });
    expect(result.success).toBe(false);
  });

  it('accepts a name exactly 200 characters long', () => {
    const result = branchSchema.safeParse({ ...validBranch, name: 'A'.repeat(200) });
    expect(result.success).toBe(true);
  });

  it('strips HTML tags from name (XSS protection)', () => {
    const result = branchSchema.safeParse({ ...validBranch, name: '<b>Branch</b>' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Branch');
    }
  });

  it('rejects a branch with a missing address', () => {
    const { address: _addr, ...rest } = validBranch;
    const result = branchSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects a branch with a missing phone', () => {
    const { phone: _phone, ...rest } = validBranch;
    const result = branchSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

// ─── categorySchema ───────────────────────────────────────────────────────────

describe('categorySchema', () => {
  it('accepts a valid category', () => {
    const result = categorySchema.safeParse({ name: 'Milkshakes', icon: '🥤' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty name', () => {
    const result = categorySchema.safeParse({ name: '', icon: '🥤' });
    expect(result.success).toBe(false);
  });

  it('rejects a name longer than 100 characters', () => {
    const result = categorySchema.safeParse({ name: 'X'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('accepts a valid kebab-case id_slug', () => {
    const result = categorySchema.safeParse({ name: 'Shakes', id_slug: 'milkshakes' });
    expect(result.success).toBe(true);
  });

  it('rejects an id_slug with spaces', () => {
    const result = categorySchema.safeParse({ name: 'Shakes', id_slug: 'milk shakes' });
    expect(result.success).toBe(false);
  });

  it('accepts a category without optional fields', () => {
    const result = categorySchema.safeParse({ name: 'Shakes' });
    expect(result.success).toBe(true);
  });
});

// ─── menuItemSchema ───────────────────────────────────────────────────────────

describe('menuItemSchema', () => {
  const validItem = {
    name: 'Chocolate Shake',
    basePrice: 120,
    category: 'milkshakes',
    description: 'Rich and creamy',
  };

  it('accepts a valid menu item', () => {
    const result = menuItemSchema.safeParse(validItem);
    expect(result.success).toBe(true);
  });

  it('rejects a zero price', () => {
    const result = menuItemSchema.safeParse({ ...validItem, basePrice: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects a negative price', () => {
    const result = menuItemSchema.safeParse({ ...validItem, basePrice: -10 });
    expect(result.success).toBe(false);
  });

  it('rejects an empty name', () => {
    const result = menuItemSchema.safeParse({ ...validItem, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a name longer than 200 characters', () => {
    const result = menuItemSchema.safeParse({ ...validItem, name: 'A'.repeat(201) });
    expect(result.success).toBe(false);
  });

  it('accepts optional fields', () => {
    const result = menuItemSchema.safeParse({
      ...validItem,
      image: 'https://example.com/shake.jpg',
      popular: true,
      available: false,
      show_in_messenger: true,
    });
    expect(result.success).toBe(true);
  });
});

// ─── paymentMethodSchema ──────────────────────────────────────────────────────

describe('paymentMethodSchema', () => {
  const validMethod = {
    id: 'gcash',
    name: 'GCash',
    account_name: 'Starr Shakes',
    account_number: '09171234567',
    qr_code_url: 'https://example.com/gcash-qr.png',
    active: true,
    sort_order: 1,
  };

  it('accepts a valid payment method', () => {
    const result = paymentMethodSchema.safeParse(validMethod);
    expect(result.success).toBe(true);
  });

  it('rejects an empty name', () => {
    const result = paymentMethodSchema.safeParse({ ...validMethod, name: '' });
    expect(result.success).toBe(false);
  });

  it('accepts a method without optional fields', () => {
    const result = paymentMethodSchema.safeParse({
      id: 'cash',
      name: 'Cash',
      account_name: 'Starr',
      account_number: '123',
      qr_code_url: 'https://example.com/qr.png',
    });
    expect(result.success).toBe(true);
  });
});

// ─── siteSettingsSchema ───────────────────────────────────────────────────────

describe('siteSettingsSchema', () => {
  it('accepts an empty object (all fields optional / partial)', () => {
    const result = siteSettingsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts a partial update with just site_name', () => {
    const result = siteSettingsSchema.safeParse({ site_name: "Starr's Famous Shakes" });
    expect(result.success).toBe(true);
  });

  it('accepts a full update with all known fields', () => {
    const result = siteSettingsSchema.safeParse({
      site_name: 'Starr',
      site_logo: 'https://example.com/logo.png',
      site_description: 'Best shakes in town',
      currency: 'Philippine Peso',
      currency_code: 'PHP',
    });
    expect(result.success).toBe(true);
  });
});

// ─── customerLinkSchema ───────────────────────────────────────────────────────

describe('customerLinkSchema', () => {
  const validLink = {
    order_id: '550e8400-e29b-41d4-a716-446655440000',
    customer_id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    reason: 'Manual identification' as const,
  };

  it('accepts a valid link with an allowed reason', () => {
    const result = customerLinkSchema.safeParse(validLink);
    expect(result.success).toBe(true);
  });

  it('accepts all valid reasons', () => {
    const reasons = ['Phone match', 'Messenger match', 'Manual identification', 'Other'] as const;
    for (const reason of reasons) {
      const result = customerLinkSchema.safeParse({ ...validLink, reason });
      expect(result.success).toBe(true);
    }
  });

  it('rejects an invalid reason', () => {
    const result = customerLinkSchema.safeParse({ ...validLink, reason: 'Because I said so' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-UUID order_id', () => {
    const result = customerLinkSchema.safeParse({ ...validLink, order_id: 'bad-id' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-UUID customer_id', () => {
    const result = customerLinkSchema.safeParse({ ...validLink, customer_id: 'bad-id' });
    expect(result.success).toBe(false);
  });
});

// ─── customerUnlinkSchema ─────────────────────────────────────────────────────

describe('customerUnlinkSchema', () => {
  const validUnlink = {
    order_id: '550e8400-e29b-41d4-a716-446655440000',
    reason: 'Incorrect match' as const,
  };

  it('accepts a valid unlink with an allowed reason', () => {
    const result = customerUnlinkSchema.safeParse(validUnlink);
    expect(result.success).toBe(true);
  });

  it('accepts all valid unlink reasons', () => {
    const reasons = ['Incorrect match', 'Customer request', 'Duplicate resolution', 'Other'] as const;
    for (const reason of reasons) {
      const result = customerUnlinkSchema.safeParse({ ...validUnlink, reason });
      expect(result.success).toBe(true);
    }
  });

  it('rejects an invalid reason', () => {
    const result = customerUnlinkSchema.safeParse({ ...validUnlink, reason: 'Just because' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-UUID order_id', () => {
    const result = customerUnlinkSchema.safeParse({ ...validUnlink, order_id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
});

// ─── reorderSchema ────────────────────────────────────────────────────────────

describe('reorderSchema', () => {
  const uuid1 = '550e8400-e29b-41d4-a716-446655440000';
  const uuid2 = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

  it('accepts an array of valid UUIDs', () => {
    const result = reorderSchema.safeParse({ ids: [uuid1, uuid2] });
    expect(result.success).toBe(true);
  });

  it('accepts an empty array', () => {
    const result = reorderSchema.safeParse({ ids: [] });
    expect(result.success).toBe(true);
  });

  it('rejects an array containing a non-UUID', () => {
    const result = reorderSchema.safeParse({ ids: [uuid1, 'not-a-uuid'] });
    expect(result.success).toBe(false);
  });

  it('rejects when ids is not an array', () => {
    const result = reorderSchema.safeParse({ ids: uuid1 });
    expect(result.success).toBe(false);
  });

  it('rejects when ids field is missing', () => {
    const result = reorderSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
