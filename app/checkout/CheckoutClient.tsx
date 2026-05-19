'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCartContext } from '@/contexts/CartContext';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import * as fpixel from '@/lib/fpixel';
import CheckoutAccordion from '@/components/checkout/CheckoutAccordion';
import type { CartItem } from '@/types';

interface CheckoutClientProps {
  messengerCart: CartItem[] | null;
  messengerError: string | null;
  msession?: string;
}

export default function CheckoutClient({
  messengerCart,
  messengerError,
  msession,
}: CheckoutClientProps) {
  const router = useRouter();
  const cart = useCartContext();
  const { siteSettings } = useSiteSettings();
  const hasTrackedCheckout = useRef(false);
  const [sessionLoaded, setSessionLoaded] = useState(!messengerCart);

  // Load pre-fetched messenger cart into context
  useEffect(() => {
    if (messengerCart && !sessionLoaded) {
      cart.loadFromMessengerSession(messengerCart);
      setSessionLoaded(true);
    }
  }, [messengerCart, cart, sessionLoaded]);

  // Track InitiateCheckout on page load (only once)
  useEffect(() => {
    if (cart.cartItems.length > 0 && !hasTrackedCheckout.current) {
      hasTrackedCheckout.current = true;
      const currency = siteSettings?.currency_code || 'PHP';
      const contentIds = cart.cartItems.map((item) => item.id);
      fpixel.trackInitiateCheckout(
        cart.getTotalPrice(),
        currency,
        cart.getTotalItems(),
        contentIds
      );
    }
  }, [cart, siteSettings?.currency_code]);

  // Redirect to menu if cart is empty (not during messenger load)
  useEffect(() => {
    if (
      !msession &&
      cart.cartItems.length === 0 &&
      (cart.bundleItems?.length ?? 0) === 0
    ) {
      router.push('/');
    }
  }, [cart.cartItems.length, cart.bundleItems?.length, router, msession]);

  // Messenger error state
  if (messengerError) {
    return (
      <div className="min-h-screen bg-starrs-linen flex items-center justify-center">
        <div className="text-center max-w-sm mx-auto p-6">
          <p className="text-red-600 font-semibold mb-4">{messengerError}</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2 bg-starrs-sage text-starrs-cream-brand rounded-xl"
          >
            Go to Menu
          </button>
        </div>
      </div>
    );
  }

  // Brief loading while messenger cart loads into context
  if (!sessionLoaded) {
    return (
      <div className="min-h-screen bg-starrs-linen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-starrs-sage mx-auto mb-4" />
          <p className="text-starrs-muted">Loading your order...</p>
        </div>
      </div>
    );
  }

  // Empty cart redirect state
  if (cart.cartItems.length === 0 && (cart.bundleItems?.length ?? 0) === 0) {
    return (
      <div className="min-h-screen bg-starrs-linen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-starrs-sage mx-auto mb-4" />
          <p className="text-starrs-muted">Redirecting to menu...</p>
        </div>
      </div>
    );
  }

  return (
    <CheckoutAccordion
      cartItems={cart.cartItems}
      bundleItems={cart.bundleItems ?? []}
      totalPrice={cart.getTotalPrice()}
      onBack={() => router.push('/cart')}
      msession={msession}
    />
  );
}
