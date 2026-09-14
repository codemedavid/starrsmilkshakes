import React from 'react';
import Link from 'next/link';
import { ProductCup } from '../illustrations';
import { BESTSELLER_STYLES, MENU_HREF } from '../content';
import type { MenuItem } from '@/types';

const BESTSELLER_COUNT = 4;

/** Shown before the menu loads, or if the catalog has no available items. */
const FALLBACK_ITEMS = [
  { id: 'oreo-mallows', name: 'Oreo Mallows', description: 'Cookies, cream and marshmallow bliss.', price: 155 },
  { id: 'oreo-pancake', name: 'Oreo Pancake', description: 'Classic cookies with pancake goodness.', price: 155 },
  { id: 'strawberry-cheesecake', name: 'Strawberry Cheesecake', description: 'Sweet strawberries and creamy cheesecake.', price: 155 },
  { id: 'pistachio', name: 'Pistachio', description: 'Rich, nutty and unforgettable.', price: 155 },
];

interface Bestseller {
  id: string;
  name: string;
  description: string;
  price: number;
  href: string;
}

const toBestseller = (item: MenuItem): Bestseller => ({
  id: item.id,
  name: item.name,
  description: item.description,
  price: item.effectivePrice ?? item.basePrice,
  href: `/product/${item.id}`,
});

/** Popular items first, then whatever else is available, capped at four. */
const selectBestsellers = (menuItems: MenuItem[]): Bestseller[] => {
  const available = menuItems.filter((item) => item.available !== false);
  if (available.length === 0) {
    return FALLBACK_ITEMS.map((item) => ({ ...item, href: MENU_HREF }));
  }

  const popular = available.filter((item) => item.popular);
  const rest = available.filter((item) => !item.popular);

  return [...popular, ...rest].slice(0, BESTSELLER_COUNT).map(toBestseller);
};

const formatPrice = (price: number) => `₱${Math.round(price).toLocaleString('en-PH')}`;

const BestsellersSection = ({ menuItems }: { menuItems: MenuItem[] }) => {
  const bestsellers = selectBestsellers(menuItems);

  return (
    <section id="bestsellers">
      <div className="wrap">
        <div className="section-head center">
          <h2>Start With the Starr&apos;s Favorites.</h2>
          <p className="lede" style={{ margin: '14px auto 0' }}>
            New here? These are a very good place to start.
          </p>
        </div>

        <div className="cards-grid">
          {bestsellers.map((item, index) => {
            const style = BESTSELLER_STYLES[index % BESTSELLER_STYLES.length];

            return (
              <div className="product-card" key={item.id}>
                <span className={`badge ${style.badgeClass}`}>{style.badge}</span>
                <div className="pc-art">
                  <ProductCup swirl={style.swirl} toppings={style.toppings} />
                </div>
                <div className="pc-name">{item.name}</div>
                <p className="pc-desc">{item.description}</p>
                <div className="pc-price">{formatPrice(item.price)}</div>
                <Link href={item.href} className={`btn ${style.buttonClass} btn-sm pc-cta`}>
                  Add to Order
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default BestsellersSection;
