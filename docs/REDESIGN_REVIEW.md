# PhenomeBeauty Website Redesign: Review and Plan

Branch: `claude/website-redesign-conversion`
Status: **Redesign v2 implemented on every customer-facing page** (organic + minimal + editorial, two fonts, motion, packages). See `docs/DESIGN.md` for the system. The findings below are the original review.

Scope of this document: review of the current site, the conversion problems found, the colour and section plan, and the phased order of work. No design or markup has changed yet.

---

## 1. Summary

The site is a static HTML/CSS/JS build (Vercel), with the shop running on Supabase Edge Functions and Yoco for payment. Booking is handled by an external app at `phenomebeauty.nextslot.co.za`.

The biggest conversion problem is on the shop. A first-time visitor lands on a hero and a "Who are you shopping for?" chooser, and **the product grid is empty until they pick a segment**. Products, the thing they came to buy, are not on screen. Fixing that, plus the purchase path and trust signals, should be the first redesign phase.

Priority order agreed in the brief: **Products → Services → Training.**

| Phase | Area | Palette | Main goal |
|---|---|---|---|
| 1 | Products (shop) | Blush `#F2C6C2` | Get products on screen immediately, shorten add-to-cart, build purchase trust |
| 2 | Services | Cream `#F3F1E8` | Show prices without accordions, make booking the obvious next step |
| 3 | Training | Midnight `#000000` | Build a real training section (see open question 1) |

---

## 2. Conversion findings: Products (shop.html, shop.js, shop.css)

Severity: **High** = likely to cost sales now, **Med** = friction, **Low** = polish.

### P1. Product grid is blank on first load (High)
- `shop.js` init (end of file) runs `localStorage.removeItem(SEGMENT_KEY)` and clears `#productGrid`, so products only render after `selectSegment()` or `browseAll()`.
- `shop.html:153` contains only a `<noscript>` message inside the grid.
- Result: the first screen is a title, a description and a chooser. No products, no prices, no add-to-cart.
- **Fix:** render the full catalogue by default. Turn segment into a filter (`All / Self-Care / Professional`) that defaults to All.

### P2. Segment choice is never remembered (Med)
- The same init block clears the stored segment on every page load, so returning visitors re-choose each time.
- **Fix:** keep the choice in `localStorage` (or as a filter in the URL), and let it be cleared with "All".

### P3. Unverified "social proof" badges on tiles (High, trust and compliance)
- `shop.js`, `renderProducts()`: products tagged `hero_segment` get the badges **"The Ritual They Return To"** and **"TRUSTED BY PROFESSIONALS"**.
- Nothing in the repo shows these claims are backed by data (reviews, repeat-purchase numbers, professional endorsements).
- **Fix:** verify each claim or replace it with a factual label such as "Bestseller" (backed by real order counts) or "Recommended for salons".

### P4. Card price can disagree with the price the customer pays (Med)
- Tiles show the base `p.price` only. `addToCart()` (`shop.js`, ~line 351) uses the selected variant and size prices, which can differ.
- **Fix:** show "From R…" on tiles and the exact price on the product page.

### P5. Add-to-cart takes two steps, with no quick-add (Med)
- Tile → product panel (`openProductDetail`) → "Add to Cart" in the panel footer.
- For single-variant products this is an unnecessary step.
- **Fix:** a quick-add button on the tile when the product has no required choice. Keep the panel for products with variants.

### P6. No purchase reassurance above the fold (High)
- Shop hero copy is brand-led ("Make Yourself A Priority"). Nothing says what delivery costs, how long it takes, how payment works, or the returns policy.
- The cart drawer says **"Delivery calculated at checkout"** (`shop.html:193`, `shop.js:180`). Late shipping costs are a common reason carts are abandoned.
- The only refund terms I found (`terms.html`) cover appointments. I did not find a **product returns policy**.
- **Fix:** add a trust strip under the hero (delivery estimate or threshold, "Secured by Yoco", returns link). Write and publish a product returns policy. Show an estimated delivery figure in the cart before checkout, if the business rules allow it.

