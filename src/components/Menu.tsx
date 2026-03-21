'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { MenuItem, CartItem } from '../types';
import type { Bundle, SlotSelection } from '../types/bundle';
import { useCategories } from '../hooks/useCategories';
import MenuItemCard from './MenuItemCard';
import MobileNav from './MobileNav';

// Preload images for better performance
const preloadImages = (items: MenuItem[]) => {
  items.forEach(item => {
    if (item.image) {
      const img = new Image();
      img.src = item.image;
    }
  });
};

interface MenuProps {
  menuItems: MenuItem[];
  bundles?: Bundle[];
  addToCart: (item: MenuItem, quantity?: number, variation?: any, addOns?: any[]) => void;
  addBundleToCart: (bundle: Bundle, selections: SlotSelection[], totalPrice: number) => void;
  cartItems: CartItem[];
  updateQuantity: (id: string, quantity: number) => void;
}

const Menu: React.FC<MenuProps> = ({ menuItems, bundles = [], addToCart, addBundleToCart, cartItems, updateQuantity }) => {
  const { categories } = useCategories();
  const router = useRouter();
  const [activeCategory, setActiveCategory] = React.useState('hot-coffee');

  // Preload images when menu items change
  React.useEffect(() => {
    if (menuItems.length > 0) {
      // Preload images for visible category first
      const visibleItems = menuItems.filter(item => item.category === activeCategory);
      preloadImages(visibleItems);

      // Then preload other images after a short delay
      setTimeout(() => {
        const otherItems = menuItems.filter(item => item.category !== activeCategory);
        preloadImages(otherItems);
      }, 1000);
    }
  }, [menuItems, activeCategory]);

  const handleCategoryClick = (categoryId: string) => {
    setActiveCategory(categoryId);
    const element = document.getElementById(categoryId);
    if (element) {
      const headerHeight = 64; // Header height (h-16)
      const mobileNavHeight = 60; // Mobile nav height
      const offset = headerHeight + mobileNavHeight + 10; // Extra padding
      const elementPosition = element.offsetTop - offset;

      window.scrollTo({
        top: elementPosition,
        behavior: 'smooth'
      });
    }
  };

  React.useEffect(() => {
    if (categories.length > 0) {
      // Set default to dim-sum if it exists, otherwise first category
      const defaultCategory = categories.find(cat => cat.id === 'dim-sum') || categories[0];
      if (!categories.find(cat => cat.id === activeCategory)) {
        setActiveCategory(defaultCategory.id);
      }
    }
  }, [categories, activeCategory]);

  React.useEffect(() => {
    const handleScroll = () => {
      const sections = categories.map(cat => document.getElementById(cat.id)).filter(Boolean);
      const scrollPosition = window.scrollY + 200;

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        if (section && section.offsetTop <= scrollPosition) {
          setActiveCategory(categories[i].id);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [categories]);

  return (
    <>
      <MobileNav
        activeCategory={activeCategory}
        onCategoryClick={handleCategoryClick}
      />
      <main className="max-w-7xl mx-auto px-4 py-6 md:py-12">
      <div className="text-center mb-6 md:mb-12">
        <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-starrs-teal-dark mb-2 md:mb-4" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>Our Menu</h2>
        <p className="text-sm sm:text-base md:text-lg text-starrs-teal-dark/80 max-w-2xl mx-auto font-medium px-2">
          Discover our premium milkshakes, decadent bake & shake creations, and refreshing yogurt-based options,
          all crafted with the finest ingredients.
        </p>
      </div>

      {/* Bundles section */}
      {bundles.length > 0 && (
        <section id="bundles" className="mb-8 md:mb-16">
          <div className="flex items-center mb-4 md:mb-8">
            <span className="text-3xl md:text-4xl mr-3 md:mr-4">🎁</span>
            <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-starrs-teal-dark" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>Combos & Bundles</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {bundles.filter(b => b.available).map(bundle => (
              <button
                key={bundle.id}
                onClick={() => router.push(`/bundle/${bundle.id}/customize`)}
                className="relative flex flex-col bg-white rounded-2xl overflow-hidden shadow-sm border border-stone-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 text-left"
              >
                {/* Combo badge */}
                <span className="absolute top-2 left-2 z-10 inline-flex items-center px-2 py-0.5 rounded-full bg-[#7BBFB5] text-white text-xs font-nunito font-semibold">
                  Combo
                </span>
                {bundle.popular && (
                  <span className="absolute top-2 right-2 z-10 inline-flex items-center px-2 py-0.5 rounded-full bg-amber-400 text-white text-xs font-nunito font-semibold">
                    Popular
                  </span>
                )}
                {bundle.image_url ? (
                  <img
                    src={bundle.image_url}
                    alt={bundle.name}
                    className="w-full aspect-square object-cover"
                  />
                ) : (
                  <div className="w-full aspect-square bg-gradient-to-br from-[#7BBFB5]/20 to-[#3D8A80]/10 flex items-center justify-center">
                    <span className="text-4xl">🎁</span>
                  </div>
                )}
                <div className="p-3 flex flex-col gap-1 flex-1">
                  <p className="font-semibold text-stone-900 text-sm leading-tight line-clamp-2">{bundle.name}</p>
                  {bundle.description && (
                    <p className="text-xs text-stone-400 line-clamp-2">{bundle.description}</p>
                  )}
                  <div className="mt-auto pt-2 flex items-center justify-between">
                    <span className="font-bold text-[#3D8A80] text-sm">₱{bundle.base_price.toFixed(0)}</span>
                    {bundle.discount_active && bundle.discount_price !== null && (
                      <span className="text-xs text-stone-400 line-through">₱{bundle.discount_price.toFixed(0)}</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {categories.map((category) => {
        const categoryItems = menuItems.filter(item => item.category === category.id);

        if (categoryItems.length === 0) return null;

        return (
          <section key={category.id} id={category.id} className="mb-8 md:mb-16">
            <div className="flex items-center mb-4 md:mb-8">
              <span className="text-3xl md:text-4xl mr-3 md:mr-4">{category.icon}</span>
              <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-starrs-teal-dark" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>{category.name}</h3>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {categoryItems.map((item) => {
                const cartItem = cartItems.find(cartItem => cartItem.id === item.id);
                return (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    onAddToCart={addToCart}
                    quantity={cartItem?.quantity || 0}
                    onUpdateQuantity={updateQuantity}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
      </main>

    </>
  );
};

export default Menu;
