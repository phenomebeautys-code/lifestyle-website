# PhenomeBeauty design system

Applies to the redesigned pages: `index.html`, `services.html`, `shop.html`.
Styles: `site.css` (system) and `shop.css` (shop components).
Older pages (`checkout.html`, `shop-success.html`, `terms.html`, `mobile-waxing-cape-town.html`, admin) still use `styles.css` and the previous dark look.

## Direction

A blend of organic, minimal and editorial. The style serves the hierarchy, never the other way round.

- **Editorial:** large Abril Fatface headlines, hairline rules, price lists set like a menu, generous whitespace.
- **Organic:** arch-shaped image frames and one soft blush form behind the hero image. Nothing else is decorative.
- **Minimal:** no glass, no blur, no drop shadows, no gradients, no icon tiles above headings, no eyebrow labels.

## Hierarchy

| Priority | What | Treatment |
|---|---|---|
| 1 | Products (shop, add to cart, checkout) | Filled black pill button. Blush bands. |
| 2 | Services (book, see prices) | Outline button or underlined text link. Cream bands. |
| 2 | Training (workshop, guides) | Underlined text link. Midnight band. |

**Rule:** the filled black button (`.btn-primary`) is only used for product actions. On a black surface (the sticky cart bar), the primary action inverts to a Cream fill. Services and training never get a filled button.

## Colour

| Token | Hex | Use |
|---|---|---|
| `--paper` (Cream) | `#F3F1E8` | Page base, services |
| `--blush` (Blush) | `#F2C6C2` | Products |
| `--ink` (Midnight) | `#000000` | Text, primary buttons, training |

Black on Cream is 18.6:1 and black on Blush is 13.6:1. Cream on black is 18.6:1. Secondary text uses black at 72% and muted text at 60%, both above 4.5:1.
Cream and Blush are only 1.36:1 apart, so a hairline always separates those bands.

## Type

- Display and headings: Abril Fatface, sentence case, tight leading.
- Body: Glacial Indifference, 17px base, 1.6 line height.
- Labels are sentence case and bold. No tracked capitals.

## Laws of UX applied

| Law | Where |
|---|---|
| **Von Restorff** (the different thing is remembered) | One filled button style, reserved for product actions. |
| **Hick's law** (fewer choices, faster decisions) | Main nav cut to Shop, Services, Training. One primary action per section. |
| **Serial position** (first and last are remembered) | Homepage opens and closes on the shop CTA. |
| **Jakob's law** (people expect familiar patterns) | Logo left, nav right, cart top right; product grid of image, name, price; slide-in cart. |
| **Fitts's law** (big, close targets are faster) | All tap targets at least 44px; Add to cart and Checkout are full-width on phones. |
| **Proximity / common region** | Prices sit on the same line as each treatment; categories are grouped under one rule. |
| **Miller's law** (chunking) | Services split into five categories with a "From" price each. |
| **Goal-gradient** | Sticky cart bar shows item count and total once something is in the cart. |
| **Doherty threshold** (respond within 400ms) | Skeleton tiles while products load; filters re-render without a network call. |
| **Aesthetic-usability / Prägnanz** | Simple shapes, one image frame style, one rule weight. |

## Impeccable checks (applied by hand)

The impeccable detector was not run (blocked in this environment). Its listed anti-patterns were checked manually:

- No Inter-for-everything, no purple gradients, no gradient text.
- No cards nested in cards; no icon tile above headings.
- No grey text on coloured backgrounds below AA.
- No skipped heading levels (h1 → h2 → h3 on every page).
- Comfortable padding; reduced motion respected.

## Deep links

- `shop.html?segment=self_care` or `?segment=professional` opens the shop with that filter.
- `shop.html?product=<id>` opens that product's detail panel.
