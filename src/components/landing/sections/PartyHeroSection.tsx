import React from 'react';
import { PartyCart } from '../illustrations';

const PartyHeroSection = () => (
  <section className="party-hero">
    <div className="wrap">
      <div>
        <p className="eyebrow">Party Catering</p>
        <h1>Bring Starr&apos;s To Your Party.</h1>
        <p className="lede" style={{ margin: '18px 0 30px' }}>
          Freshly churned shakes and mmunchies, carted straight to your celebration. Good moods,
          made mobile.
        </p>
        <div className="btn-row">
          <a href="#book" className="btn btn-primary">
            Book Your Event
          </a>
          <a href="#party-menu" className="btn btn-outline">
            See the Party Menu
          </a>
        </div>
      </div>

      <div className="party-art" aria-hidden="true">
        <div className="blob" />
        <PartyCart />
      </div>
    </div>
  </section>
);

export default PartyHeroSection;
