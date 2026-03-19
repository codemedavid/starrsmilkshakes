'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCartContext } from '@/contexts/CartContext';
import Cart from '@/components/Cart';

export default function CartPage() {
  const router = useRouter();
  const {
    cartItems,
    bundleItems,
    updateQuantity,
    removeFromCart,
    removeBundleFromCart,
    updateBundleQuantity,
    clearCart,
    getTotalPrice,
    getTotalItems,
  } = useCartContext();

  // Redirect to menu if cart is empty
  useEffect(() => {
    if (cartItems.length === 0 && bundleItems.length === 0) {
      // Small delay so user sees the empty state briefly
      const timer = setTimeout(() => router.push('/'), 2000);
      return () => clearTimeout(timer);
    }
  }, [cartItems.length, bundleItems.length, router]);

  return (
    <>
      <Cart
        cartItems={cartItems}
        bundleItems={bundleItems}
        updateQuantity={updateQuantity}
        removeFromCart={removeFromCart}
        removeBundleFromCart={removeBundleFromCart}
        updateBundleQuantity={updateBundleQuantity}
        clearCart={clearCart}
        getTotalPrice={getTotalPrice}
        onContinueShopping={() => router.push('/')}
        onCheckout={() => router.push('/checkout')}
      />
    </>
  );
}
