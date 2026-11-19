/**
 * Discount codes, created by the owner in admin → Discount codes (table discount_codes).
 *
 * Kinds: 'percent' (value = 1..90 % off products), 'fixed' (value = rand off products),
 * 'free_delivery' (no product discount; delivery is free).
 * Conditions: active, start and end dates, minimum product subtotal, total uses (paid orders),
 * one use per customer email.
 * Discounts apply to products only, never to delivery, and always leave at least R10 to pay,
 * because Yoco cannot take a zero payment.
 *
 * check-discount uses this to preview a code at checkout; create-order uses it to decide the
 * discount it records on the order. yoco-shop-checkout then charges what the order recorded.
 *
 * Plain JavaScript on purpose: the handler tests load this file as source text.
 */

export const MIN_PAYABLE_CENTS = 1000;
export const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,29}$/;

export function normaliseCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/g, '') : '';
}

/** Discount in cents for a code row and a product subtotal. Does not check conditions. */
export function discountCents(row, subtotalCents) {
  let cents = 0;
  if (row.kind === 'percent') cents = Math.floor(subtotalCents * Math.min(Math.max(Number(row.value) || 0, 0), 90) / 100);
  else if (row.kind === 'fixed') cents = Math.round((Number(row.value) || 0) * 100);
  return Math.max(0, Math.min(cents, subtotalCents - MIN_PAYABLE_CENTS));
}

/** Short shopper-facing description, e.g. "15% off" or "R50 off" or "Free delivery". */
export function describeDiscount(row) {
  if (row.kind === 'percent') return `${Number(row.value)}% off`;
  if (row.kind === 'fixed') return `R${Number(row.value)} off`;
  return 'Free delivery';
}

/**
 * Checks a code for this cart. Returns
 *   { ok: true, code, kind, label, discountCents, freeDelivery }  or  { ok: false, error }.
 * `email` is optional; without it the once-per-customer rule is checked again at order time.
 */
export async function evaluateDiscount(supabase, rawCode, subtotalCents, email, now = new Date()) {
  const code = normaliseCode(rawCode);
  if (!CODE_RE.test(code)) return { ok: false, error: 'That code is not valid.' };
  const { data: row, error } = await supabase.from('discount_codes')
    .select('id, code, kind, value, min_subtotal, starts_at, ends_at, max_uses, once_per_customer, active, customer_email')
    .eq('code', code).maybeSingle();
  if (error) return { ok: false, error: 'Discount codes are unavailable right now. Please try again.' };
  if (!row || row.active !== true) return { ok: false, error: 'That code is not valid.' };
  if (row.starts_at && now < new Date(row.starts_at)) return { ok: false, error: 'That code is not active yet.' };
  if (row.ends_at && now >= new Date(row.ends_at)) return { ok: false, error: 'That code has expired.' };
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  // Personal codes (loyalty rewards) only work for the email they were sent to.
  if (row.customer_email) {
    if (!cleanEmail) return { ok: false, error: 'This is a personal code. Enter the email address it was sent to first.' };
    if (cleanEmail !== row.customer_email) return { ok: false, error: 'This code belongs to a different email address. Use the email it was sent to.' };
  }
  const minCents = Math.round((Number(row.min_subtotal) || 0) * 100);
  if (subtotalCents < minCents) {
    return { ok: false, error: `This code needs an order of R${(minCents / 100).toFixed(0)} or more (before delivery).` };
  }
  if (row.max_uses) {
    const { count, error: countError } = await supabase.from('shop_orders')
      .select('id', { count: 'exact', head: true })
      .eq('discount_code', code).eq('payment_status', 'paid').is('cancelled_at', null);
    if (countError) return { ok: false, error: 'Discount codes are unavailable right now. Please try again.' };
    if ((count || 0) >= row.max_uses) return { ok: false, error: 'That code has been fully used.' };
  }
  if (row.once_per_customer && cleanEmail) {
    const { count, error: usedError } = await supabase.from('shop_orders')
      .select('id', { count: 'exact', head: true })
      .eq('discount_code', code).eq('payment_status', 'paid').ilike('customer_email', cleanEmail);
    if (usedError) return { ok: false, error: 'Discount codes are unavailable right now. Please try again.' };
    if ((count || 0) > 0) return { ok: false, error: 'You have already used this code.' };
  }
  const cents = discountCents(row, subtotalCents);
  if (row.kind !== 'free_delivery' && cents <= 0) return { ok: false, error: 'This code does not apply to this order.' };
  return { ok: true, code, kind: row.kind, label: describeDiscount(row), discountCents: cents, freeDelivery: row.kind === 'free_delivery' };
}
