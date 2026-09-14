import React from 'react';
import Link from 'next/link';
import { ArrowRightIcon } from '../icons';
import { MoodCup } from '../illustrations';
import { MENU_HREF, MOOD_STYLES } from '../content';
import type { Category } from '@/types';

const MOOD_COUNT = 5;

/** Categories have no tagline column, so known names keep the reference copy. */
const MOOD_SUBTITLES: Record<string, string> = {
  "starr's classics": 'The ones that started it all.',
  classics: 'The ones that started it all.',
  'oreo obsessed': 'You know who you are.',
  oreo: 'You know who you are.',
  'bake & shake': 'Dessert decided to go all in.',
  'fruity + yogurt': 'Our slightly healthier sister.',
  fruity: 'Our slightly healthier sister.',
  'snack attack': 'Corndogs, fries & friends.',
  snacks: 'Corndogs, fries & friends.',
};

const FALLBACK_MOODS = [
  { id: 'classics', name: "Starr's Classics" },
  { id: 'oreo', name: 'Oreo Obsessed' },
  { id: 'bake-shake', name: 'Bake & Shake' },
  { id: 'fruity', name: 'Fruity + Yogurt' },
  { id: 'snacks', name: 'Snack Attack' },
];

const subtitleFor = (name: string) => MOOD_SUBTITLES[name.trim().toLowerCase()] ?? `A little something for every ${name.toLowerCase()} mood.`;

const MoodSection = ({ categories }: { categories: Category[] }) => {
  const moods = categories.length > 0 ? categories.slice(0, MOOD_COUNT) : FALLBACK_MOODS;

  return (
    <section id="menu">
      <div className="wrap">
        <div className="section-head center">
          <h2>What Mood Are You In?</h2>
          <p className="lede" style={{ margin: '14px auto 0' }}>
            Great shakes. Bolder days. Explore our menu by mood.
          </p>
        </div>

        <div className="mood-grid">
          {moods.map((mood, index) => {
            const style = MOOD_STYLES[index % MOOD_STYLES.length];

            return (
              <Link href={`${MENU_HREF}#${mood.id}`} className={`mood-card ${style.cardClass}`} key={mood.id}>
                <div className="pc-art">
                  <MoodCup swirl={style.swirl} corndog={style.corndog} />
                </div>
                <div className="mood-name">{mood.name}</div>
                <div className="mood-sub">{subtitleFor(mood.name)}</div>
                <span className="mood-arrow" aria-hidden="true">
                  <ArrowRightIcon />
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default MoodSection;
