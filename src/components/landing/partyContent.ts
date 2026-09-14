/** Static copy and pricing for the catering (party cart) page. */

export const CATERING_EMAIL = 'kitty_starrs@yahoo.com';
export const CATERING_HREF = '/catering';

export const STARTING_PACKAGE_PRICE = '₱15,000';
export const MOBILIZATION_FEE = '₱1,500';
export const PRICING_FINE_PRINT =
  'Plus ₱1,500 mobilization fee and 10% service fee. Final price depends on guest count and menu selection.';

export const BOOKING_STEPS = [
  {
    title: "Reserve Starr's Cart",
    description: "Starr's Cart comes to you and serves your guests on-site — just save the date.",
    footnote: `Cart mobilization fee: ${MOBILIZATION_FEE}`,
  },
  {
    title: 'Customize Your Menu',
    description: "Mix and match from our milkshakes and mmunchies to fit your party's theme.",
    footnote: 'Sandwiches available on request, subject to prep team availability.',
  },
  {
    title: 'Confirm Your Booking',
    description: 'Reach out with your date, headcount, and preferred menu to lock it in.',
    footnote: 'Email',
    footnoteEmail: CATERING_EMAIL,
  },
] as const;

export const MENU_GROUPS = [
  {
    title: 'Famous Shakes',
    price: '₱140',
    flavors:
      'Banana • Caramel • Cherry • Chocolate • Cookies & Cream • Latte • Mixed Berries • Strawberry • Vanilla • Toffee',
    note: 'Best served with Horlicks, +₱35',
  },
  {
    title: "Starr's V.I.P.",
    price: '₱170',
    flavors:
      "Bubblegum • Cherry Choco Mint • Cherrylime & Peaches • Reese's Overload • Choco Banana Split • Mixed Berries & Banana • PB, Banana, Caramel • Vanilla Blue Heaven • Toffee & Candied Walnuts • PB&J",
  },
  {
    title: 'Bake & Shake',
    price: '₱170',
    flavors:
      'Red Velvet • Brownie Chunks • Strawberry Cheesecake • Strawberry Shortcake • Toffee Banoffee • Oreo Cheesecake • Crunchy Cookie Butter • Choco Cookies & Almond Roca • Choco Hazelnut & Mallows • Caramel Cookie Dough • Salted Caramel',
  },
  {
    title: "Starr's Specials",
    price: '₱165/ea',
    flavors: 'Oreo Mallows • Oreo Pancake • Red Velvet • Tiramisu',
    note: 'Mint Choco Chip — ₱185',
  },
  {
    title: "Starr's Munchies",
    isFullWidth: true,
    chips: [
      { name: 'Belgian Fries', price: '₱90' },
      { name: 'Mini Corndogs', price: '₱100' },
      { name: 'Mozzarella Poppers', price: '₱115' },
      { name: 'Chix Fries', price: '₱115' },
      { name: 'Onion Rings', price: '₱90' },
      { name: 'Crosstrax Fries', price: '₱90' },
    ],
  },
  {
    title: 'Mmunch Box',
    price: '₱190',
    isPriceOutlined: true,
    isFullWidth: true,
    flavors:
      'A shake plus a mix of Crosstrax Fries, Chix Fries, Mozzarella Corndogs, and Garlic Parmesan Chix Poppers — a full mood in one box.',
  },
] as const;
