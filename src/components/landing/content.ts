/** Static copy and presentation constants for the landing page. */

export const NAV_LINKS = [
  { label: 'Menu', href: '/menu' },
  { label: 'Locations', href: '#locations' },
  { label: 'Our Story', href: '#story' },
  { label: 'Parties', href: '/catering' },
] as const;

export const MENU_HREF = '/menu';

/** Badge + swirl colour applied to bestseller cards, cycled by position. */
export const BESTSELLER_STYLES = [
  { badge: 'Bestseller', badgeClass: 'badge-fill', buttonClass: 'btn-primary', swirl: '#EFE6D7', toppings: true },
  { badge: 'OG Favorite', badgeClass: 'badge-outline', buttonClass: 'btn-outline', swirl: '#EFE0C9', toppings: false },
  { badge: "Starr's Pick", badgeClass: 'badge-fill', buttonClass: 'btn-primary', swirl: '#F6DADD', toppings: false },
  { badge: 'Fresh Favorite', badgeClass: 'badge-outline', buttonClass: 'btn-outline', swirl: '#E4EAC9', toppings: false },
] as const;

/** Mood-card tint and cup swirl, cycled by position. */
export const MOOD_STYLES = [
  { cardClass: 'mc-1', swirl: '#F6A6AE', corndog: false },
  { cardClass: 'mc-2', swirl: '#EFE0C9', corndog: false },
  { cardClass: 'mc-3', swirl: '#E7C79A', corndog: false },
  { cardClass: 'mc-4', swirl: '#F6DADD', corndog: false },
  { cardClass: 'mc-5', swirl: '#C9E7E1', corndog: true },
] as const;

export const INGREDIENTS = [
  { label: 'Cookies', dotColor: '#8B5A2B', positionClass: 'ing-1', outlined: false },
  { label: 'Strawberries', dotColor: '#E4534B', positionClass: 'ing-2', outlined: false },
  { label: 'Whipped Cream', dotColor: '#F4EDE1', positionClass: 'ing-3', outlined: true },
  { label: 'Caramel', dotColor: '#C98A3E', positionClass: 'ing-4', outlined: false },
  { label: 'Chocolate', dotColor: '#4A2C1A', positionClass: 'ing-5', outlined: false },
] as const;

export const TESTIMONIALS = [
  { quote: '"This is THICK thick."', handle: '@katieeats', photoColor: 'var(--teal-pale)' },
  { quote: '"Worth the detour."', handle: '@mike.goeseverywhere', photoColor: 'var(--pink-soft)' },
  { quote: '"Okay... now I get the hype."', handle: '@jessanddrew', photoColor: 'var(--teal-pale-2)' },
] as const;

export const LOCATIONS = [
  {
    name: 'Xavier Residences',
    area: 'Katipunan, Quezon City',
    gradient: 'linear-gradient(135deg,#1F3B39,#0E5F5B)',
    comingSoon: false,
  },
  {
    name: 'Melting Pot',
    area: 'Fairview, Quezon City',
    gradient: 'linear-gradient(135deg,#28504D,#147C77)',
    comingSoon: false,
  },
  {
    name: 'Marikina',
    area: 'Opening soon',
    gradient: '#F8F1E3',
    comingSoon: true,
  },
] as const;

export const SOCIAL_HANDLE = '@starrsfamousshakes';
