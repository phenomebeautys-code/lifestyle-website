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
    if (!d) continue;
    const dims = [Number(d.length_cm), Number(d.width_cm), Number(d.height_cm)].sort((a, b) => b - a);
    const pd = d.pack_flat
      ? { l: dims[0], w: dims[1], h: dims[2] }
      : { l: Number(d.length_cm), w: Number(d.width_cm), h: Number(d.height_cm) };
    packedItems.push({ id: item.productId, qty: item.qty, ...pd });
    totalKg += Number(d.weight_kg) * item.qty;
  }
  if (!packedItems.length) return 'XS';
  for (const box of _PUDO_BOXES_CLIENT) {
    if (totalKg > box.maxKg) continue;
    if (_fitsInBoxClient(packedItems, box)) return box.code;
  }
  return 'XL';
}

/* ── Helpers ─────────────────────────────────────────────── */
const calcSub        = () => cart.reduce((s, i) => s + i.price * i.qty, 0);
const getDeliveryFee = () => cart.length ? DELIVERY_FEES[selectedDelivery] : 0;
const calcTotal      = () => calcSub() + getDeliveryFee();

function esc(str)     { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }
function escAttr(str) { return (str || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;'); }

function showToast(msg) {
  const t = document.getElementById('coToast');
  if (!t) return;
  t.classList.add('show');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('show'), 3000);
}

/* ── Delivery method ─────────────────────────────────────── */
function selectDelivery(method) {
  selectedDelivery = method;
  document.getElementById('opt-door')?.classList.toggle('selected', method === 'door');
  document.getElementById('opt-locker')?.classList.toggle('selected', method === 'locker');
  const doorFields   = document.getElementById('door-fields');
  const lockerFields = document.getElementById('locker-fields');
  if (doorFields)   doorFields.style.display   = method === 'door'   ? '' : 'none';
  if (lockerFields) lockerFields.style.display = method === 'locker' ? '' : 'none';
  const label = document.getElementById('deliveryMethodLabel');
  if (label) label.textContent = method === 'door' ? ' \u2014 Door delivery via Pudo' : ' \u2014 Pudo locker collection';
  renderSummary(); renderMobileSummary();
}
window.selectDelivery = selectDelivery;

/* ── Locker search (GET pudo-locker-search) ──────────────── */
async function searchLockers() {
  const query     = document.getElementById('f-locker-search')?.value?.trim();
  const hasCoords = lockerSearchLat !== null && lockerSearchLng !== null;
  if (!query && !hasCoords) return;

  const btn     = document.getElementById('lockerSearchBtn');
  const results = document.getElementById('lockerResults');
  if (btn) { btn.disabled = true; btn.textContent = 'Searching...'; }
  if (results) { results.innerHTML = '<div class="locker-loading">Finding nearby lockers...</div>'; results.classList.add('show'); }

  try {
    const boxSize = await estimateBoxSize();
    let apiUrl;
    if (hasCoords) {
      apiUrl = `${SUPABASE_URL}/functions/v1/pudo-locker-search?lat=${lockerSearchLat}&lng=${lockerSearchLng}&box_size=${boxSize}`;
    } else {
      apiUrl = `${SUPABASE_URL}/functions/v1/pudo-locker-search?q=${encodeURIComponent(query)}&box_size=${boxSize}`;
    }
    const res  = await fetch(apiUrl, {
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}` }
    });
    const data    = await res.json();
    const lockers = data.results || [];
    const sizeFilterActive = data.size_filter_applied === true;
    const sizeUnknown      = data.api_has_compartment_data === false;

    let noticeHtml = '';
    if (sizeFilterActive) {
      noticeHtml = `<div class="locker-size-notice locker-size-notice--filtered">&#10003; Showing lockers with a <strong>${boxSize}</strong> compartment available for your order.</div>`;
    } else {
      noticeHtml = `<div class="locker-size-notice locker-size-notice--unknown">&#8505; Compartment availability can&#8217;t be verified in advance. Your estimated box size is <strong>${boxSize}</strong>. Pudo will confirm at time of collection.</div>`;
    }

    if (data.error && !lockers.length) {
      results.innerHTML = noticeHtml + `<div class="locker-empty">${esc(data.error)}</div>`;
    } else if (!lockers.length) {
      results.innerHTML = noticeHtml + '<div class="locker-empty">No lockers found near that area. Try a nearby suburb.</div>';
    } else {
      const warnHtml = sizeUnknown ? `<div class="locker-item-size-warn">&#9888; Compartment size unverified</div>` : '';
      results.innerHTML = noticeHtml + lockers.map(l => `
        <div class="locker-item" onclick="selectLocker('${escAttr(l.id)}','${escAttr(l.name)}','${escAttr(l.address)}','${boxSize}',${sizeUnknown})" id="locker-row-${escAttr(l.id)}">
          <div>
            <div class="locker-item-name">${esc(l.name)}</div>
            <div class="locker-item-addr">${esc(l.address)}</div>
            ${l.distance_km != null ? `<div class="locker-item-dist">${l.distance_km} km away</div>` : ''}
            ${warnHtml}
          </div>
          <button class="locker-item-select" onclick="event.stopPropagation();selectLocker('${escAttr(l.id)}','${escAttr(l.name)}','${escAttr(l.address)}','${boxSize}',${sizeUnknown})">Select</button>
        </div>`).join('');
    }
  } catch(e) {
    if (results) results.innerHTML = '<div class="locker-empty">Could not load lockers. Please try again.</div>';
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Search'; }
}
window.searchLockers = searchLockers;

/* ── Select locker ───────────────────────────────────────── */
function selectLocker(id, name, address, boxSize, sizeUnknown) {
  selectedLocker = { id, name, address, boxSize, sizeUnknown };
  const results = document.getElementById('lockerResults');
  if (results) results.classList.remove('show');
  const nameEl = document.getElementById('lockerSelectedName');
  const addrEl = document.getElementById('lockerSelectedAddr');
  if (nameEl) nameEl.textContent = name;
  if (addrEl) addrEl.textContent = address;
  const sizeNoteEl = document.getElementById('lockerSelectedSizeNote');
  if (sizeNoteEl) {
    if (sizeUnknown) {
      sizeNoteEl.className = 'locker-size-note locker-size-note--unknown';
      sizeNoteEl.innerHTML = `&#9888; Compartment size for a <strong>${boxSize || 'XS'}</strong> box could not be verified. Pudo will confirm at collection.`;
      sizeNoteEl.style.display = '';
    } else if (boxSize) {
      sizeNoteEl.className = 'locker-size-note locker-size-note--confirmed';
      sizeNoteEl.innerHTML = `&#10003; This locker has a <strong>${boxSize}</strong> compartment confirmed for your order.`;
      sizeNoteEl.style.display = '';
    } else {
      sizeNoteEl.style.display = 'none';
    }
  }
  const display = document.getElementById('lockerSelectedDisplay');
  if (display) display.classList.add('show');
  const errEl = document.getElementById('err-locker');
  if (errEl) errEl.classList.remove('show');
  const searchInput = document.getElementById('f-locker-search');
  if (searchInput) searchInput.value = '';
  const hint = document.getElementById('lockerPlacesHint');
  if (hint) hint.style.display = 'none';
  lockerSearchLat = null;
  lockerSearchLng = null;
  saveDraft();
}
window.selectLocker = selectLocker;

function clearLockerSelection() {
  selectedLocker = null;
  const display = document.getElementById('lockerSelectedDisplay');
  if (display) display.classList.remove('show');
  const searchInput = document.getElementById('f-locker-search');
  if (searchInput) searchInput.focus();
}
window.clearLockerSelection = clearLockerSelection;

/* ── Google Places — callback name matches secure loader ─── */
window.initPlaces = function() {
  if (!window.google) return;

  // Street address autocomplete
  const streetInput = document.getElementById('f-street');
  if (streetInput) {
    const acStreet = new google.maps.places.Autocomplete(streetInput, {
      componentRestrictions: { country: 'za' },
      fields: ['address_components'],
      types: ['address']
    });
    streetInput.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
    acStreet.addListener('place_changed', function() {
      const place = acStreet.getPlace();
      const comps = place.address_components || [];
      function get(type, short) {
        const c = comps.find(c => c.types.includes(type));
        return c ? (short ? c.short_name : c.long_name) : '';
      }
      streetInput.value = [get('street_number'), get('route')].filter(Boolean).join(' ');
      const suburbEl = document.getElementById('f-suburb');
      const cityEl   = document.getElementById('f-city');
      const postalEl = document.getElementById('f-postal');
      const provEl   = document.getElementById('f-province');
      if (suburbEl) suburbEl.value = get('sublocality_level_1') || get('sublocality') || get('neighborhood') || get('locality');
      if (cityEl)   cityEl.value   = get('locality') || get('administrative_area_level_2');
      if (postalEl) postalEl.value = get('postal_code', true);
      if (provEl) {
        const province = get('administrative_area_level_1');
        const opt = [...provEl.options].find(o => o.value.toLowerCase() === province.toLowerCase() || province.toLowerCase().includes(o.value.toLowerCase()));
        if (opt) provEl.value = opt.value;
      }
      const hint = document.getElementById('placesHint');
      if (hint) hint.style.display = 'none';
      saveDraft();
      ['f-street','f-suburb','f-city','f-postal'].forEach(id => document.getElementById(id)?.classList.remove('error'));
      ['err-street','err-suburb','err-city','err-postal'].forEach(id => document.getElementById(id)?.classList.remove('show'));
    });
  }

  // Locker search geocode autocomplete
  const lockerInput = document.getElementById('f-locker-search');
  if (lockerInput) {
    const acLocker = new google.maps.places.Autocomplete(lockerInput, {
      componentRestrictions: { country: 'za' },
      fields: ['geometry', 'formatted_address'],
      types: ['geocode']
    });
    lockerInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); searchLockers(); } });
    acLocker.addListener('place_changed', function() {
      const place = acLocker.getPlace();
      if (place.geometry && place.geometry.location) {
        lockerSearchLat = place.geometry.location.lat();
        lockerSearchLng = place.geometry.location.lng();
        const hint = document.getElementById('lockerPlacesHint');
        if (hint) hint.style.display = 'flex';
        searchLockers();
      }
    });
  }
};

