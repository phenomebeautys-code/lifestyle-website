import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseSettings, renderCampaign, unsubscribeUrl, validUnsubscribe, firstName, productNames } from './campaigns.mjs';

const settings = { delay_days: 7, subject: 'Hi {first_name}', heading: 'Thanks', body: 'Hi {first_name},\n\nEnjoy your {products}.\n\nUse {code} for {offer}.', button_label: 'Shop', link: 'https://www.phenomebeauty.co.za/shop' };

test('settings are validated', () => {
  assert.ok(normaliseSettings('review_request', settings).settings);
  assert.match(normaliseSettings('review_request', { ...settings, delay_days: 0 }).error, /between 1 and 365/);
  assert.match(normaliseSettings('review_request', { ...settings, link: 'javascript:alert(1)' }).error, /https/);
  assert.match(normaliseSettings('review_request', { ...settings, subject: '' }).error, /subject/);
  assert.equal(normaliseSettings('replenishment', { ...settings, discount_code: ' back10 ' }).settings.discount_code, 'BACK10');
  assert.equal(normaliseSettings('review_request', { ...settings, discount_code: 'X' }).settings.discount_code, undefined);
});
test('names and products', () => {
  assert.equal(firstName('thandi mokoena'), 'Thandi');
  assert.equal(firstName(''), 'there');
  assert.equal(productNames([{ name: 'A' }, { name: 'B' }, { name: 'A' }, { name: 'C' }]).all, 'A, B and C');
});
test('renders placeholders, escapes, code link and tracking tags', () => {
  const order = { customer_name: '<b>Lindi</b> M', items: [{ name: 'Scrub & Butter' }] };
  const out = renderCampaign('replenishment', settings, order, { code: 'BACK10', label: '10% off' }, 'https://x/unsub');
  assert.equal(out.subject, 'Hi <b>Lindi</b>');
  assert.ok(out.html.includes('&lt;b&gt;Lindi&lt;/b&gt;'));
  assert.ok(!out.html.includes('<b>Lindi</b>'));
  assert.ok(out.html.includes('Scrub &amp; Butter'));
  assert.ok(out.html.includes('Use BACK10 for 10% off.'));
  assert.ok(out.html.includes('code=BACK10') && out.html.includes('utm_medium=email') && out.html.includes('utm_campaign=replenishment'));
  assert.ok(out.html.includes('https://x/unsub'));
  const review = renderCampaign('review_request', { ...settings, link: 'https://g.page/r/CSCXyIIoURUJEBM/review' }, order, null, 'u');
  assert.ok(review.html.includes('href="https://g.page/r/CSCXyIIoURUJEBM/review"'), 'external link left untouched');
});
test('unsubscribe tokens cannot be forged', async () => {
  const url = await unsubscribeUrl('https://p.supabase.co', 'A@B.co', 'secret');
  const u = new URL(url);
  assert.equal(u.searchParams.get('e'), 'a@b.co');
  assert.equal(await validUnsubscribe('a@b.co', u.searchParams.get('t'), 'secret'), true);
  assert.equal(await validUnsubscribe('c@d.co', u.searchParams.get('t'), 'secret'), false);
  assert.equal(await validUnsubscribe('a@b.co', u.searchParams.get('t'), 'other'), false);
  assert.equal(await validUnsubscribe('a@b.co', 'short', 'secret'), false);
});
