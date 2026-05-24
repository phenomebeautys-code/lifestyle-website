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
    if (useCoords) {
      params.set('lat', lat);
      params.set('lng', lng);
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
      const sizeLabel   = sizeUnknown ? '' : `<span class="locker-tag">${l.box_size}</span>`;
      const distLabel   = l.distance_km != null ? `<span class="locker-tag">${(+l.distance_km).toFixed(1)} km</span>` : '';
      return `<div class="locker-item" data-id="${l.id}" data-name="${encodeURIComponent(l.name||'')}" data-addr="${encodeURIComponent(l.address||l.full_address||'')}" data-size="${l.box_size||''}" data-unknown="${sizeUnknown}">
        <div class="locker-item-top"><h4>${l.name||'Locker'}</h4><div class="locker-badges">${distLabel}${sizeLabel}</div></div>
        <p>${l.address||l.full_address||''}</p>
        <div class="locker-cta"><button type="button" class="mini-btn" onclick="(function(el){selectLocker(el.dataset.id,decodeURIComponent(el.dataset.name),decodeURIComponent(el.dataset.addr),el.dataset.size,el.dataset.unknown==='true')})(this.closest('.locker-item'))">Select</button></div>
      </div>`;
    }).join('');

    list.querySelectorAll('.locker-item').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.tagName === 'BUTTON') return; // button has own handler
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

  // Show selected locker display block
  const display  = document.getElementById('lockerSelectedDisplay');
  const nameEl   = document.getElementById('lockerSelectedName');
  const addrEl   = document.getElementById('lockerSelectedAddr');
  const sizeNote = document.getElementById('lockerSelectedSizeNote');
  if (display) display.style.display = '';
  if (nameEl)  nameEl.textContent    = name;
  if (addrEl)  addrEl.textContent    = address;
  if (sizeNote) {
    if (sizeUnknown) {
      sizeNote.textContent  = 'Box size could not be confirmed for this locker. Your order will be packed to fit the available box.';
      sizeNote.className    = 'locker-size-note locker-size-note--unknown';
      sizeNote.style.display = '';
    } else if (boxSize) {
      sizeNote.textContent  = `This locker accepts up to box size ${boxSize}.`;
      sizeNote.className    = 'locker-size-note locker-size-note--confirmed';
      sizeNote.style.display = '';
    } else {
      sizeNote.style.display = 'none';
    }
  }

  // Highlight selected item in list
  document.querySelectorAll('.locker-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === String(id));
  });

  // Hide validation error
  const nudge = document.getElementById('err-locker');
  if (nudge) nudge.classList.remove('show');

  renderSummary();
  renderMobileSummary();
}

function clearLockerSelection() {
  selectedLocker = null;
  const display = document.getElementById('lockerSelectedDisplay');
  if (display) display.style.display = 'none';
  document.querySelectorAll('.locker-item').forEach(el => el.classList.remove('selected'));
  renderSummary();
  renderMobileSummary();
}

/* ── GPS (called by useMyLocation in HTML inline script) ─── */
function requestGPS() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    pos => {
      lockerSearchLat = pos.coords.latitude;
      lockerSearchLng = pos.coords.longitude;
      searchLockers('');
    },
    () => {}
  );
}

/* ── Google Places autocomplete ──────────────────────────── */
let _placesAutocomplete = null;

