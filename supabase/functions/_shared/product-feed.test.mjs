import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFeedItems, googleFeedXml, plainText, slug } from './product-feed.mjs';

const kit = { id: 'refine-restore-ritual-kit', name: 'Refine & Restore Ritual Kit', price: '440.00', active: true, availability: 'available', category: 'Kit', market: 'self_care',
  description: '<p>A complete <strong>at-home</strong> routine.</p>', image_url: 'https://iili.io/kit.png', image_urls: ['https://iili.io/kit.png', 'https://iili.io/kit2.png'],
  variants: [{ name: 'Calm', in_stock: true, image: 'https://iili.io/calm.png' }, { name: 'Lemongrass', in_stock: false }], sizes: [] };
const wax = { id: 'film-wax-collection', name: 'Film Wax Collection', price: '200.00', active: true, availability: 'available', category: 'Professional Wax', market: 'professional',
  description: 'Film wax', image_urls: ['https://iili.io/wax.png'], variants: [{ name: 'Type: Onyx', in_stock: true }], sizes: [{ name: '500g', price: 200 }, { name: '500g x 2', price: 360 }] };
const soon = { id: 'body-scrub', name: 'Body Scrub', price: '0.00', active: true, availability: 'coming_soon', variants: [{ name: 'A' }], image_url: 'https://iili.io/x.png' };
const noImg = { id: 'noimg', name: 'No Image', price: '100', active: true, availability: 'available', variants: [], image_url: '' };
const off = { id: 'off', name: 'Off', price: '100', active: false, availability: 'available' };

test('one item per variant, grouped, with stock and price', () => {
  const { items, skipped } = buildFeedItems([kit, wax, soon, noImg, off]);
  assert.deepEqual(items.map(i => i.id), ['refine-restore-ritual-kit-calm', 'refine-restore-ritual-kit-lemongrass', 'film-wax-collection-onyx']);
  const [calm, lemon, onyx] = items;
  assert.equal(calm.title, 'Refine & Restore Ritual Kit – Calm');
  assert.equal(calm.item_group_id, 'refine-restore-ritual-kit');
  assert.equal(calm.availability, 'in_stock');
  assert.equal(lemon.availability, 'out_of_stock');
  assert.equal(calm.price, '440.00 ZAR');
  assert.equal(calm.image_link, 'https://iili.io/calm.png');
  assert.equal(lemon.image_link, 'https://iili.io/kit2.png', 'variant 2 uses the 2nd photo, as the shop does');
  assert.equal(calm.description, 'A complete at-home routine.');
  assert.ok(calm.link.includes('/shop?product=refine-restore-ritual-kit&variant=Calm') && calm.link.includes('utm_source=google'));
  assert.equal(onyx.title, 'Film Wax Collection – Onyx');
  assert.equal(onyx.item_group_id, null, 'single variant is not a group');
  assert.equal(onyx.size, '500g');
  assert.equal(onyx.product_type, 'Professional > Professional Wax');
  assert.deepEqual(skipped.map(s => s.reason), ['Coming soon', 'No image']);
});
test('valid, escaped XML', () => {
  const xml = googleFeedXml(buildFeedItems([kit]).items);
  assert.ok(xml.startsWith('<?xml'));
  assert.ok(xml.includes('<g:title>Refine &amp; Restore Ritual Kit – Calm</g:title>'));
  assert.ok(xml.includes('&amp;variant=Calm'));
  assert.ok(xml.includes('<g:identifier_exists>no</g:identifier_exists>'));
  assert.equal((xml.match(/<item>/g) || []).length, 2);
  assert.ok(!/<[a-z:]+>[^<]*&(?!amp;|lt;|gt;|quot;|apos;)/.test(xml), 'no raw ampersands');
});
test('helpers', () => {
  assert.equal(slug('Type: Onyx Blue'), 'onyx-blue');
  assert.equal(plainText('a<br>b &amp; c'), 'a\nb & c');
});

test('labels like "Scrub Scent: Balance" are shortened', () => {
  const p = { ...kit, variants: [{ name: 'Scrub Scent: Balance' }, { name: 'Colour: Black' }] };
  const { items } = buildFeedItems([p]);
  assert.deepEqual(items.map(i => [i.id, i.title]), [['refine-restore-ritual-kit-balance', 'Refine & Restore Ritual Kit – Balance'], ['refine-restore-ritual-kit-black', 'Refine & Restore Ritual Kit – Black']]);
  assert.ok(items[0].link.includes('variant=Scrub+Scent%3A+Balance'), 'link keeps the full variant name for the shop');
});
