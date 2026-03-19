'use client';

import React from 'react';
import { ArrowLeft, Trash2, Minus, Plus, ShoppingBag } from 'lucide-react';
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

  if (cartItems.length === 0 && bundleItems.length === 0) {
    return (
      <div className="min-h-screen bg-[#F4F0EB] flex flex-col items-center justify-center px-8 text-center">
        <div className="w-20 h-20 rounded-full bg-[#8FB8A8]/10 flex items-center justify-center mb-5">
          <ShoppingBag className="w-9 h-9 text-[#8FB8A8]" strokeWidth={1.5} />
        </div>
        <h2 className="text-[22px] font-bold text-[#1A2B22] tracking-tight mb-1.5">
          Your cart is empty
        </h2>
        <p className="text-[#8B9E95] text-[15px] leading-relaxed mb-8 max-w-[260px]">
          Discover our handcrafted shakes and add your favorites
        </p>
        <button
          onClick={onContinueShopping}
          className="px-8 py-3.5 bg-[#2A5A4A] text-[#FFF8E7] rounded-full text-[15px] font-semibold tracking-wide shadow-lg shadow-[#2A5A4A]/20 active:scale-[0.97] transition-transform"
        >
          Browse Menu
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F0EB] pb-40">
      {/* Header */}
      <div className="bg-[#8FB8A8] px-5 pt-12 pb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onContinueShopping}
              className="w-9 h-9 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center active:scale-95 transition-transform"
            >
              <ArrowLeft className="w-[18px] h-[18px] text-white" />
            </button>
            <div>
              <h1 className="text-white font-bold text-[20px] tracking-tight leading-none">
                Your Cart
              </h1>
              <span className="text-white/60 text-[13px]">
                {totalItems} {totalItems === 1 ? 'item' : 'items'}
              </span>
            </div>
          </div>
          <button
            onClick={clearCart}
            className="text-white/50 text-[13px] font-medium hover:text-white/80 transition-colors"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Cart Items */}
      <div className="px-4 -mt-2 space-y-3">
        {cartItems.map((item, index) => (
          <div
            key={item.id}
            className="bg-white rounded-2xl p-3 shadow-[0_2px_12px_rgba(0,0,0,0.04)]"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="flex gap-3">
              {/* Product Image */}
              <div className="w-[76px] h-[76px] rounded-xl overflow-hidden bg-[#F0EDE8] flex-shrink-0 relative">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ShoppingBag className="w-7 h-7 text-[#C4BDB4]" strokeWidth={1.5} />
                  </div>
                )}
                {item.quantity > 1 && (
                  <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[#2A5A4A] text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                    {item.quantity}
                  </div>
                )}
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                <div>
                  <div className="flex justify-between items-start gap-2">
                    <h3 className="font-semibold text-[15px] text-[#1A2B22] leading-tight truncate">
                      {item.name}
                    </h3>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="text-[#D4CFC8] hover:text-red-400 transition-colors p-0.5 -mr-0.5 flex-shrink-0"
                    >
                      <Trash2 className="w-[15px] h-[15px]" />
                    </button>
                  </div>
                  <p className="text-[12px] text-[#8B9E95] mt-0.5 truncate">
                    {item.selectedVariation?.name}
                    {item.selectedAddOns?.length
                      ? ` · ${item.selectedAddOns.map((a) => a.name).join(', ')}`
                      : ''}
                  </p>
                </div>

                <div className="flex justify-between items-center mt-1.5">
                  <span className="font-bold text-[17px] text-[#2A5A4A] tabular-nums">
                    ₱{item.totalPrice.toLocaleString()}
                  </span>
                  {/* Quantity Stepper */}
                  <div className="flex items-center gap-0 rounded-full border border-[#E8E4DE] overflow-hidden">
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="w-8 h-8 flex items-center justify-center text-[#8B9E95] hover:bg-[#F4F0EB] active:bg-[#EBE7E1] transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-8 text-center font-semibold text-[14px] text-[#1A2B22] tabular-nums">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="w-8 h-8 flex items-center justify-center text-[#8FB8A8] hover:bg-[#F0F7F4] active:bg-[#E0F0EA] transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
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
            className="bg-white rounded-2xl p-3 shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-[#8FB8A8]/15"
          >
            <div className="flex gap-3">
              <div className="w-[76px] h-[76px] rounded-xl overflow-hidden bg-gradient-to-br from-[#8FB8A8]/15 to-[#8FB8A8]/5 flex items-center justify-center flex-shrink-0">
                <div className="text-center">
                  <div className="text-2xl leading-none mb-0.5">🎁</div>
                  <span className="text-[9px] font-semibold text-[#8FB8A8] uppercase tracking-wider">Bundle</span>
                </div>
              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                <div>
                  <div className="flex justify-between items-start gap-2">
                    <h3 className="font-semibold text-[15px] text-[#1A2B22] leading-tight truncate">
                      {item.bundle.name}
                    </h3>
                    {removeBundleFromCart && (
                      <button
                        onClick={() => removeBundleFromCart(index)}
                        className="text-[#D4CFC8] hover:text-red-400 transition-colors p-0.5 -mr-0.5 flex-shrink-0"
                      >
                        <Trash2 className="w-[15px] h-[15px]" />
                      </button>
                    )}
                  </div>
                  <p className="text-[12px] text-[#8B9E95] mt-0.5">
                    {item.slot_selections.length} items selected
                  </p>
                </div>
                <div className="flex justify-between items-center mt-1.5">
                  <span className="font-bold text-[17px] text-[#2A5A4A] tabular-nums">
                    ₱{item.totalPrice.toLocaleString()}
                  </span>
                  {updateBundleQuantity && (
                    <div className="flex items-center gap-0 rounded-full border border-[#E8E4DE] overflow-hidden">
                      <button
                        onClick={() => updateBundleQuantity(index, item.quantity - 1)}
                        className="w-8 h-8 flex items-center justify-center text-[#8B9E95] hover:bg-[#F4F0EB] active:bg-[#EBE7E1] transition-colors"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center font-semibold text-[14px] text-[#1A2B22] tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateBundleQuantity(index, item.quantity + 1)}
                        className="w-8 h-8 flex items-center justify-center text-[#8FB8A8] hover:bg-[#F0F7F4] active:bg-[#E0F0EA] transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
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
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-[#E8E4DE]/60 px-5 pt-4 pb-6 z-40">
        <div className="flex justify-between items-baseline mb-4">
          <span className="text-[#8B9E95] text-[14px]">
            Subtotal · {totalItems} {totalItems === 1 ? 'item' : 'items'}
          </span>
          <span className="font-bold text-[24px] text-[#1A2B22] tracking-tight tabular-nums">
            ₱{getTotalPrice().toLocaleString()}
          </span>
        </div>
        <button
          onClick={onCheckout}
          className="w-full py-4 bg-[#2A5A4A] text-[#FFF8E7] rounded-2xl text-[16px] font-semibold tracking-wide shadow-lg shadow-[#2A5A4A]/20 active:scale-[0.98] transition-transform"
        >
          Proceed to Checkout
        </button>
      </div>
    </div>
  );
}
