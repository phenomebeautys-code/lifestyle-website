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

import { earnsReward, rewardCode } from './campaigns.mjs';
test('loyalty settings and milestones', () => {
  const base = { delay_days: 1, subject: 's', heading: 'h', body: 'b', button_label: 'b', link: 'https://x.co' };
  const ok = normaliseSettings('loyalty_reward', { ...base, trigger: 'orders', every: 3, reward_kind: 'percent', reward_value: 15, valid_days: 60 });
  assert.equal(ok.settings.every, 3);
  assert.match(normaliseSettings('loyalty_reward', { ...base, trigger: 'orders', every: 1, reward_kind: 'percent', reward_value: 15, valid_days: 60 }).error, /2 and 50/);
  assert.match(normaliseSettings('loyalty_reward', { ...base, trigger: 'spend', every: 50, reward_kind: 'percent', reward_value: 15, valid_days: 60 }).error, /R100/);
  assert.match(normaliseSettings('loyalty_reward', { ...base, trigger: 'orders', every: 3, reward_kind: 'percent', reward_value: 95, valid_days: 60 }).error, /90%/);
  assert.match(normaliseSettings('loyalty_reward', { ...base, trigger: 'orders', every: 3, reward_kind: 'fixed', reward_value: 50, valid_days: 3 }).error, /7 to 365/);
  assert.equal(normaliseSettings('loyalty_reward', { ...base, trigger: 'orders', every: 3, reward_kind: 'free_delivery', reward_value: 99, valid_days: 30 }).settings.reward_value, 0);
  const h = [{ id: 'a', net: 300 }, { id: 'b', net: 300 }, { id: 'c', net: 500 }, { id: 'd', net: 100 }];
  assert.deepEqual(['a', 'b', 'c', 'd'].map(id => earnsReward({ trigger: 'orders', every: 2 }, h, id)), [false, true, false, true]);
  assert.deepEqual(['a', 'b', 'c', 'd'].map(id => earnsReward({ trigger: 'spend', every: 500 }, h, id)), [false, true, true, false]);
  assert.equal(earnsReward({ trigger: 'orders', every: 2 }, h, 'zz'), false);
  const codes = new Set(Array.from({ length: 200 }, () => rewardCode()));
  assert.ok([...codes].every(c => /^THANKS-[A-HJ-NP-Z2-9]{6}$/.test(c)) && codes.size > 195);
});
