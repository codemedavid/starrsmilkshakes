import { describe, it, expect } from 'vitest';
import {
  validateBundleSelections,
  getBundleEffectivePrice,
  calculateBundlePrice,
  calculateBundleSavings,
  isBundleAvailable,
} from '@/lib/bundle-engine';
import type { Bundle, SlotSelection, SlotItemAvailability } from '@/types/bundle';

const makeBundle = (overrides: Partial<Bundle> = {}): Bundle => ({
  id: 'bundle-1', name: 'Classic Combo', description: null, image_url: null,
  base_price: 199, cost_price: 80, category: 'combos',
  discount_price: null, discount_active: false,
  discount_start_date: null, discount_end_date: null,
  available: true, popular: false, sort_order: 0,
  slots: [
    {
      id: 'slot-1', bundle_id: 'bundle-1', label: 'Choose Shake', sort_order: 0,
      min_selections: 1, max_selections: 1,
      items: [
        { id: 'si-1', slot_id: 'slot-1', menu_item_id: 'item-1', price_override: null, sort_order: 0 },
        { id: 'si-2', slot_id: 'slot-1', menu_item_id: 'item-2', price_override: null, sort_order: 1 },
      ],
    },
    {
      id: 'slot-2', bundle_id: 'bundle-1', label: 'Choose Snack', sort_order: 1,
      min_selections: 1, max_selections: 1,
      items: [
        { id: 'si-3', slot_id: 'slot-2', menu_item_id: 'item-3', price_override: null, sort_order: 0 },
      ],
    },
  ],
  created_at: '', updated_at: '',
  ...overrides,
});

const validSelections: SlotSelection[] = [
  { slot_id: 'slot-1', selected_items: [{ menu_item_id: 'item-1' }] },
  { slot_id: 'slot-2', selected_items: [{ menu_item_id: 'item-3' }] },
];

describe('validateBundleSelections', () => {
  it('accepts valid selections', () => {
    const result = validateBundleSelections(makeBundle(), validSelections);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects when required slot is empty', () => {
    const result = validateBundleSelections(makeBundle(), [
      { slot_id: 'slot-1', selected_items: [{ menu_item_id: 'item-1' }] },
      // missing slot-2
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects too many selections for a slot', () => {
    const result = validateBundleSelections(makeBundle(), [
      { slot_id: 'slot-1', selected_items: [{ menu_item_id: 'item-1' }, { menu_item_id: 'item-2' }] },
      { slot_id: 'slot-2', selected_items: [{ menu_item_id: 'item-3' }] },
    ]);
    expect(result.valid).toBe(false);
  });

  it('rejects item not in slot eligible items', () => {
    const result = validateBundleSelections(makeBundle(), [
      { slot_id: 'slot-1', selected_items: [{ menu_item_id: 'item-999' }] },
      { slot_id: 'slot-2', selected_items: [{ menu_item_id: 'item-3' }] },
    ]);
    expect(result.valid).toBe(false);
  });
});

describe('getBundleEffectivePrice', () => {
  it('returns base_price when no discount', () => {
    expect(getBundleEffectivePrice(makeBundle(), new Date())).toBe(199);
  });

  it('returns discount_price when active and in range', () => {
    const bundle = makeBundle({
      discount_price: 149, discount_active: true,
      discount_start_date: '2020-01-01', discount_end_date: '2099-12-31',
    });
    expect(getBundleEffectivePrice(bundle, new Date())).toBe(149);
  });

  it('returns base_price when discount expired', () => {
    const bundle = makeBundle({
      discount_price: 149, discount_active: true,
      discount_start_date: '2020-01-01', discount_end_date: '2020-12-31',
    });
    expect(getBundleEffectivePrice(bundle, new Date())).toBe(199);
  });
});

describe('calculateBundlePrice', () => {
  it('returns effective price plus add-ons', () => {
    const selections: SlotSelection[] = [
      { slot_id: 'slot-1', selected_items: [{ menu_item_id: 'item-1', selected_add_ons: [{ id: 'a1', name: 'Whip', price: 15, category: 'topping' }] }] },
      { slot_id: 'slot-2', selected_items: [{ menu_item_id: 'item-3' }] },
    ];
    const result = calculateBundlePrice(makeBundle(), selections, new Date());
    expect(result.effectivePrice).toBe(199);
    expect(result.addOnsTotal).toBe(15);
    expect(result.total).toBe(214);
  });
});

describe('calculateBundleSavings', () => {
  it('calculates savings vs individual prices', () => {
    const bundle = makeBundle();
    // Slot items with menu_item that has prices
    bundle.slots[0].items[0].menu_item = { id: 'item-1', name: 'Shake', basePrice: 120, description: '', category: 'shakes' } as any;
    bundle.slots[1].items[0].menu_item = { id: 'item-3', name: 'Fries', basePrice: 99, description: '', category: 'snacks' } as any;

    const result = calculateBundleSavings(bundle, validSelections, new Date());
    expect(result.individualTotal).toBe(219); // 120 + 99
    expect(result.bundleTotal).toBe(199);
    expect(result.savings).toBe(20);
  });
});

describe('isBundleAvailable', () => {
  it('returns true when all slots have enough available items', () => {
    const availability: SlotItemAvailability[] = [
      { slot_id: 'slot-1', available_count: 2, min_selections: 1 },
      { slot_id: 'slot-2', available_count: 1, min_selections: 1 },
    ];
    expect(isBundleAvailable(makeBundle(), availability)).toBe(true);
  });

  it('returns false when bundle is unavailable', () => {
    expect(isBundleAvailable(makeBundle({ available: false }), [])).toBe(false);
  });

  it('returns false when a slot has too few available items', () => {
    const availability: SlotItemAvailability[] = [
      { slot_id: 'slot-1', available_count: 2, min_selections: 1 },
      { slot_id: 'slot-2', available_count: 0, min_selections: 1 },
    ];
    expect(isBundleAvailable(makeBundle(), availability)).toBe(false);
  });
});