function initPlaces() {
  const input = document.getElementById('f-street');
  if (!input || !window.google?.maps?.places) return;
  _placesAutocomplete = new google.maps.places.Autocomplete(input, {
    componentRestrictions: { country: 'ZA' },
    fields: ['address_components', 'formatted_address'],
    types: ['address'],
  });
  _placesAutocomplete.addListener('place_changed', () => {
    const place = _placesAutocomplete.getPlace();
    if (!place.address_components) return;
    const get      = (type) => place.address_components.find(c => c.types.includes(type))?.long_name  || '';
    const getShort = (type) => place.address_components.find(c => c.types.includes(type))?.short_name || '';
    const streetNum  = get('street_number');
    const streetName = get('route');
    const suburb     = get('sublocality') || get('sublocality_level_1') || get('neighborhood');
    const city       = get('locality') || get('administrative_area_level_2');
    const province   = getShort('administrative_area_level_1');
    const postal     = get('postal_code');
    const streetEl   = document.getElementById('f-street');
    const suburbEl   = document.getElementById('f-suburb');
    const cityEl     = document.getElementById('f-city');
    const provEl     = document.getElementById('f-province');
    const postalEl   = document.getElementById('f-postal');
    if (streetEl) streetEl.value = [streetNum, streetName].filter(Boolean).join(' ') || place.formatted_address;
    if (suburbEl && suburb) suburbEl.value = suburb;
    if (cityEl)   cityEl.value   = city;
    if (provEl)   provEl.value   = province;
    if (postalEl) postalEl.value = postal;
    saveDraft();
  });
}

/* ── Render delivery date ────────────────────────────────── */
function renderDeliveryDate() {
  const range = getDeliveryRange();
  // sidebar
  const elDate2  = document.getElementById('summaryDeliveryDate');
  if (elDate2) elDate2.textContent = range;
  // step 2 delivery window pill
  const elDate   = document.getElementById('deliveryDateText2');
  if (elDate) elDate.textContent = range;
  // step 3 review
  const rvDate   = document.getElementById('rv-delivery-date');
  if (rvDate) rvDate.textContent = range;
  // mobile
  const elMobile = document.getElementById('mobileDeliveryDate');
  if (elMobile) elMobile.textContent = range;
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
    return `<div class="cart-item"><div class="cart-item-img">${img ? `<img src="${img}" alt="${item.name}" loading="lazy" width="60" height="60" />` : ''}</div><div class="cart-item-info"><h4>${item.name}</h4>${item.variant ? `<div class="cart-meta">${item.variant}</div>` : ''}</div><div class="cart-price">R${item.price * item.qty}</div></div>`;
  }).join('');
  if (totalsEl) totalsEl.innerHTML = `
    <div class="total-row"><span>Subtotal</span><span>R${calcSub()}</span></div>
    ${currentStep >= 2 ? `
    <div class="total-row"><span>Delivery (${selectedDelivery === 'locker' ? 'Pudo Locker' : 'Door'})</span><span>R${getDeliveryFee()}</span></div>
    <div class="total-row delivery-date"><span><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:4px"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> Est. delivery</span><span id="summaryDeliveryDate">-</span></div>
    <div class="co-divider" style="margin:6px 0"></div>
    <div class="total-row grand"><span>Total</span><span>R${calcTotal()}</span></div>` : ''}`;
  renderDeliveryDate();
  // update pay button total
  const payBtnTotal = document.getElementById('payBtnTotal');
  if (payBtnTotal) payBtnTotal.textContent = calcTotal();
}

function renderMobileSummary() {
  const totalEl  = document.getElementById('msTotalDisplay');
  const itemsEl  = document.getElementById('mobileItems');
  const totalsEl = document.getElementById('mobileTotals');
  if (totalEl) totalEl.textContent = `R${calcTotal()}`;
  if (itemsEl) itemsEl.innerHTML = cart.map(item => {
    const img = PRODUCT_IMGS[item.productId] || item.imageUrl || '';
    return `<div class="cart-item"><div class="cart-item-img">${img ? `<img src="${img}" alt="${item.name}" loading="lazy" width="60" height="60" />` : ''}</div><div class="cart-item-info"><h4>${item.name}</h4>${item.variant ? `<div class="cart-meta">${item.variant}</div>` : ''}</div><div class="cart-price">R${item.price * item.qty}</div></div>`;
  }).join('');
  if (totalsEl) totalsEl.innerHTML = `
    <div class="total-row"><span>Subtotal</span><span>R${calcSub()}</span></div>
    ${currentStep >= 2 ? `
    <div class="total-row"><span>Delivery (${selectedDelivery === 'locker' ? 'Pudo Locker' : 'Door'})</span><span>R${getDeliveryFee()}</span></div>
    <div class="total-row delivery-date"><span><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:4px"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> Est. delivery</span><span id="mobileDeliveryDate">-</span></div>
    <div class="co-divider" style="margin:6px 0"></div>
    <div class="total-row grand"><span>Total</span><span>R${calcTotal()}</span></div>` : ''}`;
  renderDeliveryDate();
}

