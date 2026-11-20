import test from 'node:test';
import assert from 'node:assert/strict';
import { GIFT_CODE_RE, GIFT_THEMES, giftCardTheme, giftCardError, giftCardExpiry, newGiftCode, normaliseGiftCode, normaliseGiftSettings, renderGiftCardEmail } from './gift-cards.mjs';

test('codes', () => {
  const codes = new Set(Array.from({ length: 300 }, () => newGiftCode()));
  assert.ok([...codes].every(c => GIFT_CODE_RE.test(c)) && codes.size === 300);
  assert.equal(normaliseGiftCode(' pb-7kq4 mx2r-9tva '), 'PB-7KQ4-MX2R-9TVA');
  assert.equal(normaliseGiftCode('7KQ4MX2R9TVA'), 'PB-7KQ4-MX2R-9TVA');
  assert.equal(normaliseGiftCode('PB-7KQ4-MX2R'), '');
  assert.equal(normaliseGiftCode('PB-0OI1-MX2R-9TVA'), '', 'look-alike characters are never in codes');
});
test('expiry is 3 years', () => {
  assert.equal(giftCardExpiry(new Date('2026-11-19T10:00:00Z')), '2029-11-19T10:00:00.000Z');
});
test('settings', () => {
  assert.deepEqual(normaliseGiftSettings({ enabled: true, amounts: [1000, '500', 250, 250, 20, 99999] }), { enabled: true, amounts: [250, 500, 1000] });
  assert.equal(normaliseGiftSettings({ enabled: true, amounts: [] }).enabled, false, 'no amounts means not on sale');
  assert.equal(normaliseGiftSettings(null).enabled, false);
});
test('errors', () => {
  assert.match(giftCardError('ERROR: GIFT_CARD_EXPIRED'), /expired/);
  assert.match(giftCardError('GIFT_CARD_EMPTY'), /no balance/);
  assert.match(giftCardError('other'), /unavailable/);
});
test('email escapes and shows the code', () => {
  const e = renderGiftCardEmail({ code: 'PB-7KQ4-MX2R-9TVA', initial_amount: 1000, recipient_name: '<b>Lindi</b> M', sender_name: 'Thandi', message: 'Enjoy & relax', expires_at: '2029-11-19T10:00:00Z' });
  assert.equal(e.subject, 'Thandi sent you a Phenomebeauty gift card');
  assert.ok(e.html.includes('PB-7KQ4-MX2R-9TVA') && e.html.includes('R1 000') && e.html.includes('Enjoy &amp; relax'));
  assert.ok(!e.html.includes('<b>Lindi</b>') && e.html.includes('&lt;b&gt;Lindi&lt;/b&gt;'));
  assert.ok(e.html.includes('19 November 2029'));
});

test('each offered amount gets its own brand colour pairing', () => {
  const offered = [500, 250, 1000];
  assert.equal(giftCardTheme(250, offered).name, 'blush');
  assert.equal(giftCardTheme(500, offered).name, 'ink');
  assert.equal(giftCardTheme(1000, offered).name, 'cream');
  assert.equal(giftCardTheme(750, offered).name, 'ink', 'custom amount takes the nearest offered amount below it');
  assert.equal(giftCardTheme(100, offered).name, 'blush');
  assert.equal(new Set(GIFT_THEMES.map(t => t.bg + t.type)).size, GIFT_THEMES.length, 'no two themes look the same');
  const allowed = ['#F3F1E8', '#F2C6C2', '#000000'];
  assert.ok(GIFT_THEMES.every(t => [t.bg, t.type, t.mark].every(c => allowed.includes(c)) && t.bg !== t.type && t.bg !== t.mark), 'brand colours only, readable');
});

test('gift card email uses the colour for its price point', () => {
  const card = { code: 'PB-7KQ4-MX2R-9TVA', recipient_name: 'Lindi', expires_at: '2029-11-19T10:00:00Z' };
  const low = renderGiftCardEmail({ ...card, initial_amount: 250 }, [250, 500]).html;
  const high = renderGiftCardEmail({ ...card, initial_amount: 500 }, [250, 500]).html;
  assert.match(low, /bgcolor="#F2C6C2"/);
  assert.match(high, /bgcolor="#000000" style="background-color:#000000;background-image:radial-gradient/);
  assert.match(high, />GIFT<\/div>/);
  assert.match(high, />CARD<\/div>/);
  assert.match(high, /Phenomebeauty<\/td>/);
});

test('gift card email says products only, not services', () => {
  const e = renderGiftCardEmail({ code: 'PB-7KQ4-MX2R-9TVA', initial_amount: 250, expires_at: '2029-11-19T10:00:00Z' }, [250]);
  assert.match(e.html, /cannot be used for services, only products/);
  assert.match(e.text, /cannot be used for services, only products/);
  assert.doesNotMatch(e.html, /waxing/);
});
