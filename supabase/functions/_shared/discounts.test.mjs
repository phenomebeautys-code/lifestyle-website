import test from 'node:test';
import assert from 'node:assert/strict';
import { discountCents, evaluateDiscount, normaliseCode, describeDiscount } from './discounts.mjs';

// Minimal fake: discount_codes lookup and shop_orders counts.
function fake(row, { paidUses = 0, customerUses = 0, fail = false } = {}) {
  return { from(table) {
    const q = { filters: {}, select() { return q; }, eq(k, v) { q.filters[k] = v; return q; }, is() { return q; }, ilike(k, v) { q.filters.ilike = v; return q; },
      maybeSingle: async () => fail ? { data: null, error: { message: 'x' } } : { data: row, error: null },
      then(res) { return Promise.resolve({ count: q.filters.ilike ? customerUses : paidUses, error: null }).then(res); } };
    return q;
  } };
}
const base = { id: '1', code: 'WELCOME10', kind: 'percent', value: 10, min_subtotal: 0, starts_at: null, ends_at: null, max_uses: null, once_per_customer: false, active: true };

test('normalises codes', () => { assert.equal(normaliseCode(' welcome 10 '), 'WELCOME10'); assert.equal(normaliseCode(5), ''); });
test('percent, fixed and the R10 floor', () => {
  assert.equal(discountCents(base, 36000), 3600);
  assert.equal(discountCents({ kind: 'percent', value: 95 }, 10000), 9000);
  assert.equal(discountCents({ kind: 'fixed', value: 50 }, 36000), 5000);
  assert.equal(discountCents({ kind: 'fixed', value: 500 }, 36000), 35000);
  assert.equal(discountCents({ kind: 'free_delivery', value: 0 }, 36000), 0);
  assert.equal(describeDiscount({ kind: 'fixed', value: 50 }), 'R50 off');
});
test('valid code', async () => {
  const r = await evaluateDiscount(fake(base), 'welcome10', 36000, 'a@b.co');
  assert.deepEqual([r.ok, r.code, r.discountCents, r.freeDelivery], [true, 'WELCOME10', 3600, false]);
});
test('unknown, off, early, expired', async () => {
  assert.equal((await evaluateDiscount(fake(null), 'NOPE', 36000)).ok, false);
  assert.equal((await evaluateDiscount(fake({ ...base, active: false }), 'WELCOME10', 36000)).ok, false);
  const now = new Date('2026-11-19T10:00:00Z');
  assert.match((await evaluateDiscount(fake({ ...base, starts_at: '2026-11-20T00:00:00Z' }), 'WELCOME10', 36000, '', now)).error, /not active yet/);
  assert.match((await evaluateDiscount(fake({ ...base, ends_at: '2026-11-19T09:00:00Z' }), 'WELCOME10', 36000, '', now)).error, /expired/);
  assert.equal((await evaluateDiscount(fake({ ...base, ends_at: '2026-11-19T11:00:00Z' }), 'WELCOME10', 36000, '', now)).ok, true);
});
test('minimum order, uses and once per customer', async () => {
  assert.match((await evaluateDiscount(fake({ ...base, min_subtotal: 400 }), 'WELCOME10', 36000)).error, /R400 or more/);
  assert.match((await evaluateDiscount(fake({ ...base, max_uses: 5 }, { paidUses: 5 }), 'WELCOME10', 36000)).error, /fully used/);
  assert.equal((await evaluateDiscount(fake({ ...base, max_uses: 5 }, { paidUses: 4 }), 'WELCOME10', 36000)).ok, true);
  assert.match((await evaluateDiscount(fake({ ...base, once_per_customer: true }, { customerUses: 1 }), 'WELCOME10', 36000, 'A@B.co')).error, /already used/);
  assert.equal((await evaluateDiscount(fake({ ...base, once_per_customer: true }, { customerUses: 0 }), 'WELCOME10', 36000, 'a@b.co')).ok, true);
});
test('free delivery code and database failure', async () => {
  const r = await evaluateDiscount(fake({ ...base, kind: 'free_delivery', value: 0 }), 'WELCOME10', 36000);
  assert.deepEqual([r.ok, r.freeDelivery, r.discountCents], [true, true, 0]);
  assert.equal((await evaluateDiscount(fake(base, { fail: true }), 'WELCOME10', 36000)).ok, false);
  assert.equal((await evaluateDiscount(fake(base), 'x', 36000)).ok, false);
});
test('personal codes only work for their email', async () => {
  const row = { ...base, customer_email: 'lindi@x.com' };
  assert.match((await evaluateDiscount(fake(row), 'WELCOME10', 36000, '')).error, /personal code/);
  assert.match((await evaluateDiscount(fake(row), 'WELCOME10', 36000, 'other@x.com')).error, /different email/);
  assert.equal((await evaluateDiscount(fake(row), 'WELCOME10', 36000, ' Lindi@X.com ')).ok, true);
});
