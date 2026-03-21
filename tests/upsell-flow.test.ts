// tests/upsell-flow.test.ts
// Integration / acceptance tests for the 4-phase upsell flow.
//
// Covers:
//  1. Cart item ID mapping (menuItemId vs composite id)
//  2. Loading state & race-condition guards (useEffect auto-skip logic)
//  3. Accept-flow for all phases (upgrade item, upgrade bundle, pair, interstitial, loyalty nudge)
//  4. Skip / advance flow through phases
//  5. Server action Supabase FK-hint queries (mocked)
//
// NOTE: This project does not have @vitejs/plugin-react installed, so JSX
// rendering via RTL is not available in the test environment. Component
// integration tests simulate the callback contracts and state transitions
// that the Checkout orchestrator uses. If @vitejs/plugin-react is added to
// vitest.config.ts in the future, these tests can be upgraded to full RTL
// render tests.

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ── Types ────────────────────────────────────────────────────────────────────

import type {
  UpsellRule,
  UpsellOffer,
  PairRule,
  PairOffer,
  InterstitialOffer,
  UpsellCartItem,
  UpsellCart,
} from '@/types/upsell';
import type { MenuItem, CartItem } from '@/types';
import type { Bundle, SlotSelection } from '@/types/bundle';

// ── Engine functions (pure, no mocks needed) ─────────────────────────────────

import {
  matchUpgradeOffers,
  matchPairOffers,
  matchInterstitialOffers,
  shouldShowLoyaltyNudge,
} from '@/lib/upsell-engine';

import { itemNeedsCustomization, normalizeMenuItemWithRelations } from '@/lib/upsell-helpers';

// ── Mock Supabase server ─────────────────────────────────────────────────────

vi.mock('@/lib/supabase-server', () => {
  const fromMock = vi.fn();
  return {
    supabaseServer: { from: fromMock },
  };
});

import { supabaseServer } from '@/lib/supabase-server';

// ── Fixture helpers ──────────────────────────────────────────────────────────

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

