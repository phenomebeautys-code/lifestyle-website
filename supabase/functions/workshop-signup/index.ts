/**
 * workshop-signup  (PhenomeBeauty website)
 *
 * Public endpoint behind the waxing workshop waitlist form (workshop.html).
 * 1. Validates the answers. Drops silently if the hidden honeypot field is filled.
 * 2. Sets the kit price and the terms timestamp on the server. The browser can't set them.
 * 3. Stores the entry in public.workshop_signups with status 'waitlist'.
 * 4. Emails the team at once, and sends the applicant a copy of their answers.
 *
 * Env vars required (already set for send-order-email):
 *   RESEND_API_KEY             — Resend key for phenomebeauty.co.za
 *   SUPABASE_URL               — injected automatically
 *   SUPABASE_SERVICE_ROLE_KEY  — injected automatically
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API   = 'https://api.resend.com/emails';
const FROM         = 'PhenomeBeauty <hello@phenomebeauty.co.za>';
const TEAM_EMAIL   = 'phenomebeautys@gmail.com';
const TERMS_VERSION = 'waitlist-v1';
const EMAIL_RE     = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Prices per person, including the kit. The server owns these, not the browser.
const KITS: Record<string, { label: string; price: number }> = {
  foundation: { label: 'Foundation Kit', price: 2800 },
  precision:  { label: 'Precision Kit', price: 3500 },
  pro:        { label: 'Pro Confidence Kit', price: 4500 },
};
const EXPERIENCE: Record<string, string> = {
  beginner: "No, I'm a complete beginner",
  self: 'Yes, on myself only',
  family: 'Yes, on friends/family',
  professional: 'Yes, I currently offer waxing as a service',
};
const DAYS: Record<string, string> = { saturday: 'Saturdays', sunday: 'Sundays' };

// Public form: any origin may post (the input is validated), so previews work too.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type',
};

function respond(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function sendEmail(to: string, subject: string, html: string, replyTo?: string): Promise<void> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
}

function rows(pairs: Array<[string, string]>): string {
  return pairs.map(([label, value]) => `<li><strong>${esc(label)}:</strong> ${esc(value)}</li>`).join('');
}

// Brand tokens from the website (site.css): cream page, blush sheet, black ink.
const TOKEN = { cream: '#F3F1E8', blush: '#F2C6C2', paper: '#FAF9F5', ink: '#000000', soft: '#3d3d3d', line: '#e4dfd2' };

function rand(amount: number): string {
  return 'R' + String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// One shared layout for both emails, so they read as the same brand.
function shell(preheader: string, heading: string, inner: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><link href="https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet"></head>
<body bgcolor="${TOKEN.cream}" style="margin:0;padding:0;background:${TOKEN.cream};font-family:Montserrat,Helvetica,Arial,sans-serif;color:${TOKEN.ink};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${TOKEN.cream}" style="background:${TOKEN.cream};"><tr><td align="center" bgcolor="${TOKEN.cream}" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
    <tr><td style="padding:0 8px 20px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;"><img src="https://iili.io/fpiAjBj.jpg" width="40" height="40" alt="Phenomebeauty logo" style="display:block;width:40px;height:40px;border-radius:50%;border:0;"></td>
        <td style="vertical-align:middle;padding-left:12px;font-family:'Abril Fatface',Georgia,'Times New Roman',serif;font-size:26px;line-height:1;color:${TOKEN.ink};">Phenomebeauty</td>
      </tr></table>
    </td></tr>
    <tr><td bgcolor="${TOKEN.blush}" style="background:${TOKEN.blush};border-radius:48px 48px 0 0;padding:40px 32px 36px;">
      <h1 style="margin:0 0 20px;font-weight:500;font-size:30px;line-height:1.15;letter-spacing:-0.01em;">${esc(heading)}</h1>
      ${inner}
    </td></tr>
    <tr><td bgcolor="${TOKEN.ink}" style="background:${TOKEN.ink};border-radius:0 0 48px 48px;padding:28px 32px;color:${TOKEN.cream};font-size:13px;line-height:1.6;">
      <p style="margin:0 0 6px;font-weight:600;">Phenomebeauty</p>
      <p style="margin:0;opacity:0.8;">Mobile beauty across Cape Town. WhatsApp <a href="https://wa.me/27745115725" style="color:${TOKEN.cream};text-decoration:none;">+27 74 511 5725</a></p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

function summaryTable(pairs: Array<[string, string]>): string {
  const cells = pairs.map(([label, value]) => `
    <tr>
      <td style="padding:12px 0;border-top:1px solid ${TOKEN.line};vertical-align:top;width:40%;font-size:13px;font-weight:600;color:${TOKEN.soft};">${esc(label)}</td>
      <td style="padding:12px 0;border-top:1px solid ${TOKEN.line};vertical-align:top;font-size:15px;">${esc(value)}</td>
    </tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${TOKEN.paper}" style="background:${TOKEN.paper};border-radius:20px;padding:4px 20px;">${cells}</table>`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return respond({ error: 'Please send the form again.' }, 400);
  }

  // Honeypot: real visitors never fill this field. Pretend success and stop.
  if (clean(body.website, 200) !== '') return respond({ ok: true });

  const fullName   = clean(body.full_name, 80);
  const email      = clean(body.email, 254).toLowerCase();
  const mobile     = clean(body.mobile, 20);
  const experience = clean(body.experience, 20);
  const motivation = clean(body.motivation, 1000);
  const kit        = clean(body.kit, 20);
  const notes      = clean(body.notes, 500);
  const termsOk    = body.terms_accepted === true;
  const termsVer   = clean(body.terms_version, 40);
  const days       = [...new Set(
    (Array.isArray(body.days) ? body.days : []).filter((d): d is string => typeof d === 'string' && d in DAYS),
  )];

  if (fullName.length < 2)                  return respond({ error: 'Please add your full name.' }, 400);
  if (!EMAIL_RE.test(email))                return respond({ error: 'Please check your email address.' }, 400);
  if (mobile.replace(/\D/g, '').length < 7) return respond({ error: 'Please check your mobile number.' }, 400);
  if (!(experience in EXPERIENCE))          return respond({ error: 'Please choose your waxing experience.' }, 400);
  if (motivation.length < 10)               return respond({ error: 'Please tell us why you want to attend.' }, 400);
  if (days.length === 0)                    return respond({ error: 'Please choose at least one day you are available.' }, 400);
  if (!(kit in KITS))                       return respond({ error: 'Please choose a kit.' }, 400);
  if (!termsOk || termsVer !== TERMS_VERSION) return respond({ error: 'Please accept the terms to join the waitlist.' }, 400);

  const kitInfo = KITS[kit];
  const deposit = kitInfo.price / 2;
  const summary: Array<[string, string]> = [
    ['Full name', fullName],
    ['Email', email],
    ['Mobile (WhatsApp)', mobile],
    ['Waxing experience', EXPERIENCE[experience]],
    ['Why they want to attend', motivation],
    ['Available', days.map((d) => DAYS[d]).join(', ')],
    ['Kit', `${kitInfo.label}, ${rand(kitInfo.price)} per person`],
    ['50% deposit', rand(deposit)],
  ];
  if (notes) summary.push(['Anything to know', notes]);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { error } = await supabase.from('workshop_signups').insert({
      full_name: fullName,
      email,
      mobile,
      waxing_experience: experience,
      motivation,
      available_days: days,
      kit,
      kit_price_zar: kitInfo.price,
      notes: notes || null,
      terms_accepted: true,
      terms_version: TERMS_VERSION,
    });
    if (error) {
      // 23505 is a duplicate email: already on the waitlist.
      if (error.code === '23505') {
        return respond({ error: 'This email is already on the waitlist. We will be in touch soon.' }, 409);
      }
      return respond({ error: 'We could not save your answers. Please try again.' }, 500);
    }

    // Team first: this is the message that matters most.
    await sendEmail(
      TEAM_EMAIL,
      `Waitlist: ${fullName}`,
      shell(
        `${fullName} has joined the waxing workshop waitlist`,
        'New waitlist entry',
        `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;">${esc(fullName)} has joined the waitlist. Status: <strong>waitlist</strong>. Send the 50% deposit payment link.</p>
         ${summaryTable(summary)}
         <p style="margin:24px 0 0;font-size:13px;color:${TOKEN.soft};">Reply to this email to reach ${esc(fullName.split(' ')[0])} directly.</p>`,
      ),
      email,
    );

    // A copy of the answers goes to the applicant. A failure here does not undo the entry.
    try {
      await sendEmail(
        email,
        'Your waxing workshop waitlist',
        shell(
          'You are on the waitlist. Here is a copy of your answers.',
          `Thank you, ${esc(fullName.split(' ')[0])}`,
          `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;">You are on the waitlist for the waxing workshop. Here is a copy of your answers for your records.</p>
           ${summaryTable(summary)}
           <div bgcolor="${TOKEN.paper}" style="margin:28px 0 0;background:${TOKEN.paper};border-radius:20px;padding:20px;">
             <p style="margin:0 0 8px;font-weight:600;font-size:15px;">What happens next</p>
             <p style="margin:0;font-size:14px;line-height:1.6;">We will send you a payment link for your 50% deposit. Only 2 ladies are accepted per workshop.</p>
           </div>`,
        ),
      );
    } catch {
      // Logged by the platform; the team still has the entry.
    }

    return respond({ ok: true });
  } catch {
    return respond({ error: 'Something went wrong. Please try again, or WhatsApp us.' }, 500);
  }
});
