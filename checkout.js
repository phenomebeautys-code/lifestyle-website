/* ============================================================
   PhenomeBeauty — checkout.js
   Reads cart from localStorage (key: phenome_cart),
   drives the 3-step checkout UI, and submits to Yoco via
   the existing Supabase Edge Function.
   ============================================================ */

'use strict';

/* ── Cart state ─────────────────────────────────────────── */
let cart = [];
try { cart = JSON.parse(localStorage.getItem('phenome_cart') || '[]'); } catch (_) { cart = []; }

/* ── Delivery cost ──────────────────────────────────────── */
let deliveryMethod = 'door';
const DELIVERY_COST = { door: 99, locker: 59 };

/* ── Pudo / box-size state ──────────────────────────────── */
let pudoBoxSize  = null;   // fetched from Supabase
let selectedLocker = null; // { id, name, address, compartments }

/* ── Supabase config ────────────────────────────────────── */
const SUPA_URL = 'https://papdxjcfimeyjgzmatpl.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcGR4amNmaW1leWpnem1hdHBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDcwNDE1MDgsImV4cCI6MjA2MjYxNzUwOH0.bz3URnq8IovRcQ-578nt3f_RiZMh7pa7Ncc0mh9XPTE';

/* ── Helpers ─────────────────────────────────────────────── */
function fmt(n) { return 'R' + Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 0 }); }

function calcSubtotal() { return cart.reduce((s, i) => s + i.price * i.qty, 0); }
function calcDelivery()  { return DELIVERY_COST[deliveryMethod] || 99; }
function calcTotal()     { return calcSubtotal() + calcDelivery(); }

function showToast(msg, dur) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('show'), dur || 3000);
}

/* ── Render sidebar ─────────────────────────────────────── */
function renderSidebar() {
  const itemsEl     = document.getElementById('sidebarItems');
  const countEl     = document.getElementById('itemCountLabel');
  const subtotalEl  = document.getElementById('sidebarSubtotal');
  const deliveryEl  = document.getElementById('sidebarDelivery');
  const totalEl     = document.getElementById('sidebarTotal');
  const mobileCount = document.getElementById('mobileSummaryCount');
  const mobileTotal = document.getElementById('mobileSummaryTotal');

  if (!itemsEl) return;

  const totalQty = cart.reduce((s, i) => s + i.qty, 0);
  if (countEl) countEl.textContent = totalQty + ' item' + (totalQty !== 1 ? 's' : '') + ' in your cart';
  if (mobileCount) mobileCount.textContent = totalQty + ' item' + (totalQty !== 1 ? 's' : '');

  if (cart.length === 0) {
    itemsEl.innerHTML = '<p style="color:var(--text-muted);font-size:.88rem;padding:8px 0;">No items yet.</p>';
  } else {
    itemsEl.innerHTML = cart.map(item => {
      const thumb = item.imageUrl
        ? `<img src="${item.imageUrl}" alt="${item.name}" width="60" height="60" loading="lazy" />`
        : `<div style="width:60px;height:60px;border-radius:10px;background:rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;font-size:1.4rem;">🛍️</div>`;
      const meta = [item.variant, item.size].filter(Boolean).join(' · ');
      return `<div class="cart-item">
        ${thumb}
        <div>
          <h4>${item.name}</h4>
          ${meta ? `<div class="cart-meta">${meta}</div>` : ''}
          <div class="cart-meta">Qty: ${item.qty}</div>
        </div>
        <div class="cart-price">${fmt(item.price * item.qty)}</div>
      </div>`;
    }).join('');
  }

  const sub = calcSubtotal();
  const del = calcDelivery();
  const tot = sub + del;
  if (subtotalEl) subtotalEl.textContent = fmt(sub);
  if (deliveryEl) deliveryEl.textContent = del > 0 ? fmt(del) : 'TBC';
  if (totalEl)    totalEl.textContent    = fmt(tot);
  if (mobileTotal) mobileTotal.textContent = fmt(tot);
}

