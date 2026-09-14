import React from 'react';

/** Cup illustrations ported from the reference design. */

export const HeroCup = () => (
  <svg viewBox="0 0 300 380" aria-hidden="true">
    <ellipse cx="150" cy="120" rx="88" ry="34" fill="#F6A6AE" />
    <path
      d="M150 30 C 175 30 190 60 185 85 C 210 95 220 110 205 122 C 220 128 210 145 190 145 L 110 145 C 90 145 80 128 95 122 C 80 110 90 95 115 85 C 110 60 125 30 150 30 Z"
      fill="#F6A6AE"
    />
    <path
      d="M78 140 L 222 140 L 205 350 C 204 360 196 366 186 366 L 114 366 C 104 366 96 360 95 350 Z"
      fill="#F8F1E3"
      stroke="#3A2317"
      strokeWidth="2"
    />
    <text x="150" y="197" textAnchor="middle" fontFamily="Fraunces, serif" fontWeight="700" fontSize="32" fill="#147C77">
      starr&apos;s
    </text>
    <text x="150" y="216" textAnchor="middle" fontFamily="Work Sans, sans-serif" fontSize="11" letterSpacing="1" fill="#147C77">
      FAMOUS SHAKES
    </text>
    <rect x="98" y="228" width="16" height="112" rx="4" fill="#147C77" />
    <rect x="132" y="228" width="16" height="112" rx="4" fill="#147C77" />
    <rect x="166" y="228" width="16" height="112" rx="4" fill="#147C77" />
    <rect x="200" y="228" width="14" height="102" rx="4" fill="#147C77" />
  </svg>
);

export const PromiseCup = () => (
  <svg viewBox="0 0 300 380" aria-hidden="true">
    <path
      d="M150 25 C 178 25 195 55 188 82 C 215 92 226 112 205 122 C 222 130 208 148 186 148 L 114 148 C 92 148 78 130 95 122 C 74 112 85 92 112 82 C 105 55 122 25 150 25 Z"
      fill="#EFE6D7"
    />
    <circle cx="120" cy="55" r="10" fill="#4A2C1A" />
    <circle cx="150" cy="42" r="10" fill="#4A2C1A" />
    <circle cx="178" cy="58" r="10" fill="#4A2C1A" />
    <path
      d="M78 143 L 222 143 L 205 353 C 204 363 196 369 186 369 L 114 369 C 104 369 96 363 95 353 Z"
      fill="#F8F1E3"
      stroke="#3A2317"
      strokeWidth="2"
    />
    <text x="150" y="200" textAnchor="middle" fontFamily="Fraunces, serif" fontWeight="700" fontSize="32" fill="#147C77">
      starr&apos;s
    </text>
    <rect x="98" y="231" width="16" height="112" rx="4" fill="#147C77" />
    <rect x="132" y="231" width="16" height="112" rx="4" fill="#147C77" />
    <rect x="166" y="231" width="16" height="112" rx="4" fill="#147C77" />
    <rect x="200" y="231" width="14" height="102" rx="4" fill="#147C77" />
  </svg>
);

/** Product-card cup. `toppings` adds the cookie-crumble dots of the first card. */
export const ProductCup = ({ swirl, toppings = false }: { swirl: string; toppings?: boolean }) => (
  <svg viewBox="0 0 160 170" aria-hidden="true">
    <ellipse cx="80" cy="34" rx="46" ry="16" fill={swirl} />
    {toppings && (
      <>
        <circle cx="60" cy="20" r="9" fill="#3A2317" />
        <circle cx="80" cy="14" r="9" fill="#3A2317" />
        <circle cx="100" cy="22" r="9" fill="#3A2317" />
      </>
    )}
    <path
      d="M40 34 L120 34 L110 160 C109 165 105 168 100 168 L60 168 C55 168 51 165 50 160 Z"
      fill="#F8F1E3"
      stroke="#3A2317"
      strokeWidth="1.5"
    />
    <rect x="52" y="55" width="9" height="90" rx="3" fill="#147C77" />
    <rect x="70" y="55" width="9" height="90" rx="3" fill="#147C77" />
    <rect x="88" y="55" width="9" height="90" rx="3" fill="#147C77" />
    <rect x="106" y="55" width="8" height="82" rx="3" fill="#147C77" />
  </svg>
);

