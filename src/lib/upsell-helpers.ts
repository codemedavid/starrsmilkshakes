// src/lib/upsell-helpers.ts
// Pure helper functions for mapping cart data to the upsell engine's input types.
// No I/O, no DB, no React — fully testable in isolation.

import type { CartItem, MenuItem } from '@/types';
import type { BundleCartItem } from '@/types/bundle';
import type { UpsellCartItem, UpsellCart } from '@/types/upsell';

/**
 * Map CartContext items to UpsellCartItem[].
 *
 * Critical: uses `menuItemId` (the original menu item ID preserved by
 * CartContext) rather than `id` (a composite key like "shake-1-default-none").
 * Upsell rules trigger on real menu item IDs, so composite IDs would never match.
 */
export function mapCartItemsToUpsell(cartItems: CartItem[]): UpsellCartItem[] {
  return cartItems.map(i => ({
    menu_item_id: i.menuItemId || i.id,
    category: i.category,
    quantity: i.quantity,
    unit_price: i.quantity > 0 ? i.totalPrice / i.quantity : 0,
  }));
}

/**
 * Build a full UpsellCart from CartContext state.
 * Used by the interstitial phase which needs the cart total for cart_total triggers.
 */
/**
 * Normalize a raw Supabase menu_items row (snake_case) to a MenuItem (camelCase).
 *
 * Supabase joins return `{ base_price, image_url, ... }` but CartContext.addToCart
 * expects `{ basePrice, image, ... }`. Without this, addToCart calculates NaN prices.
 * Handles both formats idempotently — already-camelCase objects pass through unchanged.
 */
export function normalizeMenuItem(raw: any): MenuItem {
  if (!raw) return raw;
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? '',
    basePrice: Number(raw.basePrice ?? raw.base_price ?? 0),
    category: raw.category,
    image: raw.image ?? raw.image_url ?? undefined,
    popular: Boolean(raw.popular),
    available: raw.available ?? true,
    costPrice: raw.cost_price ?? raw.costPrice ?? null,
  };
}

/**
 * Check if a menu item requires customization (has variations or add-ons).
 * Items with variations/add-ons should navigate to product detail for customization
 * rather than being added to cart directly from the pair screen.
 */
export function itemNeedsCustomization(item: MenuItem): boolean {
  const hasVariations = Array.isArray(item.variations) && item.variations.length > 0;
  const hasAddOns = Array.isArray(item.addOns) && item.addOns.length > 0;
  return hasVariations || hasAddOns;
}

export function mapCartToUpsellCart(
  cartItems: CartItem[],
  bundleItems: BundleCartItem[],
  totalPrice: number,
): UpsellCart {
  return {
    items: mapCartItemsToUpsell(cartItems),
    total: totalPrice,
  };
}