function toggleMobileSummary() {
  const body    = document.getElementById('mobileSummaryBody');
  const chevron = document.getElementById('msChevron');
  if (!body) return;
  const open = body.classList.toggle('open');
  if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : '';
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
  const name  = document.getElementById('f-name')?.value.trim()     || '';
  const phone = document.getElementById('f-phone')?.value.trim()    || '';
  const email = document.getElementById('f-email')?.value.trim()    || '';

  // Contact block
  const contactVal = document.getElementById('done-contact-val');
  const contactVal2 = document.getElementById('done-contact-val-2');
  if (contactVal)  contactVal.textContent  = `${name} \u00b7 ${phone} \u00b7 ${email}`;
  if (contactVal2) contactVal2.textContent = email;

  // Delivery block
  let deliveryStr = '';
  if (selectedDelivery === 'locker' && selectedLocker) {
    deliveryStr = `Pudo Locker: ${selectedLocker.name}, ${selectedLocker.address}`;
  } else {
    const addr1    = document.getElementById('f-street')?.value.trim()   || '';
    const addr2    = document.getElementById('f-suburb')?.value.trim()   || '';
    const city     = document.getElementById('f-city')?.value.trim()     || '';
    const province = document.getElementById('f-province')?.value.trim() || '';
    const postal   = document.getElementById('f-postal')?.value.trim()   || '';
    deliveryStr    = [addr1, addr2, city, province, postal].filter(Boolean).join(', ');
  }
  const deliveryVal = document.getElementById('done-delivery-val');
  if (deliveryVal) deliveryVal.textContent = deliveryStr;

  // Totals
  const rvDeliveryLabel = document.getElementById('rv-delivery-label');
  const rvDelivery      = document.getElementById('rv-delivery');
  const rvSubtotal      = document.getElementById('rv-subtotal');
  const rvTotal         = document.getElementById('rv-total');
  if (rvDeliveryLabel) rvDeliveryLabel.textContent = selectedDelivery === 'locker' ? 'Pudo Locker' : 'Door delivery';
  if (rvDelivery)      rvDelivery.textContent      = `R${getDeliveryFee()}`;
  if (rvSubtotal)      rvSubtotal.textContent      = `R${calcSub()}`;
  if (rvTotal)         rvTotal.textContent         = `R${calcTotal()}`;

  // Items panel
  const reviewItems = document.getElementById('reviewItems');
  if (reviewItems) {
    reviewItems.innerHTML = cart.map(i =>
      `<div class="review-line"><span>${i.qty}\u00d7 ${i.name}${i.variant ? ' \u2013 ' + i.variant : ''}</span><span>R${i.price * i.qty}</span></div>`
    ).join('');
  }

  // Gift message review
  const giftReveal = document.getElementById('giftReveal');
  const giftMsg    = document.getElementById('f-gift-message')?.value.trim() || '';
  const giftBlock  = document.getElementById('giftReviewBlock');
  const giftBody   = document.getElementById('giftReviewBody');
  if (giftBlock) giftBlock.style.display = (giftReveal?.classList.contains('open') && giftMsg) ? '' : 'none';
  if (giftBody)  giftBody.textContent    = giftMsg;

  renderDeliveryDate();
}