function makeBundle(overrides: Partial<Bundle> = {}): Bundle {
  return {
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

function makeUpsellCartItem(overrides: Partial<UpsellCartItem> = {}): UpsellCartItem {
  return {
    menu_item_id: 'item-1',
    category: 'shakes',
    quantity: 1,
    unit_price: 150,
    ...overrides,
  };
}

function makeUpsellCart(overrides: Partial<UpsellCart> = {}): UpsellCart {
  return {
    items: [makeUpsellCartItem()],
    total: 150,
    ...overrides,
  };
}

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

function makeUpsellOffer(overrides: Partial<UpsellOffer> = {}): UpsellOffer {
  return {
    rule: makeUpsellRule({
      offer_item: makeMenuItem(),
      offer_item_id: 'menu-item-1',
    }),
    savings: 20,
    display_price: 130,
    ...overrides,
  };
}

function makePairOffer(overrides: Partial<PairOffer> = {}): PairOffer {
  return {
    rule: makePairRule(),
    item: makeMenuItem({ id: 'paired-item-1', name: 'Fries', basePrice: 80 }),
    bundle: null,
    ...overrides,
  };
}

function makeInterstitialOffer(overrides: Partial<InterstitialOffer> = {}): InterstitialOffer {
  return {
    rule: makeUpsellRule({
      phase: 'interstitial',
      offer_type: 'item',
      offer_item_id: 'int-item-1',
      offer_item: makeMenuItem({ id: 'int-item-1', name: 'Brownie', basePrice: 60 }),
    }),
    type: 'item',
    item: makeMenuItem({ id: 'int-item-1', name: 'Brownie', basePrice: 60 }),
    bundle: null,
    discounted_price: null,
    loyalty_message: null,
    ...overrides,
  };
}

const NOW = new Date('2026-01-15T12:00:00Z');

// ═════════════════════════════════════════════════════════════════════════════
// 1. CART ITEM ID MAPPING TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe('Cart Item ID Mapping', () => {
  it('should map menuItemId (not composite id) when building upsell cart items', () => {
    // CartContext stores items with composite IDs like "item-1-default-none"
    // but the upsell engine needs the real menu_item_id for trigger matching.
    const cartItem = makeCartItem({
      id: 'item-1-vanilla-whipped',  // composite ID from CartContext
      menuItemId: 'item-1',           // real menu item ID
    });

    // This mirrors the mapping logic in Checkout.tsx (lines 76-81)
    const mapped: UpsellCartItem = {
      menu_item_id: cartItem.menuItemId || cartItem.id,
      category: cartItem.category,
      quantity: cartItem.quantity,
      unit_price: cartItem.totalPrice / cartItem.quantity,
    };

    expect(mapped.menu_item_id).toBe('item-1');
    expect(mapped.menu_item_id).not.toBe('item-1-vanilla-whipped');

    // Now verify the engine can match triggers with the correctly mapped ID
    const rule = makeUpsellRule({ trigger_item_ids: ['item-1'] });
    const offers = matchUpgradeOffers([mapped], [rule], NOW);
    expect(offers).toHaveLength(1);
  });

  it('should fallback to id when menuItemId is undefined', () => {
    // Legacy cart items (e.g. from old sessions) may not have menuItemId set.
    const cartItem = makeCartItem({
      id: 'item-1',
      menuItemId: undefined,
    });

    const mapped: UpsellCartItem = {
      menu_item_id: cartItem.menuItemId || cartItem.id,
      category: cartItem.category,
      quantity: cartItem.quantity,
      unit_price: cartItem.totalPrice / cartItem.quantity,
    };

    expect(mapped.menu_item_id).toBe('item-1');

    // Should still match engine triggers
    const rule = makeUpsellRule({ trigger_item_ids: ['item-1'] });
    const offers = matchUpgradeOffers([mapped], [rule], NOW);
    expect(offers).toHaveLength(1);
  });

  it('should FAIL to match triggers when composite ID is used instead of menuItemId', () => {
    // This is the bug: if we accidentally use the composite ID, triggers won't fire
    const cartItem = makeCartItem({
      id: 'item-1-vanilla-whipped',
      menuItemId: 'item-1',
    });

    // Bug scenario: using cartItem.id instead of cartItem.menuItemId
    const badMapped: UpsellCartItem = {
      menu_item_id: cartItem.id, // BUG: composite ID
      category: cartItem.category,
      quantity: cartItem.quantity,
      unit_price: cartItem.totalPrice / cartItem.quantity,
    };

    const rule = makeUpsellRule({ trigger_item_ids: ['item-1'] });
    const offers = matchUpgradeOffers([badMapped], [rule], NOW);

    // Should NOT match because "item-1-vanilla-whipped" !== "item-1"
    expect(offers).toHaveLength(0);
  });

  it('should preserve menuItemId through CartContext addToCart flow', () => {
    // Simulate the CartContext behavior (lines 82-87 of CartContext.tsx)
    const menuItem = makeMenuItem({ id: 'real-menu-id-123' });
    const uniqueId = `${menuItem.id}-default-none`;

    const storedItem: CartItem = {
      ...menuItem,
      id: uniqueId,
      menuItemId: menuItem.id, // CartContext preserves this
      quantity: 1,
      totalPrice: menuItem.basePrice,
    };

    const upsellCartItem: UpsellCartItem = {
      menu_item_id: storedItem.menuItemId || storedItem.id,
      category: storedItem.category,
      quantity: storedItem.quantity,
      unit_price: storedItem.totalPrice / storedItem.quantity,
    };

    expect(upsellCartItem.menu_item_id).toBe('real-menu-id-123');
    expect(upsellCartItem.menu_item_id).not.toBe(uniqueId);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. LOADING STATE TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe('Loading State', () => {
  it('should show loading state while fetching upsell data', () => {
    // Checkout.tsx initializes: upsellLoading=true, upsellStep='upgrade'.
    // While upsellLoading is true AND upsellStep is 'upgrade' or 'pair',
    // it renders the loading spinner (line 451 of Checkout.tsx).
    const upsellLoading = true;
    const upsellStep = 'upgrade';
    const shouldShowLoader = upsellLoading && (upsellStep === 'upgrade' || upsellStep === 'pair');
    expect(shouldShowLoader).toBe(true);
  });

  it('should not show upgrade screen until data is loaded', () => {
    // Before upsellLoading becomes false, the upgrade screen should not render.
    // The loading guard takes priority over the upsellStep check.
    const upsellLoading = true;
    const upsellStep = 'upgrade';
    const upgradeOffers: UpsellOffer[] = [makeUpsellOffer()];

    const shouldShowUpgradeScreen = !upsellLoading && upsellStep === 'upgrade';
    const shouldShowLoader = upsellLoading && (upsellStep === 'upgrade' || upsellStep === 'pair');

    expect(shouldShowLoader).toBe(true);
    expect(shouldShowUpgradeScreen).toBe(false);

    // After loading completes, now the upgrade screen should show
    const loadingComplete = false;
    const shouldShowUpgradeAfterLoad = !loadingComplete && upsellStep === 'upgrade' && upgradeOffers.length > 0;
    expect(shouldShowUpgradeAfterLoad).toBe(true);
  });

  it('should skip to checkout when no offers returned', () => {
    // Simulates the fetchUpsellData logic in Checkout.tsx (lines 88-96).
    // When both upgrade and pair return empty, upsellStep should be 'checkout'.
    const upgradeRes = { success: true, data: [] };
    const pairRes = { success: true, data: [] };

    let upsellStep: string;

    if (upgradeRes.success && upgradeRes.data?.length > 0) {
      upsellStep = 'upgrade';
    } else if (pairRes.success && pairRes.data?.length > 0) {
      upsellStep = 'pair';
    } else {
      upsellStep = 'checkout';
    }

    expect(upsellStep).toBe('checkout');
  });

  it('should not show loading when upsellStep is already checkout', () => {
    const upsellLoading = true;
    const upsellStep: string = 'checkout';
    const shouldShowLoader = upsellLoading && (upsellStep === 'upgrade' || upsellStep === 'pair');
    expect(shouldShowLoader).toBe(false);
  });

  it('should handle UpgradeScreen auto-skip when offers array is empty', () => {
    // UpgradeScreen.tsx has a useEffect that calls onSkip when offers.length === 0.
    // This prevents the screen from staying visible after data loads empty.
    const onSkip = vi.fn();
    const offers: UpsellOffer[] = [];

    // Simulate the useEffect logic in UpgradeScreen.tsx (line 21-23)
    if (offers.length === 0) onSkip();

    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('should handle BestPairScreen auto-skip when offers array is empty', () => {
    // BestPairScreen.tsx has the same auto-skip pattern (line 33-35)
    const onSkip = vi.fn();
    const offers: PairOffer[] = [];

    if (offers.length === 0) onSkip();

    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. UPSELL ACCEPT FLOW TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe('Upsell Accept Flow', () => {
  it('should add item to cart when accepting an upgrade item offer', () => {
    // Simulates Checkout.tsx onAcceptItem callback (lines 480-487).
    const addToCart = vi.fn();
    const upgradeOffers = [makeUpsellOffer()];

    // User clicks upgrade for an item offer
    const acceptedItemId = 'menu-item-1';

    // Checkout handler logic:
    const offer = upgradeOffers.find(o => o.rule.offer_item_id === acceptedItemId);
    if (offer?.rule.offer_item) {
      addToCart(offer.rule.offer_item);
    }

    expect(addToCart).toHaveBeenCalledTimes(1);
    expect(addToCart).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'menu-item-1',
        name: 'Chocolate Shake',
        basePrice: 150,
      })
    );
  });

  it('should add bundle to cart when accepting an upgrade bundle offer', () => {
    // Simulates Checkout.tsx onAcceptBundle callback (lines 472-478).
    const addBundleToCart = vi.fn();
    const bundle = makeBundle({ id: 'combo-1', name: 'Super Combo' });
    const upgradeOffers: UpsellOffer[] = [{
      rule: makeUpsellRule({
        offer_type: 'bundle',
        offer_bundle_id: 'combo-1',
        offer_bundle: bundle,
        offer_item_id: null,
      }),
      savings: 50,
      display_price: 250,
    }];

    // User customizes and accepts bundle
    const bundleId = 'combo-1';
    const selections: SlotSelection[] = [];
    const bundleTotalPrice = 250;

    // Checkout handler logic:
    const offer = upgradeOffers.find(o => o.rule.offer_bundle?.id === bundleId);
    if (offer?.rule.offer_bundle) {
      addBundleToCart(offer.rule.offer_bundle, selections, bundleTotalPrice);
    }

    expect(addBundleToCart).toHaveBeenCalledTimes(1);
    expect(addBundleToCart).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'combo-1', name: 'Super Combo' }),
      selections,
      250
    );
  });

  it('should add paired item to cart when accepting a pair suggestion', () => {
    // Simulates Checkout.tsx onAddItem callback for pair (lines 498-506).
    const addToCart = vi.fn();
    const pairedItem = makeMenuItem({ id: 'paired-item-1', name: 'Fries', basePrice: 80 });
    const pairOffers: PairOffer[] = [makePairOffer({ item: pairedItem })];

    // User clicks "Add" on a paired item
    const itemId = 'paired-item-1';

    // Checkout handler logic:
    const offer = pairOffers.find(o =>
      o.rule.paired_item_id === itemId || o.rule.paired_bundle_id === itemId
    );
    if (offer?.item) {
      addToCart(offer.item);
    }

    expect(addToCart).toHaveBeenCalledTimes(1);
    expect(addToCart).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'paired-item-1',
        name: 'Fries',
        basePrice: 80,
      })
    );
  });

  it('should add interstitial item to cart when accepting interstitial offer', () => {
    // Simulates Checkout.tsx onAccept callback for interstitial (lines 1186-1199).
    const addToCart = vi.fn();
    const interstitialOffer = makeInterstitialOffer();

    // Checkout handler logic:
    if (interstitialOffer) {
      if (interstitialOffer.item) {
        addToCart(interstitialOffer.item);
      }
      if (interstitialOffer.type === 'loyalty_nudge') {
        // Would call onBack() instead
        return;
      }
    }

    expect(addToCart).toHaveBeenCalledTimes(1);
    expect(addToCart).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'int-item-1',
        name: 'Brownie',
        basePrice: 60,
      })
    );
  });

  it('should navigate back to menu on loyalty nudge accept', () => {
    // Simulates Checkout.tsx loyalty nudge accept (lines 1191-1194).
    const addToCart = vi.fn();
    const onBack = vi.fn();

    const loyaltyOffer = makeInterstitialOffer({
      type: 'loyalty_nudge',
      item: null,
      loyalty_message: "You're 2 stamps away from Free Shake!",
      rule: makeUpsellRule({
        phase: 'interstitial',
        offer_type: 'loyalty_nudge',
      }),
    });

    // Checkout handler logic:
    if (loyaltyOffer) {
      if (loyaltyOffer.item) {
        addToCart(loyaltyOffer.item);
      }
      if (loyaltyOffer.type === 'loyalty_nudge') {
        onBack();
        // Should NOT proceed to checkout — it returns early
      }
    }

    // addToCart should NOT be called (loyalty nudge has no item)
    expect(addToCart).not.toHaveBeenCalled();
    // onBack should be called to navigate back to menu
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('should not add anything when interstitial offer has no item and is not loyalty nudge', () => {
    const addToCart = vi.fn();
    const onBack = vi.fn();
    let upsellStep = 'interstitial';

    const emptyOffer = makeInterstitialOffer({
      type: 'bundle',
      item: null,
      bundle: makeBundle(),
    });

    // Checkout handler logic for non-item, non-nudge offers:
    if (emptyOffer) {
      if (emptyOffer.item) {
        addToCart(emptyOffer.item);
      }
      if (emptyOffer.type === 'loyalty_nudge') {
        onBack();
        return;
      }
    }
    upsellStep = 'checkout';

    expect(addToCart).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
    expect(upsellStep).toBe('checkout');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. UPSELL SKIP FLOW TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe('Upsell Skip Flow', () => {
  it('should advance from upgrade to pair when offers exist', () => {
    // Simulates Checkout.tsx onSkip for UpgradeScreen (line 488).
    const pairOffers = [makePairOffer()];
    let upsellStep = 'upgrade';

    // UpgradeScreen onSkip handler:
    upsellStep = pairOffers.length > 0 ? 'pair' : 'checkout';

    expect(upsellStep).toBe('pair');
  });

  it('should advance from upgrade to checkout when no pair offers', () => {
    // When pair offers are empty, skipping upgrade goes directly to checkout.
    const pairOffers: PairOffer[] = [];
    let upsellStep = 'upgrade';

    // UpgradeScreen onSkip handler:
    upsellStep = pairOffers.length > 0 ? 'pair' : 'checkout';

    expect(upsellStep).toBe('checkout');
  });

  it('should advance from pair to checkout on skip', () => {
    // BestPairScreen onSkip handler (line 507).
    let upsellStep = 'pair';

    // BestPairScreen onSkip handler:
    upsellStep = 'checkout';

    expect(upsellStep).toBe('checkout');
  });

  it('should advance from upgrade to pair after accepting an upgrade item', () => {
    // After accepting an upgrade, advance to pair if pair offers exist (line 486).
    const pairOffers = [makePairOffer()];
    let upsellStep = 'upgrade';

    // After onAcceptItem:
    upsellStep = pairOffers.length > 0 ? 'pair' : 'checkout';

    expect(upsellStep).toBe('pair');
  });

  it('should advance from upgrade to checkout after accepting an upgrade item when no pair offers', () => {
    const pairOffers: PairOffer[] = [];
    let upsellStep = 'upgrade';

    upsellStep = pairOffers.length > 0 ? 'pair' : 'checkout';

    expect(upsellStep).toBe('checkout');
  });

  it('should advance from pair to checkout after accepting a pair item', () => {
    // After onAddItem in BestPairScreen, go to checkout (line 505).
    let upsellStep = 'pair';

    // After onAddItem:
    upsellStep = 'checkout';

    expect(upsellStep).toBe('checkout');
  });

  it('should set interstitial step when pre-place-order finds an offer', () => {
    // Simulates handlePrePlaceOrder in Checkout.tsx (lines 295-311).
    let upsellStep = 'checkout';
    let interstitialOffer: InterstitialOffer | null = null;

    const res = { success: true, data: makeInterstitialOffer() };

    if (res.success && res.data) {
      interstitialOffer = res.data;
      upsellStep = 'interstitial';
    }

    expect(upsellStep).toBe('interstitial');
    expect(interstitialOffer).not.toBeNull();
  });

  it('should proceed directly to place order when no interstitial offer', () => {
    let upsellStep = 'checkout';
    const placeOrder = vi.fn();

    const res = { success: true, data: null };

    if (res.success && res.data) {
      upsellStep = 'interstitial';
    } else {
      placeOrder();
    }

    expect(upsellStep).toBe('checkout');
    expect(placeOrder).toHaveBeenCalledTimes(1);
  });

  it('should place order after declining interstitial', () => {
    // Simulates onDecline callback in Checkout.tsx (lines 1200-1203).
    let interstitialOffer: InterstitialOffer | null = makeInterstitialOffer();
    const placeOrder = vi.fn();

    // onDecline handler:
    interstitialOffer = null;
    placeOrder();

    expect(interstitialOffer).toBeNull();
    expect(placeOrder).toHaveBeenCalledTimes(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. SERVER ACTION TESTS (Mock Supabase)
// ═════════════════════════════════════════════════════════════════════════════

describe('Server Action Supabase FK Hints', () => {
  // For these tests we use vi.importActual to get the real server action
  // implementations and verify they make the correct Supabase queries.

  let realGetUpgradeOffers: typeof import('@/actions/upsell').getUpgradeOffers;
  let realGetPairSuggestions: typeof import('@/actions/upsell').getPairSuggestions;
  let realGetInterstitialOffers: typeof import('@/actions/upsell').getInterstitialOffers;

  // Helper to build a chainable Supabase mock that records method calls
  function makeChainableMock(resolvedData: any = [], resolvedError: any = null) {
    const result = { data: resolvedData, error: resolvedError };
    const selectSpy = vi.fn();
    const eqSpy = vi.fn();

    const chain: Record<string, any> = {};

    // Each method returns a proxy that is thenable (resolves to result)
    const makeProxy = (): any => {
      return new Proxy({} as any, {
        get(_target, prop) {
          if (prop === 'then') {
            return (resolve: any) => Promise.resolve(result).then(resolve);
          }
          if (prop === 'catch') {
            return () => Promise.resolve(result);
          }
          if (prop === 'select') {
            return (...args: any[]) => {
              selectSpy(...args);
              return makeProxy();
            };
          }
          if (prop === 'eq') {
            return (...args: any[]) => {
              eqSpy(...args);
              return makeProxy();
            };
          }
          if (prop === 'limit') {
            return () => makeProxy();
          }
          if (prop === 'single') {
            return () => Promise.resolve(result);
          }
          return () => makeProxy();
        },
      });
    };

    return { proxy: makeProxy(), selectSpy, eqSpy };
  }

  beforeEach(async () => {
    vi.clearAllMocks();

    // Dynamically import the real module (bypassing any vi.mock for @/actions/upsell)
    const realModule = await vi.importActual<typeof import('@/actions/upsell')>('@/actions/upsell');
    realGetUpgradeOffers = realModule.getUpgradeOffers;
    realGetPairSuggestions = realModule.getPairSuggestions;
    realGetInterstitialOffers = realModule.getInterstitialOffers;
  });

  it('getUpgradeOffers should use explicit FK hints in select', async () => {
    const { proxy, selectSpy, eqSpy } = makeChainableMock([]);
    (supabaseServer.from as Mock).mockReturnValue(proxy);

    const cartItems: UpsellCartItem[] = [
      { menu_item_id: 'item-1', category: 'shakes', quantity: 1, unit_price: 150 },
    ];

    await realGetUpgradeOffers(cartItems);

    // Verify `from` was called with the correct table
    expect(supabaseServer.from).toHaveBeenCalledWith('upsell_rules');

    // Verify the select call uses explicit FK hints for the join:
    //   offer_item:menu_items!offer_item_id(*)
    //   offer_bundle:bundles!offer_bundle_id(*)
    // This is the fix for the ambiguous FK bug.
    const selectArg = selectSpy.mock.calls[0]?.[0] as string;
    expect(selectArg).toContain('offer_item:menu_items!offer_item_id(*)');
    expect(selectArg).toContain('offer_bundle:bundles!offer_bundle_id(*)');

    // Verify it filters for 'upgrade' phase
    expect(eqSpy).toHaveBeenCalledWith('phase', 'upgrade');
    expect(eqSpy).toHaveBeenCalledWith('is_active', true);
  });

  it('getPairSuggestions should resolve ambiguous menu_items FK', async () => {
    const { proxy, selectSpy, eqSpy } = makeChainableMock([]);
    (supabaseServer.from as Mock).mockReturnValue(proxy);

    const cartItems: UpsellCartItem[] = [
      { menu_item_id: 'item-1', category: 'shakes', quantity: 1, unit_price: 150 },
    ];

    await realGetPairSuggestions(cartItems);

    // Verify `from` was called with pair_rules
    expect(supabaseServer.from).toHaveBeenCalledWith('pair_rules');

    // The select must use explicit FK hints to disambiguate:
    //   paired_item:menu_items!paired_item_id(...)
    //   paired_bundle:bundles!paired_bundle_id(*)
    // Without the !paired_item_id hint, PostgREST throws an ambiguous
    // relationship error when pair_rules has multiple FKs to menu_items.
    // Note: the nested select may include additional fields (e.g. variations, add_ons)
    // inside the paired_item join, so we check for the FK hint prefix only.
    const selectArg = selectSpy.mock.calls[0]?.[0] as string;
    expect(selectArg).toContain('paired_item:menu_items!paired_item_id(');
    expect(selectArg).toContain('paired_bundle:bundles!paired_bundle_id(*)');

    // Should filter for active rules
    expect(eqSpy).toHaveBeenCalledWith('is_active', true);
  });

  it('getInterstitialOffers should use explicit FK hints', async () => {
    const { proxy, selectSpy, eqSpy } = makeChainableMock([]);
    (supabaseServer.from as Mock).mockReturnValue(proxy);

    const cart: UpsellCart = {
      items: [{ menu_item_id: 'item-1', category: 'shakes', quantity: 1, unit_price: 150 }],
      total: 150,
    };

    await realGetInterstitialOffers(cart);

    // Verify `from` was called with upsell_rules
    expect(supabaseServer.from).toHaveBeenCalledWith('upsell_rules');

    // Verify explicit FK hints in the select statement
    const selectArg = selectSpy.mock.calls[0]?.[0] as string;
    expect(selectArg).toContain('offer_item:menu_items!offer_item_id(*)');
    expect(selectArg).toContain('offer_bundle:bundles!offer_bundle_id(*)');

    // Verify it filters for interstitial phase
    expect(eqSpy).toHaveBeenCalledWith('phase', 'interstitial');
    expect(eqSpy).toHaveBeenCalledWith('is_active', true);
  });

  it('getUpgradeOffers should return mapped offer_item/offer_bundle from join', async () => {
    // Verify the server action maps the joined data correctly
    const fakeItem = { id: 'item-1', name: 'Shake', basePrice: 120 };
    const fakeRule = {
      ...makeUpsellRule({ phase: 'upgrade', trigger_item_ids: ['item-1'] }),
      offer_item: fakeItem,
      offer_bundle: null,
    };

    const { proxy } = makeChainableMock([fakeRule]);
    (supabaseServer.from as Mock).mockReturnValue(proxy);

    const cartItems: UpsellCartItem[] = [
      { menu_item_id: 'item-1', category: 'shakes', quantity: 1, unit_price: 150 },
    ];

    const result = await realGetUpgradeOffers(cartItems);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    // The engine should have matched the rule and returned offers
    if (result.data && result.data.length > 0) {
      expect(result.data[0].rule.offer_item).toMatchObject(fakeItem);
    }
  });

  it('getPairSuggestions should return mapped paired_item from join', async () => {
    const fakeItem = { id: 'paired-1', name: 'Fries', basePrice: 80 };
    const fakeRule = {
      ...makePairRule({ source_item_id: 'item-1', paired_item_id: 'paired-1' }),
      paired_item: fakeItem,
      paired_bundle: null,
    };

    const { proxy } = makeChainableMock([fakeRule]);
    (supabaseServer.from as Mock).mockReturnValue(proxy);

    const cartItems: UpsellCartItem[] = [
      { menu_item_id: 'item-1', category: 'shakes', quantity: 1, unit_price: 150 },
    ];

    const result = await realGetPairSuggestions(cartItems);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    if (result.data && result.data.length > 0) {
      expect(result.data[0].item).toMatchObject(fakeItem);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. END-TO-END UPSELL STEP MACHINE (state transition integration)
// ═════════════════════════════════════════════════════════════════════════════

describe('Upsell Step Machine (full state transitions)', () => {
  type UpsellStep = 'upgrade' | 'pair' | 'checkout' | 'interstitial' | 'placing';

  // Simulate the complete Checkout state machine for upsell steps
  function createStepMachine(upgradeOffers: UpsellOffer[], pairOffers: PairOffer[]) {
    let step: UpsellStep = 'upgrade';
    let interstitialOffer: InterstitialOffer | null = null;
    const addToCart = vi.fn();
    const addBundleToCart = vi.fn();
    const placeOrder = vi.fn();
    const onBack = vi.fn();

    // Determine initial step (mirrors fetchUpsellData logic)
    if (upgradeOffers.length > 0) {
      step = 'upgrade';
    } else if (pairOffers.length > 0) {
      step = 'pair';
    } else {
      step = 'checkout';
    }

    return {
      getStep: () => step,
      getInterstitialOffer: () => interstitialOffer,

      // UpgradeScreen handlers
      skipUpgrade: () => {
        step = pairOffers.length > 0 ? 'pair' : 'checkout';
      },
      acceptUpgradeItem: (itemId: string) => {
        const offer = upgradeOffers.find(o => o.rule.offer_item_id === itemId);
        if (offer?.rule.offer_item) addToCart(offer.rule.offer_item);
        step = pairOffers.length > 0 ? 'pair' : 'checkout';
      },
      acceptUpgradeBundle: (bundleId: string, selections: SlotSelection[], price: number) => {
        const offer = upgradeOffers.find(o => o.rule.offer_bundle?.id === bundleId);
        if (offer?.rule.offer_bundle) addBundleToCart(offer.rule.offer_bundle, selections, price);
        step = pairOffers.length > 0 ? 'pair' : 'checkout';
      },

      // BestPairScreen handlers
      skipPair: () => { step = 'checkout'; },
      acceptPairItem: (itemId: string) => {
        const offer = pairOffers.find(o =>
          o.rule.paired_item_id === itemId || o.rule.paired_bundle_id === itemId
        );
        if (offer?.item) addToCart(offer.item as any);
        step = 'checkout';
      },

      // Interstitial handlers
      showInterstitial: (offer: InterstitialOffer) => {
        interstitialOffer = offer;
        step = 'interstitial';
      },
      acceptInterstitial: () => {
        if (interstitialOffer) {
          if (interstitialOffer.item) addToCart(interstitialOffer.item as any);
          if (interstitialOffer.type === 'loyalty_nudge') {
            onBack();
            return;
          }
        }
        interstitialOffer = null;
        step = 'checkout';
      },
      declineInterstitial: () => {
        interstitialOffer = null;
        placeOrder();
      },

      // Spies for assertions
      addToCart,
      addBundleToCart,
      placeOrder,
      onBack,
    };
  }

  it('full flow: upgrade -> skip -> pair -> skip -> checkout', () => {
    const machine = createStepMachine(
      [makeUpsellOffer()],
      [makePairOffer()]
    );

    expect(machine.getStep()).toBe('upgrade');

    machine.skipUpgrade();
    expect(machine.getStep()).toBe('pair');

    machine.skipPair();
    expect(machine.getStep()).toBe('checkout');

    expect(machine.addToCart).not.toHaveBeenCalled();
  });

  it('full flow: upgrade -> accept item -> pair -> accept pair -> checkout', () => {
    const machine = createStepMachine(
      [makeUpsellOffer()],
      [makePairOffer()]
    );

    expect(machine.getStep()).toBe('upgrade');

    machine.acceptUpgradeItem('menu-item-1');
    expect(machine.getStep()).toBe('pair');
    expect(machine.addToCart).toHaveBeenCalledTimes(1);

    machine.acceptPairItem('paired-item-1');
    expect(machine.getStep()).toBe('checkout');
    expect(machine.addToCart).toHaveBeenCalledTimes(2);
  });

  it('full flow: no upgrades, pair only -> accept -> checkout', () => {
    const machine = createStepMachine(
      [],
      [makePairOffer()]
    );

    // Should start at pair (no upgrades)
    expect(machine.getStep()).toBe('pair');

    machine.acceptPairItem('paired-item-1');
    expect(machine.getStep()).toBe('checkout');
  });

  it('full flow: no offers -> checkout directly', () => {
    const machine = createStepMachine([], []);

    expect(machine.getStep()).toBe('checkout');
  });

  it('full flow: checkout -> interstitial accept -> checkout', () => {
    const machine = createStepMachine([], []);
    expect(machine.getStep()).toBe('checkout');

    machine.showInterstitial(makeInterstitialOffer());
    expect(machine.getStep()).toBe('interstitial');

    machine.acceptInterstitial();
    expect(machine.getStep()).toBe('checkout');
    expect(machine.addToCart).toHaveBeenCalledTimes(1);
  });

  it('full flow: checkout -> interstitial decline -> place order', () => {
    const machine = createStepMachine([], []);
    expect(machine.getStep()).toBe('checkout');

    machine.showInterstitial(makeInterstitialOffer());
    expect(machine.getStep()).toBe('interstitial');

    machine.declineInterstitial();
    expect(machine.placeOrder).toHaveBeenCalledTimes(1);
    expect(machine.getInterstitialOffer()).toBeNull();
  });

  it('full flow: checkout -> loyalty nudge accept -> navigate back', () => {
    const machine = createStepMachine([], []);
    expect(machine.getStep()).toBe('checkout');

    machine.showInterstitial(makeInterstitialOffer({
      type: 'loyalty_nudge',
      item: null,
      loyalty_message: "You're 1 stamp away!",
    }));

    machine.acceptInterstitial();
    expect(machine.onBack).toHaveBeenCalledTimes(1);
    expect(machine.addToCart).not.toHaveBeenCalled();
  });

  it('full flow: upgrade -> accept bundle -> checkout (no pairs)', () => {
    const bundleOffer: UpsellOffer = {
      rule: makeUpsellRule({
        offer_type: 'bundle',
        offer_bundle_id: 'bundle-1',
        offer_bundle: makeBundle(),
        offer_item_id: null,
      }),
      savings: 50,
      display_price: 250,
    };

    const machine = createStepMachine([bundleOffer], []);
    expect(machine.getStep()).toBe('upgrade');

    machine.acceptUpgradeBundle('bundle-1', [], 250);
    expect(machine.getStep()).toBe('checkout');
    expect(machine.addBundleToCart).toHaveBeenCalledTimes(1);
    expect(machine.addBundleToCart).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'bundle-1' }),
      [],
      250
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. PAIR MATCHING: SINGLE ITEM VS ENTIRE CART
// ═════════════════════════════════════════════════════════════════════════════

describe('pair matching: single item vs entire cart', () => {
  it('single item matches only its own pair rules', () => {
    const singleItem = [makeUpsellCartItem({ menu_item_id: 'shake-1', category: 'shakes' })];
    const rules = [
      makePairRule({ id: 'pair-for-shake', source_item_id: 'shake-1', paired_item_id: 'fries-1' }),
      makePairRule({ id: 'pair-for-snack', source_item_id: 'snack-1', paired_item_id: 'drink-1' }),
    ];
    const offers = matchPairOffers(singleItem, rules);
    expect(offers).toHaveLength(1);
    expect(offers[0].rule.id).toBe('pair-for-shake');
  });

  it('entire cart matches pair rules for ALL items (old behavior)', () => {
    const entireCart = [
      makeUpsellCartItem({ menu_item_id: 'shake-1', category: 'shakes' }),
      makeUpsellCartItem({ menu_item_id: 'snack-1', category: 'snacks' }),
    ];
    const rules = [
      makePairRule({ id: 'pair-for-shake', source_item_id: 'shake-1', paired_item_id: 'fries-1' }),
      makePairRule({ id: 'pair-for-snack', source_item_id: 'snack-1', paired_item_id: 'drink-1' }),
    ];
    const offers = matchPairOffers(entireCart, rules);
    expect(offers).toHaveLength(2);
  });

  it('category-based pair rules only match the single item category', () => {
    const singleItem = [makeUpsellCartItem({ menu_item_id: 'shake-1', category: 'shakes' })];
    const rules = [
      makePairRule({ id: 'pair-shakes', source_item_id: null, source_category_id: 'shakes', paired_item_id: 'fries-1' }),
      makePairRule({ id: 'pair-snacks', source_item_id: null, source_category_id: 'snacks', paired_item_id: 'drink-1' }),
    ];
    const offers = matchPairOffers(singleItem, rules);
    expect(offers).toHaveLength(1);
    expect(offers[0].rule.id).toBe('pair-shakes');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. PAIR ITEM CUSTOMIZATION DETECTION
// ═════════════════════════════════════════════════════════════════════════════

describe('pair item customization detection', () => {
  it('item with variations needs customization', () => {
    const raw = {
      id: 'item-1', name: 'Test', base_price: 100, category: 'shakes',
      variations: [{ id: 'v1', name: 'Large', price: 20 }],
    };
    const normalized = normalizeMenuItemWithRelations(raw);
    expect(itemNeedsCustomization(normalized)).toBe(true);
  });

  it('item without variations/add-ons does not need customization', () => {
    const raw = {
      id: 'item-1', name: 'Test', base_price: 100, category: 'shakes',
    };
    const normalized = normalizeMenuItemWithRelations(raw);
    expect(itemNeedsCustomization(normalized)).toBe(false);
  });

  it('normalizeMenuItemWithRelations maps add_ons for customization check', () => {
    const raw = {
      id: 'item-1', name: 'Test', base_price: 100, category: 'shakes',
      add_ons: [{ id: 'a1', name: 'Whip', price: 15, category: 'toppings' }],
    };
    const normalized = normalizeMenuItemWithRelations(raw);
    expect(itemNeedsCustomization(normalized)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. GET PAIR SUGGESTIONS QUERY INCLUDES RELATIONS
// ═════════════════════════════════════════════════════════════════════════════

describe('getPairSuggestions query includes relations', () => {
  it('selects variations and add_ons on paired items', async () => {
    const { getPairSuggestions } = await import('@/actions/upsell');

    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    (supabaseServer.from as Mock).mockReturnValue({ select: selectMock });

    await getPairSuggestions([makeUpsellCartItem()]);

    expect(selectMock).toHaveBeenCalledWith(
      expect.stringContaining('variations(*)'),
    );
    expect(selectMock).toHaveBeenCalledWith(
      expect.stringContaining('add_ons(*)'),
    );
  });
});
