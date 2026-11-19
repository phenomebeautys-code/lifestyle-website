/**
 * Gift cards: codes, settings and the branded gift card email.
 *
 * Codes look like PB-7KQ4-MX2R-9TVA (about 60 bits of randomness, no look-alike characters),
 * so they cannot be guessed. Balances change only through the database functions
 * gift_card_hold / gift_card_release / gift_card_settle / gift_card_adjust.
 * Cards are valid for 3 years, the minimum the Consumer Protection Act allows for vouchers.
 *
 * Plain JavaScript on purpose: the tests load this file as source text.
 */

export const GIFT_CODE_RE = /^PB-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
export const GIFT_CARD_YEARS = 3;
export const GIFT_SETTINGS_DEFAULT = { enabled: false, amounts: [250, 500, 1000] };
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normaliseGiftCode(value) {
  const raw = typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
  const body = raw.startsWith('PB') ? raw.slice(2) : raw;
  if (body.length !== 12) return '';
  const code = `PB-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
  return GIFT_CODE_RE.test(code) ? code : '';
}

export function newGiftCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const chars = Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('');
  return `PB-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

export function giftCardExpiry(from = new Date()) {
  const d = new Date(from);
  d.setFullYear(d.getFullYear() + GIFT_CARD_YEARS);
  return d.toISOString();
}

export function normaliseGiftSettings(value) {
  const v = value && typeof value === 'object' ? value : {};
  const amounts = [...new Set((Array.isArray(v.amounts) ? v.amounts : [])
    .map(Number).filter(n => Number.isInteger(n) && n >= 50 && n <= 10000))].sort((a, b) => a - b).slice(0, 6);
  return { enabled: v.enabled === true && amounts.length > 0, amounts: amounts.length ? amounts : [...GIFT_SETTINGS_DEFAULT.amounts] };
}

export async function loadGiftSettings(supabase) {
  try {
    const { data } = await supabase.from('shop_settings').select('value').eq('key', 'gift_cards').maybeSingle();
    return normaliseGiftSettings(data && data.value);
  } catch {
    return { ...GIFT_SETTINGS_DEFAULT };
  }
}

/** Shopper-facing message for a database error from gift_card_hold. */
export function giftCardError(message) {
  const m = String(message || '');
  if (m.includes('GIFT_CARD_NOT_FOUND')) return 'We could not find that gift card. Check the code and try again.';
  if (m.includes('GIFT_CARD_DISABLED')) return 'This gift card cannot be used. Please contact us.';
  if (m.includes('GIFT_CARD_EXPIRED')) return 'This gift card has expired.';
  if (m.includes('GIFT_CARD_EMPTY')) return 'This gift card has no balance left.';
  return 'Gift cards are unavailable right now. Please try again.';
}

/**
 * One brand colour pairing per price point (cream, blush and ink only). The lowest amount the shop
 * offers gets theme 0, the next theme 1, and so on. An amount that is not on offer (issued in admin)
 * takes the theme of the nearest offered amount below it.
 * gift-cards.js on the website keeps a copy of this table; keep the two in step.
 */
export const GIFT_THEMES = [
  { name: 'blush', bg: '#F2C6C2', type: '#000000', mark: '#000000' },
  { name: 'ink', bg: '#000000', type: '#F2C6C2', mark: '#F2C6C2' },
  { name: 'cream', bg: '#F3F1E8', type: '#F2C6C2', mark: '#000000' },
  { name: 'ink-cream', bg: '#000000', type: '#F3F1E8', mark: '#F3F1E8' },
  { name: 'blush-cream', bg: '#F2C6C2', type: '#F3F1E8', mark: '#000000' },
  { name: 'cream-ink', bg: '#F3F1E8', type: '#000000', mark: '#000000' },
];

export function giftCardTheme(amount, amounts) {
  const list = [...new Set((Array.isArray(amounts) ? amounts : []).map(Number).filter(n => n > 0))].sort((a, b) => a - b);
  const v = Number(amount);
  let i = 0;
  list.forEach((a, n) => { if (a <= v) i = n; });
  return GIFT_THEMES[i % GIFT_THEMES.length];
}

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function rand(n) {
  const v = Number(n);
  return 'R' + (Number.isInteger(v) ? String(v) : v.toFixed(2)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** The email the recipient gets, in the brand style. */
export function renderGiftCardEmail(card, amounts) {
  const T = { cream: '#F3F1E8', paper: '#FAF9F5', blush: '#F2C6C2', ink: '#000000' };
  const th = giftCardTheme(card.initial_amount, amounts || GIFT_SETTINGS_DEFAULT.amounts);
  const edge = th.bg === T.cream ? `border:1px solid rgba(0,0,0,0.12);` : '';
  const to = card.recipient_name ? card.recipient_name.trim().split(/\s+/)[0] : '';
  const from = (card.sender_name || '').trim();
  const expires = new Date(card.expires_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' });
  const subject = from ? `${from} sent you a Phenomebeauty gift card` : 'Your Phenomebeauty gift card';
  const link = 'https://www.phenomebeauty.co.za/shop?utm_source=phenomebeauty&utm_medium=email&utm_campaign=gift_card';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><link href="https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet"><style>@media (max-width:480px){.gc-big{font-size:58px !important}.gc-gap{height:60px !important;line-height:60px !important}.gc-wm{font-size:17px !important}.gc-amt{font-size:16px !important}.gc-code{font-size:17px !important;letter-spacing:0.06em !important}.gc-pad{padding:28px 20px 28px !important}.gc-head{font-size:26px !important}}</style><title>${esc(subject)}</title></head>
<body bgcolor="${T.cream}" style="margin:0;padding:0;background:${T.cream};font-family:Montserrat,Helvetica,Arial,sans-serif;color:${T.ink};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(rand(card.initial_amount))} to spend at Phenomebeauty</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${T.cream}" style="background:${T.cream};"><tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
    <tr><td style="padding:0 8px 20px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;"><img src="https://iili.io/fpiAjBj.jpg" width="64" height="64" alt="Phenomebeauty logo" style="display:block;width:64px;height:64px;border-radius:50%;border:0;"></td>
        <td class="gc-head" style="vertical-align:middle;padding-left:16px;font-family:'Abril Fatface',Georgia,'Times New Roman',serif;font-size:34px;line-height:1;color:${T.ink};">Phenomebeauty</td>
      </tr></table>
    </td></tr>
    <tr><td bgcolor="${T.paper}" style="background:${T.paper};border-radius:48px 48px 0 0;padding:40px 32px 36px;" class="gc-pad">
      <h1 style="margin:0 0 20px;font-weight:500;font-size:30px;line-height:1.15;">${to ? `${esc(to)}, a` : 'A'} gift for you</h1>
      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">${from ? `${esc(from)} has sent you` : 'You have'} a Phenomebeauty gift card to spend on skincare, wax and professional products in our online shop.</p>
      ${card.message ? `<p style="margin:0 0 20px;font-size:16px;line-height:1.6;font-style:italic;">&ldquo;${esc(card.message)}&rdquo;</p>` : ''}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${th.bg}" style="background:${th.bg};border-radius:20px;margin:8px 0 18px;${edge}"><tr><td style="padding:26px 26px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td class="gc-wm" style="font-family:'Abril Fatface',Georgia,'Times New Roman',serif;font-size:24px;line-height:1;color:${th.mark};">Phenomebeauty</td>
          <td class="gc-amt" align="right" style="padding-left:12px;white-space:nowrap;font-family:Montserrat,Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;line-height:1;color:${th.mark};">${esc(rand(card.initial_amount))}</td>
        </tr></table>
        <div class="gc-gap" style="height:110px;line-height:110px;font-size:1px;">&nbsp;</div>
        <div class="gc-big" style="font-family:Montserrat,Helvetica,Arial,sans-serif;font-weight:600;font-size:96px;line-height:0.84;letter-spacing:-0.05em;color:${th.type};text-align:right;">GIFT</div>
        <div class="gc-big" style="font-family:Montserrat,Helvetica,Arial,sans-serif;font-weight:600;font-size:96px;line-height:0.84;letter-spacing:-0.05em;color:${th.type};text-align:left;">CARD</div>
      </td></tr></table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px dashed rgba(0,0,0,0.3);border-radius:16px;margin:0 0 24px;"><tr><td style="padding:18px 20px;text-align:center;">
        <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#555;margin:0 0 6px;">Your code</div>
        <div class="gc-code" style="font-size:22px;font-weight:600;letter-spacing:0.12em;white-space:nowrap;color:${T.ink};">${esc(card.code)}</div>
        <div style="font-size:12px;color:#555;margin-top:8px;">${esc(rand(card.initial_amount))} &middot; valid until ${esc(expires)}</div>
      </td></tr></table>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">Enter the code at checkout under Gift card. You can use it over more than one order until the balance is spent. Gift cards cannot be used for services, only products.</p>
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="${T.ink}" style="background:${T.ink};border-radius:999px;">
        <a href="${link}" style="display:inline-block;padding:15px 30px;font-size:15px;font-weight:600;color:${T.cream};text-decoration:none;">Start shopping</a></td></tr></table>
    </td></tr>
    <tr><td bgcolor="${T.ink}" style="background:${T.ink};border-radius:0 0 48px 48px;padding:28px 32px;color:${T.cream};font-size:13px;line-height:1.6;">
      <p style="margin:0 0 6px;font-weight:600;">Phenomebeauty</p>
      <p style="margin:0;opacity:0.8;">Mobile beauty across Cape Town. Questions about your gift card? WhatsApp <a href="https://wa.me/27745115725" style="color:${T.cream};text-decoration:none;">+27 74 511 5725</a></p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
  const text = `${from ? from + ' sent you' : 'You have'} a Phenomebeauty gift card of ${rand(card.initial_amount)}.\n${card.message ? '"' + card.message + '"\n' : ''}\nCode: ${card.code}\nValid until ${expires}.\nEnter the code at checkout under Gift card: ${link}\nGift cards cannot be used for services, only products.`;
  return { subject, html, text };
}