/* ── Delivery date estimator ─────────────────────────────── */
const SA_HOLIDAYS = new Set([
  '2025-01-01','2025-03-21','2025-04-18','2025-04-19','2025-04-21',
  '2025-04-27','2025-05-01','2025-06-16','2025-08-09','2025-09-24',
  '2025-12-16','2025-12-25','2025-12-26',
  '2026-01-01','2026-03-21','2026-04-03','2026-04-06','2026-04-07',
  '2026-04-27','2026-05-01','2026-06-16','2026-08-10','2026-09-24',
  '2026-12-16','2026-12-25','2026-12-26'
]);
function isBusinessDay(d) {
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  return !SA_HOLIDAYS.has(d.toISOString().slice(0,10));
}
function addBusinessDays(start, n) {
  const d = new Date(start); let added = 0;
  while (added < n) { d.setDate(d.getDate()+1); if (isBusinessDay(d)) added++; }
  return d;
}
function fmtDate(d) { return d.toLocaleDateString('en-ZA',{weekday:'short',day:'numeric',month:'short'}); }
function getDeliveryWindow() {
  const now = new Date();
  const hourSAST = now.getUTCHours() + 2;
  const base = (hourSAST >= 14 && isBusinessDay(now)) ? addBusinessDays(now,1) : (isBusinessDay(now) ? now : addBusinessDays(now,1));
  const days = selectedDelivery === 'locker' ? [1,3] : [2,4];
  return `${fmtDate(addBusinessDays(base,days[0]))} - ${fmtDate(addBusinessDays(base,days[1]))}`;
}
function renderDeliveryDate() {
  const range = getDeliveryWindow();
  ['deliveryDateText2','rv-delivery-date','summaryDeliveryDate','mobileDeliveryDate'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.textContent = (id === 'deliveryDateText2') ? `Est. delivery: ${range}` : range;
  });
}

