import React from 'react';
import Link from 'next/link';
import { SparkIcon } from '../icons';
import { HeroCup } from '../illustrations';
import { MENU_HREF } from '../content';

const HeroSection = () => (
  <section className="hero">
    <div className="wrap">
      <div className="hero-copy">
        <h1>More Than a Milkshake. It&apos;s a Mood.</h1>
        <p className="lede">Freshly churned. Seriously thick. Since 2009.</p>
        <div className="btn-row">
          <Link href={MENU_HREF} className="btn btn-primary">
            Order Now
          </Link>
          <a href="#menu" className="btn btn-outline">
            Explore the Menu
          </a>
        </div>
        <div className="hero-marks" aria-hidden="true">
          <span className="stripe-mark" />
          <span className="stripe-mark" />
          <span className="stripe-mark" />
        </div>
      </div>

      <div className="hero-art" aria-hidden="true">
        <div className="blob" />
        <span className="spark" style={{ top: '6%', left: '2%' }}>
          <SparkIcon />
        </span>
        <span className="spark" style={{ bottom: '10%', right: '-2%' }}>
          <SparkIcon />
        </span>
        <div className="cup-wrap">
          <HeroCup />
        </div>
        <span className="script hero-tag" style={{ position: 'absolute', bottom: '6%', left: 0 }}>
          Seriously Thick
        </span>
      </div>
    </div>
  </section>
);

export default HeroSection;
