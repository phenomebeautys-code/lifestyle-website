import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { logActivity, ownerExists, resolveAdmin } from '../_shared/admin-auth.ts';
import { corsOrigin } from '../_shared/site-origin.ts';
import { loadFreeDelivery, normaliseFreeDelivery } from '../_shared/free-delivery.mjs';
import { CODE_RE, normaliseCode } from '../_shared/discounts.mjs';
import { CAMPAIGN_KEYS, normaliseSettings } from '../_shared/campaigns.mjs';
import { loadGiftSettings, normaliseGiftSettings } from '../_shared/gift-cards.mjs';

/**
 * shop-admin: back end for shop-admin.html.
 *
 * Based on the live version 46 (status rules, payment marking, product editing), plus Phase 1:
 * owner account, activity log, order timeline and notes, tags, cancel, archive, recorded refunds
 * with optional restock, tracking references, customers and abandoned checkouts.
 *
 * Refunds are recorded after the money has been returned in the Yoco portal. This function never
 * calls Yoco. No customer emails are sent for tracking: Pudo notifies the customer.
 */

const ADMIN_PASSWORD   = Deno.env.get('SHOP_ADMIN_PASSWORD') ?? '';
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OWNER_EMAIL      = (Deno.env.get('SHOP_OWNER_EMAIL') ?? 'phenomebeautys@gmail.com').toLowerCase();

function corsHeaders(req: Request) {
  return {
    'Access-Control-Allow-Origin':  corsOrigin(req.headers.get('origin') ?? ''),
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

const loginAttempts = new Map<string, { count: number; firstAt: number }>();
const RATE_LIMIT    = 5;
const RATE_WINDOW   = 60_000;

function isRateLimited(ip: string): boolean {
  const now    = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now - record.firstAt > RATE_WINDOW) {
    loginAttempts.set(ip, { count: 1, firstAt: now });
    return false;
  }
  record.count++;
  return record.count > RATE_LIMIT;
}

function json(data: unknown, status = 200, cors: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const VALID_AVAILABILITY = ['available', 'unavailable', 'coming_soon'];
const ORDER_COLUMNS = 'id, created_at, customer_name, customer_email, customer_phone, delivery_address, delivery_method, delivery_meta, items, subtotal, delivery_fee, total_amount, payment_status, payment_id, paid_at, status, is_gift, gift_message, notes, tags, archived_at, cancelled_at, cancel_reason, refunded_amount, pudo_tracking_ref, pudo_shipment_id, reminder_sent, discount_code, discount_amount, gift_card_amount';

function cents(value: unknown): number {
  return Math.round(Number(value) * 100);
}

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function cleanTags(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const tags = [...new Set(value
    .filter((t): t is string => typeof t === 'string')
    .map(t => t.trim().slice(0, 40))
    .filter(Boolean))];
  return tags.length > 20 ? null : tags;
}

async function fireEmail(type: string, order_id: string, status?: string): Promise<{ ok: boolean; status: number; detail?: unknown }> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-order-email`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE}`,
        'apikey':        SUPABASE_SERVICE,
      },
      body: JSON.stringify({ type, order_id, status }),
    });
    const detail = await response.json().catch(() => null);
    if (!response.ok || detail?.error) {
      console.error('[shop-admin] send-order-email rejected:', response.status, detail);
      return { ok: false, status: response.status, detail };
    }
    return { ok: true, status: response.status, detail };
  } catch (err) {
    console.error('[shop-admin] send-order-email failed (non-fatal):', err);
    return { ok: false, status: 0, detail: String(err) };
  }
}