/* ── Gift toggle ─────────────────────────────────────────── */
function toggleGift() {
  const reveal  = document.getElementById('giftReveal');
  const toggles = document.querySelectorAll('#giftToggleRow .switch');
  if (!reveal) return;
  const open = !reveal.classList.contains('open');
  reveal.classList.toggle('open', open);
  reveal.style.maxHeight = open ? reveal.scrollHeight + 'px' : '0';
  toggles.forEach(t => t.classList.toggle('on', open));
  if (open) document.getElementById('f-gift-message')?.focus();
}

/* ── Exit nudge ──────────────────────────────────────────── */
function dismissNudge() {
  const nudge = document.getElementById('exitNudge');
  if (nudge) nudge.classList.remove('show');
}

/* ── Yoco payment ────────────────────────────────────────── */
async function handlePay() {
  if (!validateStep2()) { goToStep(2); return; }
  initiatePayment();
}

async function initiatePayment() {
  const btn = document.getElementById('payBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = 'Processing\u2026'; }

  const loading = document.getElementById('coLoading');
  if (loading) loading.classList.add('show');

  const name  = document.getElementById('f-name')?.value.trim()  || '';
  const phone = document.getElementById('f-phone')?.value.trim() || '';
  const email = document.getElementById('f-email')?.value.trim() || '';

  let deliveryAddress = null;
  if (selectedDelivery === 'locker' && selectedLocker) {
    deliveryAddress = {
      type:       'locker',
      lockerId:   selectedLocker.id,
      lockerName: selectedLocker.name,
      address:    selectedLocker.address,
      boxSize:    selectedLocker.boxSize,
    };
  } else {
    deliveryAddress = {
      type:     'door',
      line1:    document.getElementById('f-street')?.value.trim()   || '',
      line2:    document.getElementById('f-suburb')?.value.trim()   || '',
      city:     document.getElementById('f-city')?.value.trim()     || '',
      province: document.getElementById('f-province')?.value.trim() || '',
      postal:   document.getElementById('f-postal')?.value.trim()   || '',
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
    if (loading) loading.classList.remove('show');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `Pay R<span id="payBtnTotal">${calcTotal()}</span> <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
    }
    const errEl = document.getElementById('alert-3');
    if (errEl) {
      errEl.textContent = 'Payment could not be initiated. Please try again.';
      errEl.classList.add('show');
    }
  }
}

/* ── Init ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadDraft();

  // Show/hide layout based on cart
  const isEmpty = !cart.length;
  const emptyState = document.getElementById('emptyState');
  const coLayout   = document.getElementById('coLayout');
  if (emptyState) emptyState.classList.toggle('show', isEmpty);
  if (coLayout)   coLayout.style.display = isEmpty ? 'none' : '';

  renderSummary();
  renderMobileSummary();
  renderCartCount();
  syncDeliveryToggle();

  // Locker search input (debounced)
  const lockerInput = document.getElementById('f-locker-search');
  if (lockerInput) {
    lockerInput.addEventListener('input', e => {
      clearTimeout(_lockerSearchTimer);
      _lockerSearchTimer = setTimeout(() => searchLockers(e.target.value.trim()), 400);
    });
  }

  // Draft autosave on input
  document.querySelectorAll('#f-name,#f-phone,#f-email,#f-street,#f-suburb,#f-city,#f-province,#f-postal').forEach(el => {
    el.addEventListener('input', saveDraft);
  });

  // Show toast if draft was restored
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (d && (d.name || d.email)) {
      const toast = document.getElementById('coToast');
      if (toast) {
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
      }
    }
  } catch(e) {}

  // Exit-intent nudge on step 3
  document.addEventListener('mouseleave', e => {
    if (e.clientY < 10 && currentStep === 3) {
      const nudge = document.getElementById('exitNudge');
      if (nudge) nudge.classList.add('show');
    }
  });
});
