import React from 'react';
import { ArrowRightIcon } from '../icons';
import { LOCATIONS } from '../content';

const LocationsSection = () => (
  <section className="section-alt" id="locations">
    <div className="wrap visit">
      <div className="visit-info">
        <h2>Find Your Happy Place.</h2>
        <p className="visit-hours">Open daily • 11:00 AM–9:00 PM</p>
        <p className="script visit-quote">
          Good Shakes Bring
          <br />
          People Together
        </p>
      </div>

      <div className="loc-grid">
        {LOCATIONS.map((location) => (
          <div className={`loc-card${location.comingSoon ? ' full' : ''}`} key={location.name}>
            <div className="loc-photo" style={{ background: location.gradient }}>
              <div className="loc-logo" style={location.comingSoon ? { color: 'var(--brown)' } : undefined}>
                starr&apos;s
                <small style={location.comingSoon ? { color: 'var(--brown-soft)' } : undefined}>
                  famous shakes{location.comingSoon ? ' — Marikina' : ''}
                </small>
              </div>
              {location.comingSoon && <span className="soon-badge">Coming Soon</span>}
            </div>
            <div className="loc-body">
              <div>
                <div className="loc-name">{location.name}</div>
                <div className="loc-area">{location.area}</div>
              </div>
              <span className="loc-link" aria-hidden="true">
                <ArrowRightIcon />
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default LocationsSection;