/** Mood-card cup. `corndog` swaps in the Snack Attack illustration. */
export const MoodCup = ({ swirl, corndog = false }: { swirl: string; corndog?: boolean }) => {
  if (corndog) {
    return (
      <svg viewBox="0 0 120 110" aria-hidden="true">
        <rect x="34" y="30" width="52" height="66" rx="6" fill="#F8F1E3" stroke="#3A2317" />
        <rect x="40" y="36" width="7" height="54" rx="2" fill="#147C77" />
        <rect x="53" y="36" width="7" height="54" rx="2" fill="#147C77" />
        <rect x="66" y="36" width="7" height="54" rx="2" fill="#147C77" />
        <path d="M50 14 Q60 0 70 14 L66 30 L54 30 Z" fill="#E8A33D" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 120 110" aria-hidden="true">
      <ellipse cx="60" cy="20" rx="34" ry="11" fill={swirl} />
      <path
        d="M28 20 L92 20 L84 100 C83.5 104 80 106 76 106 L44 106 C40 106 36.5 104 36 100 Z"
        fill="#F8F1E3"
        stroke="#3A2317"
      />
      <rect x="40" y="36" width="7" height="60" rx="2" fill="#147C77" />
      <rect x="53" y="36" width="7" height="60" rx="2" fill="#147C77" />
      <rect x="66" y="36" width="7" height="60" rx="2" fill="#147C77" />
    </svg>
  );
};

export const StoryScene = () => (
  <svg viewBox="0 0 400 320" aria-hidden="true">
    <circle cx="110" cy="140" r="46" fill="#E7B7A3" />
    <circle cx="200" cy="120" r="50" fill="#EFCBAE" />
    <circle cx="290" cy="145" r="46" fill="#DDAA92" />
    <rect x="150" y="180" width="30" height="90" rx="6" fill="#F5A9A0" />
    <rect x="195" y="165" width="32" height="105" rx="6" fill="#F8F1E3" stroke="#3A2317" />
    <rect x="243" y="185" width="30" height="85" rx="6" fill="#F1E3D0" />
  </svg>
);

export const MakeYourOwnCup = () => (
  <svg viewBox="0 0 300 380" aria-hidden="true">
    <path
      d="M150 20 C 172 20 186 40 184 60 C 200 65 212 78 206 92 C 216 98 214 112 198 118 C 210 126 200 140 182 140 L 118 140 C 100 140 90 126 102 118 C 86 112 84 98 94 92 C 88 78 100 65 116 60 C 114 40 128 20 150 20 Z"
      fill="#F8F1E3"
      stroke="#3A2317"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path d="M108 55 C 116 44 184 44 192 55" stroke="#EFE0C9" strokeWidth="3" fill="none" strokeLinecap="round" />
    <path d="M98 88 C 130 100 170 100 202 88" stroke="#EFE0C9" strokeWidth="3" fill="none" strokeLinecap="round" />
    <path d="M104 114 C 136 124 164 124 196 114" stroke="#EFE0C9" strokeWidth="3" fill="none" strokeLinecap="round" />
    <path d="M120 28 q6 8 -2 14 q-8 6 -1 13 q7 7 -1 14" stroke="#5A3418" strokeWidth="3" fill="none" strokeLinecap="round" />
    <path d="M178 32 q-6 8 2 14 q8 6 1 13 q-7 7 1 14" stroke="#5A3418" strokeWidth="3" fill="none" strokeLinecap="round" />
    <path d="M150 24 q5 7 -1 12" stroke="#C98A3E" strokeWidth="3" fill="none" strokeLinecap="round" />
    <g strokeLinecap="round">
      <rect x="122" y="70" width="8" height="3" rx="1.5" fill="#E14B4B" transform="rotate(20 126 71)" />
      <rect x="168" y="66" width="8" height="3" rx="1.5" fill="#147C77" transform="rotate(-25 172 67)" />
      <rect x="140" y="98" width="8" height="3" rx="1.5" fill="#F2A79E" transform="rotate(10 144 99)" />
      <rect x="160" y="104" width="8" height="3" rx="1.5" fill="#4A2C1A" transform="rotate(-15 164 105)" />
      <rect x="112" y="100" width="8" height="3" rx="1.5" fill="#E8A33D" transform="rotate(35 116 101)" />
      <rect x="185" y="98" width="8" height="3" rx="1.5" fill="#E14B4B" transform="rotate(-10 189 99)" />
    </g>
    <circle cx="150" cy="16" r="9" fill="#D8342C" stroke="#3A2317" strokeWidth="1.5" />
    <circle cx="147" cy="13" r="2.6" fill="#F3958D" />
    <path d="M150 7 Q156 -4 168 -2" stroke="#3F7D3E" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    <path
      d="M78 140 L 222 140 L 205 350 C 204 360 196 366 186 366 L 114 366 C 104 366 96 360 95 350 Z"
      fill="#F8F1E3"
      stroke="#3A2317"
      strokeWidth="2"
    />
    <text x="150" y="197" textAnchor="middle" fontFamily="Fraunces, serif" fontWeight="700" fontSize="30" fill="#147C77">
      starr&apos;s
    </text>
    <text x="150" y="216" textAnchor="middle" fontFamily="Work Sans, sans-serif" fontSize="10" letterSpacing="1.5" fill="#147C77">
      MAKE IT YOURS
    </text>
    <rect x="98" y="228" width="16" height="112" rx="4" fill="#147C77" />
    <rect x="132" y="228" width="16" height="112" rx="4" fill="#147C77" />
    <rect x="166" y="228" width="16" height="112" rx="4" fill="#147C77" />
    <rect x="200" y="228" width="14" height="102" rx="4" fill="#147C77" />
  </svg>
);

type TrioTopping = 'crumbles' | 'cherry' | 'none';

/** Cup used in the closing trio. */
export const TrioCup = ({ swirl, topping = 'none' }: { swirl: string; topping?: TrioTopping }) => (
  <svg viewBox="0 0 200 260" aria-hidden="true">
    <ellipse cx="100" cy="26" rx="58" ry="14" fill={swirl} />
    {topping === 'crumbles' && (
      <>
        <circle cx="80" cy="14" r="7" fill="#4A2C1A" />
        <circle cx="100" cy="10" r="7" fill="#4A2C1A" />
        <circle cx="120" cy="16" r="7" fill="#4A2C1A" />
      </>
    )}
    {topping === 'cherry' && <circle cx="118" cy="16" r="8" fill="#3A2317" />}
    <path
      d="M50 26 L150 26 L140 235 C139 240 135 244 130 244 L70 244 C65 244 61 240 60 235 Z"
      fill="#F8F1E3"
      stroke="#3A2317"
    />
    <rect x="66" y="45" width="10" height="110" fill="#147C77" />
    <rect x="84" y="45" width="10" height="110" fill="#147C77" />
    <rect x="102" y="45" width="10" height="110" fill="#147C77" />
    <rect x="120" y="45" width="9" height="100" fill="#147C77" />
  </svg>
);

export const TestimonialCup = () => (
  <svg viewBox="0 0 100 100" width="60%" aria-hidden="true">
    <path
      d="M30 35 Q30 20 50 20 Q70 20 70 35 L66 75 Q65 82 58 82 L42 82 Q35 82 34 75 Z"
      fill="#F8F1E3"
      stroke="#3A2317"
    />
    <rect x="40" y="42" width="6" height="34" fill="#147C77" />
    <rect x="50" y="42" width="6" height="34" fill="#147C77" />
    <rect x="60" y="42" width="5" height="30" fill="#147C77" />
  </svg>
);

/** Party cart under a striped umbrella and bunting, for the catering page. */
export const PartyCart = () => (
  <svg viewBox="0 0 320 340" className="cart-wrap" aria-hidden="true">
    <path d="M60 90 C60 40 260 40 260 90 Z" fill="#F2A79E" />
    <path d="M60 90 C90 78 230 78 260 90" fill="none" stroke="#3A2317" strokeWidth="2" />
    <rect x="157" y="90" width="6" height="80" fill="#3A2317" />

    <path d="M40 60 L55 78 L70 60 Z" fill="#F6A6AE" />
    <path d="M75 55 L90 73 L105 55 Z" fill="#147C77" />
    <path d="M215 55 L230 73 L245 55 Z" fill="#F6A6AE" />
    <path d="M250 60 L265 78 L280 60 Z" fill="#147C77" />
    <path
      d="M40 60 C 100 40 220 40 280 60"
      fill="none"
      stroke="#3A2317"
      strokeWidth="1.5"
      strokeDasharray="1 6"
      strokeLinecap="round"
    />

    <rect x="110" y="175" width="100" height="80" rx="8" fill="#F8F1E3" stroke="#3A2317" strokeWidth="2" />
    <rect x="110" y="175" width="100" height="16" fill="#147C77" />
    <text
      x="160"
      y="222"
      textAnchor="middle"
      fontFamily="Fraunces, Georgia, serif"
      fontWeight="700"
      fontSize="20"
      fill="#147C77"
    >
      starr&apos;s
    </text>
    <text
      x="160"
      y="238"
      textAnchor="middle"
      fontFamily="Work Sans, sans-serif"
      fontSize="8"
      letterSpacing="1"
      fill="#5C4534"
    >
      FAMOUS SHAKES
    </text>

    <circle cx="130" cy="270" r="18" fill="#F8F1E3" stroke="#3A2317" strokeWidth="2" />
    <circle cx="130" cy="270" r="5" fill="#3A2317" />
    <rect x="205" y="250" width="10" height="24" rx="3" fill="#3A2317" />

    <g transform="translate(178,150)">
      <ellipse cx="10" cy="6" rx="16" ry="6" fill="#F6A6AE" />
      <path
        d="M-6 6 L26 6 L22 34 C21.6 36 20 37.5 18 37.5 L2 37.5 C0 37.5 -1.6 36 -2 34 Z"
        fill="#F8F1E3"
        stroke="#3A2317"
        strokeWidth="1.5"
      />
    </g>

    <path d="M30 150 L32 156 L38 158 L32 160 L30 166 L28 160 L22 158 L28 156 Z" fill="#147C77" />
    <path
      d="M290 190 L291.5 195 L296.5 196.5 L291.5 198 L290 203 L288.5 198 L283.5 196.5 L288.5 195 Z"
      fill="#147C77"
    />
  </svg>
);
