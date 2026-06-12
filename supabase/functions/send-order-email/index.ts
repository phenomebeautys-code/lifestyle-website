/**
 * send-order-email  (PhenomeBeauty shop)
 * Internal Edge Function — called by other functions using service role.
 * Never exposed directly to the browser.
 *
 * Accepted body:
 *   { type: 'order_placed',      order_id: string }
 *   { type: 'payment_received',  order_id: string }
 *   { type: 'status_update',     order_id: string, status: 'dispatched' | 'delivered' }
 *
 * Env vars required:
 *   RESEND_API_KEY             — re_... key scoped to phenomebeauty.co.za
 *   SUPABASE_URL               — injected automatically
 *   SUPABASE_SERVICE_ROLE_KEY  — injected automatically
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API  = 'https://api.resend.com/emails';
const FROM        = 'PhenomeBeauty Orders <orders@phenomebeauty.co.za>';
const ADMIN_EMAIL = 'phenomebeautys@gmail.com';
const STORE_URL   = 'https://www.phenomebeauty.co.za';
const LOGO_URL    = 'https://iili.io/fpiAjBj.jpg';
const WA_LINK     = 'https://wa.me/2745115725';

/* ── Shared CSS for customer-facing emails ─────────────────────────────────── */
const BASE_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=Inter:wght@400;500;600;700&display=swap');
  body { margin:0; padding:0; background:#0a0a0c; font-family:'Inter',sans-serif; color:#e8e4dc; }
  .wrap { max-width:600px; margin:0 auto; background:#0a0a0c; }
  .header { background:#0a0a0c; padding:36px 40px 24px; border-bottom:1px solid rgba(255,255,255,0.08); text-align:center; }
  .logo { display:block; margin:0 auto 18px; width:140px; height:auto; }
  .headline { font-family:'Cormorant Garamond','Georgia',serif; font-size:28px; font-weight:300; color:#f5f0e8; line-height:1.25; letter-spacing:0.02em; }
  .body { padding:32px 40px; }
  .section { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:24px; margin-bottom:20px; }
  .section-label { font-size:10px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:#7a7060; margin-bottom:12px; }
  .detail { font-size:14px; color:#b0a898; margin-top:4px; line-height:1.5; }
  .item-row { display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.06); font-size:14px; }
  .item-row:last-child { border-bottom:none; }
  .item-name { color:#e8e4dc; font-weight:500; }
  .item-meta { font-size:12px; color:#7a7060; margin-top:2px; }
  .item-price { color:#b8a98a; font-weight:700; white-space:nowrap; }
  .total-row { display:flex; justify-content:space-between; padding:6px 0; font-size:14px; color:#b0a898; }
  .total-row.grand { font-size:17px; font-weight:700; color:#f5f0e8; border-top:1px solid rgba(255,255,255,0.12); padding-top:12px; margin-top:4px; }
  .total-row.grand .total-val { color:#b8a98a; }
  .badge { display:inline-block; padding:4px 12px; border-radius:40px; font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; }
  .badge-pending   { background:rgba(251,191,36,0.1);   border:1px solid rgba(251,191,36,0.3);  color:#fbbf24; }
  .badge-paid      { background:rgba(74,222,128,0.1);   border:1px solid rgba(74,222,128,0.3);  color:#4ade80; }
  .badge-onitsway  { background:rgba(245,243,239,0.08); border:1px solid rgba(245,243,239,0.18); color:#f5f0e8; }
  .badge-delivered { background:rgba(74,222,128,0.12);  border:1px solid rgba(74,222,128,0.3);  color:#4ade80; }
  .gift-box { background:rgba(255,200,80,0.06); border:1px solid rgba(255,200,80,0.2); border-radius:12px; padding:18px 24px; margin-bottom:20px; }
  .gift-label { font-size:10px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:#fbbf24; margin-bottom:8px; }
  .gift-msg { font-size:14px; font-style:italic; color:#e8d898; line-height:1.6; }
  .delivery-note { background:rgba(184,169,138,0.06); border:1px solid rgba(184,169,138,0.18); border-radius:12px; padding:20px 24px; margin-bottom:20px; }
  .delivery-note-label { font-size:10px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:#b8a98a; margin-bottom:10px; }
  .delivery-note-copy { font-size:14px; color:#b0a898; line-height:1.75; }
  .delivery-note-copy strong { color:#f5f0e8; }
  .cta-btn { display:inline-block; background:#b8a98a; color:#0a0a0c; text-decoration:none; font-weight:700; font-size:13px; letter-spacing:0.08em; text-transform:uppercase; padding:14px 32px; border-radius:8px; margin-top:8px; }
  .sign { font-size:14px; color:#b0a898; margin-top:28px; line-height:1.7; }
  .sign strong { color:#f5f0e8; }
  .footer { padding:28px 40px; border-top:1px solid rgba(255,255,255,0.06); text-align:center; }
  .footer p { font-size:12px; color:#4a4640; line-height:1.7; margin:0; }
  .footer a { color:#7a7060; text-decoration:none; }
  @media (max-width:600px) {
    .header, .body, .footer { padding-left:20px; padding-right:20px; }
    .headline { font-size:22px; }
    .logo { width:110px; }
  }
`;

/* ── Helpers ───────────────────────────────────────────────────────────────── */
function esc(str: string | null | undefined): string {
  return (str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmt(n: number | null | undefined): string {
  return 'R' + (Number(n) || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function shortId(id: string): string {
  return String(id).slice(0, 8).toUpperCase();
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
}

/* ── Delivery label ────────────────────────────────────────────────────────── */
function deliveryLabel(order: Record<string, any>): { method: string; address: string } {
  if (order.delivery_method === 'locker') {
    const meta = order.delivery_meta || {};
    return {
      method:  'Pudo Locker Collection',
      address: [meta.locker_name, meta.locker_address].filter(Boolean).join(' — '),
    };
  }
  return {
    method:  'Door Delivery',
    address: order.delivery_address || '',
  };
}

/* ── Items HTML ────────────────────────────────────────────────────────────── */
function itemsHTML(items: any[]): string {
  if (!items?.length) return '<div style="color:#7a7060;font-size:14px;padding:8px 0">No items</div>';
  return items.map(i => `
    <div class="item-row">
      <div>
        <div class="item-name">${esc(i.name)}</div>
        ${i.variant ? `<div class="item-meta">${esc(i.variant)}</div>` : ''}
        ${i.size    ? `<div class="item-meta">Size: ${esc(i.size)}</div>` : ''}
        <div class="item-meta">Qty: ${i.qty}</div>
      </div>
      <div class="item-price">${fmt(i.price * i.qty)}</div>
    </div>`).join('');
}

/* ── Totals HTML ───────────────────────────────────────────────────────────── */
function totalsHTML(order: Record<string, any>): string {
  let html = '';
  if (order.subtotal != null) {
    html += `<div class="total-row"><span>Subtotal</span><span>${fmt(order.subtotal)}</span></div>`;
  }
  if (order.delivery_fee != null) {
    html += `<div class="total-row"><span>Delivery</span><span>${fmt(order.delivery_fee)}</span></div>`;
  }
  html += `<div class="total-row grand"><span>Total</span><span class="total-val">${fmt(order.total_amount)}</span></div>`;
  return html;
}

/* ── Logo HTML ─────────────────────────────────────────────────────────────── */
function logoHTML(): string {
  return `<img src="${LOGO_URL}" alt="PhenomeBeauty" class="logo" />`;
}

/* ── Signature HTML ────────────────────────────────────────────────────────── */
function signatureHTML(): string {
  return `<p class="sign">Warm regards,<br><strong>Shu-Meez</strong><br>PhenomeBeauty</p>`;
}

/* ══════════════════════════════════════════════════════════════════════════════
   EMAIL BUILDERS — CUSTOMER FACING
══════════════════════════════════════════════════════════════════════════════ */

/* ── 1. order_placed ── sent immediately when order is created ─────────────── */
function buildOrderPlaced(order: Record<string, any>): { subject: string; html: string } {
  const orderNo  = shortId(order.id);
  const delivery = deliveryLabel(order);
  const items    = Array.isArray(order.items) ? order.items : [];

  const subject = `Your PhenomeBeauty order #${orderNo} is confirmed`;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${BASE_STYLE}</style></head>
<body><div class="wrap">
  <div class="header">
    ${logoHTML()}
    <div class="headline">Order received.</div>
  </div>
  <div class="body">

    <div style="margin-bottom:20px">
      <span class="badge badge-pending">Payment Pending</span>
    </div>

    <p style="font-size:15px;color:#b0a898;line-height:1.7;margin:0 0 24px">
      Hi <strong style="color:#f5f0e8">${esc(order.customer_name)}</strong>,<br><br>
      Thank you for choosing PhenomeBeauty.<br><br>
      We've received your order and it is currently awaiting payment confirmation. Once payment has been received, we'll begin preparing your order with care.
    </p>

    <div class="section">
      <div class="section-label">Your order details</div>
      ${itemsHTML(items)}
      <div style="margin-top:16px">${totalsHTML(order)}</div>
    </div>

    <div class="section">
      <div class="section-label">Delivery</div>
      <div class="detail" style="font-weight:600;color:#e8e4dc">${esc(delivery.method)}</div>
      ${delivery.address ? `<div class="detail">${esc(delivery.address)}</div>` : ''}
    </div>

    ${order.is_gift && order.gift_message ? `
    <div class="gift-box">
      <div class="gift-label">Gift Message</div>
      <div class="gift-msg">&ldquo;${esc(order.gift_message)}&rdquo;</div>
    </div>` : ''}

    <p style="font-size:14px;color:#b0a898;line-height:1.7;margin:0 0 8px">
      Questions about your order? 
      <a href="${WA_LINK}" style="color:#b8a98a">Contact us on WhatsApp</a>.
    </p>

    <p style="font-size:14px;color:#b0a898;line-height:1.7;margin:16px 0 0">
      Thank you for making yourself a priority.
    </p>

    ${signatureHTML()}

  </div>
  <div class="footer">
    <p>PhenomeBeauty &mdash; <a href="${STORE_URL}">${STORE_URL}</a><br>
    This email was sent to ${esc(order.customer_email)} because you placed an order on our store.</p>
  </div>
</div></body></html>`;

  return { subject, html };
}

/* ── 2. payment_received (customer) ── branded, no admin BCC ───────────────── */
function buildPaymentReceived(order: Record<string, any>): { subject: string; html: string } {
  const orderNo  = shortId(order.id);
  const delivery = deliveryLabel(order);
  const items    = Array.isArray(order.items) ? order.items : [];
  const paidAt   = order.paid_at ? formatDate(order.paid_at) : formatDate(order.created_at);

  const subject = `Payment received — order #${orderNo} is being prepared`;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${BASE_STYLE}</style></head>
<body><div class="wrap">
  <div class="header">
    ${logoHTML()}
    <div class="headline">Payment confirmed.</div>
  </div>
  <div class="body">

    <div style="margin-bottom:20px">
      <span class="badge badge-paid">Payment Confirmed</span>
    </div>

    <p style="font-size:15px;color:#b0a898;line-height:1.7;margin:0 0 24px">
      Hi <strong style="color:#f5f0e8">${esc(order.customer_name)}</strong>,<br><br>
      Your payment of <strong style="color:#b8a98a">${fmt(order.total_amount)}</strong> has been successfully received on ${paidAt}.<br><br>
      We're now preparing your order and will have it on its way to you soon.
    </p>

    <div class="section">
      <div class="section-label">Your order details</div>
      ${itemsHTML(items)}
      <div style="margin-top:16px">${totalsHTML(order)}</div>
    </div>

    <div class="section">
      <div class="section-label">Delivery</div>
      <div class="detail" style="font-weight:600;color:#e8e4dc">${esc(delivery.method)}</div>
      ${delivery.address ? `<div class="detail">${esc(delivery.address)}</div>` : ''}
    </div>

    ${order.is_gift && order.gift_message ? `
    <div class="gift-box">
      <div class="gift-label">Gift Message</div>
      <div class="gift-msg">&ldquo;${esc(order.gift_message)}&rdquo;</div>
    </div>` : ''}

    <p style="font-size:14px;color:#b0a898;line-height:1.7;margin:0 0 8px">
      We'll send another update as soon as your order has been dispatched.
    </p>

    <p style="font-size:14px;color:#b0a898;line-height:1.7;margin:8px 0 0">
      Questions? <a href="${WA_LINK}" style="color:#b8a98a">Chat with us on WhatsApp</a>.
    </p>

    ${signatureHTML()}

  </div>
  <div class="footer">
    <p>PhenomeBeauty &mdash; <a href="${STORE_URL}">${STORE_URL}</a><br>
    This email was sent to ${esc(order.customer_email)} because you placed an order on our store.</p>
  </div>
</div></body></html>`;

  return { subject, html };
}

/* ── 2b. payment_received (admin system notification) ──────────────────────── */
function buildAdminPaymentNotification(order: Record<string, any>): { subject: string; html: string } {
  const orderNo  = shortId(order.id);
  const delivery = deliveryLabel(order);
  const items    = Array.isArray(order.items) ? order.items : [];
  const paidAt   = order.paid_at ? formatDate(order.paid_at) : formatDate(order.created_at);

  const subject = `[NEW ORDER] #${orderNo} — ${esc(order.customer_name)} — ${fmt(order.total_amount)}`;

  const itemLines = items.map((i: any) =>
    `${i.qty}x ${i.name}${i.variant ? ' (' + i.variant + ')' : ''}${i.size ? ' [' + i.size + ']' : ''} — ${fmt(i.price * i.qty)}`
  ).join('<br>');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body { margin:0; padding:0; background:#ffffff; font-family:Arial,sans-serif; color:#1a1a1a; }
    .wrap { max-width:600px; margin:0 auto; padding:32px 24px; }
    h2 { font-size:18px; font-weight:700; margin:0 0 20px; color:#1a1a1a; }
    table { width:100%; border-collapse:collapse; font-size:14px; }
    td { padding:8px 0; border-bottom:1px solid #eeeeee; vertical-align:top; }
    td:first-child { font-weight:700; width:160px; color:#555555; }
    .total { font-size:16px; font-weight:700; color:#1a1a1a; }
  </style>
  </head>
<body><div class="wrap">
  <h2>New paid order — #${orderNo}</h2>
  <table>
    <tr><td>Customer</td><td>${esc(order.customer_name)}</td></tr>
    <tr><td>Email</td><td>${esc(order.customer_email)}</td></tr>
    <tr><td>Phone</td><td>${esc(order.customer_phone || '—')}</td></tr>
    <tr><td>Paid on</td><td>${paidAt}</td></tr>
    <tr><td>Delivery</td><td>${esc(delivery.method)}${delivery.address ? '<br>' + esc(delivery.address) : ''}</td></tr>
    <tr><td>Items</td><td>${itemLines || '—'}</td></tr>
    ${order.subtotal   != null ? `<tr><td>Subtotal</td><td>${fmt(order.subtotal)}</td></tr>` : ''}
    ${order.delivery_fee != null ? `<tr><td>Delivery fee</td><td>${fmt(order.delivery_fee)}</td></tr>` : ''}
    <tr><td>Total</td><td class="total">${fmt(order.total_amount)}</td></tr>
    ${order.is_gift ? `<tr><td>Gift order</td><td>${order.gift_message ? '&ldquo;' + esc(order.gift_message) + '&rdquo;' : 'Yes (no message)'}</td></tr>` : ''}
    ${order.notes ? `<tr><td>Notes</td><td>${esc(order.notes)}</td></tr>` : ''}
  </table>
</div></body></html>`;

  return { subject, html };
}

/* ── 3. status_update ── sent when admin marks dispatched or delivered ──────── */
function buildStatusUpdate(order: Record<string, any>, status: string): { subject: string; html: string } {
  const orderNo  = shortId(order.id);
  const delivery = deliveryLabel(order);
  const items    = Array.isArray(order.items) ? order.items : [];

  const isDispatched = status === 'dispatched';
  const isLocker     = order.delivery_method === 'locker';

  const headline   = isDispatched ? 'Your order is on its way.' : 'Your order has been delivered.';
  const badgeClass = isDispatched ? 'badge-onitsway'  : 'badge-delivered';
  const badgeLabel = isDispatched ? 'On Its Way'      : 'Delivered';
  const subject    = isDispatched
    ? `Your PhenomeBeauty order #${orderNo} is on its way`
    : `Your PhenomeBeauty order #${orderNo} has been delivered`;

  const introCopy = isDispatched
    ? `Hi <strong style="color:#f5f0e8">${esc(order.customer_name)}</strong>,<br><br>
       Your order is on its way.<br><br>
       We've carefully packed your PhenomeBeauty order and it has been handed to <strong style="color:#f5f0e8">The Courier Guy (Pudo)</strong> for delivery.`
    : `Hi <strong style="color:#f5f0e8">${esc(order.customer_name)}</strong>,<br><br>
       Your order has been delivered.<br><br>
       We hope you enjoy your PhenomeBeauty essentials and that they serve you well in the routines and rituals that help you feel your best.`;

  const dispatchDeliveryNote = isDispatched ? (isLocker
    ? `<div class="delivery-note">
        <div class="delivery-note-label">Collecting your order</div>
        <div class="delivery-note-copy">
          Your parcel is heading to your chosen <strong>Pudo locker</strong>.<br><br>
          The Courier Guy will send you a <strong>PIN code</strong> directly via SMS and email once your parcel arrives at the locker. You will need that PIN to open the locker and collect your order.<br><br>
          Please collect your parcel within 36 hours of receiving the PIN.
        </div>
      </div>`
    : `<div class="delivery-note">
        <div class="delivery-note-label">Your delivery</div>
        <div class="delivery-note-copy">
          Your parcel is on its way to your door via <strong>The Courier Guy</strong>.<br><br>
          Keep an eye on your phone — you will receive an SMS notification when your courier is on the way.
        </div>
      </div>`
  ) : '';

  const outroDispatched = `
    <p style="font-size:14px;color:#b0a898;line-height:1.7;margin:0 0 8px">
      Thank you for choosing PhenomeBeauty.
    </p>
    <p style="font-size:14px;color:#b0a898;line-height:1.7;margin:8px 0 0">
      Questions about your delivery? <a href="${WA_LINK}" style="color:#b8a98a">Contact us on WhatsApp</a>.
    </p>`;

  const outroDelivered = `
    <p style="font-size:14px;color:#b0a898;line-height:1.7;margin:0 0 16px">
      If there's anything we can help with,
      <a href="${WA_LINK}" style="color:#b8a98a">Chat with us on WhatsApp</a>.
    </p>
    <p style="font-size:14px;color:#b0a898;line-height:1.7;margin:0 0 20px">
      Thank you for making yourself a priority.
    </p>
    <div style="text-align:center;margin-top:8px">
      <a href="${STORE_URL}/shop.html" class="cta-btn">Shop Again</a>
    </div>`;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${BASE_STYLE}</style></head>
<body><div class="wrap">
  <div class="header">
    ${logoHTML()}
    <div class="headline">${headline}</div>
  </div>
  <div class="body">

    <div style="margin-bottom:20px">
      <span class="badge ${badgeClass}">${badgeLabel}</span>
    </div>

    <p style="font-size:15px;color:#b0a898;line-height:1.7;margin:0 0 24px">${introCopy}</p>

    ${dispatchDeliveryNote}

    <div class="section">
      <div class="section-label">Your order details</div>
      ${itemsHTML(items)}
      <div style="margin-top:16px">${totalsHTML(order)}</div>
    </div>

    <div class="section">
      <div class="section-label">Delivery</div>
      <div class="detail" style="font-weight:600;color:#e8e4dc">${esc(delivery.method)}</div>
      ${delivery.address ? `<div class="detail">${esc(delivery.address)}</div>` : ''}
    </div>

    ${isDispatched ? outroDispatched : outroDelivered}

    ${signatureHTML()}

  </div>
  <div class="footer">
    <p>PhenomeBeauty &mdash; <a href="${STORE_URL}">${STORE_URL}</a><br>
    This email was sent to ${esc(order.customer_email)} because you placed an order on our store.</p>
  </div>
</div></body></html>`;

  return { subject, html };
}

/* ══════════════════════════════════════════════════════════════════════════════
   SEND VIA RESEND
══════════════════════════════════════════════════════════════════════════════ */
async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) { console.error('[send-order-email] RESEND_API_KEY not set'); return; }

  const payload: Record<string, unknown> = {
    from:     FROM,
    to:       [opts.to],
    subject:  opts.subject,
    html:     opts.html,
    reply_to: 'orders@phenomebeauty.co.za',
  };

  const res = await fetch(RESEND_API, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[send-order-email] Resend error:', res.status, err);
  } else {
    const data = await res.json();
    console.log('[send-order-email] Sent OK:', data.id);
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN HANDLER
══════════════════════════════════════════════════════════════════════════════ */
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  let body: { type?: string; order_id?: string; status?: string };
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { type, order_id, status } = body;

  if (!type || !order_id) {
    return new Response(JSON.stringify({ error: 'Missing type or order_id' }), { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: order, error } = await supabase
    .from('shop_orders')
    .select('id, created_at, paid_at, customer_name, customer_email, customer_phone, delivery_method, delivery_address, delivery_meta, delivery_fee, items, subtotal, total_amount, payment_status, status, is_gift, gift_message, notes')
    .eq('id', order_id)
    .single();

  if (error || !order) {
    console.error('[send-order-email] Order not found:', order_id, error);
    return new Response(JSON.stringify({ error: 'Order not found' }), { status: 404 });
  }

  if (!order.customer_email) {
    console.error('[send-order-email] Order has no customer email:', order_id);
    return new Response(JSON.stringify({ error: 'No customer email' }), { status: 422 });
  }

  try {
    if (type === 'order_placed') {
      const { subject, html } = buildOrderPlaced(order);
      await sendEmail({ to: order.customer_email, subject, html });

    } else if (type === 'payment_received') {
      /* Customer email — branded */
      const { subject, html } = buildPaymentReceived(order);
      await sendEmail({ to: order.customer_email, subject, html });

      /* Admin system notification — separate plain email */
      const { subject: adminSubject, html: adminHtml } = buildAdminPaymentNotification(order);
      await sendEmail({ to: ADMIN_EMAIL, subject: adminSubject, html: adminHtml });

    } else if (type === 'status_update') {
      const resolvedStatus = status || order.status;
      if (!['dispatched', 'delivered'].includes(resolvedStatus)) {
        return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
      }
      const { subject, html } = buildStatusUpdate(order, resolvedStatus);
      await sendEmail({ to: order.customer_email, subject, html });

    } else {
      return new Response(JSON.stringify({ error: 'Unknown type' }), { status: 400 });
    }
  } catch (err) {
    console.error('[send-order-email] Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
