/**
 * Email campaigns run from admin → Email campaigns: review requests and "running low" reminders.
 * Builds the branded email (same look as the waitlist emails) from the owner's wording.
 *
 * Placeholders the owner can use: {first_name}, {products}, {first_product}, {code}, {offer}.
 *
 * Plain JavaScript on purpose: the handler tests load this file as source text.
 */

export const CAMPAIGN_KEYS = ['review_request', 'replenishment'];
export const CAMPAIGN_NAMES = { review_request: 'Review request', replenishment: 'Running low reminder' };

const TOKEN = { cream: '#F3F1E8', paper: '#FAF9F5', blush: '#F2C6C2', ink: '#000000' };

export function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cleanText(value, max) {
  return typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim().slice(0, max) : '';
}

function safeLink(value) {
  try {
    const u = new URL(String(value || ''));
    return u.protocol === 'https:' ? u.toString() : '';
  } catch { return ''; }
}

/** Cleans settings coming from the admin. Returns { settings } or { error }. */
export function normaliseSettings(key, input) {
  const s = input && typeof input === 'object' ? input : {};
  const delay = Math.round(Number(s.delay_days));
  if (!Number.isFinite(delay) || delay < 1 || delay > 365) return { error: 'Choose a delay between 1 and 365 days.' };
  const subject = cleanText(s.subject, 150);
  const heading = cleanText(s.heading, 120);
  const body = cleanText(s.body, 3000);
  const buttonLabel = cleanText(s.button_label, 40);
  const link = safeLink(s.link);
  if (!subject || !heading || !body) return { error: 'Fill in the subject, heading and message.' };
  if (!buttonLabel || !link) return { error: 'Add a button label and a link that starts with https://' };
  const settings = { delay_days: delay, subject, heading, body, button_label: buttonLabel, link };
  if (key === 'replenishment') {
    const code = typeof s.discount_code === 'string' ? s.discount_code.trim().toUpperCase() : '';
    settings.discount_code = code || null;
  }
  return { settings };
}

export function firstName(name) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : 'there';
}

export function productNames(items) {
  const names = [...new Set((Array.isArray(items) ? items : []).map(i => i && i.name).filter(Boolean))];
  if (!names.length) return { all: 'order', first: 'favourites' };
  const all = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return { all, first: names[0] };
}

function fill(text, vars) {
  return text.replace(/\{(first_name|products|first_product|code|offer)\}/g, (_, k) => vars[k] ?? '');
}

/**
 * Renders one campaign email.
 * order: { customer_name, items }. discount: { code, label } or null. unsubscribeUrl: string.
 */
export function renderCampaign(key, settings, order, discount, unsubscribeUrl) {
  const names = productNames(order.items);
  const vars = {
    first_name: firstName(order.customer_name),
    products: names.all,
    first_product: names.first,
    code: discount ? discount.code : '',
    offer: discount ? discount.label : '',
  };
  let link = settings.link;
  try {
    const u = new URL(link);
    if (discount) u.searchParams.set('code', discount.code);
    // Links to the shop are tagged so Analytics shows them under Email, by campaign.
    if (/(^|\.)phenomebeauty\.co\.za$/.test(u.hostname)) {
      u.searchParams.set('utm_source', 'phenomebeauty');
      u.searchParams.set('utm_medium', 'email');
      u.searchParams.set('utm_campaign', key);
    }
    link = u.toString();
  } catch { /* keep link */ }
  const subject = fill(settings.subject, vars);
  const paragraphs = fill(settings.body, vars).split(/\n{2,}/).map(p =>
    `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const offer = discount ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${TOKEN.paper}" style="background:${TOKEN.paper};border-radius:20px;margin:8px 0 20px;"><tr><td style="padding:18px 20px;font-size:15px;line-height:1.5;">
        <strong>${esc(discount.label)}</strong> with code <strong style="letter-spacing:0.06em;">${esc(discount.code)}</strong>. It is applied for you when you use the button below.
      </td></tr></table>` : '';
  const button = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;"><tr><td bgcolor="${TOKEN.ink}" style="background:${TOKEN.ink};border-radius:999px;">
        <a href="${esc(link)}" style="display:inline-block;padding:15px 30px;font-size:15px;font-weight:600;color:${TOKEN.cream};text-decoration:none;">${esc(settings.button_label)}</a></td></tr></table>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><link href="https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet"><title>${esc(subject)}</title></head>
<body bgcolor="${TOKEN.cream}" style="margin:0;padding:0;background:${TOKEN.cream};font-family:Montserrat,Helvetica,Arial,sans-serif;color:${TOKEN.ink};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(settings.heading)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${TOKEN.cream}" style="background:${TOKEN.cream};"><tr><td align="center" bgcolor="${TOKEN.cream}" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
    <tr><td style="padding:0 8px 20px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;"><img src="https://iili.io/fpiAjBj.jpg" width="64" height="64" alt="Phenomebeauty logo" style="display:block;width:64px;height:64px;border-radius:50%;border:0;"></td>
        <td style="vertical-align:middle;padding-left:16px;font-family:'Abril Fatface',Georgia,'Times New Roman',serif;font-size:34px;line-height:1;color:${TOKEN.ink};">Phenomebeauty</td>
      </tr></table>
    </td></tr>
    <tr><td bgcolor="${TOKEN.blush}" style="background:${TOKEN.blush};border-radius:48px 48px 0 0;padding:40px 32px 36px;">
      <h1 style="margin:0 0 20px;font-weight:500;font-size:30px;line-height:1.15;letter-spacing:-0.01em;">${esc(fill(settings.heading, vars))}</h1>
      ${paragraphs}${offer}${button}
    </td></tr>
    <tr><td bgcolor="${TOKEN.ink}" style="background:${TOKEN.ink};border-radius:0 0 48px 48px;padding:28px 32px;color:${TOKEN.cream};font-size:13px;line-height:1.6;">
      <p style="margin:0 0 6px;font-weight:600;">Phenomebeauty</p>
      <p style="margin:0 0 12px;opacity:0.8;">Mobile beauty across Cape Town. WhatsApp <a href="https://wa.me/27745115725" style="color:${TOKEN.cream};text-decoration:none;">+27 74 511 5725</a></p>
      <p style="margin:0;opacity:0.7;font-size:12px;">You are receiving this because you ordered from Phenomebeauty. <a href="${esc(unsubscribeUrl)}" style="color:${TOKEN.cream};">Unsubscribe from these emails</a>. Order updates are not affected.</p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
  const text = `${fill(settings.heading, vars)}\n\n${fill(settings.body, vars)}\n\n${discount ? `${discount.label} with code ${discount.code}.\n\n` : ''}${settings.button_label}: ${link}\n\nUnsubscribe: ${unsubscribeUrl}`;
  return { subject, html, text };
}

/* Unsubscribe links: an HMAC of the email, so links cannot be forged for other addresses. */
async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode('unsubscribe:' + secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

export async function unsubscribeToken(email, secret) {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(String(email).toLowerCase()));
  return Array.from(new Uint8Array(sig)).slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function unsubscribeUrl(baseUrl, email, secret) {
  const e = String(email).toLowerCase();
  return `${baseUrl}/functions/v1/unsubscribe?e=${encodeURIComponent(e)}&t=${await unsubscribeToken(e, secret)}`;
}

export async function validUnsubscribe(email, token, secret) {
  if (typeof token !== 'string' || token.length !== 32) return false;
  const expected = await unsubscribeToken(email, secret);
  let diff = 0;
  for (let i = 0; i < 32; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}
