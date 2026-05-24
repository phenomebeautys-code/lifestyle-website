/* ============================================================
   PhenomeBeauty — checkout.js
   Extracted from working commit f5f0532.
   - Correct Supabase anon key (iat: May 2026)
   - Correct locker endpoint: pudo-locker-search (GET)
   - Correct Places callback name: initPlaces
   - selectLocker(id, name, address, boxSize, sizeUnknown)
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
  // orders after 14:00 count as next business day
  if (hour >= 14) base.setDate(base.getDate() + 1);
  // skip weekends for dispatch
  while (base.getDay() === 0 || base.getDay() === 6) base.setDate(base.getDate() + 1);
  // locker: +2 bd, door: +3 bd
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
      name:     document.getElementById('coName')?.value  || '',
      phone:    document.getElementById('coPhone')?.value || '',
      email:    document.getElementById('coEmail')?.value || '',
      addr1:    document.getElementById('coAddr1')?.value || '',
      addr2:    document.getElementById('coAddr2')?.value || '',
      city:     document.getElementById('coCity')?.value  || '',
      province: document.getElementById('coProvince')?.value || '',
      postal:   document.getElementById('coPostal')?.value  || '',
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
    set('coName', d.name); set('coPhone', d.phone); set('coEmail', d.email);
    set('coAddr1', d.addr1); set('coAddr2', d.addr2); set('coCity', d.city);
    set('coProvince', d.province); set('coPostal', d.postal);
    if (d.delivery) { selectedDelivery = d.delivery; syncDeliveryToggle(); }
    if (d.locker)   { selectedLocker   = d.locker; }
  } catch(e) {}
}

/* ── Validation ──────────────────────────────────────────── */
function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('error');
  let err = el.parentElement.querySelector('.field-error');
  if (!err) { err = document.createElement('span'); err.className = 'field-error'; el.parentElement.appendChild(err); }
  err.textContent = msg;
}
function clearFieldErrors() {
  document.querySelectorAll('.field-error').forEach(e => e.remove());
  document.querySelectorAll('.error').forEach(e => e.classList.remove('error'));
}

function validateStep1() {
  clearFieldErrors();
  let ok = true;
  const name  = document.getElementById('coName')?.value.trim();
  const phone = document.getElementById('coPhone')?.value.trim();
  const email = document.getElementById('coEmail')?.value.trim();
  if (!name)               { showFieldError('coName',  'Full name is required'); ok = false; }
  if (!phone)              { showFieldError('coPhone', 'Phone number is required'); ok = false; }
  if (!email || !email.includes('@')) { showFieldError('coEmail', 'Valid email is required'); ok = false; }
  return ok;
}

