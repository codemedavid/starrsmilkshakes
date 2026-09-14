import React from 'react';
import Link from 'next/link';
import { MakeYourOwnCup } from '../illustrations';
import { INGREDIENTS, MENU_HREF } from '../content';

const MakeYourOwnSection = () => (
  <section className="section-alt" id="build">
    <div className="wrap myo">
      <div className="myo-copy">
        <h2>Your Shake. Your Rules.</h2>
        <p className="lede">Pick your base. Add your favorites. Make something very you.</p>
        <Link href={MENU_HREF} className="btn btn-primary">
          Make Your Own
        </Link>
      </div>

      <div className="myo-art" aria-hidden="true">
        <div className="blob" />
        <div className="cup-wrap">
          <MakeYourOwnCup />
        </div>
        {INGREDIENTS.map((ingredient) => (
          <span className={`ingredient ${ingredient.positionClass}`} key={ingredient.label}>
            <span
              className="dot"
              style={{
                background: ingredient.dotColor,
                border: ingredient.outlined ? '1px solid rgba(58,35,23,0.12)' : undefined,
              }}
            />
            {ingredient.label}
          </span>
        ))}
      </div>
    </div>
  </section>
);

export default MakeYourOwnSection;
