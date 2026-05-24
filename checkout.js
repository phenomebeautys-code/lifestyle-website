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

/* -- Box-size client estimator -------------------------------------------- */
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

/* -- Helpers --------------------------------------------------------------- */
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

/* -- Draft persistence ----------------------------------------------------- */
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

/* -- Validation ------------------------------------------------------------ */
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
  if (!name)                         { showFieldError('f-name',  'err-name',  'Full name is required'); ok = false; }
  if (!phone)                        { showFieldError('f-phone', 'err-phone', 'Phone number is required'); ok = false; }
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

/* -- Step navigation ------------------------------------------------------- */
function goToStep(n) {
  if (n === 2 && currentStep === 1) {
    if (!validateStep1()) return;
  }
  if (n === 3 && currentStep === 2) {
    if (!validateStep2()) return;
  }
  currentStep = n;
  document.querySelectorAll('.step').forEach((p, i) => {
    p.classList.toggle('active', i + 1 === n);
  });
  document.querySelectorAll('.step-pill').forEach((b, i) => {
    b.classList.toggle('active',    i + 1 === n);
    b.classList.toggle('done',      i + 1 <  n);
  });
  renderSummary();
  renderMobileSummary();
  if (n === 3) {
    _initYoco();
    _renderReviewPanel();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* -- Delivery toggle ------------------------------------------------------- */
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
  const metaTitle = document.getElementById('deliveryMetaTitle');
  const metaText  = document.getElementById('deliveryMetaText');
  if (metaTitle) metaTitle.textContent = selectedDelivery === 'locker' ? 'Pudo locker selected' : 'Door delivery selected';
  if (metaText)  metaText.textContent  = selectedDelivery === 'locker'
    ? 'Select a locker from the list below. We\u2019ll include the locker details in your order.'
    : 'Enter your address and we\u2019ll estimate a delivery window based on business days and local holidays.';
  renderDeliveryDate();
}

/* -- Locker search --------------------------------------------------------- */
let _lockerSearchTimer = null;

async function searchLockers(query) {
  if (query === undefined) {
    query = document.getElementById('f-locker-search')?.value.trim() || '';
  }
  const list = document.getElementById('lockerResults');
  if (!list) return;

  const lat = lockerSearchLat ?? window.lockerSearchLat ?? null;
  const lng = lockerSearchLng ?? window.lockerSearchLng ?? null;
  const useCoords = lat !== null && lng !== null;
  if (!useCoords && (!query || query.length < 3)) return;

  list.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:.82rem;">Searching&hellip;</div>';

  try {
    const params = new URLSearchParams({ limit: '20' });
    if (useCoords) {
      params.set('lat', lat);
      params.set('lng', lng);
    } else {
      params.set('q', query);
    }

    const resp = await fetch(
      `${SUPABASE_URL}/functions/v1/pudo-locker-search?${params}`,
      { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
    );
    const data = await resp.json();
    const lockers = Array.isArray(data) ? data : (data.lockers || []);

    if (!lockers.length) {
      list.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:.82rem;">No lockers found nearby. Try a different address.</div>';
      return;
    }

    list.innerHTML = lockers.map(l => {
      const id      = l.id || l.locker_id || '';
      const name    = l.name || l.locker_name || 'Locker';
      const address = l.address || l.locker_address || '';
      const boxSize = l.box_size || l.boxSize || '';
      const unknown = !boxSize;
      const idJ     = JSON.stringify(id);
      const nameJ   = JSON.stringify(name);
      const addrJ   = JSON.stringify(address);
      const boxJ    = JSON.stringify(boxSize);
      return `<div class="locker-item">
        <div class="locker-item-top">
          <div>
            <h4>${name}</h4>
            <p>${address}</p>
            ${boxSize ? `<div class="locker-badges"><span class="locker-tag">${boxSize} box</span></div>` : ''}
          </div>
        </div>
        <div class="locker-cta">
          <button class="mini-btn" onclick="selectLocker(${idJ},${nameJ},${addrJ},${boxJ},${unknown})">Select locker</button>
        </div>
      </div>`;
    }).join('');
  } catch(err) {
    list.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:.82rem;">Search failed. Please try again.</div>';
    console.error('Locker search error:', err);
  }
}

/* -- Select locker --------------------------------------------------------- */
function selectLocker(id, name, address, boxSize, sizeUnknown) {
  selectedLocker = { id, name, address, boxSize, sizeUnknown };

  const list = document.getElementById('lockerResults');
  if (list) list.innerHTML = '';

  const display = document.getElementById('lockerSelectedDisplay');
  const nameEl  = document.getElementById('lockerSelectedName');
  const addrEl  = document.getElementById('lockerSelectedAddr');
  if (display) display.style.display = '';
  if (nameEl)  nameEl.textContent = name;
  if (addrEl)  addrEl.textContent = address;

  const errEl = document.getElementById('err-locker');
  if (errEl) errEl.classList.remove('show');

  const notice = document.getElementById('lockerSizeNotice');
  if (notice) {
    if (boxSize && !sizeUnknown) {
      notice.style.display = '';
      notice.textContent   = `This locker accepts ${boxSize} boxes. Your order will be packed to fit.`;
    } else {
      notice.style.display = 'none';
    }
  }

  renderSummary();
  renderMobileSummary();
  saveDraft();
}

/* -- Render delivery date -------------------------------------------------- */
function renderDeliveryDate() {
  const range = getDeliveryRange();
  const el2   = document.getElementById('deliveryDateText2');
  if (el2) el2.textContent = range;
}

/* -- Render summary (desktop aside) ---------------------------------------- */
function renderSummary() {
  const rowsEl   = document.getElementById('asideSummaryRows');
  const totalsEl = document.getElementById('asideTotals');
  const countEl  = document.getElementById('asideItemCount');
  if (!rowsEl) return;

  const totalQty = cart.reduce((s, i) => s + i.qty, 0);
  if (countEl) countEl.textContent = `${totalQty} item${totalQty !== 1 ? 's' : ''}`;

  rowsEl.innerHTML = cart.map(item => {
    const imgHtml = item.image
      ? `<img src="${item.image}" alt="${item.name || 'Product'}" width="60" height="60" loading="lazy" style="width:60px;height:60px;border-radius:10px;object-fit:cover;" />`
      : `<div style="width:60px;height:60px;border-radius:10px;background:rgba(255,255,255,0.06);flex-shrink:0;"></div>`;
    return `<div class="cart-item">
      ${imgHtml}
      <div>
        <h4>${item.name || 'Product'}</h4>
        <div class="cart-meta">${item.qty > 1 ? `Qty: ${item.qty}` : ''}</div>
      </div>
      <div class="cart-price">R${(item.price * item.qty).toFixed(2)}</div>
    </div>`;
  }).join('');

  const sub      = calcSub();
  const delivery = getDeliveryFee();
  const total    = calcTotal();
  const range    = getDeliveryRange();

  if (totalsEl) totalsEl.innerHTML = `
    <div class="total-row"><span>Subtotal</span><span>R${sub.toFixed(2)}</span></div>
    <div class="total-row"><span>Delivery (${selectedDelivery === 'locker' ? 'Pudo locker' : 'Door'})</span><span>R${delivery.toFixed(2)}</span></div>
    <div class="total-row grand"><span>Total</span><span>R${total.toFixed(2)}</span></div>
    <div class="total-row" style="font-size:.78rem;color:#34d399;"><span style="color:var(--text-muted);">Est. delivery</span><span>${range}</span></div>
  `;

  _renderReviewPanel();
}

/* -- Render summary (mobile bar) ------------------------------------------- */
function renderMobileSummary() {
  const rowsEl   = document.getElementById('mobileSummaryRows');
  const totalsEl = document.getElementById('mobileTotals');
  const labelEl  = document.getElementById('mobileSummaryLabel');
  const totalEl  = document.getElementById('mobileSummaryTotal');
  if (!rowsEl) return;

  const totalQty = cart.reduce((s, i) => s + i.qty, 0);
  if (labelEl) labelEl.textContent = `${totalQty} item${totalQty !== 1 ? 's' : ''} in your order`;
  if (totalEl) totalEl.textContent = `R${calcTotal().toFixed(2)}`;

  rowsEl.innerHTML = cart.map(item => {
    const imgHtml = item.image
      ? `<img src="${item.image}" alt="${item.name || 'Product'}" width="60" height="60" loading="lazy" style="width:60px;height:60px;border-radius:10px;object-fit:cover;" />`
      : `<div style="width:60px;height:60px;border-radius:10px;background:rgba(255,255,255,0.06);flex-shrink:0;"></div>`;
    return `<div class="cart-item">
      ${imgHtml}
      <div>
        <h4>${item.name || 'Product'}</h4>
        <div class="cart-meta">${item.qty > 1 ? `Qty: ${item.qty}` : ''}</div>
      </div>
      <div class="cart-price">R${(item.price * item.qty).toFixed(2)}</div>
    </div>`;
  }).join('');

  const sub      = calcSub();
  const delivery = getDeliveryFee();
  const total    = calcTotal();

  if (totalsEl) totalsEl.innerHTML = `
    <div class="total-row"><span>Subtotal</span><span>R${sub.toFixed(2)}</span></div>
    <div class="total-row"><span>Delivery</span><span>R${delivery.toFixed(2)}</span></div>
    <div class="total-row grand"><span>Total</span><span>R${total.toFixed(2)}</span></div>
  `;
}

/* -- Toggle mobile summary ------------------------------------------------- */
function toggleMobileSummary() {
  const body    = document.getElementById('mobileSummaryBody');
  const toggle  = document.querySelector('.mobile-summary-toggle');
  const chevron = document.getElementById('mobileSummaryChevron');
  if (!body) return;
  const open = body.classList.toggle('open');
  if (toggle)  toggle.setAttribute('aria-expanded', open);
  if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : '';
}

/* -- Review panel (step 3) ------------------------------------------------- */
function _renderReviewPanel() {
  const panel = document.getElementById('reviewPanel');
  if (!panel || currentStep !== 3) return;

  const name    = document.getElementById('f-name')?.value    || '';
  const phone   = document.getElementById('f-phone')?.value   || '';
  const email   = document.getElementById('f-email')?.value   || '';
  const special = document.getElementById('f-special')?.value || '';

  let deliveryHtml = '';
  if (selectedDelivery === 'locker' && selectedLocker) {
    deliveryHtml = `<p><strong>Pudo locker:</strong> ${selectedLocker.name}</p>
                    <p>${selectedLocker.address}</p>`;
  } else {
    const street   = document.getElementById('f-street')?.value   || '';
    const suburb   = document.getElementById('f-suburb')?.value   || '';
    const city     = document.getElementById('f-city')?.value     || '';
    const province = document.getElementById('f-province')?.value || '';
    const postal   = document.getElementById('f-postal')?.value   || '';
    deliveryHtml   = `<p>${street}${suburb ? ', ' + suburb : ''}</p>
                      <p>${city}${province ? ', ' + province : ''}${postal ? ' ' + postal : ''}</p>`;
  }

  panel.innerHTML = `
    <div class="review-section">
      <h4>Contact</h4>
      <p>${name}</p><p>${email}</p><p>${phone}</p>
    </div>
    <div class="review-section">
      <h4>Delivery (${selectedDelivery === 'locker' ? 'Pudo locker &mdash; R59' : 'Door &mdash; R99'})</h4>
      ${deliveryHtml}
      ${special ? `<p><em>Instructions: ${special}</em></p>` : ''}
    </div>
    <div class="review-section">
      <h4>Order</h4>
      ${cart.map(i => `<p>${i.name || 'Product'} x${i.qty} &mdash; R${(i.price * i.qty).toFixed(2)}</p>`).join('')}
      <p><strong>Total: R${calcTotal().toFixed(2)}</strong></p>
    </div>
  `;
}

/* -- Yoco payment ---------------------------------------------------------- */
let _yocoSDK    = null;
let _yocoReady  = false;

function _initYoco() {
  if (typeof window.YocoSDK === 'undefined') return;
  try {
    _yocoSDK  = new window.YocoSDK({ publicKey: 'pk_live_eba4e00cLbkMSn5b5a8f' });
    const inline = _yocoSDK.inline({ layout: 'basic', showErrors: true, showSubmitButton: false });
    inline.mount('#yoco-card-frame');
    _yocoReady = true;
    window._yocoInline = inline;
  } catch(e) {
    console.warn('Yoco init error:', e);
  }
}

async function submitPayment() {
  const btn     = document.getElementById('payBtn');
  const alertEl = document.getElementById('payAlert');
  if (btn) btn.disabled = true;

  const showAlert = (msg, type = 'error') => {
    if (!alertEl) return;
    alertEl.textContent   = msg;
    alertEl.className     = `alert alert-${type}`;
    alertEl.style.display = '';
  };

  if (!_yocoReady || !window._yocoInline) {
    showAlert('Payment form is not ready. Please refresh and try again.');
    if (btn) btn.disabled = false;
    return;
  }

  const overlay   = document.getElementById('loadingOverlay');
  const loadTitle = document.getElementById('loadingTitle');
  const loadText  = document.getElementById('loadingText');
  if (overlay)   overlay.style.display = '';
  if (loadTitle) loadTitle.textContent = 'Processing payment';
  if (loadText)  loadText.textContent  = 'Please wait while we securely process your payment\u2026';

  try {
    const result = await window._yocoInline.createToken();
    if (result.error) {
      if (overlay) overlay.style.display = 'none';
      showAlert(result.error.message || 'Card error. Please check your details.');
      if (btn) btn.disabled = false;
      return;
    }

    const token    = result.id;
    const orderRef = `PB-${Date.now()}`;
    const name     = document.getElementById('f-name')?.value.trim()  || '';
    const phone    = document.getElementById('f-phone')?.value.trim() || '';
    const email    = document.getElementById('f-email')?.value.trim() || '';
    const special  = document.getElementById('f-special')?.value.trim() || '';

    let deliveryAddress = {};
    if (selectedDelivery === 'locker' && selectedLocker) {
      deliveryAddress = { type: 'locker', ...selectedLocker };
    } else {
      deliveryAddress = {
        type:     'door',
        street:   document.getElementById('f-street')?.value.trim()   || '',
        suburb:   document.getElementById('f-suburb')?.value.trim()   || '',
        city:     document.getElementById('f-city')?.value.trim()     || '',
        province: document.getElementById('f-province')?.value.trim() || '',
        postal:   document.getElementById('f-postal')?.value.trim()   || '',
        special,
      };
    }

    const orderPayload = {
      order_ref:        orderRef,
      customer_name:    name,
      customer_phone:   phone,
      customer_email:   email,
      delivery_type:    selectedDelivery,
      delivery_address: deliveryAddress,
      items:            cart,
      subtotal:         calcSub(),
      delivery_fee:     getDeliveryFee(),
      total:            calcTotal(),
      status:           'pending_payment',
      yoco_token:       token,
    };

    const saveResp = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
      method:  'POST',
      headers: {
        apikey:         SUPABASE_ANON,
        Authorization:  `Bearer ${SUPABASE_ANON}`,
        'Content-Type': 'application/json',
        Prefer:         'return=representation',
      },
      body: JSON.stringify(orderPayload),
    });

    if (!saveResp.ok) {
      const err = await saveResp.json().catch(() => ({}));
      throw new Error(err.message || `Order save failed (${saveResp.status})`);
    }

    const chargeResp = await fetch(`${SUPABASE_URL}/functions/v1/yoco-charge`, {
      method:  'POST',
      headers: {
        apikey:         SUPABASE_ANON,
        Authorization:  `Bearer ${SUPABASE_ANON}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, amount: Math.round(calcTotal() * 100), currency: 'ZAR', order_ref: orderRef }),
    });

    const chargeData = await chargeResp.json();
    if (!chargeResp.ok || chargeData.error) {
      throw new Error(chargeData.error || chargeData.message || 'Payment charge failed.');
    }

    localStorage.removeItem('phenome_cart');
    localStorage.removeItem(DRAFT_KEY);
    if (loadTitle) loadTitle.textContent = 'Payment successful!';
    if (loadText)  loadText.textContent  = 'Redirecting to your order confirmation\u2026';

    setTimeout(() => {
      window.location.href = `order-confirmation.html?ref=${encodeURIComponent(orderRef)}&email=${encodeURIComponent(email)}`;
    }, 1200);

  } catch(err) {
    if (overlay) overlay.style.display = 'none';
    showAlert(err.message || 'Something went wrong. Please try again.');
    if (btn) btn.disabled = false;
    console.error('Payment error:', err);
  }
}

/* -- Google Places autocomplete callback ----------------------------------- */
async function initPlaces() {
  try {
    const { Autocomplete } = await google.maps.importLibrary('places');

    const streetInput = document.getElementById('f-street');
    if (streetInput) {
      const ac = new Autocomplete(streetInput, {
        componentRestrictions: { country: 'za' },
        fields: ['address_components'],
        types:  ['address'],
      });
      const hint = document.getElementById('placesHint');
      if (hint) hint.style.display = '';
      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        if (!place.address_components) return;
        const get = (type) => place.address_components.find(c => c.types.includes(type))?.long_name || '';
        const street_number = get('street_number');
        const route         = get('route');
        document.getElementById('f-street').value   = [street_number, route].filter(Boolean).join(' ');
        document.getElementById('f-suburb').value   = get('sublocality_level_1') || get('neighborhood') || get('sublocality');
        document.getElementById('f-city').value     = get('locality') || get('postal_town');
        document.getElementById('f-province').value = get('administrative_area_level_1');
        document.getElementById('f-postal').value   = get('postal_code');
        saveDraft();
      });
    }

    const lockerInput = document.getElementById('f-locker-search');
    if (lockerInput) {
      const hint = document.getElementById('lockerPlacesHint');
      if (hint) hint.style.display = 'flex';
      const acLocker = new Autocomplete(lockerInput, {
        componentRestrictions: { country: 'za' },
        fields: ['geometry', 'formatted_address'],
      });
      acLocker.addListener('place_changed', () => {
        const place = acLocker.getPlace();
        if (place.geometry?.location) {
          lockerSearchLat = place.geometry.location.lat();
          lockerSearchLng = place.geometry.location.lng();
          searchLockers();
        }
      });
    }
  } catch(e) {
    console.warn('Places init error:', e);
  }
}

/* -- DOMContentLoaded init ------------------------------------------------- */
document.addEventListener('DOMContentLoaded', function () {
  if (!cart.length) {
    window.location.href = 'index.html';
    return;
  }

  syncDeliveryToggle();
  renderSummary();
  renderMobileSummary();
  renderDeliveryDate();

  const hasDraft = !!localStorage.getItem(DRAFT_KEY);
  loadDraft();
  if (hasDraft) {
    const toast = document.getElementById('coToast');
    if (toast) {
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3200);
    }
  }

  document.querySelectorAll('#f-name,#f-phone,#f-email,#f-street,#f-suburb,#f-city,#f-province,#f-postal').forEach(el => {
    el.addEventListener('input', saveDraft);
  });

  const lockerSearchInput = document.getElementById('f-locker-search');
  if (lockerSearchInput) {
    lockerSearchInput.addEventListener('keyup', function(e) {
      if (e.key === 'Enter') { searchLockers(); return; }
      clearTimeout(_lockerSearchTimer);
      _lockerSearchTimer = setTimeout(searchLockers, 500);
    });
  }
});
