# Design System Document

## 1. Overview & Creative North Star: "The Neon Parlor"
This design system is built to capture the tactile, joyful essence of a mid-century milkshake parlor reimagined for a high-end digital editorial experience. Our Creative North Star is **"The Neon Parlor"**—a concept that balances 1950s nostalgia with high-gloss, modern sophistication. 

Instead of a standard, rigid grid, we utilize **intentional asymmetry** and **tonal layering** to mimic the physical depth of a milkshake—creamy layers, bold toppings, and frosty glass. We move away from the "flat web" by using varying surface containers and hyper-rounded geometry (`roundedness-xl`) to create a UI that feels soft, approachable, yet premium.

---

## 2. Colors: Tonal Depth & The No-Line Rule
The palette is rooted in minty teals and creamy off-whites, used not just as decoration, but as the primary tool for spatial organization.

*   **Primary (#006b5e) & Primary Container (#7ed2c2):** Used for brand anchors and major focal points. 
*   **Surface Hierarchy:** We utilize the `surface-container` tiers to create depth without shadows.
    *   `surface` (#e6fff5): The base canvas.
    *   `surface-container-low` (#cdfeed): Secondary content areas.
    *   `surface-container-highest` (#bceddc): High-priority interactive zones.

### The "No-Line" Rule
**Prohibit 1px solid borders for sectioning.** Boundaries must be defined solely through background color shifts or tonal transitions. To separate a hero section from a menu grid, transition from `surface` to `surface-container-low`.

### The "Glass & Gradient" Rule
To elevate the brand beyond a "flat" look, use **Glassmorphism** for floating headers and modal overlays. Use semi-transparent `surface` colors with a `backdrop-blur-md` effect. Main CTAs should utilize a subtle linear gradient from `primary` (#006b5e) to `primary_container` (#7ed2c2) at a 135-degree angle to provide a "neon glow" finish.

---

## 3. Typography: Bold Playfulness
We pair **Plus Jakarta Sans** (Display/Headlines) with **Be Vietnam Pro** (Body/Titles) to create a high-contrast, editorial feel.

*   **Display-LG (3.5rem):** Set in Plus Jakarta Sans with tight letter-spacing (-0.02em). Use this for hero statements to evoke the "bold, rounded" personality of vintage signage.
*   **Headline-MD (1.75rem):** Used for section titles (e.g., "Famous Shakes"). It conveys authority while remaining friendly.
*   **Body-LG (1rem):** Set in Be Vietnam Pro for optimal readability. The generous x-height ensures clarity against vibrant backgrounds.
*   **Label-MD (0.75rem):** Used for overlines and tags, always in uppercase with increased letter-spacing (+0.05em) to provide a "designer" touch to small metadata.

---

## 4. Elevation & Depth: Tonal Layering
Traditional structural lines are replaced with **The Layering Principle**.

*   **Ambient Shadows:** For floating elements like Modals, use a diffused shadow: `box-shadow: 0 20px 40px rgba(0, 32, 25, 0.08)`. Notice the shadow is tinted with the `on_surface` color (#002019) rather than pure black, ensuring it looks like light passing through mint-tinted glass.
*   **The "Ghost Border" Fallback:** If accessibility requires a border, use `outline_variant` (#bec9c5) at **20% opacity**. This creates a "watermark" effect rather than a hard edge.
*   **Nesting:** Place a `surface_container_lowest` (#ffffff) card inside a `surface_container` (#c8f8e8) section to create a soft, natural lift that mimics a paper menu sitting on a teal countertop.

---

## 5. Components

### Hero Sections & Banners
*   **Layout:** Utilize asymmetrical compositions. Text should be left-aligned using `display-lg`, with imagery (like the signature milkshake) overlapping the section container edges.
*   **Background:** Use a subtle radial gradient: `surface_bright` at the center fading to `surface_variant` at the edges.

### Buttons
*   **Primary:** `primary` background, `on_primary` text. Shape: `rounded-full`.
*   **Secondary:** `primary_container` background with a "Ghost Border."
*   **States:** On hover, apply a `surface_tint` overlay at 8% opacity to create a "pressed" glass look.

### Modal Pop-ups
*   **Style:** `surface_container_low` background with a heavy `backdrop-blur-lg`. 
*   **Radius:** Always use `rounded-xl` (3rem) for modals to reinforce the friendly, rounded brand identity.
*   **Transition:** Modals should "grow" from the trigger point rather than simply fading in.

### Cards & Lists
*   **Rule:** Forbid divider lines. Use `spacing-8` (2rem) of vertical white space to separate items.
*   **Image Treatment:** Product images should have a `rounded-lg` (2rem) corner radius. Use the checkerboard pattern seen in the brand profile as a subtle background decorative element for product cards.

---

## 6. Do's and Don'ts

### Do:
*   **Do** use overlapping elements (e.g., a shake image breaking the "box" of a card) to create energy.
*   **Do** lean into the `rounded-xl` and `rounded-full` scales for all interactive elements.
*   **Do** use `on_primary_container` (#005b50) for icons to ensure they feel integrated into the teal palette.

### Don't:
*   **Don't** use 100% black (#000000) for text. Always use `on_surface` (#002019) to maintain tonal harmony.
*   **Don't** use sharp 90-degree corners. This violates the "friendly and nostalgic" brand pillar.
*   **Don't** use standard "Drop Shadows." Stick to the Ambient Shadow spec or Tonal Layering.
*   **Don't** use more than two font weights in a single component; let the size scale handle the hierarchy.