/* ── Empty-state guard ──────────────────────────────────── */
function initCheckout() {
  const emptyState     = document.getElementById('emptyState');
  const checkoutLayout = document.getElementById('checkoutLayout');
  const mobileSummary  = document.getElementById('mobileSummaryBar');

  if (cart.length === 0) {
    if (emptyState)     emptyState.classList.add('show');
    if (checkoutLayout) checkoutLayout.style.display = 'none';
    if (mobileSummary)  mobileSummary.style.display  = 'none';
    return;
  }

  if (emptyState)     emptyState.classList.remove('show');
  if (checkoutLayout) checkoutLayout.style.display = '';
  renderSidebar();
  renderSteps();
  setActiveStep(1);
  fetchBoxSize();
}

/* ── Steps bar ──────────────────────────────────────────── */
const STEPS = [
  { num: 1, label: 'Contact' },
  { num: 2, label: 'Delivery' },
  { num: 3, label: 'Review & Pay' },
];

let currentStep = 1;

function renderSteps() {
  const bar = document.getElementById('stepsBar');
  if (!bar) return;
  bar.innerHTML = STEPS.map((s, idx) => {
    const cls = currentStep === s.num ? 'active' : currentStep > s.num ? 'done' : '';
    const arrow = idx < STEPS.length - 1 ? '<span class="step-arrow">›</span>' : '';
    return `<div class="step-pill ${cls}"><span class="step-num">${currentStep > s.num ? '✓' : s.num}</span>${s.label}</div>${arrow}`;
  }).join('');
}

function setActiveStep(n) {
  currentStep = n;
  renderSteps();
  document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
  const target = document.getElementById('step' + n);
  if (target) target.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── Expose goStep globally ─────────────────────────────── */
window.goStep = function(n) {
  if (n === 2 && !validateStep1()) return;
  if (n === 3 && !validateStep2()) return;
  if (n === 3) buildReview();
  setActiveStep(n);
};

/* ── Delivery method toggle ─────────────────────────────── */
window.selectDelivery = function(method) {
  deliveryMethod = method;
  document.getElementById('delivery-door')?.classList.toggle('selected', method === 'door');
  document.getElementById('delivery-locker')?.classList.toggle('selected', method === 'locker');
  document.getElementById('door-fields').style.display   = method === 'door'   ? '' : 'none';
  document.getElementById('locker-fields').style.display = method === 'locker' ? '' : 'none';

  const metaTitle = document.getElementById('deliveryMetaTitle');
  const metaText  = document.getElementById('deliveryMetaText');
  if (metaTitle) metaTitle.textContent = method === 'door' ? 'Door delivery selected' : 'Pudo locker selected';
  if (metaText)  metaText.textContent  = method === 'door'
    ? 'Enter your address and we\'ll estimate a delivery window based on business days.'
    : 'Search for a nearby locker and select the one most convenient for you.';

  renderSidebar();
};

/* ── Special instructions toggle ───────────────────────── */
window.toggleSpecial = function() {
  const btn  = document.getElementById('specialToggle');
  const wrap = document.getElementById('specialFieldWrap');
  if (!btn || !wrap) return;
  const on = btn.classList.toggle('on');
  wrap.style.display = on ? '' : 'none';
};

/* ── Google Places autocomplete ─────────────────────────── */
window.initAutocomplete = function() {
  const input = document.getElementById('f-street');
  if (!input || !window.google) return;

  const ac = new google.maps.places.Autocomplete(input, {
    componentRestrictions: { country: 'za' },
    fields: ['address_components', 'formatted_address', 'geometry'],
    types: ['address'],
  });

  ac.addListener('place_changed', () => {
    const place = ac.getPlace();
    if (!place.address_components) return;

    let street = '', suburb = '', city = '', postal = '', province = '';
    const comps = place.address_components;

    // street number + route
    const num   = comps.find(c => c.types.includes('street_number'))?.long_name  || '';
    const route = comps.find(c => c.types.includes('route'))?.long_name           || '';
    street = [num, route].filter(Boolean).join(' ');

    suburb   = comps.find(c => c.types.includes('sublocality_level_1') || c.types.includes('sublocality'))?.long_name
             || comps.find(c => c.types.includes('neighborhood'))?.long_name || '';
    city     = comps.find(c => c.types.includes('locality'))?.long_name || '';
    postal   = comps.find(c => c.types.includes('postal_code'))?.long_name || '';
    province = comps.find(c => c.types.includes('administrative_area_level_1'))?.long_name || '';

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    set('f-street', street || place.formatted_address);
    set('f-suburb', suburb);
    set('f-city',   city);
    set('f-postal', postal);
    set('f-province', province);
  });
};

/* ── Fetch required box size from Supabase ──────────────── */
async function fetchBoxSize() {
  try {
    const keys = cart.map(i => i.key || i.productId).filter(Boolean);
    if (!keys.length) { pudoBoxSize = 'medium'; return; }

    const q = keys.map(k => `key=eq.${k}`).join(',');
    const url = `${SUPA_URL}/rest/v1/products?or=(${encodeURIComponent(q)})&select=key,pudo_box_size`;
    const res = await fetch(url, {
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': 'Bearer ' + SUPA_KEY,
        'Accept': 'application/json',
      }
    });

    if (!res.ok) throw new Error('Supabase ' + res.status);
    const rows = await res.json();

    const sizeOrder = ['xsmall','small','medium','large','xlarge'];
    let maxIdx = 0;
    rows.forEach(r => {
      const idx = sizeOrder.indexOf((r.pudo_box_size || 'medium').toLowerCase());
      if (idx > maxIdx) maxIdx = idx;
    });
    pudoBoxSize = sizeOrder[maxIdx] || 'medium';
  } catch (e) {
    console.warn('fetchBoxSize failed:', e);
    pudoBoxSize = 'medium';
  }
}

