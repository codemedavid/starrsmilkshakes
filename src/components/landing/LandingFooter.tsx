import React from 'react';
import Link from 'next/link';
import { MENU_HREF } from './content';

const CURRENT_YEAR = new Date().getFullYear();

const FOOTER_COLUMNS = [
  {
    heading: 'Explore',
    links: [
      { label: 'Menu', href: MENU_HREF },
      { label: 'Locations', href: '#locations' },
      { label: 'Our Story', href: '#story' },
      { label: 'Parties', href: '/catering' },
    ],
  },
  {
    heading: 'Order',
    links: [
      { label: 'Order Now', href: MENU_HREF },
      { label: 'Make Your Own', href: '#build' },
      { label: 'Bestsellers', href: '#bestsellers' },
    ],
  },
  {
    heading: 'Follow',
    links: [
      { label: 'Instagram', href: 'https://www.instagram.com/starrsfamousshakes/' },
      { label: 'TikTok', href: 'https://www.tiktok.com/@starrsfamousshakes' },
      { label: 'Facebook', href: 'https://www.facebook.com/starrsfamousshakes' },
    ],
  },
];

const isExternal = (href: string) => href.startsWith('http');

const LandingFooter = () => (
  <footer>
    <div className="wrap">
      <div className="footer-top">
        <div className="footer-brand">
          <span className="logo-text">starr&apos;s</span>
          <p>Freshly churned, seriously thick milkshakes. Katipunan · Fairview · Marikina.</p>
        </div>

        {FOOTER_COLUMNS.map((column) => (
          <div className="footer-col" key={column.heading}>
            <h4>{column.heading}</h4>
            <ul>
              {column.links.map((link) => (
                <li key={link.label}>
                  {isExternal(link.href) ? (
                    <a href={link.href} target="_blank" rel="noopener noreferrer">
                      {link.label}
                    </a>
                  ) : (
                    <Link href={link.href}>{link.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="footer-bottom">
        <p>© {CURRENT_YEAR} Starr&apos;s Famous Shakes. All rights reserved.</p>
        <span className="footer-tag">Good Shakes, Brighter Days.</span>
      </div>
    </div>
  </footer>
);

export default LandingFooter;
