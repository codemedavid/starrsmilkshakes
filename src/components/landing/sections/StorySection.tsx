import React from 'react';
import { StoryScene } from '../illustrations';

const StorySection = () => (
  <section className="section-alt" id="story">
    <div className="wrap story">
      <div className="story-copy">
        <h2>Shaking Things Up Since 2009.</h2>
        <p>Starr&apos;s started with one simple obsession: make really good, seriously thick milkshakes.</p>
        <p>
          Years later, we&apos;re still freshly churning, blending and making the kind of shakes you meet friends over,
          take on late-afternoon drives, and suddenly crave again tomorrow.
        </p>
        <p className="callout">Some things never go out of style. Especially a good milkshake.</p>
      </div>

      <div className="story-art" aria-hidden="true">
        <div className="frame">
          <StoryScene />
        </div>
        <span className="script story-tag">Since 2009</span>
      </div>
    </div>
  </section>
);

export default StorySection;
