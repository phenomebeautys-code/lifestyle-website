/**
 * workshop-signup  (PhenomeBeauty website)
 *
 * Public endpoint behind the waxing workshop form (workshop.html).
 * 1. Validates the submission and drops it silently if the hidden honeypot field is filled.
 * 2. Stores the sign-up in public.workshop_signups (service role).
 * 3. Emails the team straight away, and the signer a short confirmation.
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
// Public form: any origin may post (the input is validated), so previews work too.
const ALLOWED_ORIGIN = '*';
const EXPERIENCE   = new Set(['beginner', 'some', 'professional']);
const EXPERIENCE_LABEL: Record<string, string> = {
  beginner: 'New to waxing',
  some: 'Some experience',
  professional: 'Working in beauty',
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
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
  const phone      = clean(body.phone, 20);
  const experience = clean(body.experience, 20);
  const notes      = clean(body.notes, 500);
  const consent    = body.consent === true;

  if (fullName.length < 2)            return respond({ error: 'Please add your full name.' }, 400);
  if (!EMAIL_RE.test(email))          return respond({ error: 'Please check your email address.' }, 400);
  if (phone.replace(/\D/g, '').length < 7) return respond({ error: 'Please check your phone number.' }, 400);
  if (!EXPERIENCE.has(experience))    return respond({ error: 'Please choose your experience level.' }, 400);
  if (!consent)                       return respond({ error: 'Please tick the box so we can contact you.' }, 400);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { error } = await supabase.from('workshop_signups').insert({
      full_name: fullName,
      email,
      phone,
      experience,
      notes: notes || null,
      consent: true,
    });
    if (error) return respond({ error: 'We could not save your sign-up. Please try again.' }, 500);

    // Team notification first: this is the message that matters most.
    await sendEmail(
      TEAM_EMAIL,
      `New workshop sign-up: ${fullName}`,
      `<p><strong>${esc(fullName)}</strong> has signed up for the waxing workshop.</p>
       <ul>
         <li>Email: <a href="mailto:${esc(email)}">${esc(email)}</a></li>
         <li>Phone: ${esc(phone)}</li>
         <li>Experience: ${esc(EXPERIENCE_LABEL[experience])}</li>
         ${notes ? `<li>Notes: ${esc(notes)}</li>` : ''}
       </ul>`,
      email,
    );

    // Confirmation to the signer. A failure here should not undo the sign-up.
    try {
      await sendEmail(
        email,
        'You are on the waxing workshop list',
        `<p>Hi ${esc(fullName.split(' ')[0])},</p>
         <p>Thank you for signing up. We will be in touch with the workshop details soon.</p>
         <p>Phenomebeauty</p>`,
      );
    } catch {
      // Logged by the platform; the team still has the sign-up.
    }

    return respond({ ok: true });
  } catch {
    return respond({ error: 'Something went wrong. Please try again, or WhatsApp us.' }, 500);
  }
});
