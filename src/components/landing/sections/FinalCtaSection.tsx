import React from 'react';
import Link from 'next/link';
import { TrioCup } from '../illustrations';
import { MENU_HREF } from '../content';

const TRIO_CUPS = [
  { swirl: '#EFE6D7', topping: 'crumbles' as const, isMiddle: false },
  { swirl: '#F6A6AE', topping: 'none' as const, isMiddle: true },
  { swirl: '#F8F1E3', topping: 'cherry' as const, isMiddle: false },
];

const FinalCtaSection = () => (
  <section className="final" id="order">
    <div className="wrap">
      <h2>Good Moods Get Shaken Here.</h2>
      <p className="lede">Freshly churned. Seriously thick.</p>
      <div className="btn-row">
        <Link href={MENU_HREF} className="btn btn-primary">
          Order Now
        </Link>
        <a href="#menu" className="btn btn-outline">
          View Full Menu
        </a>
      </div>
      <p className="script">Your happy place in a cup.</p>

      <div className="final-trio" aria-hidden="true">
        {TRIO_CUPS.map((cup, index) => (
          <div className={`cup-wrap${cup.isMiddle ? ' mid' : ''}`} key={index}>
            <TrioCup swirl={cup.swirl} topping={cup.topping} />
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default FinalCtaSection;
