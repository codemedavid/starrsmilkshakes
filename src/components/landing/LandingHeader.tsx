'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { BurgerIcon, CartIcon, CloseIcon, LogoMark, SearchIcon } from './icons';
import { MENU_HREF, NAV_LINKS } from './content';

interface LandingHeaderProps {
  cartItemsCount: number;
  onCartClick: () => void;
}

const LandingHeader = ({ cartItemsCount, onCartClick }: LandingHeaderProps) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <>
      <header>
        <nav className="nav">
          <Link href="/" className="logo" aria-label="Starr's Famous Shakes home">
            <LogoMark />
            <span>
              <span className="logo-text">starr&apos;s</span>{' '}
              <span className="logo-sub">famous shakes</span>
            </span>
          </Link>

          <ul className="nav-links">
            {NAV_LINKS.map((link) => (
              <li key={link.label}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>

          <div className="nav-actions">
            <Link href={MENU_HREF} className="icon-btn" aria-label="Search the menu">
              <SearchIcon />
            </Link>
            <button type="button" className="icon-btn" aria-label="Cart" onClick={onCartClick}>
              <CartIcon />
              {cartItemsCount > 0 && <span className="cart-count">{cartItemsCount}</span>}
            </button>
            <Link href={MENU_HREF} className="btn btn-primary btn-sm">
              Order Now
            </Link>
            <button
              type="button"
              className="icon-btn burger"
              aria-label="Open menu"
              aria-expanded={isMobileMenuOpen}
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <BurgerIcon />
            </button>
          </div>
        </nav>
      </header>

      <div className={`mobile-menu${isMobileMenuOpen ? ' open' : ''}`}>
        <div className="mm-top">
          <span className="logo-text">starr&apos;s</span>
          <button type="button" className="icon-btn" aria-label="Close menu" onClick={closeMobileMenu}>
            <CloseIcon />
          </button>
        </div>
        <ul>
          {NAV_LINKS.map((link) => (
            <li key={link.label}>
              <Link href={link.href} onClick={closeMobileMenu}>
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        <Link href={MENU_HREF} className="btn btn-primary" onClick={closeMobileMenu}>
          Order Now
        </Link>
      </div>
    </>
  );
};

export default LandingHeader;