### P7. Three cart surfaces compete with each other (Med)
- Cart drawer (`shop.html:176`), a sticky cart bar with an expandable panel (`shop.html:209-219`), and the product panel footer.
- **Fix:** one cart pattern. The sticky bar opens the drawer, and the drawer is the only place to edit the cart.

### P8. Product names and IDs are inserted into HTML without escaping (Med, security)
- `renderProducts()` and `openProductDetail()` interpolate `p.name` into `innerHTML`, and product IDs into inline `onclick` attributes.
- Admin-entered data is the usual source, so the risk is low today. It still makes admin input a stored-XSS path, and the CSP (`vercel.json`) allows `'unsafe-inline'` scripts, so it would not be blocked.
- **Fix:** escape text and IDs before rendering. Replace inline `onclick` handlers with event listeners when the grid is rebuilt.

### P9. Smaller items (Low)
- `shop.js` loads `segment-selector.html` with an extra fetch on every page load. Once the grid is always visible, the chooser can be part of the page markup.
- `shop.js`: `updateCardPrice()` is an empty shim.
- Tiles use `aria-label` on a `div` ("Hero pick"). Screen readers ignore it there.

---

## 3. Services findings (index.html, Phase 2)

- **Prices are hidden behind collapsed accordions** (`index.html:307-400`, `<details>` elements). Visitors see five category names and have to open each one to see a price. Services are the main way visitors book, so this is a big barrier.
- **Interactive content inside `<summary>`.** Each accordion `summary` contains a "Book" `<a>` with `onclick="event.stopPropagation()"` to stop it toggling. That is fragile, and keyboard users cannot reach the link cleanly.
- **Structured data does not match the page.** JSON-LD (`index.html:87`) lists "Lash & Brow Tint Combo" at R150. The page (`index.html:373`) shows "Lash & Brow Combo" at R200. This can cause rich-result errors and misleads search engines.
- **Five separate "Book" links**, all opening the external booking app in a new tab. This takes visitors off the site at the point of decision.
- **Two "Book" entries in the nav** (`index.html:179` "Book" and `:183` "Book Now") point to the same place.
- **The Waxing landing page** (`mobile-waxing-cape-town.html`) is only in `sitemap.xml`. Nothing on the site links to it.
- **Schema is maintained by hand.** Only five services are in the JSON-LD, and the FAQ text is separate from the Services section. Generating both from one list would stop them drifting apart.

---

## 4. Training findings (Phase 3)

- **There is no training section.** The only related content is a "Workshop" promo card (`index.html:282-289`) that links to a Google Form, and the two guides.
- Training is **not in the nav**.
- The guides are PDFs hosted on Google Drive (`index.html:273, 417, 425`). They open off-site and cannot be tracked or used to capture leads.
- **Plan:** a training section in the Midnight palette, with the workshop, the guides and a clear sign-up. Guides should be hosted pages or gated downloads that capture an email address.

---

## 5. Site-wide findings

| # | Finding | Where | Severity |
|---|---|---|---|
| S1 | "Reviews" promo links to a long Google search URL with session tokens (`sca_esv`, `sxsrf`, `si`). It will break or expire. | `index.html:264` | Med |
| S2 | Third-party product (Tara-S period tracker) sits in the homepage promo grid, away from the beauty offer. | `index.html:255` | Low (decision) |
| S3 | Fonts are loaded twice: `@import` in `styles.css:1-2` and `<link>` tags in each page. The `@import` chain is render-blocking. | `styles.css`, all HTML | Med (performance) |
| S4 | All brand images (logo, hero background, promo images, OG image) are hosted on `iili.io`, a third-party image host. Reliability depends on it, and the CSP allows it in `img-src`. | all pages, `vercel.json` | Med (later) |
| S5 | CSP uses `'unsafe-inline'` for scripts, which is needed for the inline `onclick` handlers. It limits what the CSP protects against. | `vercel.json` | Med (later) |
| S6 | `<meta name="keywords">` is ignored by search engines. | all pages | Low |
| S7 | Accessibility: hero mini-cards use CSS background images with text and no alt text; the "Hero pick" `aria-label` is on a `div`; the `summary` nesting problem above. | `index.html:226-228`, `shop.js` | Med |
| S8 | The site is dark-only (`#0a0a0e`, full-bleed photo with a 62% black overlay). The Cream and Blush sections in the brief will be the first light surfaces. | `styles.css:` `:root`, `#bg-image` | Decision (see §7) |

