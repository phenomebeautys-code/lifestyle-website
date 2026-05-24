/* ============================================================
   PhenomeBeauty — checkout.js
   Extracted from working commit f5f0532.
   - Correct Supabase anon key (iat: May 2026)
   - Correct locker endpoint: pudo-locker-search (GET)
   - Correct Places callback name: initPlaces
   - selectLocker(id, name, address, boxSize, sizeUnknown)
   - IDs/classes aligned with checkout.html (May 2026)
   ============================================================ */

'use strict';

const SUPABASE_URL  = 'https://papdxjcfimeyjgzmatpl.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcGR4amNmaW1leWpnem1hdHBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMDk4NjcsImV4cCI6MjA5MjY4NTg2N30.mn_JsORuYUBtHTqIF2RjY8YUJzY9zJQV0uGFXBvrJRc';
const ORIGIN        = 'https://www.phenomebeauty.co.za';
const DRAFT_KEY     = 'phenome_checkout_draft';

const DELIVERY_FEES = { locker: 59, door: 99 };

let cart             = JSON.parse(localStorage.getItem('phenome_cart') || '[]');
let selectedDelivery = 'door';
let selectedLocker   = null;
let lockerSearchLat  = null;
let lockerSearchLng  = null;
let currentStep      = 1;

/* ── Box-size client estimator ──────────────────────────── */
const _PUDO_BOXES_CLIENT = [
  { code: 'XS', boxL: 60, boxW: 17, boxH:  8, maxKg:  2 },
  { code: 'S',  boxL: 60, boxW: 41, boxH:  8, maxKg:  5 },
  { code: 'M',  boxL: 60, boxW: 41, boxH: 19, maxKg: 10 },
  { code: 'L',  boxL: 60, boxW: 41, boxH: 41, maxKg: 15 },
  { code: 'XL', boxL: 60, boxW: 41, boxH: 69, maxKg: 20 },
];
let _productDimCache = {};

