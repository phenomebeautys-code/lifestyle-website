/**
 * workshop-signup  (PhenomeBeauty website)
 *
 * Public endpoint behind the waxing workshop application form (workshop.html).
 * 1. Validates the application and drops it silently if the hidden honeypot field is filled.
 * 2. Stores it in public.workshop_signups (service role).
 * 3. Emails the team at once, and sends the applicant a copy of their responses.
 *
 * Env vars required (already set for send-order-email):
 *   RESEND_API_KEY             — Resend key for phenomebeauty.co.za
 *   SUPABASE_URL               — injected automatically
 *   SUPABASE_SERVICE_ROLE_KEY  — injected automatically
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API     = 'https://api.resend.com/emails';
const FROM           = 'PhenomeBeauty <hello@phenomebeauty.co.za>';
const TEAM_EMAIL     = 'phenomebeautys@gmail.com';
const EMAIL_RE       = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EXPERIENCE: Record<string, string> = {
  beginner: "No, I'm a complete beginner",
  self: 'Yes, on myself only',
  family: 'Yes, on friends/family',
  professional: 'Yes, I currently offer waxing as a service',
};
const DAYS: Record<string, string> = { saturday: 'Saturdays', sunday: 'Sundays' };
const KITS: Record<string, string> = {
  foundation: 'Foundation Kit (R2800)',
  precision: 'Precision Kit (R3500)',
  pro: 'Pro Confidence Kit (R4500)',
};

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

function rows(a: Array<[string, string]>): string {
  return a.map(([label, value]) => `<li><strong>${esc(label)}:</strong> ${esc(value)}</li>`).join('');
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

  const email      = clean(body.email, 254).toLowerCase();
  const fullName   = clean(body.full_name, 80);
  const mobile     = clean(body.phone, 20);
  const experience = clean(body.experience, 20);
  const motivation = clean(body.motivation, 1000);
  const notes      = clean(body.notes, 500);
  const kit        = clean(body.kit, 20);
  const termsOk    = body.terms_accepted === true;
  const daysInput  = Array.isArray(body.days) ? body.days : [];
  const days       = [...new Set(daysInput.filter((d): d is string => typeof d === 'string' && d in DAYS))];

  if (!EMAIL_RE.test(email))                  return respond({ error: 'Please check your email address.' }, 400);
  if (fullName.length < 2)                    return respond({ error: 'Please add your full name.' }, 400);
  if (mobile.replace(/\D/g, '').length < 7)   return respond({ error: 'Please check your mobile number.' }, 400);
  if (!(experience in EXPERIENCE))            return respond({ error: 'Please choose your waxing experience.' }, 400);
  if (motivation.length < 10)                 return respond({ error: 'Please tell us why you want to attend.' }, 400);
  if (days.length === 0)                      return respond({ error: 'Please choose at least one day you are available.' }, 400);
  if (!termsOk)                               return respond({ error: 'Please accept the terms to continue.' }, 400);
  if (!(kit in KITS))                         return respond({ error: 'Please choose a kit to reserve.' }, 400);

  const summary: Array<[string, string]> = [
    ['Email', email],
    ['Full name', fullName],
    ['Mobile (WhatsApp)', mobile],
    ['Waxing experience', EXPERIENCE[experience]],
    ['Why they want to attend', motivation],
    ['Available', days.map((d) => DAYS[d]).join(', ')],
    ['Kit to reserve', KITS[kit]],
  ];
  if (notes) summary.push(['Anything to know', notes]);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { error } = await supabase.from('workshop_signups').insert({
      email,
      full_name: fullName,
      mobile,
      waxing_experience: experience,
      motivation,
      available_days: days,
      terms_accepted: true,
      notes: notes || null,
      kit,
    });
    if (error) return respond({ error: 'We could not save your application. Please try again.' }, 500);

    // Team notification first: this is the message that matters most.
    await sendEmail(
      TEAM_EMAIL,
      `Workshop application: ${fullName}`,
      `<p>A new application for the waxing workshop. Send the deposit payment link to the applicant.</p><ul>${rows(summary)}</ul>`,
      email,
    );

    // A copy of the responses goes to the applicant, as the form promises.
    // A failure here should not undo the application.
    try {
      await sendEmail(
        email,
        'Your waxing workshop application',
        `<p>Hi ${esc(fullName.split(' ')[0])},</p>
         <p>Thank you for applying. Here is a copy of your responses.</p>
         <ul>${rows(summary)}</ul>
         <p>Next, we will email you a payment link for your 50% deposit. Only 2 ladies are accepted per workshop. Your spot is secured only after paying the deposit.</p>
         <p>Phenomebeauty</p>`,
      );
    } catch {
      // Logged by the platform; the team still has the application.
    }

    return respond({ ok: true });
  } catch {
    return respond({ error: 'Something went wrong. Please try again, or WhatsApp us.' }, 500);
  }
});
