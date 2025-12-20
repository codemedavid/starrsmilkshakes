'use client';

import React from 'react';
import Header from '@/components/Header';
import Menu from '@/components/Menu';
import Cart from '@/components/Cart';
import Checkout from '@/components/Checkout';
import FloatingCartButton from '@/components/FloatingCartButton';
import MetaPixel from '@/components/MetaPixel';
import { useCart } from '@/hooks/useCart';
import { useMenu } from '@/hooks/useMenu';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { trackInitiateCheckout } from '@/lib/meta-pixel';

const HomePage = () => {
  const cart = useCart();
  const { menuItems } = useMenu();
  const { siteSettings } = useSiteSettings();
  const [currentView, setCurrentView] = React.useState<'menu' | 'cart' | 'checkout'>('menu');

  const handleViewChange = (view: 'menu' | 'cart' | 'checkout') => {
    // Track InitiateCheckout when transitioning to checkout
    if (view === 'checkout' && currentView !== 'checkout') {
      const currency = siteSettings?.currency_code || 'PHP';
      const contentIds = cart.cartItems.map(item => item.id);
      trackInitiateCheckout(
        cart.getTotalPrice(),
        currency,
        cart.getTotalItems(),
        contentIds
      );
    }
    setCurrentView(view);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-starrs-mint-light to-starrs-cream-light font-inter">
      <MetaPixel />
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
          onCheckout={() => handleViewChange('checkout')}
        />
      )}
      {currentView === 'checkout' && (
        <Checkout
          cartItems={cart.cartItems}
          totalPrice={cart.getTotalPrice()}
          onBack={() => handleViewChange('cart')}
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