async function _fetchProductDims(productIds) {
  const missing = productIds.filter(id => !_productDimCache[id]);
  if (!missing.length) return;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/shop_products?id=in.(${missing.join(',')})&select=id,weight_kg,length_cm,width_cm,height_cm,pack_flat`,
      { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
    );
    const rows = await res.json();
    if (Array.isArray(rows)) rows.forEach(r => { _productDimCache[r.id] = r; });
  } catch(e) { /* silently degrade */ }
}

function _fitsInBoxClient(items, box) {
  const units = [];
  for (const it of items) {
    for (let i = 0; i < it.qty; i++) units.push({ l: it.l, w: it.w, h: it.h });
  }
  units.sort((a, b) => b.h - a.h);
  let usedHeight = 0;
  let remaining = [...units];
  while (remaining.length > 0) {
    const layerH = remaining[0].h;
    usedHeight += layerH;
    if (usedHeight > box.boxH) return false;
    let usedL = 0;
    const packed = [];
    for (let i = 0; i < remaining.length; i++) {
      const u = remaining[i];
      if (u.h > layerH) continue;
      if (usedL + u.l <= box.boxL && u.w <= box.boxW) { usedL += u.l; packed.push(i); }
    }
    if (!packed.length) return false;
    for (let i = packed.length - 1; i >= 0; i--) remaining.splice(packed[i], 1);
  }
  return true;
}

async function estimateBoxSize() {
  if (!cart.length) return 'XS';
  const productIds = [...new Set(cart.map(i => i.productId).filter(Boolean))];
  await _fetchProductDims(productIds);
  let totalKg = 0;
  const packedItems = [];
  for (const item of cart) {
    const d = _productDimCache[item.productId];
    let pd;
    if (d && d.length_cm && d.width_cm && d.height_cm) {
      pd = { l: d.pack_flat ? d.height_cm : d.length_cm,
             w: d.pack_flat ? d.length_cm : d.width_cm,
             h: d.pack_flat ? d.width_cm  : d.height_cm };
      totalKg += (d.weight_kg || 0.2) * item.qty;
    } else {
      pd = { l: 10, w: 10, h: 5 };
      totalKg += 0.2 * item.qty;
    }
    packedItems.push({ id: item.productId, qty: item.qty, ...pd });
  }
  for (const box of _PUDO_BOXES_CLIENT) {
    if (totalKg <= box.maxKg && _fitsInBoxClient(packedItems, box)) return box.code;
  }
  return 'XL';
}

/* ── Helpers ─────────────────────────────────────────────── */
function calcSub()   { return cart.reduce((s, i) => s + i.price * i.qty, 0); }
function getDeliveryFee() { return DELIVERY_FEES[selectedDelivery] ?? 0; }
function calcTotal() { return calcSub() + getDeliveryFee(); }

function fmt(d) {
  return d.toLocaleDateString('en-ZA', { weekday:'short', day:'numeric', month:'short' });
}

function getDeliveryRange() {
  const now  = new Date();
  const hour = now.getHours();
  const base = new Date(now);
  if (hour >= 14) base.setDate(base.getDate() + 1);
  while (base.getDay() === 0 || base.getDay() === 6) base.setDate(base.getDate() + 1);
  const daysMin = selectedDelivery === 'locker' ? 2 : 3;
  const daysMax = daysMin + 1;
  function addBd(d, n) {
    let count = 0;
    while (count < n) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) count++; }
    return d;
  }
  const lo = addBd(new Date(base), daysMin);
  const hi = addBd(new Date(lo),   daysMax - daysMin);
  return `${fmt(lo)} \u2013 ${fmt(hi)}`;
}

/* ── Draft persistence ───────────────────────────────────── */
function saveDraft() {
  try {
    const d = {
      name:     document.getElementById('f-name')?.value     || '',
      phone:    document.getElementById('f-phone')?.value    || '',
      email:    document.getElementById('f-email')?.value    || '',
      addr1:    document.getElementById('f-street')?.value   || '',
      addr2:    document.getElementById('f-suburb')?.value   || '',
      city:     document.getElementById('f-city')?.value     || '',
      province: document.getElementById('f-province')?.value || '',
      postal:   document.getElementById('f-postal')?.value   || '',
      delivery: selectedDelivery,
      locker:   selectedLocker,
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch(e) {}
}

function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (!d) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
    set('f-name',     d.name);
    set('f-phone',    d.phone);
    set('f-email',    d.email);
    set('f-street',   d.addr1);
    set('f-suburb',   d.addr2);
    set('f-city',     d.city);
    set('f-province', d.province);
    set('f-postal',   d.postal);
    if (d.delivery) { selectedDelivery = d.delivery; syncDeliveryToggle(); }
    if (d.locker)   { selectedLocker   = d.locker; }
  } catch(e) {}
}

/* ── Validation ──────────────────────────────────────────── */
function showFieldError(fieldId, errId, msg) {
  const field = document.getElementById(fieldId);
  const errEl = document.getElementById(errId);
  if (field) field.closest('.field')?.classList.add('error');
  if (errEl) { errEl.textContent = msg; errEl.classList.add('show'); }
}
function clearFieldErrors() {
  document.querySelectorAll('.field.error').forEach(e => e.classList.remove('error'));
  document.querySelectorAll('.error-text.show').forEach(e => e.classList.remove('show'));
}

function validateStep1() {
  clearFieldErrors();
  let ok = true;
  const name  = document.getElementById('f-name')?.value.trim();
  const phone = document.getElementById('f-phone')?.value.trim();
  const email = document.getElementById('f-email')?.value.trim();
  if (!name)                       { showFieldError('f-name',  'err-name',  'Full name is required'); ok = false; }
  if (!phone)                      { showFieldError('f-phone', 'err-phone', 'Phone number is required'); ok = false; }
  if (!email || !email.includes('@')) { showFieldError('f-email', 'err-email', 'Valid email is required'); ok = false; }
  return ok;
}

function validateStep2() {
  clearFieldErrors();
  if (selectedDelivery === 'locker') {
    if (!selectedLocker) {
      const nudge = document.getElementById('err-locker');
      if (nudge) { nudge.classList.add('show'); nudge.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      return false;
    }
    return true;
  }
  let ok = true;
  const addr1    = document.getElementById('f-street')?.value.trim();
  const city     = document.getElementById('f-city')?.value.trim();
  const province = document.getElementById('f-province')?.value.trim();
  const postal   = document.getElementById('f-postal')?.value.trim();
  if (!addr1)    { showFieldError('f-street',   'err-street',   'Street address is required'); ok = false; }
  if (!city)     { showFieldError('f-city',     'err-city',     'City is required'); ok = false; }
  if (!province) { showFieldError('f-province', 'err-province', 'Province is required'); ok = false; }
  if (!postal)   { showFieldError('f-postal',   'err-postal',   'Postal code is required'); ok = false; }
  return ok;
}

/* ── Step navigation ─────────────────────────────────────── */
function goToStep(n) {
  currentStep = n;
  // panels: id="panel-1", "panel-2", "panel-3"
  document.querySelectorAll('.step').forEach((p, i) => {
    p.classList.toggle('active', i + 1 === n);
  });
  // breadcrumbs: id="breadcrumb-1", "breadcrumb-2", "breadcrumb-3"
  document.querySelectorAll('.step-pill').forEach((b, i) => {
    b.classList.toggle('active',    i + 1 === n);
    b.classList.toggle('done',      i + 1 <  n);
  });
  renderSummary();
  renderMobileSummary();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── Delivery toggle ─────────────────────────────────────── */
function selectDelivery(type) {
  selectedDelivery = type;
  syncDeliveryToggle();
  renderSummary();
  renderMobileSummary();
  saveDraft();
}

function syncDeliveryToggle() {
  const lockerBtn = document.getElementById('opt-locker');
  const doorBtn   = document.getElementById('opt-door');
  const lockerSec = document.getElementById('locker-fields');
  const doorSec   = document.getElementById('door-fields');
  if (lockerBtn) lockerBtn.classList.toggle('selected', selectedDelivery === 'locker');
  if (doorBtn)   doorBtn.classList.toggle('selected',   selectedDelivery === 'door');
  if (lockerSec) lockerSec.style.display = selectedDelivery === 'locker' ? '' : 'none';
  if (doorSec)   doorSec.style.display   = selectedDelivery === 'door'   ? '' : 'none';
  // update meta copy
  const metaTitle = document.getElementById('deliveryMetaTitle');
  const metaText  = document.getElementById('deliveryMetaText');
  if (metaTitle) metaTitle.textContent = selectedDelivery === 'locker' ? 'Pudo locker selected' : 'Door delivery selected';
  if (metaText)  metaText.textContent  = selectedDelivery === 'locker'
    ? 'Select a locker from the list below. We\u2019ll include the locker details in your order.'
    : 'Enter your address and we\u2019ll estimate a delivery window based on business days and local holidays.';
  renderDeliveryDate();
}

/* ── Locker search ───────────────────────────────────────── */
let _lockerSearchTimer = null;

async function searchLockers(query) {
  // query may come from the input field directly (called by HTML onclick)
  if (query === undefined) {
    query = document.getElementById('f-locker-search')?.value.trim() || '';
  }
  const list = document.getElementById('lockerResults');
  if (!list) return;

  const lat = lockerSearchLat ?? window.lockerSearchLat ?? null;
  const lng = lockerSearchLng ?? window.lockerSearchLng ?? null;
  const useCoords = lat !== null && lng !== null;
  if (!useCoords && (!query || query.length < 3)) return;

  list.innerHTML = '<div class="locker-loading">Searching\u2026</div>';

  try {
    const params = new URLSearchParams({ limit: '20' });
    if (useCoords)