---

## 6. Colour plan

Section colours from the brief:

| Section | Colour | Text colour | Contrast (WCAG) |
|---|---|---|---|
| Services | Cream `#F3F1E8` | Midnight `#000000` | 18.56:1 (AAA) |
| Products | Blush `#F2C6C2` | Midnight `#000000` | 13.63:1 (AAA) |
| Training | Midnight `#000000` | Cream `#F3F1E8` | 18.56:1 (AAA) |

Notes:
- **Cream and Blush sit next to each other.** Their contrast with each other is only 1.36:1. Put a clear divider (a hairline border or a spacing change) between those bands, so they do not run together.
- The existing light accent `#f2e7d6` is close to Cream. Consider replacing it with Cream in the new sections so the palette stays to three colours plus one neutral.
- Proposed tokens, to be added to `:root` in `styles.css`:

```css
:root {
    --color-services: #F3F1E8;   /* Cream */
    --color-products: #F2C6C2;   /* Blush */
    --color-training: #000000;   /* Midnight */
    --color-ink: #000000;        /* text on Cream and Blush */
    --color-paper: #F3F1E8;      /* text on Midnight */
}
```

- **Buttons on Blush and Cream** can be black with cream text, which keeps them consistent with the Midnight sections.

---

## 7. Redesign plan

### Phase 1: Products (Blush)

Target: a product-first shop that shows products and prices on first load.

1. **Hero (short).** One headline, one line of copy, and a trust strip with delivery, secure payment and returns.
2. **Filter bar.** `All` (default) · `Self-Care` · `Professional`. Remember the choice, and make the URL reflect it (`shop.html?segment=professional`).
3. **Product grid.** Visible on first load. Tile = image, name, "From R…", a short benefit line, and a quick-add button where no choice is needed.
4. **Product panel.** Keep it for variants and sizes. Show the exact price, the stock state, and the shipping and returns notes.
5. **One cart.** The sticky bar opens the drawer. The drawer shows an estimated delivery figure, and the checkout button is the main action.
6. **Remove or verify** the two unverified badges (P3).
7. **Escape** product data before rendering (P8).

Acceptance checks for Phase 1:
- Products and prices are visible without any interaction on a 390 px wide screen.
- Add-to-cart for a single-variant product takes one tap.
- Filter choice survives a reload.
- No unescaped product string reaches `innerHTML`.
- Cart totals match the checkout total for the same items (existing `trusted-cart` tests cover the server side; add a client check).

### Phase 2: Services (Cream)

1. Replace the accordions with a price-led grid of the five categories. Each card shows a "From R…" price, a short list of the top services, and one "Book" button.
2. Fix the Lash & Brow price mismatch and generate the JSON-LD `OfferCatalog` from the same list.
3. Link the Waxing landing page from the Services section and the nav.
4. Reduce the five "Book" links to one primary booking CTA per card, and open the booking app in the same tab on mobile.

### Phase 3: Training (Midnight)

1. Add a Training section and a nav item.
2. Move the workshop sign-up and the two guides into it. Host the guides as pages, with an email capture before download.
3. Add a short "what you will learn" list and a single sign-up CTA.

### Cross-cutting (any phase)
- Fix the Reviews link (S1). Decide on the Tara-S card (S2).
- Load fonts once (S3).
- Move brand images to `/assets` once the layout is settled (S4). Requires copying files; the image URLs stay the same until then.

---

## 8. Open questions

1. **Training.** I could not find a training offer in the code. I have assumed it means the waxing workshop and the guides. Is there a separate training product, price or schedule to show?
2. **Dark or light.** Should the hero and the footer stay dark with the photo background, with Cream, Blush and Midnight used as section bands? Or should the whole site move to the light palette?
3. **Badges.** Are "The Ritual They Return To" and "TRUSTED BY PROFESSIONALS" true? If not, what should the tile labels say?
4. **Returns and delivery.** What is the delivery fee or free-delivery threshold, and what is the product returns policy? The trust strip needs these facts.
5. **Tara-S card.** Keep it on the homepage, or remove it?