function validateStep2() {
  clearFieldErrors();
  if (selectedDelivery === 'locker') {
    if (!selectedLocker) {
      const nudge = document.getElementById('lockerNudge');
      if (nudge) { nudge.classList.add('show'); nudge.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      return false;
    }
    return true;
  }
  let ok = true;
  const addr1    = document.getElementById('coAddr1')?.value.trim();
  const city     = document.getElementById('coCity')?.value.trim();
  const province = document.getElementById('coProvince')?.value.trim();
  const postal   = document.getElementById('coPostal')?.value.trim();
  if (!addr1)    { showFieldError('coAddr1',    'Street address is required'); ok = false; }
  if (!city)     { showFieldError('coCity',     'City is required'); ok = false; }
  if (!province) { showFieldError('coProvince', 'Province is required'); ok = false; }
  if (!postal)   { showFieldError('coPostal',   'Postal code is required'); ok = false; }
  return ok;
}

/* ── Step navigation ─────────────────────────────────────── */
function goToStep(n) {
  currentStep = n;
  document.querySelectorAll('.co-step-panel').forEach((p, i) => {
    p.classList.toggle('active', i + 1 === n);
  });
  document.querySelectorAll('.co-step-btn').forEach((b, i) => {
    b.classList.toggle('active',    i + 1 === n);
    b.classList.toggle('completed', i + 1 <  n);
  });
  renderSummary();
  renderMobileSummary();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── Delivery toggle ─────────────────────────────────────── */
function syncDeliveryToggle() {
  const lockerBtn = document.getElementById('deliveryLocker');
  const doorBtn   = document.getElementById('deliveryDoor');
  const lockerSec = document.getElementById('lockerSection');
  const doorSec   = document.getElementById('doorSection');
  if (lockerBtn) lockerBtn.classList.toggle('selected', selectedDelivery === 'locker');
  if (doorBtn)   doorBtn.classList.toggle('selected',   selectedDelivery === 'door');
  if (lockerSec) lockerSec.style.display = selectedDelivery === 'locker' ? '' : 'none';
  if (doorSec)   doorSec.style.display   = selectedDelivery === 'door'   ? '' : 'none';
}

/* ── Locker search ───────────────────────────────────────── */
let _lockerSearchTimer = null;

async function searchLockers(query) {
  const list = document.getElementById('lockerList');
  if (!list) return;

  // If we have GPS coords, always prefer those
  const useCoords = lockerSearchLat !== null && lockerSearchLng !== null;
  if (!useCoords && (!query || query.length < 3)) return;

  list.innerHTML = '<div class="locker-loading">Searching\u2026</div>';

  try {
    const params = new URLSearchParams({ limit: '20' });
    if (useCoords) {
      params.set('lat', lockerSearchLat);
      params.set('lng', lockerSearchLng);
    } else {
      params.set('q', query);
    }

    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/pudo-locker-search?${params}`,
      { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const lockers = data.lockers || data.results || data || [];

    if (!lockers.length) {
      list.innerHTML = '<div class="locker-empty">No lockers found nearby. Try a different area.</div>';
      return;
    }

    list.innerHTML = lockers.map(l => {
      const sizeUnknown = !l.box_size || l.box_size === 'UNKNOWN';
      const sizeLabel   = sizeUnknown ? '' : `<span class="locker-size">${l.box_size}</span>`;
      const distLabel   = l.distance_km != null ? `<span class="locker-dist">${(+l.distance_km).toFixed(1)} km</span>` : '';
      return `<div class="locker-item" data-id="${l.id}" data-name="${encodeURIComponent(l.name||'')}" data-addr="${encodeURIComponent(l.address||l.full_address||'')}" data-size="${l.box_size||''}" data-unknown="${sizeUnknown}">
        <div class="locker-item-top"><span class="locker-name">${l.name||'Locker'}</span>${distLabel}${sizeLabel}</div>
        <div class="locker-addr">${l.address||l.full_address||''}</div>
      </div>`;
    }).join('');

    list.querySelectorAll('.locker-item').forEach(el => {
      el.addEventListener('click', () => {
        selectLocker(
          el.dataset.id,
          decodeURIComponent(el.dataset.name),
          decodeURIComponent(el.dataset.addr),
          el.dataset.size,
          el.dataset.unknown === 'true'
        );
      });
    });
  } catch(e) {
    list.innerHTML = `<div class="locker-empty">Could not load lockers. Please try again.</div>`;
    console.error('Locker search error:', e);
  }
}

function selectLocker(id, name, address, boxSize, sizeUnknown) {
  selectedLocker = { id, name, address, boxSize, sizeUnknown };
  const badge = document.getElementById('selectedLockerBadge');
  if (badge) {
    badge.innerHTML = `<strong>${name}</strong><br><small>${address}</small>`;
    badge.style.display = 'block';
  }
  document.querySelectorAll('.locker-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === String(id));
  });
  const nudge = document.getElementById('lockerNudge');
  if (nudge) nudge.classList.remove('show');
  renderSummary();
  renderMobileSummary();
}

/* ── GPS ─────────────────────────────────────────────────── */
function requestGPS() {
  if (!navigator.geolocation) return;
  const btn = document.getElementById('gpsBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Locating\u2026'; }
  navigator.geolocation.getCurrentPosition(
    pos => {
      lockerSearchLat = pos.coords.latitude;
      lockerSearchLng = pos.coords.longitude;
      if (btn) { btn.disabled = false; btn.textContent = 'Use my location'; }
      searchLockers('');
    },
    () => {
      if (btn) { btn.disabled = false; btn.textContent = 'Use my location'; }
    }
  );
}

/* ── Google Places autocomplete ──────────────────────────── */
let _placesAutocomplete = null;

function initPlaces() {
  const input = document.getElementById('coAddr1');
  if (!input || !window.google?.maps?.places) return;
  _placesAutocomplete = new google.maps.places.Autocomplete(input, {
    componentRestrictions: { country: 'ZA' },
    fields: ['address_components', 'formatted_address'],
    types: ['address'],
  });
  _placesAutocomplete.addListener('place_changed', () => {
    const place = _placesAutocomplete.getPlace();
    if (!place.address_components) return;
    const get = (type) => place.address_components.find(c => c.types.includes(type))?.long_name || '';
    const getShort = (type) => place.address_components.find(c => c.types.includes(type))?.short_name || '';
    const streetNum  = get('street_number');
    const streetName = get('route');
    const suburb     = get('sublocality') || get('sublocality_level_1') || get('neighborhood');
    const city       = get('locality') || get('administrative_area_level_2');
    const province   = getShort('administrative_area_level_1');
    const postal     = get('postal_code');
    const addr1El    = document.getElementById('coAddr1');
    const addr2El    = document.getElementById('coAddr2');
    const cityEl     = document.getElementById('coCity');
    const provEl     = document.getElementById('coProvince');
    const postalEl   = document.getElementById('coPostal');
    if (addr1El) addr1El.value = [streetNum, streetName].filter(Boolean).join(' ') || place.formatted_address;
    if (addr2El && suburb) addr2El.value = suburb;
    if (cityEl)   cityEl.value   = city;
    if (provEl)   provEl.value   = province;
    if (postalEl) postalEl.value = postal;
    saveDraft();
  });
}

/* ── Render delivery date ────────────────────────────────── */
function renderDeliveryDate() {
  const range = getDeliveryRange();
  const elSummary = document.getElementById('summaryDeliveryDate');
  const elMobile  = document.getElementById('mobileDeliveryDate');
  if (elSummary) elSummary.textContent = range;
  if (elMobile)  elMobile.textContent  = range;
}

/* ── PRODUCT_IMGS ────────────────────────────────────────── */
const PRODUCT_IMGS = {
  'film-wax-collection':        'https://iili.io/BiIZ18x.jpg',
  'refine-restore-ritual-kit':  'https://iili.io/BPKRo0J.jpg',
  'refine-exfoliating-scrub':   'https://iili.io/BPFXtun.jpg',
  'restore-moisturising-cream': 'https://iili.io/BP36aft.jpg',
  'pro-max-100-wax-heater':     'https://iili.io/BP3Dn9t.jpg',
  'custom-press-on-nails':      'https://iili.io/BscYqN9.png',
};

/* ── Render sidebar summary ──────────────────────────────── */
function renderSummary() {
  const itemsEl  = document.getElementById('summaryItems');
  const totalsEl = document.getElementById('summaryTotals');
  if (!itemsEl) return;
  itemsEl.innerHTML = cart.map(item => {
    const img = PRODUCT_IMGS[item.productId] || item.imageUrl || '';
    return `<div class="co-item"><div class="co-item-img">${img ? `<img src="${img}" alt="${item.name}" loading="lazy" />` : ''}<span class="co-item-qty-badge">${item.qty}</span></div><div class="co-item-info"><div class="co-item-name">${item.name}</div><div class="co-item-var">${item.variant || ''}</div></div><div class="co-item-price">R${item.price * item.qty}</div></div>`;
  }).join('');
  if (totalsEl) totalsEl.innerHTML = `
    <div class="co-total-row"><span>Subtotal</span><span>R${calcSub()}</span></div>
    ${currentStep >= 2 ? `
    <div class="co-total-row"><span>Delivery (${selectedDelivery === 'locker' ? 'Pudo Locker' : 'Door'})</span><span>R${getDeliveryFee()}</span></div>
    <div class="co-total-row delivery-date"><span><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:4px"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> Est. delivery</span><span id="summaryDeliveryDate">-</span></div>
    <div class="co-divider" style="margin:6px 0"></div>
    <div class="co-total-row grand"><span>Total</span><span>R${calcTotal()}</span></div>` : ''}`;
  renderDeliveryDate();
}

function renderMobileSummary() {
  const totalEl  = document.getElementById('msTotalDisplay');
  const itemsEl  = document.getElementById('mobileItems');
  const totalsEl = document.getElementById('mobileTotals');
  if (totalEl) totalEl.textContent = `R${calcTotal()}`;
  if (itemsEl) itemsEl.innerHTML = cart.map(item => {
    const img = PRODUCT_IMGS[item.productId] || item.imageUrl || '';
    return `<div class="co-item"><div class="co-item-img">${img ? `<img src="${img}" alt="${item.name}" loading="lazy" />` : ''}<span class="co-item-qty-badge">${item.qty}</span></div><div class="co-item-info"><div class="co-item-name">${item.name}</div><div class="co-item-var">${item.variant || ''}</div></div><div class="co-item-price">R${item.price * item.qty}</div></div>`;
  }).join('');
  if (totalsEl) totalsEl.innerHTML = `
    <div class="co-total-row"><span>Subtotal</span><span>R${calcSub()}</span></div>
    ${currentStep >= 2 ? `
    <div class="co-total-row"><span>Delivery (${selectedDelivery === 'locker' ? 'Pudo Locker' : 'Door'})</span><span>R${getDeliveryFee()}</span></div>
    <div class="co-total-row delivery-date"><span><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:4px"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> Est. delivery</span><span id="mobileDeliveryDate">-</span></div>
    <div class="co-divider" style="margin:6px 0"></div>
    <div class="co-total-row grand"><span>Total</span><span>R${calcTotal()}</span></div>` : ''}`;
  renderDeliveryDate();
}

function toggleMobileSummary() {
  const drawer = document.getElementById('mobileSummaryDrawer');
  const arrow  = document.getElementById('msArrow');
  if (!drawer) return;
  const open = drawer.classList.toggle('open');
  if (arrow) arrow.style.transform = open ? 'rotate(180deg)' : '';
}

/* ── Cart count ──────────────────────────────────────────── */
function renderCartCount() {
  const total = cart.reduce((s, i) => s + i.qty, 0);
  document.querySelectorAll('.co-cart-count').forEach(el => {
    el.textContent = `${total} item${total !== 1 ? 's' : ''} in your cart`;
  });
}

/* ── Review step (Step 3) ────────────────────────────────── */
function renderReview() {
  const el = document.getElementById('reviewContent');
  if (!el) return;
  const name  = document.getElementById('coName')?.value.trim()  || '';
  const phone = document.getElementById('coPhone')?.value.trim() || '';
  const email = document.getElementById('coEmail')?.value.trim() || '';
  let deliveryStr = '';
  if (selectedDelivery === 'locker' && selectedLocker) {
    deliveryStr = `Pudo Locker: ${selectedLocker.name}, ${selectedLocker.address}`;
  } else {
    const addr1    = document.getElementById('coAddr1')?.value.trim()    || '';
    const addr2    = document.getElementById('coAddr2')?.value.trim()    || '';
    const city     = document.getElementById('coCity')?.value.trim()     || '';
    const province = document.getElementById('coProvince')?.value.trim() || '';
    const postal   = document.getElementById('coPostal')?.value.trim()   || '';
    deliveryStr    = [addr1, addr2, city, province, postal].filter(Boolean).join(', ');
  }
  el.innerHTML = `
    <div class="review-section">
      <div class="review-label">Contact</div>
      <div class="review-value">${name} \u00b7 ${phone} \u00b7 ${email}</div>
    </div>
    <div class="review-section">
      <div class="review-label">Delivery</div>
      <div class="review-value">${deliveryStr}</div>
    </div>
    <div class="review-section">
      <div class="review-label">Items</div>
      ${cart.map(i => `<div class="review-value">${i.qty}\u00d7 ${i.name}${i.variant ? ' \u2013 ' + i.variant : ''} \u2014 R${i.price * i.qty}</div>`).join('')}
    </div>
    <div class="review-section">
      <div class="review-label">Order total</div>
      <div class="review-value grand">R${calcTotal()}</div>
    </div>`;
}

/* ── Yoco payment ────────────────────────────────────────── */
async function initiatePayment() {
  const btn = document.getElementById('payBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Processing\u2026'; }

  const name  = document.getElementById('coName')?.value.trim()  || '';
  const phone = document.getElementById('coPhone')?.value.trim() || '';
  const email = document.getElementById('coEmail')?.value.trim() || '';

  let deliveryAddress = null;
  if (selectedDelivery === 'locker' && selectedLocker) {
    deliveryAddress = {
      type: 'locker',
      lockerId:   selectedLocker.id,
      lockerName: selectedLocker.name,
      address:    selectedLocker.address,
      boxSize:    selectedLocker.boxSize,
    };
  } else {
    deliveryAddress = {
      type:     'door',
      line1:    document.getElementById('coAddr1')?.value.trim()    || '',
      line2:    document.getElementById('coAddr2')?.value.trim()    || '',
      city:     document.getElementById('coCity')?.value.trim()     || '',
      province: document.getElementById('coProvince')?.value.trim() || '',
      postal:   document.getElementById('coPostal')?.value.trim()   || '',
    };
  }

  const payload = {
    cart,
    customer: { name, phone, email },
    delivery: { method: selectedDelivery, fee: getDeliveryFee(), address: deliveryAddress },
    total:    calcTotal(),
    origin:   ORIGIN,
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-yoco-session`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
      body:    JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.redirectUrl) {
      localStorage.removeItem(DRAFT_KEY);
      window.location.href = data.redirectUrl;
    } else {
      throw new Error(data.error || 'No redirect URL returned');
    }
  } catch(e) {
    console.error('Payment error:', e);
    if (btn) { btn.disabled = false; btn.textContent = 'Pay now'; }
    const errEl = document.getElementById('payError');
    if (errEl) { errEl.textContent = 'Payment could not be initiated. Please try again.'; errEl.style.display = 'block'; }
  }
}

/* ── Init ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadDraft();
  renderSummary();
  renderMobileSummary();
  renderCartCount();
  syncDeliveryToggle();

  // Step 1 → 2
  const nextBtn = document.getElementById('nextToDelivery');
  if (nextBtn) nextBtn.addEventListener('click', () => {
    if (validateStep1()) { saveDraft(); goToStep(2); }
  });

  // Step 2 → 3
  const next2Btn = document.getElementById('nextToReview');
  if (next2Btn) next2Btn.addEventListener('click', () => {
    if (validateStep2()) { saveDraft(); goToStep(3); renderReview(); }
  });

  // Step 3: Pay
  const payBtn = document.getElementById('payBtn');
  if (payBtn) payBtn.addEventListener('click', initiatePayment);

  // Back buttons
  document.getElementById('backToContact')?.addEventListener('click', () => goToStep(1));
  document.getElementById('backToDelivery')?.addEventListener('click', () => goToStep(2));

  // Delivery toggle
  document.getElementById('deliveryLocker')?.addEventListener('click', () => {
    selectedDelivery = 'locker'; syncDeliveryToggle(); renderSummary(); renderMobileSummary(); saveDraft();
  });
  document.getElementById('deliveryDoor')?.addEventListener('click', () => {
    selectedDelivery = 'door'; syncDeliveryToggle(); renderSummary(); renderMobileSummary(); saveDraft();
  });

  // Locker search input
  const lockerInput = document.getElementById('lockerSearch');
  if (lockerInput) {
    lockerInput.addEventListener('input', e => {
      clearTimeout(_lockerSearchTimer);
      _lockerSearchTimer = setTimeout(() => searchLockers(e.target.value.trim()), 400);
    });
  }

  // GPS button
  document.getElementById('gpsBtn')?.addEventListener('click', requestGPS);

  // Mobile summary toggle
  document.getElementById('mobileSummaryToggle')?.addEventListener('click', toggleMobileSummary);

  // Draft autosave on input
  document.querySelectorAll('#coName,#coPhone,#coEmail,#coAddr1,#coAddr2,#coCity,#coProvince,#coPostal').forEach(el => {
    el.addEventListener('input', saveDraft);
  });

  // Empty cart warning
  if (!cart.length) {
    const warn = document.getElementById('emptyCartWarn');
    if (warn) warn.style.display = 'block';
  }
});
