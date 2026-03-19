'use client';

import React from 'react';
import { ArrowLeft, Trash2, Minus, Plus } from 'lucide-react';
import { CartItem } from '@/types';
import { BundleCartItem } from '@/types/bundle';

interface CartProps {
  cartItems: CartItem[];
  bundleItems?: BundleCartItem[];
  updateQuantity: (id: string, quantity: number) => void;
  removeFromCart: (id: string) => void;
  removeBundleFromCart?: (index: number) => void;
  updateBundleQuantity?: (index: number, quantity: number) => void;
  clearCart: () => void;
  getTotalPrice: () => number;
  onContinueShopping: () => void;
  onCheckout: () => void;
}

export default function Cart({
  cartItems,
  bundleItems = [],
  updateQuantity,
  removeFromCart,
  removeBundleFromCart,
  updateBundleQuantity,
  clearCart,
  getTotalPrice,
  onContinueShopping,
  onCheckout,
}: CartProps) {
  const totalItems =
    cartItems.reduce((sum, item) => sum + item.quantity, 0) +
    bundleItems.reduce((sum, item) => sum + item.quantity, 0);

  // Empty state
  if (cartItems.length === 0 && bundleItems.length === 0) {
    return (
      <div className="min-h-screen bg-starrs-linen flex flex-col items-center justify-center px-6 text-center">
        <div className="text-6xl mb-4">🥤</div>
        <h2 className="text-xl font-bold text-starrs-deep mb-2">Your cart is empty</h2>
        <p className="text-starrs-muted text-sm mb-6">
          Browse our menu and add your favorite shakes!
        </p>
        <button
          onClick={onContinueShopping}
          className="px-6 py-3 bg-starrs-sage text-starrs-cream-brand rounded-xl font-semibold"
        >
          Browse Menu
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-starrs-linen pb-36">
      {/* Header */}
      <div className="bg-starrs-sage px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button onClick={onContinueShopping} className="text-starrs-cream-brand">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-starrs-cream-brand font-bold text-lg tracking-tight">
            Your Cart
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-starrs-cream-brand/80 text-sm">{totalItems} items</span>
          <button
            onClick={clearCart}
            className="text-starrs-cream-brand/70 text-xs font-medium"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Cart Items */}
      <div className="px-4 pt-4 space-y-2.5">
        {cartItems.map((item) => (
          <div
            key={item.id}
            className="bg-white rounded-[14px] p-3.5 shadow-sm"
          >
            <div className="flex gap-3">
              {/* Thumbnail */}
              <div className="w-16 h-16 rounded-[10px] bg-gradient-to-br from-starrs-sage/20 to-starrs-sage/5 flex items-center justify-center text-2xl flex-shrink-0">
                🥤
              </div>
              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <div className="font-bold text-[15px] text-gray-900">{item.name}</div>
                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="text-gray-300 hover:text-red-400 transition-colors p-0.5"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-xs text-starrs-sage mt-0.5">
                  {item.selectedVariation?.name}
                  {item.selectedAddOns?.length
                    ? ` • +${item.selectedAddOns.map((a) => a.name).join(', ')}`
                    : ''}
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="font-extrabold text-base text-starrs-deep">
                    ₱{item.totalPrice.toLocaleString()}
                  </span>
                  {/* Quantity Stepper */}
                  <div className="flex items-center bg-starrs-mint-soft rounded-[10px] overflow-hidden">
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="w-[34px] h-[34px] flex items-center justify-center text-starrs-sage"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-7 text-center font-bold text-[15px] text-starrs-deep">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="w-[34px] h-[34px] flex items-center justify-center bg-starrs-sage text-white rounded-r-[10px]"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Bundle Items */}
        {bundleItems.map((item, index) => (
          <div
            key={`bundle-${index}`}
            className="bg-white rounded-[14px] p-3.5 shadow-sm"
          >
            <div className="flex gap-3">
              <div className="w-16 h-16 rounded-[10px] bg-gradient-to-br from-amber-100 to-amber-50 flex items-center justify-center text-2xl flex-shrink-0">
                🎁
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <div className="font-bold text-[15px] text-gray-900">{item.bundle.name}</div>
                  {removeBundleFromCart && (
                    <button
                      onClick={() => removeBundleFromCart(index)}
                      className="text-gray-300 hover:text-red-400 transition-colors p-0.5"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="text-xs text-starrs-sage mt-0.5">Bundle</div>
                <div className="flex justify-between items-center mt-2">
                  <span className="font-extrabold text-base text-starrs-deep">
                    ₱{item.totalPrice.toLocaleString()}
                  </span>
                  {updateBundleQuantity && (
                    <div className="flex items-center bg-starrs-mint-soft rounded-[10px] overflow-hidden">
                      <button
                        onClick={() => updateBundleQuantity(index, item.quantity - 1)}
                        className="w-[34px] h-[34px] flex items-center justify-center text-starrs-sage"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-7 text-center font-bold text-[15px] text-starrs-deep">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateBundleQuantity(index, item.quantity + 1)}
                        className="w-[34px] h-[34px] flex items-center justify-center bg-starrs-sage text-white rounded-r-[10px]"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Sticky Bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[20px] shadow-[0_-4px_20px_rgba(0,0,0,0.08)] px-5 py-4 z-40">
        <div className="flex justify-between mb-3.5">
          <span className="text-starrs-muted text-sm">
            Subtotal ({totalItems} items)
          </span>
          <span className="font-extrabold text-xl text-starrs-deep">
            ₱{getTotalPrice().toLocaleString()}
          </span>
        </div>
        <button
          onClick={onCheckout}
          className="w-full py-4 bg-starrs-deep text-starrs-cream-brand rounded-[14px] text-base font-bold"
        >
          Proceed to Checkout
        </button>
      </div>
    </div>
  );
}
