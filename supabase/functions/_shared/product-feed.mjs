/**
 * Builds product-feed items from the products table, for Google Merchant Center
 * (and later Meta, which reads the same format).
 *
 * One item per variant (scent or type), grouped by product with item_group_id. Price is the
 * variant price if it has one, otherwise the product price. Availability follows the same rules
 * as the shop: a product must be active and 'available', and a variant must not be out of stock.
 * Products that are coming soon, unavailable or have no price are skipped and reported.
 *
 * Plain JavaScript on purpose: the tests load this file as source text.
 */

export const SITE = 'https://www.phenomebeauty.co.za';
const BRAND = 'Phenomebeauty';

const label = o => (o && (o.name || o.label || o.value)) || '';
// "Scrub Scent: Balance" or "Colour: Black" becomes "Balance" or "Black" in titles and IDs.
const shortName = text => String(text || '').replace(/^[^:]{1,30}:\s*/, '');

export function slug(text) {
  return shortName(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function plainText(html, max = 4900) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

function money(n) {
  return `${Number(n).toFixed(2)} ZAR`;
}

// The shop shows variant i with the i-th product photo when the variant has no photo of its own.
function images(p, variant, index) {
  const gallery = Array.isArray(p.image_urls) ? p.image_urls : [];
  const own = (variant && variant.image) || (variant && gallery[index]) || null;
  const list = [own, ...gallery, p.image_url]
    .filter(u => typeof u === 'string' && /^https:\/\//.test(u));
  return [...new Set(list)];
}

/** Returns { items, skipped }. */
export function buildFeedItems(products) {
  const items = [];
  const skipped = [];
  for (const p of products || []) {
    if (!p || p.active !== true) continue;
    const basePrice = Number(p.price);
    if (p.availability === 'coming_soon') { skipped.push({ id: p.id, name: p.name, reason: 'Coming soon' }); continue; }
    if (p.availability !== 'available') { skipped.push({ id: p.id, name: p.name, reason: 'Not available' }); continue; }
    const variants = Array.isArray(p.variants) && p.variants.length ? p.variants : [null];
    // The first size sets the price when sizes carry prices (e.g. 500g before 500g x 2).
    const firstSize = Array.isArray(p.sizes) && p.sizes.length ? p.sizes[0] : null;
    const description = plainText(p.description) || p.name;
    for (const [index, v] of variants.entries()) {
      const price = Number(v && v.price != null ? v.price : firstSize && firstSize.price != null ? firstSize.price : basePrice);
      const imgs = images(p, v, index);
      const name = shortName(label(v));
      if (!(price > 0)) { skipped.push({ id: p.id, name: `${p.name}${name ? ' · ' + name : ''}`, reason: 'No price' }); continue; }
      if (!imgs.length) { skipped.push({ id: p.id, name: `${p.name}${name ? ' · ' + name : ''}`, reason: 'No image' }); continue; }
      const id = (v ? `${p.id}-${slug(name)}` : p.id).slice(0, 50);
      const link = new URL(`${SITE}/shop`);
      link.searchParams.set('product', p.id);
      if (v) link.searchParams.set('variant', label(v));
      link.searchParams.set('utm_source', 'google');
      link.searchParams.set('utm_medium', 'shopping');
      items.push({
        id,
        item_group_id: variants.length > 1 ? p.id : null,
        title: (name ? `${p.name} – ${name}` : p.name).slice(0, 150),
        description,
        link: link.toString(),
        image_link: imgs[0],
        additional_image_links: imgs.slice(1, 11),
        availability: v && v.in_stock === false ? 'out_of_stock' : 'in_stock',
        price: money(price),
        brand: p.brand || BRAND,
        condition: 'new',
        product_type: [p.market === 'professional' ? 'Professional' : 'Self-care', p.category].filter(Boolean).join(' > '),
        size: firstSize ? label(firstSize) : null,
      });
    }
  }
  return { items, skipped };
}

function x(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Google Merchant Center RSS 2.0 feed. */
export function googleFeedXml(items) {
  const body = items.map(i => `    <item>
      <g:id>${x(i.id)}</g:id>
      <g:title>${x(i.title)}</g:title>
      <g:description>${x(i.description)}</g:description>
      <g:link>${x(i.link)}</g:link>
      <g:image_link>${x(i.image_link)}</g:image_link>
${i.additional_image_links.map(u => `      <g:additional_image_link>${x(u)}</g:additional_image_link>`).join('\n')}${i.additional_image_links.length ? '\n' : ''}      <g:availability>${i.availability}</g:availability>
      <g:price>${x(i.price)}</g:price>
      <g:brand>${x(i.brand)}</g:brand>
      <g:condition>${i.condition}</g:condition>
      <g:identifier_exists>no</g:identifier_exists>
      <g:product_type>${x(i.product_type)}</g:product_type>
${i.item_group_id ? `      <g:item_group_id>${x(i.item_group_id)}</g:item_group_id>\n` : ''}${i.size ? `      <g:size>${x(i.size)}</g:size>\n` : ''}    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Phenomebeauty</title>
    <link>${SITE}</link>
    <description>Phenomebeauty shop products</description>
${body}
  </channel>
</rss>
`;
}
