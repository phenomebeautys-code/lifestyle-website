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
  Exception: physical objects. The review notes, their pins, the curled corner and the iPhone frame are drawn as real objects, so they alone carry shadows and gradients.

## Type: three fonts

| Font | Used for |
|---|---|
| **Abril Fatface** | The **Phenomebeauty** wordmark only: header and the giant footer signature. |
| **Montserrat** | Everything else. Light 300 uppercase for headlines, 400 for body, 500 to 700 for labels, links and buttons. |
| **Barlow Condensed** | All-caps taglines only: package names, package taglines, the call-out note and spotlight titles. Semibold 600, tight and bold. |

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
| 2 | Book, see prices, register, read a guide | **Outline button** (`.btn-secondary` or `.link-go`): a labelled pill that says what happens next. |

**Arrows:** no arrow circles on calls to action. Icon-only controls (carousel prev and next, pause, close, cart) keep their icons. Every action names itself, such as "Shop self-care" or "Book Essential".

Rule: a filled button is only ever a product action. This is checked on every page in testing.

## Links without underlines

- **Standalone actions** are labelled outline pills (`.link-go`) that fill on hover.
- **Inline links** in sentences (`.link`) are bold, so they differ from body text by weight as well as colour, and they fade on hover.
- **Navigation** marks the current page and hover with a small dot, echoing the carousel dots on the package cards.
- **Focus** is always a visible 2px ring.

## Spacing

- **Sections:** every section has `--half` padding top and bottom. A sheet overlaps the section above it by `--r-sheet`, so that section gets `--half` plus `--r-sheet` at the bottom. The visible gap stays `--half`.
- **Inner spacing:** use the `--s-*` scale and the `.mt-*`, `.stack-*` and `.btn-row` utilities, not inline margins.
- **Inline styles:** only motion variables (`--d`, `--i`, `--interval`) and JavaScript show/hide state. Everything else is a class.

## Components

- **Review notes** (`.review`): Google reviews word for word, pinned to a Cream pegboard (`.band--board`). Each note is Blush or a lighter tint.
- **Phone frame** (`.iphone`): the booking app inside an iPhone 17 frame, with aluminium edges, a black bezel, a Dynamic Island and side buttons.
- **Package card** (`.pkg`): rebuilt from the four package images, with an asymmetric photo frame, light uppercase name, price with "+ call-out fee", bold treatment list, tagline and a labelled "Book" button. It adapts to its own width with container queries, and the price drops under the name on narrow cards.
- **Story spotlight** (homepage hero): a deck of story cards with progress bars, which advances every 6 seconds and can be paused, stepped or swiped. Each card has one labelled button.
- **Product card** and **shop tile**: 4:5 photo, name, "From R…" price, and a labelled "View product" button.
- **Price list**: category heading that sticks while you scroll its treatments, then name, description and price rows.
- **Editorial list** (training): large rows that slide on hover, each with a labelled action, and the guide image following the pointer on desktop.
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

## Voice and copy

Rules, from the brief:

- **Empathy is king.** Validate the nerves, then empower. Don't coddle.
- **Short is beautiful.** No sentence over 12 words. Break lines aggressively.
- **Sell the why, not the what.** Write about the feeling (confidence, post-wax ease), not wax temperature or ingredients.
- **The customer is the star.** We are the supporting cast.
- **Never:** "epilation", "follicle", "hyperpigmentation" (keep those for the FAQ), "bespoke", "synergy", "leverage", "elevate", "seamless".
- **Always:** declarative statements, and "&" to keep the eye moving.

Checked on every public page: no sentence over 12 words, and no banned terms. Legal wording on the terms page is unchanged, so that page keeps its exact clauses.

Page roles: the homepage hero sells the product and the booking together. The services page keeps the package cards as the model for every treatment list, in Title Case. About us has three short paragraphs. Booking & FAQ carries the empathy for nervous first-timers.

**Typography:** the brief's condensed, bolder face for all-caps taglines is Barlow Condensed. It is the third and last font, and it is used only for those taglines.
