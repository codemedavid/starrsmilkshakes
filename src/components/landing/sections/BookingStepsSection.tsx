import React from 'react';
import { BOOKING_STEPS, PRICING_FINE_PRINT, STARTING_PACKAGE_PRICE } from '../partyContent';

const BookingStepsSection = () => (
  <section className="section-alt" id="book">
    <div className="wrap">
      <div className="section-head center">
        <p className="eyebrow">Book Your Event</p>
        <h2>Party Planning in 3 Easy Steps.</h2>
      </div>

      <div className="steps-grid">
        {BOOKING_STEPS.map((step, index) => (
          <div className="step-card" key={step.title}>
            <div className="step-num">{index + 1}</div>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
            <div className="fee-line">
              {step.footnote}
              {'footnoteEmail' in step && (
                <>
                  {' '}
                  <a href={`mailto:${step.footnoteEmail}`}>{step.footnoteEmail}</a> to inquire.
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="price-banner">
        <div>
          <div className="label">Starting Package</div>
          <div className="amount">{STARTING_PACKAGE_PRICE}</div>
        </div>
        <div className="fine">{PRICING_FINE_PRINT}</div>
      </div>
    </div>
  </section>
);

export default BookingStepsSection;
