'use client';

import React, { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import Menu from '@/components/Menu';
import Cart from '@/components/Cart';
import FloatingCartButton from '@/components/FloatingCartButton';
import { useCartContext } from '@/contexts/CartContext';
import { useMenu } from '@/hooks/useMenu';

const HomePage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cart = useCartContext();
  const { menuItems } = useMenu();
  const [currentView, setCurrentView] = React.useState<'menu' | 'cart'>('menu');

  // Handle URL-based view switching (e.g., /?view=cart)
  useEffect(() => {
    const view = searchParams.get('view');
    if (view === 'cart') {
      setCurrentView('cart');
    }
  }, [searchParams]);

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
          addToCart={cart.addToCart}
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