// deno-lint-ignore no-explicit-any
async function addEvent(supabase: any, order_id: string, actor: string, kind: string, message: string | null, data?: unknown) {
  try {
    await supabase.from('order_events').insert({ order_id, actor, kind, message, data: data ?? null });
  } catch { /* the timeline is best effort; the order change has already been saved */ }
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST')    return new Response('Method Not Allowed', { status: 405 });

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('cf-connecting-ip') ??
    'unknown';

  // deno-lint-ignore no-explicit-any
  let body: Record<string, any>;
  try { body = await req.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400, cors);
  }
  if (!body || typeof body !== 'object') return json({ error: 'Invalid JSON' }, 400, cors);

  if (isRateLimited(ip)) {
    return new Response(
      JSON.stringify({ error: 'Too many attempts. Try again in 60 seconds.' }),
      { status: 429, headers: { ...cors, 'Content-Type': 'application/json', 'Retry-After': '60' } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);
  const { action } = body;

  const admin = await resolveAdmin(supabase, body.password, ADMIN_PASSWORD);
  if (!admin.ok) return json({ error: admin.error, code: admin.code }, admin.status, cors);
  loginAttempts.delete(ip);
  const actor = admin.actor;

  /* ── Account ────────────────────────────────────────────────────── */

  if (action === 'whoami') {
    return json({ actor, role: admin.role, via: admin.via, owner_exists: admin.via === 'account' ? true : await ownerExists(supabase), owner_email: OWNER_EMAIL }, 200, cors);
  }

  // One-time switch from the shared password to the owner account.
  if (action === 'create_owner') {
    if (admin.via !== 'password') return json({ error: 'The owner account already exists.' }, 409, cors);
    const email = cleanText(body.email, 254).toLowerCase();
    const newPassword = typeof body.new_password === 'string' ? body.new_password : '';
    if (email !== OWNER_EMAIL) return json({ error: `The owner account must use ${OWNER_EMAIL}.` }, 400, cors);
    if (newPassword.length < 12) return json({ error: 'Choose a password of at least 12 characters.' }, 400, cors);

    let userId: string | null = null;
    const { data: created, error: createError } = await supabase.auth.admin.createUser({ email, password: newPassword, email_confirm: true });
    if (created?.user) {
      userId = created.user.id;
    } else {
      // The address may already have a Supabase Auth user. Reuse it and set the new password.
      const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = list?.users?.find((u: { email?: string }) => (u.email || '').toLowerCase() === email);
      if (!existing) return json({ error: createError?.message || 'Could not create the owner account.' }, 500, cors);
      const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, { password: newPassword, email_confirm: true });
      if (updateError) return json({ error: updateError.message }, 500, cors);
      userId = existing.id;
    }

    const { error: insertError } = await supabase.from('admin_users').insert({ user_id: userId, email, role: 'owner' });
    if (insertError) return json({ error: insertError.message }, 500, cors);
    await logActivity(supabase, email, 'create_owner', 'admin_user', userId, null);
    return json({ ok: true, email }, 200, cors);
  }

  if (action === 'get_activity') {
    const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 500);
    const { data, error } = await supabase.from('admin_activity').select('*').order('at', { ascending: false }).limit(limit);
    if (error) return json({ error: error.message }, 500, cors);
    return json({ activity: data ?? [] }, 200, cors);
  }

  /* ── Orders ─────────────────────────────────────────────────────── */

  if (action === 'get_orders') {
    const { data, error } = await supabase
      .from('shop_orders')
      .select(ORDER_COLUMNS)
      .order('created_at', { ascending: false });

    if (error) return json({ error: error.message }, 500, cors);
    return json({ orders: data }, 200, cors);
  }

  if (action === 'update_status') {
    const { order_id, status } = body;
    const allowed = ['pending', 'processing', 'confirmed', 'dispatched', 'delivered'];

    if (!order_id) return json({ error: 'Missing order_id' }, 400, cors);
    if (!status || !allowed.includes(status)) return json({ error: 'Invalid status' }, 400, cors);

    const { data: current, error: currentErr } = await supabase
      .from('shop_orders')
      .select('status, payment_status, cancelled_at')
      .eq('id', order_id)
      .single();

    if (currentErr || !current) return json({ error: 'Order not found' }, 404, cors);
    if (current.cancelled_at || current.status === 'cancelled') return json({ error: 'This order is cancelled. Its status cannot change.' }, 409, cors);
    if (current.status === status) return json({ ok: true, unchanged: true, email_sent: null }, 200, cors);

    if (['confirmed', 'dispatched', 'delivered'].includes(status) && current.payment_status !== 'paid') {
      return json({ error: 'A verified paid order is required for this status' }, 409, cors);
    }
    if (current.payment_status === 'paid' && status === 'pending') {
      return json({ error: 'A paid order cannot be returned to Payment Pending. Refresh the order and choose the intended status.' }, 409, cors);
    }

    const { data: updated, error } = await supabase
      .from('shop_orders')
      .update({ status })
      .eq('id', order_id)
      .eq('status', current.status)
      .select('id')
      .maybeSingle();

    if (error) return json({ error: error.message }, 500, cors);
    if (!updated) return json({ error: 'Order status changed concurrently; refresh before trying again' }, 409, cors);

    await addEvent(supabase, order_id, actor, 'status', `Status changed from ${current.status} to ${status}.`, { from: current.status, to: status });
    await logActivity(supabase, actor, 'update_status', 'order', order_id, { from: current.status, to: status });

    let emailResult: { ok: boolean; status: number; detail?: unknown } | null = null;
    if (status === 'dispatched' || status === 'delivered') {
      emailResult = await fireEmail('status_update', order_id, status);
    }

    return json({
      ok: true,
      email_sent: emailResult?.ok ?? null,
      email_status: emailResult?.status ?? null,
      ...(emailResult && !emailResult.ok ? { email_error: emailResult.detail ?? 'Email notification failed' } : {}),
    }, 200, cors);
  }

  if (action === 'mark_paid') {
    const { order_id } = body;
    if (!order_id) return json({ error: 'Missing order_id' }, 400, cors);

    const { data: current, error: fetchErr } = await supabase
      .from('shop_orders')
      .select('payment_status, cancelled_at')
      .eq('id', order_id)
      .single();

    if (fetchErr || !current) return json({ error: 'Order not found' }, 404, cors);
    if (current.cancelled_at) return json({ error: 'This order is cancelled.' }, 409, cors);
    if (current.payment_status === 'paid') {
      return json({ error: 'Order is already marked as paid', already_paid: true }, 409, cors);
    }

    const paidAt = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from('shop_orders')
      .update({
        payment_status: 'paid',
        paid_at:        paidAt,
        status:         'processing',
      })
      .eq('id', order_id);

    if (updateErr) return json({ error: updateErr.message }, 500, cors);

    await addEvent(supabase, order_id, actor, 'payment', 'Marked as paid.', { paid_at: paidAt });
    await logActivity(supabase, actor, 'mark_paid', 'order', order_id, null);
    fireEmail('payment_received', order_id);

    return json({ ok: true, paid_at: paidAt }, 200, cors);
  }

  if (action === 'get_order_events') {
    const { order_id } = body;
    if (!order_id) return json({ error: 'Missing order_id' }, 400, cors);
    const { data, error } = await supabase.from('order_events').select('*').eq('order_id', order_id).order('at', { ascending: false });
    if (error) return json({ error: error.message }, 500, cors);
    return json({ events: data ?? [] }, 200, cors);
  }

  if (action === 'add_order_note') {
    const { order_id } = body;
    const note = cleanText(body.note, 2000);
    if (!order_id) return json({ error: 'Missing order_id' }, 400, cors);
    if (!note) return json({ error: 'Write a note first.' }, 400, cors);
    const { data: order } = await supabase.from('shop_orders').select('id').eq('id', order_id).maybeSingle();
    if (!order) return json({ error: 'Order not found' }, 404, cors);
    const { error } = await supabase.from('order_events').insert({ order_id, actor, kind: 'note', message: note });
    if (error) return json({ error: error.message }, 500, cors);
    await logActivity(supabase, actor, 'add_order_note', 'order', order_id, null);
    return json({ ok: true }, 200, cors);
  }

  if (action === 'set_order_tags') {
    const { order_id } = body;
    const tags = cleanTags(body.tags);
    if (!order_id) return json({ error: 'Missing order_id' }, 400, cors);
    if (!tags) return json({ error: 'Use up to 20 tags.' }, 400, cors);
    const { data, error } = await supabase.from('shop_orders').update({ tags }).eq('id', order_id).select('id').maybeSingle();
    if (error) return json({ error: error.message }, 500, cors);
    if (!data) return json({ error: 'Order not found' }, 404, cors);
    await addEvent(supabase, order_id, actor, 'tags', tags.length ? `Tags: ${tags.join(', ')}.` : 'Tags cleared.', { tags });
    await logActivity(supabase, actor, 'set_order_tags', 'order', order_id, { tags });
    return json({ ok: true, tags }, 200, cors);
  }

  if (action === 'cancel_order') {
    const { order_id } = body;
    const reason = cleanText(body.reason, 500);
    if (!order_id) return json({ error: 'Missing order_id' }, 400, cors);
    if (!reason) return json({ error: 'Give a reason for cancelling.' }, 400, cors);
    const { data: current } = await supabase.from('shop_orders').select('status, cancelled_at').eq('id', order_id).maybeSingle();
    if (!current) return json({ error: 'Order not found' }, 404, cors);
    if (current.cancelled_at || current.status === 'cancelled') return json({ error: 'This order is already cancelled.' }, 409, cors);
    if (['dispatched', 'delivered'].includes(current.status)) {
      return json({ error: 'This order has already been dispatched. Record a refund instead.' }, 409, cors);
    }
    const cancelledAt = new Date().toISOString();
    const { data: updated, error } = await supabase.from('shop_orders')
      .update({ status: 'cancelled', cancelled_at: cancelledAt, cancel_reason: reason })
      .eq('id', order_id).eq('status', current.status).select('id').maybeSingle();
    if (error) return json({ error: error.message }, 500, cors);
    if (!updated) return json({ error: 'Order changed concurrently; refresh before trying again' }, 409, cors);
    await addEvent(supabase, order_id, actor, 'cancel', `Cancelled: ${reason}`, { from: current.status });
    // Any gift card amount held for this order goes back on the card.
    try {
      const { data: given } = await supabase.rpc('gift_card_release', { p_order: order_id, p_note: 'Order cancelled' });
      if (Number(given) > 0) await addEvent(supabase, order_id, actor, 'note', `R${Number(given).toFixed(2)} given back to the gift card.`);
    } catch { /* the hourly job also gives back holds on cancelled orders */ }
    await logActivity(supabase, actor, 'cancel_order', 'order', order_id, { reason });
    return json({ ok: true, cancelled_at: cancelledAt }, 200, cors);
  }

  if (action === 'archive_order' || action === 'unarchive_order') {
    const { order_id } = body;
    if (!order_id) return json({ error: 'Missing order_id' }, 400, cors);
    const archivedAt = action === 'archive_order' ? new Date().toISOString() : null;
    const { data, error } = await supabase.from('shop_orders').update({ archived_at: archivedAt }).eq('id', order_id).select('id').maybeSingle();
    if (error) return json({ error: error.message }, 500, cors);
    if (!data) return json({ error: 'Order not found' }, 404, cors);
    const kind = action === 'archive_order' ? 'archive' : 'unarchive';
    await addEvent(supabase, order_id, actor, kind, archivedAt ? 'Archived.' : 'Moved back to open orders.');
    await logActivity(supabase, actor, action, 'order', order_id, null);
    return json({ ok: true, archived_at: archivedAt }, 200, cors);
  }

  // Records a refund already made in the Yoco portal. Optionally puts returned items back into stock.
  if (action === 'record_refund') {
    const { order_id } = body;
    const amountCents = cents(body.amount);
    const reason = cleanText(body.reason, 500);
    if (!order_id) return json({ error: 'Missing order_id' }, 400, cors);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return json({ error: 'Enter a refund amount greater than zero.' }, 400, cors);
    if (!reason) return json({ error: 'Give a reason for the refund.' }, 400, cors);

    const { data: order } = await supabase.from('shop_orders')
      .select('id, payment_status, total_amount, refunded_amount, items').eq('id', order_id).maybeSingle();
    if (!order) return json({ error: 'Order not found' }, 404, cors);
    if (order.payment_status !== 'paid') return json({ error: 'Only paid orders can be refunded.' }, 409, cors);

    const alreadyCents = cents(order.refunded_amount || 0);
    const totalCents = cents(order.total_amount);
    if (alreadyCents + amountCents > totalCents) {
      return json({ error: `The refund is more than the amount left to refund (R${((totalCents - alreadyCents) / 100).toFixed(2)}).` }, 400, cors);
    }

    // Restock lines may only return what the order contained.
    const ordered = new Map<string, number>();
    for (const item of Array.isArray(order.items) ? order.items : []) {
      if (item && typeof item.productId === 'string') {
        ordered.set(item.productId, (ordered.get(item.productId) || 0) + (Number(item.qty) || 0) * (Number(item.units_per_pack) || 1));
      }
    }
    const restock: Array<{ productId: string; qty: number }> = [];
    for (const line of Array.isArray(body.restock) ? body.restock : []) {
      const qty = Number(line?.qty);
      if (!line || typeof line.productId !== 'string' || !Number.isSafeInteger(qty) || qty <= 0) continue;
      if (qty > (ordered.get(line.productId) || 0)) return json({ error: 'You cannot restock more than the order contained.' }, 400, cors);
      restock.push({ productId: line.productId, qty });
    }

    const refundedAfter = (alreadyCents + amountCents) / 100;
    const { data: updated, error: updateErr } = await supabase.from('shop_orders')
      .update({ refunded_amount: refundedAfter })
      .eq('id', order_id).eq('refunded_amount', order.refunded_amount || 0)
      .select('id').maybeSingle();
    if (updateErr) return json({ error: updateErr.message }, 500, cors);
    if (!updated) return json({ error: 'Another refund was recorded at the same time; refresh before trying again.' }, 409, cors);

    const restocked: Array<{ productId: string; qty: number; stock_after: number }> = [];
    const restockErrors: string[] = [];
    for (const line of restock) {
      const { data: product } = await supabase.from('products').select('id, stock_on_hand').eq('id', line.productId).maybeSingle();
      if (!product) { restockErrors.push(`${line.productId}: product not found`); continue; }
      const before = Number(product.stock_on_hand) || 0;
      const after = before + line.qty;
      const { error: moveErr } = await supabase.from('inventory_movements').insert({
        product_id: line.productId, movement_type: 'returned', quantity: line.qty,
        stock_before: before, stock_after: after, reference_type: 'shop_order', reference_id: order_id,
        note: `Returned with refund: ${reason}`,
      });
      if (moveErr) { restockErrors.push(`${line.productId}: ${moveErr.message}`); continue; }
      await supabase.from('products').update({ stock_on_hand: after }).eq('id', line.productId);
      restocked.push({ productId: line.productId, qty: line.qty, stock_after: after });
    }

    const amount = amountCents / 100;
    const fully = refundedAfter * 100 >= totalCents;
    await addEvent(supabase, order_id, actor, 'refund',
      `Refund of R${amount.toFixed(2)} recorded (${fully ? 'fully refunded' : 'partly refunded'}): ${reason}`,
      { amount, refunded_total: refundedAfter, restocked });
    await logActivity(supabase, actor, 'record_refund', 'order', order_id, { amount, reason, restocked });
    return json({ ok: true, refunded_amount: refundedAfter, fully_refunded: fully, restocked, restock_errors: restockErrors }, 200, cors);
  }

  if (action === 'set_tracking') {
    const { order_id } = body;
    const trackingRef = cleanText(body.tracking_ref, 120);
    const shipmentId = cleanText(body.shipment_id, 120);
    if (!order_id) return json({ error: 'Missing order_id' }, 400, cors);
    if (!trackingRef) return json({ error: 'Enter the Pudo tracking reference.' }, 400, cors);
    const { data, error } = await supabase.from('shop_orders')
      .update({ pudo_tracking_ref: trackingRef, ...(shipmentId ? { pudo_shipment_id: shipmentId } : {}) })
      .eq('id', order_id).select('id').maybeSingle();
    if (error) return json({ error: error.message }, 500, cors);
    if (!data) return json({ error: 'Order not found' }, 404, cors);
    await addEvent(supabase, order_id, actor, 'tracking', `Tracking reference: ${trackingRef}`, { tracking_ref: trackingRef, shipment_id: shipmentId || null });
    await logActivity(supabase, actor, 'set_tracking', 'order', order_id, { tracking_ref: trackingRef });
    return json({ ok: true }, 200, cors);
  }

  // Unpaid checkouts that never completed payment. Cancelled and archived orders are left out.
  if (action === 'get_abandoned') {
    const { data, error } = await supabase.from('shop_orders')
      .select('id, created_at, customer_name, customer_email, customer_phone, items, total_amount, reminder_sent, status, payment_status, cancelled_at, archived_at')
      .eq('payment_status', 'unpaid')
      .order('created_at', { ascending: false });
    if (error) return json({ error: error.message }, 500, cors);
    const abandoned = (data ?? []).filter((o: { cancelled_at: string | null; archived_at: string | null; status: string }) =>
      !o.cancelled_at && !o.archived_at && o.status !== 'cancelled');
    return json({ abandoned }, 200, cors);
  }

  /* ── Customers (built from order history) ───────────────────────── */

  if (action === 'get_customers' || action === 'get_customer') {
    const wanted = action === 'get_customer' ? cleanText(body.email, 254).toLowerCase() : '';
    if (action === 'get_customer' && !wanted) return json({ error: 'Missing email' }, 400, cors);

    let query = supabase.from('shop_orders')
      .select('id, created_at, customer_name, customer_email, customer_phone, total_amount, refunded_amount, payment_status, status, cancelled_at')
      .order('created_at', { ascending: false });
    if (wanted) query = query.ilike('customer_email', wanted);
    const { data: orders, error } = await query;
    if (error) return json({ error: error.message }, 500, cors);

    const { data: profiles } = await supabase.from('customer_profiles').select('*');
    const profileMap = new Map((profiles ?? []).map((p: { email: string }) => [p.email, p]));

    // deno-lint-ignore no-explicit-any
    const customers = new Map<string, any>();
    for (const o of orders ?? []) {
      const email = String(o.customer_email || '').trim().toLowerCase();
      if (!email) continue;
      if (!customers.has(email)) {
        customers.set(email, {
          email, name: o.customer_name, phone: o.customer_phone,
          orders: 0, paid_orders: 0, total_spent: 0, first_order_at: o.created_at, last_order_at: o.created_at,
          notes: null, tags: [], order_list: [],
        });
      }
      const c = customers.get(email);
      c.orders += 1;
      if (o.payment_status === 'paid' && !o.cancelled_at) {
        c.paid_orders += 1;
        c.total_spent = Math.round((c.total_spent + Number(o.total_amount) - Number(o.refunded_amount || 0)) * 100) / 100;
      }
      if (o.created_at < c.first_order_at) c.first_order_at = o.created_at;
      if (o.created_at > c.last_order_at) { c.last_order_at = o.created_at; c.name = o.customer_name; c.phone = o.customer_phone; }
      if (wanted) c.order_list.push({ id: o.id, created_at: o.created_at, total_amount: o.total_amount, refunded_amount: o.refunded_amount, payment_status: o.payment_status, status: o.status });
    }
    for (const c of customers.values()) {
      const p = profileMap.get(c.email) as { notes?: string; tags?: string[] } | undefined;
      if (p) { c.notes = p.notes ?? null; c.tags = p.tags ?? []; }
      if (!wanted) delete c.order_list;
    }

    if (wanted) {
      const customer = customers.get(wanted);
      if (!customer) return json({ error: 'Customer not found' }, 404, cors);
      return json({ customer }, 200, cors);
    }
    const list = [...customers.values()].sort((a, b) => (a.last_order_at < b.last_order_at ? 1 : -1));
    return json({ customers: list }, 200, cors);
  }

  if (action === 'save_customer') {
    const email = cleanText(body.email, 254).toLowerCase();
    const notes = cleanText(body.notes, 2000);
    const tags = cleanTags(body.tags ?? []);
    if (!email) return json({ error: 'Missing email' }, 400, cors);
    if (!tags) return json({ error: 'Use up to 20 tags.' }, 400, cors);
    const { error } = await supabase.from('customer_profiles')
      .upsert({ email, notes: notes || null, tags, updated_at: new Date().toISOString() }, { onConflict: 'email' });
    if (error) return json({ error: error.message }, 500, cors);
    await logActivity(supabase, actor, 'save_customer', 'customer', email, { tags });
    return json({ ok: true }, 200, cors);
  }

  /* ── Shop settings ──────────────────────────────────────────────── */

  if (action === 'get_settings') {
    return json({ free_delivery: await loadFreeDelivery(supabase) }, 200, cors);
  }

  if (action === 'save_free_delivery') {
    const input = body.free_delivery && typeof body.free_delivery === 'object' ? body.free_delivery : {};
    const wantOn = input.enabled === true;
    const rule = normaliseFreeDelivery({ ...input, enabled: wantOn });
    if (wantOn && !rule.enabled) {
      return json({ error: 'Enter an amount between R1 and R100 000 and choose at least one delivery method.' }, 400, cors);
    }
    const { error } = await supabase.from('shop_settings')
      .upsert({ key: 'free_delivery', value: rule, updated_at: new Date().toISOString(), updated_by: actor }, { onConflict: 'key' });
    if (error) return json({ error: error.message }, 500, cors);
    await logActivity(supabase, actor, 'save_free_delivery', 'setting', 'free_delivery', rule);
    return json({ free_delivery: rule }, 200, cors);
  }

  /* ── Discount codes ─────────────────────────────────────────────── */

  if (action === 'get_discounts') {
    const [{ data: codes, error }, { data: used }] = await Promise.all([
      supabase.from('discount_codes').select('*').order('created_at', { ascending: false }),
      supabase.from('shop_orders').select('discount_code, total_amount, refunded_amount, discount_amount, payment_status, cancelled_at')
        .not('discount_code', 'is', null),
    ]);
    if (error) return json({ error: error.message }, 500, cors);
    // deno-lint-ignore no-explicit-any
    const stats: Record<string, any> = {};
    for (const o of used ?? []) {
      const st = (stats[o.discount_code] ||= { orders: 0, sales: 0, discount_given: 0, unpaid: 0 });
      if (o.payment_status === 'paid' && !o.cancelled_at) {
        st.orders += 1;
        st.sales = Math.round((st.sales + Number(o.total_amount) - Number(o.refunded_amount || 0)) * 100) / 100;
        st.discount_given = Math.round((st.discount_given + Number(o.discount_amount || 0)) * 100) / 100;
      } else st.unpaid += 1;
    }
    return json({ discounts: (codes ?? []).map((c: { code: string }) => ({ ...c, stats: stats[c.code] || { orders: 0, sales: 0, discount_given: 0, unpaid: 0 } })) }, 200, cors);
  }

  if (action === 'save_discount') {
    const d = body.discount && typeof body.discount === 'object' ? body.discount : {};
    const kind = ['percent', 'fixed', 'free_delivery'].includes(d.kind) ? d.kind : null;
    if (!kind) return json({ error: 'Choose the type of discount.' }, 400, cors);
    const value = kind === 'free_delivery' ? 0 : Number(d.value);
    if (kind === 'percent' && !(value > 0 && value <= 90)) return json({ error: 'A percentage discount must be between 1% and 90%.' }, 400, cors);
    if (kind === 'fixed' && !(value > 0 && value <= 100000)) return json({ error: 'Enter the rand amount off.' }, 400, cors);
    const minSubtotal = d.min_subtotal === '' || d.min_subtotal == null ? 0 : Number(d.min_subtotal);
    if (!(minSubtotal >= 0 && minSubtotal <= 100000)) return json({ error: 'The minimum order must be zero or more.' }, 400, cors);
    const maxUses = d.max_uses === '' || d.max_uses == null ? null : Math.round(Number(d.max_uses));
    if (maxUses !== null && !(maxUses >= 1 && maxUses <= 100000)) return json({ error: 'Total uses must be 1 or more, or left empty for no limit.' }, 400, cors);
    const date = (v: unknown) => { if (!v) return null; const t = new Date(String(v)); return isNaN(t.getTime()) ? undefined : t.toISOString(); };
    const startsAt = date(d.starts_at), endsAt = date(d.ends_at);
    if (startsAt === undefined || endsAt === undefined) return json({ error: 'Check the start and end dates.' }, 400, cors);
    if (startsAt && endsAt && endsAt <= startsAt) return json({ error: 'The end date must be after the start date.' }, 400, cors);
    const row = {
      kind, value, min_subtotal: minSubtotal, max_uses: maxUses, starts_at: startsAt, ends_at: endsAt,
      once_per_customer: d.once_per_customer === true, active: d.active !== false,
      campaign: cleanText(d.campaign, 80) || null, note: cleanText(d.note, 500) || null, updated_at: new Date().toISOString(),
    };
    if (d.id) {
      const { data, error } = await supabase.from('discount_codes').update(row).eq('id', d.id).select('*').maybeSingle();
      if (error) return json({ error: error.message }, 500, cors);
      if (!data) return json({ error: 'Discount code not found' }, 404, cors);
      await logActivity(supabase, actor, 'update_discount', 'discount', data.code, { kind, value, active: row.active });
      return json({ discount: data }, 200, cors);
    }
    const code = normaliseCode(d.code);
    if (!CODE_RE.test(code)) return json({ error: 'Codes are 3 to 30 letters, numbers, dashes or underscores, e.g. WELCOME10.' }, 400, cors);
    const { data, error } = await supabase.from('discount_codes').insert({ ...row, code, created_by: actor }).select('*').single();
    if (error) return json({ error: error.code === '23505' ? 'That code already exists.' : error.message }, error.code === '23505' ? 409 : 500, cors);
    await logActivity(supabase, actor, 'create_discount', 'discount', code, { kind, value });
    return json({ discount: data }, 200, cors);
  }

  if (action === 'delete_discount') {
    const { data: d } = await supabase.from('discount_codes').select('id, code').eq('id', body.id).maybeSingle();
    if (!d) return json({ error: 'Discount code not found' }, 404, cors);
    const { count } = await supabase.from('shop_orders').select('id', { count: 'exact', head: true }).eq('discount_code', d.code);
    if ((count || 0) > 0) return json({ error: 'This code is on existing orders, so it is kept for your records. Switch it off instead.' }, 409, cors);
    const { error } = await supabase.from('discount_codes').delete().eq('id', d.id);
    if (error) return json({ error: error.message }, 500, cors);
    await logActivity(supabase, actor, 'delete_discount', 'discount', d.code, null);
    return json({ ok: true }, 200, cors);
  }

  /* ── Email campaigns ────────────────────────────────────────────── */

  if (action === 'get_campaigns') {
    const [{ data: rows, error }, { data: sends }, { count: optouts }] = await Promise.all([
      supabase.from('email_campaigns').select('*'),
      supabase.from('campaign_sends').select('id, campaign, order_id, email, sent_at, status, detail').order('sent_at', { ascending: false }).limit(200),
      supabase.from('email_optouts').select('email', { count: 'exact', head: true }),
    ]);
    if (error) return json({ error: error.message }, 500, cors);
    return json({ campaigns: rows ?? [], sends: sends ?? [], optouts: optouts || 0 }, 200, cors);
  }

  if (action === 'save_campaign') {
    if (!CAMPAIGN_KEYS.includes(body.key)) return json({ error: 'Unknown campaign' }, 400, cors);
    const checked = normaliseSettings(body.key, body.settings);
    if (checked.error) return json({ error: checked.error }, 400, cors);
    if (checked.settings.discount_code) {
      const { data: code } = await supabase.from('discount_codes').select('code').eq('code', checked.settings.discount_code).maybeSingle();
      if (!code) return json({ error: `There is no discount code ${checked.settings.discount_code}. Create it under Discount codes first.` }, 400, cors);
    }
    const { data: current } = await supabase.from('email_campaigns').select('enabled, enabled_at').eq('key', body.key).maybeSingle();
    const enabled = body.enabled === true;
    // Switching on starts from now, so customers from before (or from while it was off) are not emailed.
    const enabledAt = enabled ? (current?.enabled && current.enabled_at ? current.enabled_at : new Date().toISOString()) : null;
    const { data, error } = await supabase.from('email_campaigns')
      .upsert({ key: body.key, enabled, enabled_at: enabledAt, settings: checked.settings, updated_at: new Date().toISOString(), updated_by: actor }, { onConflict: 'key' })
      .select('*').single();
    if (error) return json({ error: error.message }, 500, cors);
    await logActivity(supabase, actor, 'save_campaign', 'campaign', body.key, { enabled, delay_days: checked.settings.delay_days });
    return json({ campaign: data }, 200, cors);
  }

  // Preview, send a test to the owner, list who is due, or send what is due now.
  if (action === 'campaign_tool') {
    const mode = ['preview', 'test', 'dry_run', 'run'].includes(body.mode) ? body.mode : null;
    if (!mode) return json({ error: 'Unknown tool' }, 400, cors);
    const to = admin.via === 'account' ? actor : OWNER_EMAIL;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/run-campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_SERVICE}`, apikey: SUPABASE_SERVICE },
      body: JSON.stringify({ mode, key: body.key, settings: body.settings, to }),
    });
    const data = await res.json().catch(() => ({ error: 'Campaign service unavailable' }));
    if (mode === 'test' || mode === 'run') await logActivity(supabase, actor, `campaign_${mode}`, 'campaign', body.key || 'all', null);
    return json(data, res.ok ? 200 : res.status, cors);
  }

  if (action === 'retry_failed_sends') {
    if (!CAMPAIGN_KEYS.includes(body.key)) return json({ error: 'Unknown campaign' }, 400, cors);
    const { error } = await supabase.from('campaign_sends').delete().eq('campaign', body.key).eq('status', 'failed');
    if (error) return json({ error: error.message }, 500, cors);
    await logActivity(supabase, actor, 'retry_failed_sends', 'campaign', body.key, null);
    return json({ ok: true }, 200, cors);
  }

  /* ── Gift cards ─────────────────────────────────────────────────── */

  if (action === 'get_gift_cards') {
    const [{ data: cards, error }, settings] = await Promise.all([
      supabase.from('gift_cards').select('id, code, initial_amount, balance, expires_at, status, recipient_name, recipient_email, sender_name, source, purchase_order_id, emailed_at, created_at, created_by')
        .order('created_at', { ascending: false }).limit(500),
      loadGiftSettings(supabase),
    ]);
    if (error) return json({ error: error.message }, 500, cors);
    const now = Date.now();
    const live = (cards ?? []).filter((c: { status: string; expires_at: string }) => c.status === 'active' && new Date(c.expires_at).getTime() > now);
    const outstanding = Math.round(live.reduce((sum: number, c: { balance: number }) => sum + Number(c.balance), 0) * 100) / 100;
    // Codes are shown in full only when a card is opened, not in the list.
    const list = (cards ?? []).map((c: { code: string }) => ({ ...c, code: undefined, last4: c.code.slice(-4) }));
    return json({ cards: list, settings, outstanding, live: live.length }, 200, cors);
  }

  if (action === 'get_gift_card') {
    const { data: card } = await supabase.from('gift_cards').select('*').eq('id', body.card_id).maybeSingle();
    if (!card) return json({ error: 'Gift card not found' }, 404, cors);
    const { data: ledger } = await supabase.from('gift_card_ledger').select('*').eq('card_id', card.id).order('at', { ascending: false }).limit(200);
    return json({ card, ledger: ledger ?? [] }, 200, cors);
  }

  if (action === 'issue_gift_card' || action === 'resend_gift_card') {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gift-card-jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_SERVICE}`, apikey: SUPABASE_SERVICE },
      body: JSON.stringify(action === 'issue_gift_card'
        ? { mode: 'issue', amount: body.amount, recipient_name: body.recipient_name, recipient_email: body.recipient_email, sender_name: body.sender_name, message: body.message, send_email: body.send_email === true, actor }
        : { mode: 'resend', card_id: body.card_id }),
    });
    const data = await res.json().catch(() => ({ error: 'Gift card service unavailable' }));
    if (res.ok) await logActivity(supabase, actor, action, 'gift_card', data.card ? data.card.id : body.card_id, action === 'issue_gift_card' ? { amount: Number(body.amount) } : null);
    return json(data, res.ok ? 200 : res.status, cors);
  }

  if (action === 'adjust_gift_card') {
    const change = Math.round(Number(body.change) * 100) / 100;
    const kind = body.kind === 'topup' ? 'topup' : 'adjust';
    const note = cleanText(body.note, 300);
    if (!Number.isFinite(change) || change === 0 || Math.abs(change) > 50000) return json({ error: 'Enter an amount to add or take off.' }, 400, cors);
    if (kind === 'topup' && change < 0) return json({ error: 'A top-up adds to the balance.' }, 400, cors);
    if (!note) return json({ error: 'Add a short note so the history makes sense later.' }, 400, cors);
    const { data: balance, error } = await supabase.rpc('gift_card_adjust', { p_card: body.card_id, p_change: change, p_kind: kind, p_actor: actor, p_note: note });
    if (error) return json({ error: /GIFT_CARD_BALANCE/.test(error.message) ? 'The balance cannot go below zero.' : error.message }, 400, cors);
    await logActivity(supabase, actor, 'adjust_gift_card', 'gift_card', body.card_id, { change, kind, note });
    return json({ balance }, 200, cors);
  }

  if (action === 'set_gift_card_status') {
    const status = body.status === 'disabled' ? 'disabled' : 'active';
    const { data, error } = await supabase.from('gift_cards').update({ status }).eq('id', body.card_id).select('id').maybeSingle();
    if (error) return json({ error: error.message }, 500, cors);
    if (!data) return json({ error: 'Gift card not found' }, 404, cors);
    await logActivity(supabase, actor, 'set_gift_card_status', 'gift_card', body.card_id, { status });
    return json({ ok: true, status }, 200, cors);
  }

  if (action === 'save_gift_card_settings') {
    const input = body.settings && typeof body.settings === 'object' ? body.settings : {};
    const settings = normaliseGiftSettings(input);
    if (input.enabled === true && !settings.enabled) return json({ error: 'Add at least one amount between R50 and R10 000.' }, 400, cors);
    const { error } = await supabase.from('shop_settings').upsert({ key: 'gift_cards', value: settings, updated_at: new Date().toISOString(), updated_by: actor }, { onConflict: 'key' });
    if (error) return json({ error: error.message }, 500, cors);
    await logActivity(supabase, actor, 'save_gift_card_settings', 'setting', 'gift_cards', settings);
    return json({ settings }, 200, cors);
  }

  /* ── Sales analytics ────────────────────────────────────────────── */

  // Report for the last N days, plus the N days before that for comparison.
  if (action === 'get_analytics') {
    const days = [7, 30, 90, 365].includes(Number(body.days)) ? Number(body.days) : 30;
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    const prevFrom = new Date(from.getTime() - days * 86_400_000);
    const [current, previous] = await Promise.all([
      supabase.rpc('admin_sales_report', { p_from: from.toISOString(), p_to: to.toISOString() }),
      supabase.rpc('admin_sales_report', { p_from: prevFrom.toISOString(), p_to: from.toISOString() }),
    ]);
    if (current.error) return json({ error: current.error.message }, 500, cors);
    if (previous.error) return json({ error: previous.error.message }, 500, cors);
    return json({ days, current: current.data, previous: previous.data }, 200, cors);
  }

  /* ── Products (unchanged from live version 46, plus the activity log) ─ */

  if (action === 'get_products') {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, price, cost_price, sku, brand, description, image_url, image_urls, category, variants, sizes, active, availability, idx, created_at, weight_kg, length_cm, width_cm, height_cm, pack_flat')
      .order('idx', { ascending: true });

    if (error) return json({ error: error.message }, 500, cors);
    return json({ products: data }, 200, cors);
  }

  if (action === 'add_product') {
    const p = body.product;
    if (!p || !p.name) return json({ error: 'Missing product name' }, 400, cors);

    const { data: existing } = await supabase
      .from('products')
      .select('idx')
      .order('idx', { ascending: false })
      .limit(1)
      .single();
    const nextIdx = existing ? (Number(existing.idx) + 1) : 0;

    const availability = VALID_AVAILABILITY.includes(p.availability as string)
      ? p.availability
      : 'available';

    const { data, error } = await supabase
      .from('products')
      .insert({
        id:           crypto.randomUUID(),
        name:         p.name,
        price:        p.price        ?? 0,
        cost_price:   p.cost_price   ?? 0,
        sku:          p.sku          ?? '',
        brand:        p.brand        ?? '',
        description:  p.description  ?? '',
        image_url:    p.image_url    ?? '',
        image_urls:   p.image_urls   ?? [],
        category:     p.category     ?? '',
        variants:     p.variants     ?? [],
        sizes:        p.sizes        ?? [],
        active:       true,
        availability: availability,
        idx:          nextIdx,
      })
      .select()
      .single();

    if (error) return json({ error: error.message }, 500, cors);
    await logActivity(supabase, actor, 'add_product', 'product', data?.id, { name: p.name });
    return json({ product: data }, 200, cors);
  }

  if (action === 'update_product') {
    const p = body.product;
    if (!p || !p.id)   return json({ error: 'Missing product id' }, 400, cors);
    if (!p.name)       return json({ error: 'Missing product name' }, 400, cors);

    const availability = VALID_AVAILABILITY.includes(p.availability as string)
      ? p.availability
      : 'available';

    const { data, error } = await supabase
      .from('products')
      .update({
        name:         p.name,
        price:        p.price        ?? 0,
        cost_price:   p.cost_price   ?? 0,
        sku:          p.sku          ?? '',
        brand:        p.brand        ?? '',
        description:  p.description  ?? '',
        image_url:    p.image_url    ?? '',
        image_urls:   p.image_urls   ?? [],
        category:     p.category     ?? '',
        variants:     p.variants     ?? [],
        sizes:        p.sizes        ?? [],
        active:       p.active       ?? true,
        availability: availability,
      })
      .eq('id', p.id)
      .select()
      .single();

    if (error) return json({ error: error.message }, 500, cors);
    await logActivity(supabase, actor, 'update_product', 'product', p.id, { name: p.name });
    return json({ product: data }, 200, cors);
  }

  if (action === 'delete_product') {
    const { product_id } = body;
    if (!product_id) return json({ error: 'Missing product_id' }, 400, cors);

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', product_id);

    if (error) return json({ error: error.message }, 500, cors);
    await logActivity(supabase, actor, 'delete_product', 'product', product_id, null);
    return json({ ok: true }, 200, cors);
  }

  if (action === 'reorder_products') {
    const order = body.order;
    if (!Array.isArray(order) || !order.length) return json({ error: 'Missing order array' }, 400, cors);

    const updates = order.map(({ id, idx }: { id: string; idx: number }) =>
      supabase.from('products').update({ idx }).eq('id', id)
    );
    const results = await Promise.all(updates);
    const failed  = results.find((r: { error: unknown }) => r.error);
    // deno-lint-ignore no-explicit-any
    if (failed?.error) return json({ error: (failed.error as any).message }, 500, cors);

    await logActivity(supabase, actor, 'reorder_products', 'product', null, { count: order.length });
    return json({ ok: true }, 200, cors);
  }

  return json({ error: 'Unknown action' }, 400, cors);
});