/* Box size is calculated silently — never shown to the customer */
function updateSizeNotice() {}

/* ── Pudo locker search ─────────────────────────────────── */
window.searchLockers = async function() {
  const q   = document.getElementById('lockerQuery')?.value?.trim();
  const lat = document.getElementById('lockerSearchLat')?.value;
  const lng = document.getElementById('lockerSearchLng')?.value;
  const res = document.getElementById('lockerResults');

  if (!q && !lat) { showToast('Enter a suburb or landmark to search.'); return; }
  if (!res) return;

  res.innerHTML = '<div class="box-size-loading"><span class="box-size-ring"></span> Searching for lockers…</div>';

  try {
    const body = { query: q || '', boxSize: pudoBoxSize || 'medium' };
    if (lat && lng) { body.lat = parseFloat(lat); body.lng = parseFloat(lng); }

    const response = await fetch(`${SUPA_URL}/functions/v1/pudo-lockers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SUPA_KEY,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Pudo API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const lockers = data.lockers || data.results || data || [];

    if (!Array.isArray(lockers) || lockers.length === 0) {
      res.innerHTML = '<p style="color:var(--text-muted);font-size:.86rem;">No lockers found near that location. Try a different suburb or landmark.</p>';
      return;
    }

    res.innerHTML = lockers.map((locker, idx) => {
      const compartments = locker.compartments || locker.availableCompartments || [];
      const tags = compartments.map(c =>
        `<span class="locker-tag">${c.size || c.type || c}</span>`
      ).join('');
      const dist = locker.distance ? `<span class="locker-tag">${(locker.distance/1000).toFixed(1)} km</span>` : '';

      return `<div class="locker-item">
        <div class="locker-item-top">
          <div>
            <h4>${locker.name || locker.locationName || 'Locker ' + (idx + 1)}</h4>
            <p>${locker.address || locker.fullAddress || ''}</p>
          </div>
          <div class="locker-badges">${dist}${tags}</div>
        </div>
        <div class="locker-cta">
          <span style="font-size:.8rem;color:var(--text-muted);">${locker.openingHours || locker.hours || ''}</span>
          <button type="button" class="primary-btn" style="padding:9px 14px;font-size:.82rem;"
            onclick="selectLocker(${idx}, ${JSON.stringify(locker).replace(/"/g, '&quot;')})">Select</button>
        </div>
      </div>`;
    }).join('');

  } catch (err) {
    console.error('Locker search error:', err);
    res.innerHTML = `<p style="color:#ffb4b4;font-size:.86rem;">Could not load lockers: ${err.message}</p>`;
  }
};

window.selectLocker = function(idx, locker) {
  selectedLocker = locker;
  const display = document.getElementById('lockerSelectedDisplay');
  if (display) {
    const name    = locker.name || locker.locationName || 'Selected locker';
    const address = locker.address || locker.fullAddress || '';
    display.innerHTML = `<div class="locker-selected">
      <strong>✓ ${name}</strong>
      <p>${address}</p>
    </div>`;
  }
  showToast('Locker selected: ' + (locker.name || locker.locationName || 'Locker ' + (idx + 1)));
};

window.useMyLocation = function() {
  if (!navigator.geolocation) { showToast('Geolocation not supported.'); return; }
  navigator.geolocation.getCurrentPosition(
    pos => {
      document.getElementById('lockerSearchLat').value = pos.coords.latitude;
      document.getElementById('lockerSearchLng').value = pos.coords.longitude;
      window.searchLockers();
    },
    () => showToast('Could not get your location. Please enter it manually.')
  );
};

/* ── Validation helpers ─────────────────────────────────── */
function fieldErr(id, errId, show) {
  const field = document.getElementById(id);
  const err   = document.getElementById(errId);
  field?.classList.toggle('error', show);
  err?.classList.toggle('show', show);
}

function validateStep1() {
  const name  = document.getElementById('f-name')?.value?.trim();
  const phone = document.getElementById('f-phone')?.value?.trim();
  const email = document.getElementById('f-email')?.value?.trim();
  let ok = true;
  if (!name)  { fieldErr('field-name',  'err-name',  true); ok = false; } else fieldErr('field-name',  'err-name',  false);
  if (!phone) { fieldErr('field-phone', 'err-phone', true); ok = false; } else fieldErr('field-phone', 'err-phone', false);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
  if (!emailOk) { fieldErr('field-email', 'err-email', true); ok = false; } else fieldErr('field-email', 'err-email', false);
  return ok;
}

function validateStep2() {
  if (deliveryMethod === 'door') {
    const street = document.getElementById('f-street')?.value?.trim();
    const suburb = document.getElementById('f-suburb')?.value?.trim();
    const city   = document.getElementById('f-city')?.value?.trim();
    const postal = document.getElementById('f-postal')?.value?.trim();
    const prov   = document.getElementById('f-province')?.value?.trim();
    let ok = true;
    if (!street) { fieldErr('field-street',   'err-street',   true); ok = false; } else fieldErr('field-street',   'err-street',   false);
    if (!suburb) { fieldErr('field-suburb',   'err-suburb',   true); ok = false; } else fieldErr('field-suburb',   'err-suburb',   false);
    if (!city)   { fieldErr('field-city',     'err-city',     true); ok = false; } else fieldErr('field-city',     'err-city',     false);
    if (!postal) { fieldErr('field-postal',   'err-postal',   true); ok = false; } else fieldErr('field-postal',   'err-postal',   false);
    if (!prov)   { fieldErr('field-province', 'err-province', true); ok = false; } else fieldErr('field-province', 'err-province', false);
    return ok;
  }
  if (!selectedLocker) { showToast('Please select a locker before continuing.'); return false; }
  return true;
}

/* ── Build review panel ─────────────────────────────────── */
function buildReview() {
  const panel = document.getElementById('reviewPanel');
  if (!panel) return;

  const name    = document.getElementById('f-name')?.value?.trim()    || '—';
  const phone   = document.getElementById('f-phone')?.value?.trim()   || '—';
  const email   = document.getElementById('f-email')?.value?.trim()   || '—';
  const street  = document.getElementById('f-street')?.value?.trim()  || '';
  const suburb  = document.getElementById('f-suburb')?.value?.trim()  || '';
  const city    = document.getElementById('f-city')?.value?.trim()    || '';
  const postal  = document.getElementById('f-postal')?.value?.trim()  || '';
  const prov    = document.getElementById('f-province')?.value?.trim()|| '';
  const special = document.getElementById('f-special')?.value?.trim() || '';

  const addressStr = deliveryMethod === 'door'
    ? [street, suburb, city, postal, prov].filter(Boolean).join(', ')
    : selectedLocker
      ? (selectedLocker.name || selectedLocker.locationName || 'Locker') + ' — ' + (selectedLocker.address || selectedLocker.fullAddress || '')
      : 'Locker selected';

  const itemRows = cart.map(i => `
    <div class="review-line">
      <span>${i.name}${i.variant ? ' · ' + i.variant : ''}${i.size ? ' · ' + i.size : ''} × ${i.qty}</span>
      <span>${fmt(i.price * i.qty)}</span>
    </div>`).join('');

  const sub = calcSubtotal();
  const del = calcDelivery();

  panel.innerHTML = `
    <div class="review-grid">
      <div class="done-block">
        <h4>Contact</h4>
        <p>${name}</p>
        <p>${email}</p>
        <p>${phone}</p>
      </div>
      <div class="done-block">
        <h4>Delivery · ${deliveryMethod === 'door' ? 'Door' : 'Pudo locker'}</h4>
        <p>${addressStr}</p>
        ${special ? `<p style="margin-top:6px;font-style:italic;">"${special}"</p>` : ''}
      </div>
    </div>
    <div class="done-block" style="margin-top:14px;">
      <h4>Order summary</h4>
      <div class="review-lines">
        ${itemRows}
        <div class="co-divider"></div>
        <div class="review-line"><span>Subtotal</span><span>${fmt(sub)}</span></div>
        <div class="review-line"><span>Delivery (${deliveryMethod === 'door' ? 'door' : 'locker'})</span><span>${fmt(del)}</span></div>
        <div class="review-line" style="font-weight:800;color:var(--accent-strong);"><span>Total</span><span>${fmt(sub + del)}</span></div>
      </div>
    </div>`;
}

/* ── Exit-intent nudge (Step 3 only) ────────────────────── */
window.dismissExitNudge = function(resume) {
  document.getElementById('exitNudge')?.classList.remove('show');
  if (resume) setActiveStep(3);
};

document.addEventListener('visibilitychange', () => {
  if (document.hidden && currentStep === 3) {
    document.getElementById('exitNudge')?.classList.add('show');
  }
});

/* ── Submit order → Yoco ─────────────────────────────────── */
window.submitOrder = async function() {
  const btn     = document.getElementById('payBtn');
  const alert   = document.getElementById('payAlert');
  const overlay = document.getElementById('loadingOverlay');
  if (btn) btn.disabled = true;
  if (alert) alert.classList.remove('show');
  if (overlay) overlay.classList.add('show');

  const lockerAddr = selectedLocker
    ? (selectedLocker.name || selectedLocker.locationName || 'Locker') + ', ' + (selectedLocker.address || selectedLocker.fullAddress || '')
    : (document.getElementById('lockerSelectedDisplay')?.textContent?.trim() || 'Locker selected');

  const orderPayload = {
    customer: {
      name:  document.getElementById('f-name')?.value?.trim(),
      email: document.getElementById('f-email')?.value?.trim(),
      phone: document.getElementById('f-phone')?.value?.trim(),
    },
    delivery: {
      method:   deliveryMethod,
      address:  deliveryMethod === 'door' ? {
        street:   document.getElementById('f-street')?.value?.trim(),
        suburb:   document.getElementById('f-suburb')?.value?.trim(),
        city:     document.getElementById('f-city')?.value?.trim(),
        postal:   document.getElementById('f-postal')?.value?.trim(),
        province: document.getElementById('f-province')?.value?.trim(),
      } : { locker: lockerAddr },
      special: document.getElementById('f-special')?.value?.trim() || '',
      cost:    calcDelivery(),
    },
    items: cart.map(i => ({
      key:       i.key,
      productId: i.productId,
      name:      i.name,
      variant:   i.variant || '',
      size:      i.size    || '',
      price:     i.price,
      qty:       i.qty,
      imageUrl:  i.imageUrl || '',
    })),
    subtotal:     calcSubtotal(),
    deliveryCost: calcDelivery(),
    total:        calcTotal(),
    currency:     'ZAR',
  };

  try {
    const res  = await fetch(`${SUPA_URL}/functions/v1/create-payment`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(orderPayload),
    });
    const data = await res.json();
    if (data && data.redirectUrl) {
      try { localStorage.removeItem('phenome_cart'); } catch (_) {}
      window.location.href = data.redirectUrl;
    } else {
      throw new Error(data?.error || data?.message || 'Unexpected response from payment server.');
    }
  } catch (err) {
    if (overlay) overlay.classList.remove('show');
    if (btn) btn.disabled = false;
    if (alert) {
      alert.textContent = 'Payment could not be initiated: ' + err.message + '. Please try again or contact support.';
      alert.classList.add('show');
    }
  }
};

/* ── Init ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initCheckout();
});
