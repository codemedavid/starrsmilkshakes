// tests/upsell-helpers.test.ts
// Unit tests for the shared upsell mapping utility.

import { describe, it, expect } from 'vitest';
import { mapCartItemsToUpsell, mapCartToUpsellCart, normalizeMenuItem, normalizeMenuItemWithRelations, itemNeedsCustomization } from '@/lib/upsell-helpers';
import { matchUpgradeOffers, matchPairOffers } from '@/lib/upsell-engine';
import type { CartItem, MenuItem } from '@/types';
import type { BundleCartItem, Bundle } from '@/types/bundle';
import type { UpsellRule, PairRule } from '@/types/upsell';

// ─── Fixture Helpers ────────────────────────────────────────────────────────

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: 'item-1-default-none',
    menuItemId: 'item-1',
    name: 'Vanilla Shake',
    description: 'Classic vanilla',
    basePrice: 150,
    category: 'shakes',
    quantity: 1,
    totalPrice: 150,
    ...overrides,
  };
}

function makeMenuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'menu-item-1',
    name: 'Chocolate Shake',
    description: 'Rich chocolate shake',
    basePrice: 150,
    category: 'shakes',
    ...overrides,
  };
}

function makeBundleCartItem(overrides: Partial<BundleCartItem> = {}): BundleCartItem {
  return {
    bundle_id: 'bundle-1',
    bundle: {
      id: 'bundle-1',
      name: 'Combo Deal',
      description: null,
      image_url: null,
      base_price: 250,
      cost_price: null,
      category: 'combos',
      discount_price: null,
      discount_active: false,
      discount_start_date: null,
      discount_end_date: null,
      available: true,
      popular: false,
      sort_order: 0,
      slots: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    quantity: 1,
    slot_selections: [],
    totalPrice: 250,
    ...overrides,
  };
}

function makeUpsellRule(overrides: Partial<UpsellRule> = {}): UpsellRule {
  return {
    id: 'rule-1',
    name: 'Test Rule',
    phase: 'upgrade',
    trigger_type: 'item',
    trigger_item_ids: ['item-1'],
    trigger_category_ids: [],
    trigger_min_total: null,
    offer_type: 'item',
    offer_item_id: 'offer-item-1',
    offer_bundle_id: null,
    offer_discount_percent: null,
    offer_message: null,
    priority: 10,
    is_active: true,
    starts_at: null,
    ends_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makePairRule(overrides: Partial<PairRule> = {}): PairRule {
  return {
    id: 'pair-1',
    source_item_id: 'item-1',
    source_category_id: null,
    paired_item_id: 'paired-item-1',
    paired_bundle_id: null,
    message: 'Try this with your shake!',
    priority: 10,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const NOW = new Date('2026-01-15T12:00:00Z');

// ─── mapCartItemsToUpsell ───────────────────────────────────────────────────

describe('mapCartItemsToUpsell', () => {
  it('uses menuItemId (not composite id) for menu_item_id', () => {
    const items = [makeCartItem({
      id: 'shake-1-vanilla-whipped',
      menuItemId: 'shake-1',
    })];
    const result = mapCartItemsToUpsell(items);
    expect(result[0].menu_item_id).toBe('shake-1');
  });

  it('falls back to id when menuItemId is undefined', () => {
    const items = [makeCartItem({
      id: 'legacy-item-1',
      menuItemId: undefined,
    })];
    const result = mapCartItemsToUpsell(items);
    expect(result[0].menu_item_id).toBe('legacy-item-1');
  });

  it('preserves category from the original item', () => {
    const items = [makeCartItem({ category: 'snacks' })];
    const result = mapCartItemsToUpsell(items);
    expect(result[0].category).toBe('snacks');
  });

  it('preserves quantity', () => {
    const items = [makeCartItem({ quantity: 3 })];
    const result = mapCartItemsToUpsell(items);
    expect(result[0].quantity).toBe(3);
  });

  it('calculates unit_price from totalPrice / quantity', () => {
    const items = [makeCartItem({ totalPrice: 450, quantity: 3 })];
    const result = mapCartItemsToUpsell(items);
    expect(result[0].unit_price).toBe(150);
  });

  it('handles zero quantity without NaN', () => {
    const items = [makeCartItem({ totalPrice: 150, quantity: 0 })];
    const result = mapCartItemsToUpsell(items);
    expect(result[0].unit_price).toBe(0);
    expect(Number.isNaN(result[0].unit_price)).toBe(false);
  });

  it('maps multiple items correctly', () => {
    const items = [
      makeCartItem({ id: 'a-composite', menuItemId: 'item-a', category: 'shakes' }),
      makeCartItem({ id: 'b-composite', menuItemId: 'item-b', category: 'snacks' }),
    ];
    const result = mapCartItemsToUpsell(items);
    expect(result).toHaveLength(2);
    expect(result[0].menu_item_id).toBe('item-a');
    expect(result[1].menu_item_id).toBe('item-b');
  });

  it('returns empty array for empty input', () => {
    expect(mapCartItemsToUpsell([])).toEqual([]);
  });

  // ─── Integration with upsell engine ──────────────────────────────────────

  it('correctly mapped items match upgrade triggers', () => {
    const items = [makeCartItem({
      id: 'shake-1-default-none',
      menuItemId: 'shake-1',
      category: 'shakes',
    })];
    const mapped = mapCartItemsToUpsell(items);
    const rule = makeUpsellRule({ trigger_type: 'item', trigger_item_ids: ['shake-1'] });
    const offers = matchUpgradeOffers(mapped, [rule], NOW);
    expect(offers).toHaveLength(1);
  });

  it('composite IDs without mapping would NOT match triggers', () => {
    // Prove the bug: using i.id instead of i.menuItemId breaks matching
    const items = [makeCartItem({
      id: 'shake-1-default-none',
      menuItemId: 'shake-1',
    })];
    const badMapped = items.map(i => ({
      menu_item_id: i.id, // BUG: composite ID
      category: i.category,
      quantity: i.quantity,
      unit_price: i.totalPrice / i.quantity,
    }));
    const rule = makeUpsellRule({ trigger_type: 'item', trigger_item_ids: ['shake-1'] });
    const offers = matchUpgradeOffers(badMapped, [rule], NOW);
    expect(offers).toHaveLength(0); // FAILS to match — this is the bug
  });

  it('correctly mapped items match pair source triggers', () => {
    const items = [makeCartItem({
      id: 'shake-1-vanilla-none',
      menuItemId: 'shake-1',
    })];
    const mapped = mapCartItemsToUpsell(items);
    const rule = makePairRule({ source_item_id: 'shake-1' });
    const offers = matchPairOffers(mapped, [rule]);
    expect(offers).toHaveLength(1);
  });

  it('correctly mapped items match category triggers', () => {
    const items = [makeCartItem({
      id: 'shake-1-default-none',
      menuItemId: 'shake-1',
      category: 'shakes',
    })];
    const mapped = mapCartItemsToUpsell(items);
    const rule = makeUpsellRule({ trigger_type: 'category', trigger_category_ids: ['shakes'] });
    const offers = matchUpgradeOffers(mapped, [rule], NOW);
    expect(offers).toHaveLength(1);
  });
});

// ─── mapCartToUpsellCart ────────────────────────────────────────────────────

describe('mapCartToUpsellCart', () => {
  it('maps cart items using menuItemId', () => {
    const items = [makeCartItem({ id: 'comp-1', menuItemId: 'real-1' })];
    const result = mapCartToUpsellCart(items, [], 150);
    expect(result.items[0].menu_item_id).toBe('real-1');
  });

  it('uses totalPrice for the cart total', () => {
    const items = [makeCartItem({ totalPrice: 150 })];
    const bundles = [makeBundleCartItem({ totalPrice: 250 })];
    const result = mapCartToUpsellCart(items, bundles, 400);
    expect(result.total).toBe(400);
  });

  it('includes all cart items in the items array', () => {
    const items = [
      makeCartItem({ menuItemId: 'a' }),
      makeCartItem({ menuItemId: 'b' }),
    ];
    const result = mapCartToUpsellCart(items, [], 300);
    expect(result.items).toHaveLength(2);
  });

  it('returns empty items for empty cart', () => {
    const result = mapCartToUpsellCart([], [], 0);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});

// ─── normalizeMenuItem ──────────────────────────────────────────────────────

describe('normalizeMenuItem', () => {
  it('converts snake_case Supabase row to camelCase MenuItem', () => {
    const raw = {
      id: 'item-1',
      name: 'Chocolate Shake',
      description: 'Rich chocolate',
      base_price: 150,
      image_url: 'https://example.com/img.jpg',
      category: 'shakes',
      popular: true,
      available: true,
      cost_price: 50,
    };
    const result = normalizeMenuItem(raw);
    expect(result.id).toBe('item-1');
    expect(result.name).toBe('Chocolate Shake');
    expect(result.basePrice).toBe(150);
    expect(result.image).toBe('https://example.com/img.jpg');
    expect(result.category).toBe('shakes');
    expect(result.popular).toBe(true);
    expect(result.costPrice).toBe(50);
  });

  it('handles already-camelCase data idempotently', () => {
    const camelCase = {
      id: 'item-2',
      name: 'Vanilla Shake',
      description: 'Smooth vanilla',
      basePrice: 120,
      image: 'https://example.com/v.jpg',
      category: 'shakes',
    };
    const result = normalizeMenuItem(camelCase);
    expect(result.basePrice).toBe(120);
    expect(result.image).toBe('https://example.com/v.jpg');
  });

  it('returns null/undefined input as-is', () => {
    expect(normalizeMenuItem(null)).toBeNull();
    expect(normalizeMenuItem(undefined)).toBeUndefined();
  });

  it('defaults basePrice to 0 when both formats missing', () => {
    const raw = { id: 'x', name: 'Test' };
    const result = normalizeMenuItem(raw);
    expect(result.basePrice).toBe(0);
  });

  it('prefers camelCase over snake_case when both exist', () => {
    const raw = { id: 'x', name: 'T', basePrice: 100, base_price: 200 };
    const result = normalizeMenuItem(raw);
    expect(result.basePrice).toBe(100);
  });
});

// ─── itemNeedsCustomization ─────────────────────────────────────────────────

describe('itemNeedsCustomization', () => {
  it('returns true when item has variations', () => {
    const item = makeMenuItem({ variations: [{ id: 'v1', name: 'Large', price: 20 }] });
    expect(itemNeedsCustomization(item)).toBe(true);
  });

  it('returns true when item has addOns', () => {
    const item = makeMenuItem({ addOns: [{ id: 'a1', name: 'Whip', price: 15, category: 'toppings' }] });
    expect(itemNeedsCustomization(item)).toBe(true);
  });

  it('returns true when item has both variations and addOns', () => {
    const item = makeMenuItem({
      variations: [{ id: 'v1', name: 'Large', price: 20 }],
      addOns: [{ id: 'a1', name: 'Whip', price: 15, category: 'toppings' }],
    });
    expect(itemNeedsCustomization(item)).toBe(true);
  });

  it('returns false when item has no variations or addOns', () => {
    const item = makeMenuItem();
    expect(itemNeedsCustomization(item)).toBe(false);
  });

  it('returns false when variations is empty array', () => {
    const item = makeMenuItem({ variations: [] });
    expect(itemNeedsCustomization(item)).toBe(false);
  });

  it('returns false when addOns is empty array', () => {
    const item = makeMenuItem({ addOns: [] });
    expect(itemNeedsCustomization(item)).toBe(false);
  });

  it('returns false when variations and addOns are undefined', () => {
    const item = makeMenuItem({ variations: undefined, addOns: undefined });
    expect(itemNeedsCustomization(item)).toBe(false);
  });
});

// ─── normalizeMenuItemWithRelations ─────────────────────────────────────────

describe('normalizeMenuItemWithRelations', () => {
  it('normalizes base fields like normalizeMenuItem', () => {
    const raw = {
      id: 'item-1',
      name: 'Chocolate Shake',
      description: 'Rich chocolate',
      base_price: 150,
      image_url: 'https://example.com/img.jpg',
      category: 'shakes',
      popular: true,
      available: true,
      cost_price: 50,
    };
    const result = normalizeMenuItemWithRelations(raw);
    expect(result.basePrice).toBe(150);
    expect(result.image).toBe('https://example.com/img.jpg');
    expect(result.costPrice).toBe(50);
  });

  it('maps nested variations array', () => {
    const raw = {
      id: 'item-1',
      name: 'Test',
      base_price: 100,
      category: 'shakes',
      variations: [
        { id: 'v1', name: 'Large', price: 20 },
        { id: 'v2', name: 'Small', price: 0 },
      ],
    };
    const result = normalizeMenuItemWithRelations(raw);
    expect(result.variations).toHaveLength(2);
    expect(result.variations![0].name).toBe('Large');
    expect(result.variations![0].price).toBe(20);
  });

  it('maps nested add_ons (snake_case) to addOns (camelCase)', () => {
    const raw = {
      id: 'item-1',
      name: 'Test',
      base_price: 100,
      category: 'shakes',
      add_ons: [
        { id: 'a1', name: 'Whip', price: 15, category: 'toppings' },
      ],
    };
    const result = normalizeMenuItemWithRelations(raw);
    expect(result.addOns).toHaveLength(1);
    expect(result.addOns![0].name).toBe('Whip');
    expect(result.addOns![0].category).toBe('toppings');
  });

  it('returns undefined for variations/addOns when not present', () => {
    const raw = {
      id: 'item-1',
      name: 'Test',
      base_price: 100,
      category: 'shakes',
    };
    const result = normalizeMenuItemWithRelations(raw);
    expect(result.variations).toBeUndefined();
    expect(result.addOns).toBeUndefined();
  });

  it('returns null for null input', () => {
    expect(normalizeMenuItemWithRelations(null)).toBeNull();
  });
});
