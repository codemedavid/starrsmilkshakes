'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Menu from '@/components/Menu';
import Cart from '@/components/Cart';
import FloatingCartButton from '@/components/FloatingCartButton';
import { useCartContext } from '@/contexts/CartContext';
import { useMenu } from '@/hooks/useMenu';
import { supabase } from '@/lib/supabase';
import type { Bundle } from '@/types/bundle';

const HomePage = () => {
  const router = useRouter();
  const cart = useCartContext();
  const { menuItems } = useMenu();
  const [currentView, setCurrentView] = React.useState<'menu' | 'cart'>('menu');
  const [bundles, setBundles] = useState<Bundle[]>([]);

  const fetchBundles = useCallback(async () => {
    const { data } = await (supabase.from('bundles') as any)
      .select(`
        *,
        slots:bundle_slots (
          *,
          items:bundle_slot_items (
            *,
            menu_item:menu_items (
              *,
              variations (*),
              add_ons (*)
            )
          )
        )
      `)
      .eq('available', true)
      .order('sort_order', { ascending: true });

    if (data) setBundles(data as Bundle[]);
  }, []);

  useEffect(() => {
    void fetchBundles();
  }, [fetchBundles]);

  // Handle URL-based view switching (e.g., /?view=cart)
  useEffect(() => {
    const syncViewFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      setCurrentView(params.get('view') === 'cart' ? 'cart' : 'menu');
    };

    syncViewFromUrl();
    window.addEventListener('popstate', syncViewFromUrl);
    return () => window.removeEventListener('popstate', syncViewFromUrl);
  }, []);

  const handleViewChange = (view: 'menu' | 'cart') => {
    if (view === 'cart') {
      router.push('/?view=cart');
    } else {
      router.push('/');
    }
    setCurrentView(view);
  };

  const handleCheckout = () => {
    router.push('/checkout');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-starrs-mint-light to-starrs-cream-light font-inter">
      <Header
        cartItemsCount={cart.getTotalItems()}
        onCartClick={() => handleViewChange('cart')}
        onMenuClick={() => handleViewChange('menu')}
      />
      {currentView === 'menu' && (
        <Menu
          menuItems={menuItems}
          bundles={bundles}
          addToCart={cart.addToCart}
          addBundleToCart={cart.addBundleToCart}
          cartItems={cart.cartItems}
          updateQuantity={cart.updateQuantity}
        />
      )}
      {currentView === 'cart' && (
        <Cart
          cartItems={cart.cartItems}
          updateQuantity={cart.updateQuantity}
          removeFromCart={cart.removeFromCart}
          clearCart={cart.clearCart}
          getTotalPrice={cart.getTotalPrice}
          onContinueShopping={() => handleViewChange('menu')}
          onCheckout={handleCheckout}
        />
      )}
      {currentView === 'menu' && (
        <FloatingCartButton
          itemCount={cart.getTotalItems()}
          onCartClick={() => handleViewChange('cart')}
        />
      )}
    </div>
  );
};

export default HomePage;
