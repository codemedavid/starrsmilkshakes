import React from 'react';

const STROKE_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
} as const;

export const SearchIcon = () => (
  <svg {...STROKE_PROPS}>
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

export const CartIcon = () => (
  <svg {...STROKE_PROPS}>
    <path d="M6 6h15l-1.5 9h-12z" />
    <circle cx="9" cy="20" r="1" />
    <circle cx="17" cy="20" r="1" />
    <path d="M6 6L4 2H2" />
  </svg>
);

export const BurgerIcon = () => (
  <svg {...STROKE_PROPS}>
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

export const CloseIcon = () => (
  <svg {...STROKE_PROPS}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const ArrowRightIcon = () => (
  <svg {...STROKE_PROPS}>
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

export const ChurnIcon = () => (
  <svg {...STROKE_PROPS}>
    <path d="M4 10 C4 6 8 3 12 3 C16 3 20 6 20 10 C20 14 16 15 12 15 C8 15 4 14 4 10 Z" />
    <path d="M6 15 L7 20 L17 20 L18 15" />
  </svg>
);

export const ThickIcon = () => (
  <svg {...STROKE_PROPS}>
    <path d="M9 3h6l1 5-3 3v8a2 2 0 0 1-4 0v-8l-3-3z" />
  </svg>
);

export const MoodIcon = () => (
  <svg {...STROKE_PROPS}>
    <circle cx="12" cy="12" r="8" />
    <path d="M9 14 Q12 17 15 14" />
    <line x1="9" y1="10" x2="9" y2="10.5" />
    <line x1="15" y1="10" x2="15" y2="10.5" />
  </svg>
);

export const SparkIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
  </svg>
);

export const StarIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor">
    <path d="M10 1l2.6 5.9 6.4.6-4.8 4.3 1.4 6.3L10 15l-5.6 3.1L5.8 11.8 1 7.5l6.4-.6z" />
  </svg>
);

export const LogoMark = () => (
  <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <path
      d="M20 2 L23 15 L36 12 L25 20 L36 28 L23 25 L20 38 L17 25 L4 28 L15 20 L4 12 L17 15 Z"
      fill="#147C77"
    />
  </svg>
);

export const InstagramIcon = () => (
  <svg {...STROKE_PROPS}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1" />
  </svg>
);
