# Phenomebeauty design system (v2)

Applies to every customer-facing page: `index.html`, `shop.html`, `services.html`, `training.html`, `checkout.html`, `shop-success.html`, `terms.html`, `mobile-waxing-cape-town.html` and `404.html`.

| File | What it holds |
|---|---|
| `site.css` | Tokens, type, buttons, header, footer, bands, every page section, motion keyframes |
| `site.js` | Navigation and motion (no dependencies) |
| `shop.css` / `shop.js` | Shop grid, product panel, cart drawer, sticky cart bar |
| `checkout.css` | Checkout steps, fields, delivery, review, cart editor |
| `home.js` | Live products on the homepage |

The admin tools (`shop-admin.html`, `register-webhook.html`) still use the older `styles.css` and `script.js`. They are internal and were not redesigned.

## Direction

A blend of organic, minimal and editorial, where the style always serves the hierarchy.

- **Editorial:** big light uppercase headlines, hairline rules, price lists set like a menu, generous space.
- **Organic:** arch-shaped and pill-shaped photo frames, one slowly breathing Blush form, sections that overlap with rounded tops like stacked sheets.
- **Minimal:** no glass, no blur, no drop shadows, no gradients, no icon tiles, no eyebrow labels, no underlined links.

## Type: two fonts

| Font | Used for |
|---|---|
| **Abril Fatface** | The **Phenomebeauty** wordmark only: header and the giant footer signature. Loaded as a subset of just those letters. |
| **Montserrat** | Everything else. Light 300 uppercase for headlines (matching the package cards), 400 for body, 500 to 700 for labels, links and buttons. |

The brand name is always written **Phenomebeauty** (lower-case b).

## Colour carries meaning

| Token | Hex | Section | Text on it |
|---|---|---|---|
| `--blush` (Blush) | `#F2C6C2` | Products | Black, 13.6:1 |
| `--paper` (Cream) | `#F3F1E8` | Services, page base | Black, 18.6:1 |
| `--ink` (Midnight) | `#000000` | Training, footer, sticky cart | Cream, 18.6:1 |

Secondary text is black at 72% and muted text at 60%; on Midnight, cream at 76% and 64%. All are above 4.5:1.

## Hierarchy

| Priority | Actions | Treatment |
|---|---|---|
| 1 | Shop, add to cart, checkout, pay | **Filled button** (`.btn-primary`). Black on light; cream on Midnight. Hover floods with Blush, the product colour. |
| 2 | Book, see prices, register, read a guide | **Outline button** (`.btn-secondary`) or **go-link** (`.link-go`: label plus circled arrow, from the package cards). |

Rule: a filled button is only ever a product action. This is checked on every page in testing.

## Links without underlines

- **Standalone links** use the go-link: bold label plus a circled arrow that fills on hover.
- **Inline links** in sentences (`.link`) are bold, so they differ from body text by weight as well as colour, and they fade on hover.
- **Navigation** marks the current page and hover with a small dot, echoing the carousel dots on the package cards.
- **Focus** is always a visible 2px ring.

## Components

- **Package card** (`.pkg`): rebuilt from the four package images, with an asymmetric photo frame, light uppercase name, price with "excl. call-out fee", bold treatment list, tagline and circled arrow. The whole card links to booking. It adapts to its own width with container queries, and the price drops under the name on narrow cards.
- **Story spotlight** (homepage hero): a deck of story cards with progress bars, which advances every 6 seconds and can be paused, stepped or swiped.
- **Product card** and **shop tile**: 4:5 photo, name, "From R…" price, and a circled arrow that springs in on hover.
- **Price list**: category heading that sticks while you scroll its treatments, then name, description and price rows.
- **Editorial list** (training): large rows that slide on hover, with the guide image following the pointer on desktop.
- **Footer signature**: a full-width Abril Fatface "Phenomebeauty", fitted exactly to the screen width.

Package photos live in `assets/packages/`. They are cropped from the supplied 1080×1920 cards to remove the baked-in text and the corner "X", which reads as a close button on the web. The card text is real HTML, so it is readable by search engines and screen readers.

## Motion

| Where | What moves |
|---|---|
| Hero | Headline lines rise out of masks; the photo pills grow and cycle; the story card deals in; the Blush form breathes. |
| Scroll | Sections reveal (rise, mask-wipe for images, line-by-line headlines); the marquee moves only as you scroll; gentle parallax on shapes and the booking phone. |
| Header | Hides on the way down and returns on the way up; the menu opens as a full-screen sheet with staggered links. |
| Interactions | Fill-sweep buttons, arrow nudges, image zoom on cards, springy cart-count bump on add to cart, tiles stagger in, the product panel and cart slide in. |
| Pages | Cross-page fade (View Transitions) in browsers that support it; others simply navigate. |
| Confirmation | The checkmark draws itself. |

**Reduced motion:** with `prefers-reduced-motion`, nothing animates, nothing is hidden waiting for a scroll, the spotlight does not auto-advance, the marquee and parallax stay still, and page transitions are off. The spotlight always has a visible pause button, and the marquee only moves when you scroll.

## Laws of UX applied

| Law | Where |
|---|---|
| **Von Restorff** | One filled-button style, reserved for product actions. |
| **Hick's law** | The main nav is three items: Shop, Services, Training. One primary action per section. |
| **Serial position** | The homepage opens and closes on the shop, and every footer starts with "Shop the collection". |
| **Jakob's law** | Logo left, nav centre, cart right; familiar product grid; slide-in cart; story-style cards your audience knows from Instagram. |
| **Fitts's law** | Touch targets are at least 44px; Add to cart, Checkout and Pay are full width on phones. |
| **Goal-gradient** | Cart count in every header, sticky cart bar on the shop, checkout progress steps. |
| **Doherty threshold** | Skeletons while products load; filters re-render instantly without a network call; the cart count bumps the moment an item is added. |
| **Proximity / common region** | Prices on the same line as each treatment; packages grouped as cards. |
| **Miller's law** | Treatments chunked into five categories plus four packages. |
| **Peak-end rule** | A drawn checkmark and a warm thank-you at the end of the purchase. |
| **Aesthetic-usability** | One consistent frame language and type system across all pages. |

## Impeccable rules (applied by hand)

The impeccable detector could not be run in this environment. Its listed anti-patterns were checked manually:

- No Inter-for-everything, no purple gradients, no gradient text.
- No nested cards, no icon tiles above headings, no eyebrow above every heading.
- No grey text on coloured backgrounds below AA.
- No skipped heading levels.

## Deep links

- `shop.html?segment=self_care` or `?segment=professional`: opens the shop filtered.
- `shop.html?product=<id>`: opens that product's detail panel.
- `shop.html?cart=open`: opens the cart, used by the header cart on every other page.

## How the pages are built

The pages are plain static HTML, with no build step to deploy. Headers, footers and package cards were generated once from a shared template so they are identical everywhere. If you edit them by hand, keep these the same on every page:

- the header
- the footer
- the `site.js` script tag
