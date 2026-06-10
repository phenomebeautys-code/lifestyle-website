/* ============================================================
   PhenomeBeauty — shop.js
   ============================================================ */

const SUPABASE_URL  = 'https://papdxjcfimeyjgzmatpl.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcGR4amNmaW1leWpnem1hdHBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMDk4NjcsImV4cCI6MjA5MjY4NTg2N30.mn_JsORuYUBtHTqIF2RjY8YUJzY9zJQV0uGFXBvrJRc';

/* ── Image transform ──────────────────────────────────────── */

function transformImage(url, width) {
  if (!url || !url.includes('supabase.co/storage')) return url;
  return url + '?width=' + (width || 400) + '&quality=75&format=webp';
}

/* ── Strip label prefix (e.g. "Scent: Bloom" -> "Bloom") ─── */

function stripPrefix(str) {
  if (!str) return str;
  return str.replace(/^[^:]+:\s*/i, '');
}

/* ── Render structured description ───────────────────────── */

function renderDescription(text) {
  if (!text) return '';
  const match = text.match(/^([\s\S]*?)\n?\s*Available in\s*:\s*\n([\s\S]*)$/i);
  if (!match) {
    return `<div class="product-desc"><p>${text}</p></div>`;
  }
  const body    = match[1].trim();
  const rawList = match[2].trim();
  const items   = rawList
    .split('\n')
    .map(l => l.replace(/^[\u2022\-\*]\s*/, '').trim())
    .filter(Boolean);
  const listHTML = items.map(item => `<li>${item}</li>`).join('');
  return `<div class="product-desc">
  <p>${body}</p>
  <p class="desc-avail-label">Available in</p>
  <ul>${listHTML}</ul>
</div>`;
}

/* ── Cart helpers ─────────────────────────────────────────── */

function loadCart() {
  try {
    const raw = sessionStorage.getItem('pb_cart')
             || localStorage.getItem('pb_cart')
             || '[]';
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch(e)