'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Menu from '@/components/Menu';
import FloatingCartButton from '@/components/FloatingCartButton';
import { useCartContext } from '@/contexts/CartContext';
import { useMenu } from '@/hooks/useMenu';
import { supabase } from '@/lib/supabase';
import type { Bundle } from '@/types/bundle';

const HomePage = () => {
  const router = useRouter();
  const cart = useCartContext();
  const { menuItems } = useMenu();
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-starrs-mint-light to-starrs-cream-light font-inter">
      <Header
        cartItemsCount={cart.getTotalItems()}
        onCartClick={() => router.push('/cart')}
        onMenuClick={() => router.push('/')}
      />
      <Menu
        menuItems={menuItems}
        bundles={bundles}
        addToCart={cart.addToCart}
        addBundleToCart={cart.addBundleToCart}
        cartItems={cart.cartItems}
        updateQuantity={cart.updateQuantity}
      />
      <FloatingCartButton
        itemCount={cart.getTotalItems()}
        onCartClick={() => router.push('/cart')}
      />
    </div>
  );
};

export default HomePage;