/* ── Draft save / restore ────────────────────────────────── */
const DRAFT_FIELDS = ['f-name','f-email','f-phone','f-street','f-suburb','f-city','f-postal','f-province','f-notes','f-gift-message'];
function saveDraft() {
  const d = {};
  DRAFT_FIELDS.forEach(id => { const el = document.getElementById(id); if (el) d[id] = el.value; });
  const giftCb = document.getElementById('f-is-gift');
  if (giftCb) d['f-is-gift-checked'] = giftCb.checked;
  d['delivery_method'] = selectedDelivery;
  if (selectedLocker) d['selected_locker'] = JSON.stringify(selectedLocker);
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch(e) {}
}
function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY); if (!raw) return false;
    const d = JSON.parse(raw); let found = false;
    DRAFT_FIELDS.forEach(id => { if (d[id] !== undefined && d[id] !== '') { const el = document.getElementById(id); if (el) { el.value = d[id]; found = true; } } });
    if (d['f-is-gift-checked']) {
      const cb = document.getElementById('f-is-gift');
      if (cb) {
        cb.checked = true;
        document.getElementById('giftReveal')?.classList.add('open');
        document.getElementById('giftToggleRow')?.classList.add('active');
      }
    }
    if (d['delivery_method']) selectDelivery(d['delivery_method']);
    if (d['selected_locker']) {
      try { const l = JSON.parse(d['selected_locker']); selectLocker(l.id, l.name, l.address, l.boxSize, l.sizeUnknown); } catch(e) {}
    }
    return found;
  } catch(e) { return false; }
}
function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch(e) {} }
function attachDraftListeners() {
  DRAFT_FIELDS.forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.addEventListener((el.tagName === 'SELECT' ? 'change' : 'input'), saveDraft);
  });
  const giftCb = document.getElementById('f-is-gift');
  if (giftCb) giftCb.addEventListener('change', saveDraft);
}
function showRestoredToast() {
  const t = document.getElementById('coToast');
  if (!t) return;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

/* ── Delivery price labels ───────────────────────────────── */
function updateDeliveryPriceLabels() {
  const doorEl   = document.getElementById('door-price-display');
  const lockerEl = document.getElementById('locker-price-display');
  if (doorEl)   doorEl.textContent   = `R${DELIVERY_FEES.door}`;
  if (lockerEl) lockerEl.textContent = `R${DELIVERY_FEES.locker}`;
}

/* ── Summary renderers ───────────────────────────────────── */
const PRODUCT_IMGS = {
  'smooth-ritual':     'https://iili.io/B6e8cSR.png',
  'smooth-veil':       'https://iili.io/B6e8acv.jpg',
  'smooth-ritual-kit': 'https://iili.io/B6e8acv.jpg',
  'wax-melting-pot':   'https://iili.io/B6e8YKJ.jpg',
  'professional-wax':  'https://iili.io/B6e8YKJ.jpg',
};

function renderSummary() {
  const itemsEl  = document.getElementById('summaryItems');
  const totalsEl = document.getElementById('summaryTotals');
  if (!itemsEl) return;
  itemsEl.innerHTML = cart.map(item => {
    const img = PRODUCT_IMGS[item.productId] || '';
    return `<div class="co-item"><div class="co-item-img">${img ? `<img src="${img}" alt="${item.name}" loading="lazy" />` : ''}<span class="co-item-qty-badge">${item.qty}</span></div><div class="co-item-info"><div class="co-item-name">${item.name}</div><div class="co-item-var">${item.variant || ''}</div></div><div class="co-item-price">R${item.price * item.qty}</div></div>`;
  }).join('');
  if (totalsEl) totalsEl.innerHTML = `
    <div class="co-total-row"><span>Subtotal</span><span>R${calcSub()}</span></div>
    <div class="co-total-row"><span>Delivery (${selectedDelivery === 'locker' ? 'Pudo Locker' : 'Door'})</span><span>R${getDeliveryFee()}</span></div>
    <div class="co-total-row delivery-date"><span>&#128666; Est. delivery</span><span id="summaryDeliveryDate">-</span></div>
    <div class="co-divider" style="margin:6px 0"></div>
    <div class="co-total-row grand"><span>Total</span><span>R${calcTotal()}</span></div>`;
  renderDeliveryDate();
}

function renderMobileSummary() {
  const totalEl  = document.getElementById('msTotalDisplay');
  const itemsEl  = document.getElementById('mobileItems');
  const totalsEl = document.getElementById('mobileTotals');
  if (totalEl) totalEl.textContent = `R${calcTotal()}`;
  if (itemsEl) itemsEl.innerHTML = cart.map(item => {
    const img = PRODUCT_IMGS[item.productId] || '';
    return `<div class="co-item"><div class="co-item-img">${img ? `<img src="${img}" alt="${item.name}" loading="lazy" />` : ''}<span class="co-item-qty-badge">${item.qty}</span></div><div class="co-item-info"><div class="co-item-name">${item.name}</div><div class="co-item-var">${item.variant || ''}</div></div><div class="co-item-price">R${item.price * item.qty}</div></div>`;
  }).join('');
  if (totalsEl) totalsEl.innerHTML = `
    <div class="co-total-row"><span>Subtotal</span><span>R${calcSub()}</span></div>
    <div class="co-total-row"><span>Delivery (${selectedDelivery === 'locker' ? 'Pudo Locker' : 'Door'})</span><span>R${getDeliveryFee()}</span></div>
    <div class="co-total-row delivery-date"><span>&#128666; Est. delivery</span><span id="mobileDeliveryDate">-</span></div>
    <div class="co-divider" style="margin:6px 0"></div>
    <div class="co-total-row grand"><span>Total</span><span>R${calcTotal()}</span></div>`;
  renderDeliveryDate();
}

function toggleMobileSummary() {
  const body    = document.getElementById('mobileSummaryBody');
  const chevron = document.getElementById('msChevron');
  if (!body || !chevron) return;
  chevron.style.transform = body.classList.toggle('open') ? 'rotate(180deg)' : '';
}
window.toggleMobileSummary = toggleMobileSummary;

/* ── Step navigation ─────────────────────────────────────── */
function goStep(n) {
  if (n > currentStep) {
    if (currentStep === 1 && !validateStep1()) return;
    if (currentStep === 2 && !validateStep2()) return;
  }
  document.getElementById(`panel-${currentStep}`)?.classList.remove('active');
  document.getElementById(`panel-${n}`)?.classList.add('active');
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById(`breadcrumb-${i}`);
    if (!el) continue;
    el.classList.remove('active','done');
    if (i < n) el.classList.add('done');
    if (i === n) el.classList.add('active');
  }
  currentStep = n;
  if (n >= 2) populateDoneContact();
  if (n >= 3) { populateDoneDelivery(); populateReview(); renderDeliveryDate(); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.goStep = goStep;

/* ── Validation ──────────────────────────────────────────── */
function setFieldError(id, errId, show) {
  document.getElementById(id)?.classList.toggle('error', show);
  document.getElementById(errId)?.classList.toggle('show', show);
}
function validateStep1() {
  const name  = document.getElementById('f-name')?.value?.trim()  || '';
  const email = document.getElementById('f-email')?.value?.trim() || '';
  const phone = document.getElementById('f-phone')?.value?.trim() || '';
  setFieldError('f-name','err-name', name.length < 2);
  setFieldError('f-email','err-email', !/^[^@]+@[^@]+\.[^@]+$/.test(email));
  setFieldError('f-phone','err-phone', phone.length < 7);
  return name.length >= 2 && /^[^@]+@[^@]+\.[^@]+$/.test(email) && phone.length >= 7;
}
function validateStep2() {
  if (selectedDelivery === 'locker') {
    const ok = !!selectedLocker;
    document.getElementById('err-locker')?.classList.toggle('show', !ok);
    return ok;
  }
  const s = document.getElementById('f-street')?.value?.trim() || '';
  const u = document.getElementById('f-suburb')?.value?.trim() || '';
  const c = document.getElementById('f-city')?.value?.trim()   || '';
  const p = document.getElementById('f-postal')?.value?.trim() || '';
  setFieldError('f-street','err-street', s.length < 3);
  setFieldError('f-suburb','err-suburb', u.length < 2);
  setFieldError('f-city','err-city',     c.length < 2);
  setFieldError('f-postal','err-postal', p.length < 4);
  return s.length >= 3 && u.length >= 2 && c.length >= 2 && p.length >= 4;
}

/* ── Done-card populators ────────────────────────────────── */
function populateDoneContact() {
  const val = `${document.getElementById('f-name')?.value?.trim() || ''} \u00b7 ${document.getElementById('f-email')?.value?.trim() || ''}`;
  ['done-contact-val','done-contact-val-2'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = val; });
}
function populateDoneDelivery() {
  let val;
  if (selectedDelivery === 'locker' && selectedLocker) {
    val = `Pudo Locker: ${selectedLocker.name} \u2014 ${selectedLocker.address}`;
  } else {
    const s = document.getElementById('f-street')?.value?.trim() || '';
    const u = document.getElementById('f-suburb')?.value?.trim() || '';
    const c = document.getElementById('f-city')?.value?.trim()   || '';
    const p = document.getElementById('f-postal')?.value?.trim() || '';
    val = `${s}, ${u}, ${c}, ${p}`;
  }
  const el = document.getElementById('done-delivery-val');
  if (el) el.textContent = val;
}

/* ── Gift toggle ─────────────────────────────────────────── */
function toggleGift() {
  const cb     = document.getElementById('f-is-gift');
  const reveal = document.getElementById('giftReveal');
  const row    = document.getElementById('giftToggleRow');
  if (!cb || !reveal || !row) return;
  if (event && event.currentTarget === row) cb.checked = !cb.checked;
  reveal.classList.toggle('open', cb.checked);
  row.classList.toggle('active', cb.checked);
  if (cb.checked) setTimeout(() => document.getElementById('f-gift-message')?.focus(), 340);
}
window.toggleGift = toggleGift;

/* ── Review panel ────────────────────────────────────────── */
function populateReview() {
  const reviewItems = document.getElementById('reviewItems');
  if (reviewItems) {
    reviewItems.innerHTML = cart.map(item => `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--glass-border);gap:12px">
        <div>
          <div style="font-weight:600;color:var(--accent-strong)">${item.name} <span style="font-weight:400;color:var(--text-muted)">x${item.qty}</span></div>
          <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px">${item.variant || ''}</div>
        </div>
        <div style="font-weight:700;color:var(--accent);white-space:nowrap">R${item.price * item.qty}</div>
      </div>`).join('');
  }
  const deliveryLabel = selectedDelivery === 'locker' ? 'Pudo Locker Collection' : 'Door Delivery (incl. fuel surcharge)';
  const rvDlLabel = document.getElementById('rv-delivery-label');
  if (rvDlLabel) rvDlLabel.textContent = deliveryLabel;
  const rvSub  = document.getElementById('rv-subtotal'); if (rvSub)  rvSub.textContent  = `R${calcSub()}`;
  const rvDel  = document.getElementById('rv-delivery'); if (rvDel)  rvDel.textContent  = `R${getDeliveryFee()}`;
  const rvTot  = document.getElementById('rv-total');    if (rvTot)  rvTot.textContent   = `R${calcTotal()}`;
  const payBtn = document.getElementById('payBtnTotal'); if (payBtn) payBtn.textContent  = calcTotal();
  const isGift    = document.getElementById('f-is-gift')?.checked;
  const giftMsg   = document.getElementById('f-gift-message')?.value?.trim();
  const giftBlock = document.getElementById('giftReviewBlock');
  const giftBody  = document.getElementById('giftReviewBody');
  if (giftBlock) giftBlock.style.display = isGift ? '' : 'none';
  if (isGift && giftBody) giftBody.textContent = giftMsg || '(No message added)';
}

/* ── Exit-intent nudge ───────────────────────────────────── */
let nudgeFired = false, nudgeDismissed = false;
function initExitIntent() {
  document.documentElement.addEventListener('mouseleave', function(e) {
    if (e.clientY > 10 || currentStep !== 3 || nudgeFired || nudgeDismissed) return;
    nudgeFired = true;
    const nudge = document.getElementById('exitNudge');
    if (nudge) { nudge.classList.add('show'); nudge.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  });
}
function dismissNudge() {
  nudgeDismissed = true;
  const nudge = document.getElementById('exitNudge');
  if (!nudge) return;
  nudge.style.transition = 'opacity 0.25s ease';
  nudge.style.opacity = '0';
  setTimeout(() => nudge.classList.remove('show'), 260);
}
window.dismissNudge = dismissNudge;

/* ── Payment handler ─────────────────────────────────────── */
async function handlePay() {
  const btn = document.getElementById('payBtn');
  const loadingEl = document.getElementById('coLoading');
  const loadingMsg = document.getElementById('loadingMsg');
  if (btn) btn.disabled = true;
  if (loadingEl) loadingEl.classList.add('show');

  const name    = document.getElementById('f-name')?.value?.trim()          || '';
  const email   = document.getElementById('f-email')?.value?.trim()         || '';
  const phone   = document.getElementById('f-phone')?.value?.trim()         || '';
  const notes   = document.getElementById('f-notes')?.value?.trim()         || '';
  const isGift  = document.getElementById('f-is-gift')?.checked             || false;
  const giftMsg = document.getElementById('f-gift-message')?.value?.trim()  || '';

  let deliveryAddress, deliveryMeta;
  if (selectedDelivery === 'locker' && selectedLocker) {
    deliveryAddress = `Pudo Locker: ${selectedLocker.name}, ${selectedLocker.address}`;
    deliveryMeta    = { type: 'locker', locker_id: selectedLocker.id, locker_name: selectedLocker.name, locker_address: selectedLocker.address };
  } else {
    const street   = document.getElementById('f-street')?.value?.trim()   || '';
    const suburb   = document.getElementById('f-suburb')?.value?.trim()   || '';
    const city     = document.getElementById('f-city')?.value?.trim()     || '';
    const postal   = document.getElementById('f-postal')?.value?.trim()   || '';
    const province = document.getElementById('f-province')?.value         || '';
    deliveryAddress = `${street}, ${suburb}, ${city}, ${postal}, ${province}`;
    deliveryMeta    = { type: 'door', street, suburb, city, postal, province };
  }

  try {
    if (loadingMsg) loadingMsg.textContent = 'Saving your order...';
    const orderRes = await fetch(`${SUPABASE_URL}/rest/v1/shop_orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        customer_name:    name,
        customer_email:   email,
        customer_phone:   phone,
        delivery_address: deliveryAddress,
        delivery_method:  selectedDelivery,
        delivery_meta:    deliveryMeta,
        items:            cart,
        subtotal:         calcSub(),
        delivery_fee:     getDeliveryFee(),
        total_amount:     calcTotal(),
        notes:            notes || null,
        is_gift:          isGift,
        gift_message:     isGift && giftMsg ? giftMsg : null
      })
    });
    if (!orderRes.ok) throw new Error('Failed to save order. Please try again.');
    const [order] = await orderRes.json();
    if (loadingMsg) loadingMsg.textContent = 'Redirecting to payment...';
    const checkoutRes = await fetch(`${SUPABASE_URL}/functions/v1/yoco-shop-checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`
      },
      body: JSON.stringify({
        order_id:    order.id,
        success_url: `${ORIGIN}/shop-success.html?payment=success&order_id=${order.id}&name=${encodeURIComponent(name)}&ct=${order.customer_token}`,
        cancel_url:  `${ORIGIN}/checkout.html?payment=cancelled&order_id=${order.id}`
      })
    });
    if (!checkoutRes.ok) throw new Error('Failed to create payment session. Please try again.');
    const cd = await checkoutRes.json();
    const redirect = cd.redirectUrl || cd.url;
    if (!redirect) throw new Error('No payment URL returned. Please try again.');
    cart = []; try { localStorage.setItem('phenome_cart', '[]'); } catch(e) {}
    clearDraft();
    window.location.href = redirect;
  } catch(err) {
    if (loadingEl) loadingEl.classList.remove('show');
    if (btn) btn.disabled = false;
    const alertEl = document.getElementById('alert-3');
    if (alertEl) { alertEl.textContent = err.message; alertEl.classList.add('show'); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
window.handlePay = handlePay;

/* ── Handle payment return (cancelled) ──────────────────── */
(function checkReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('payment') === 'cancelled') {
    window.history.replaceState({}, '', 'checkout.html');
    setTimeout(() => {
      const el = document.getElementById('alert-3');
      if (el) {
        el.style.background  = 'rgba(251,191,36,0.08)';
        el.style.borderColor = 'rgba(251,191,36,0.28)';
        el.style.color       = '#fbbf24';
        el.textContent = 'Payment was cancelled \u2014 no charge was made. Review your order and try again.';
        el.classList.add('show');
      }
    }, 300);
  }
})();

/* ── Init ────────────────────────────────────────────────── */
(function init() {
  updateDeliveryPriceLabels();
  if (!cart.length) {
    const content = document.getElementById('checkoutContent');
    const empty   = document.getElementById('emptyState');
    const summary = document.querySelector('#coLayout .co-summary-col');
    const mobile  = document.getElementById('mobileSummary');
    if (content) content.style.display = 'none';
    if (empty)   empty.style.display   = 'flex';
    if (summary) summary.style.display = 'none';
    if (mobile)  mobile.style.display  = 'none';
    return;
  }
  renderSummary();
  renderMobileSummary();
  renderDeliveryDate();
  attachDraftListeners();
  if (loadDraft()) setTimeout(showRestoredToast, 400);
  initExitIntent();

  // Attach locker search input listeners
  const lockerInput = document.getElementById('f-locker-search');
  if (lockerInput) {
    lockerInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); searchLockers(); } });
    lockerInput.addEventListener('input', () => {
      lockerSearchLat = null; lockerSearchLng = null;
      const hint = document.getElementById('lockerPlacesHint');
      if (hint) hint.style.display = 'none';
    });
  }

  // Load Google Places securely
  (async function loadPlaces() {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/get-places-key`,
        { headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}` } }
      );
      const { key } = await res.json();
      if (!key) return;
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&callback=initPlaces&loading=async`;
      s.async = true; s.defer = true;
      document.head.appendChild(s);
    } catch(e) {
      console.warn('Places autocomplete unavailable:', e);
    }
  })();
})();
