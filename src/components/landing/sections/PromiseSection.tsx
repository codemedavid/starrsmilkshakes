import React from 'react';
import { ChurnIcon, MoodIcon, ThickIcon } from '../icons';
import { PromiseCup } from '../illustrations';

const PROMISE_POINTS = [
  { Icon: ChurnIcon, title: 'Freshly Churned', sub: 'Made in-store.' },
  { Icon: ThickIcon, title: 'Seriously Thick', sub: "The Starr's way." },
  { Icon: MoodIcon, title: 'Made to Your Mood', sub: 'Mix, match, make it yours.' },
];

const PromiseSection = () => (
  <section className="section-alt" id="promise">
    <div className="wrap promise">
      <div className="promise-copy">
        <p className="eyebrow">Why Starr&apos;s?</p>
        <h2>
          Freshly churned.
          <br />
          Thick by nature.
        </h2>
        <p className="lede">
          We freshly churn our ice cream in-store, then blend it into the thick milkshakes Starr&apos;s has been known for
          since 2009.
        </p>
        <div className="promise-points">
          {PROMISE_POINTS.map(({ Icon, title, sub }) => (
            <div className="point" key={title}>
              <div className="point-icon">
                <Icon />
              </div>
              <div className="point-title">{title}</div>
              <div className="point-sub">{sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="promise-art" aria-hidden="true">
        <div className="blob" />
        <div className="cup-wrap">
          <PromiseCup />
        </div>
        <span className="script" style={{ position: 'absolute', bottom: '2%', right: '-2%' }}>
          Thick Happens
          <br />
          Here
        </span>
      </div>
    </div>
  </section>
);

export default PromiseSection;
