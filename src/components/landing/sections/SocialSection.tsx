import React from 'react';
import { InstagramIcon, StarIcon } from '../icons';
import { TestimonialCup } from '../illustrations';
import { SOCIAL_HANDLE, TESTIMONIALS } from '../content';

const STAR_COUNT = 5;
const INSTAGRAM_URL = 'https://www.instagram.com/starrsfamousshakes/';

const SocialSection = () => (
  <section id="social">
    <div className="wrap">
      <div className="social-head">
        <div>
          <h2>Apparently, We&apos;re Not the Only Ones Obsessed.</h2>
          <div className="social-handle" style={{ marginTop: '14px' }}>
            <span>{SOCIAL_HANDLE}</span>
          </div>
        </div>
        <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
          Follow Us
        </a>
      </div>

      <div className="testimonial-row">
        {TESTIMONIALS.map((testimonial) => (
          <div className="t-card" key={testimonial.handle}>
            <div className="t-photo" style={{ background: testimonial.photoColor }}>
              <TestimonialCup />
              <span className="ig" aria-hidden="true">
                <InstagramIcon />
              </span>
            </div>
            <div className="t-body">
              <div className="t-quote">{testimonial.quote}</div>
              <div className="stars" aria-label="5 out of 5 stars">
                {Array.from({ length: STAR_COUNT }, (_, index) => (
                  <StarIcon key={index} />
                ))}
              </div>
              <div className="t-handle">{testimonial.handle}</div>
            </div>
          </div>
        ))}
      </div>

      <p className="script center" style={{ marginTop: '40px' }}>
        Real People, Really Good Shakes.
      </p>
    </div>
  </section>
);

export default SocialSection;
