// checkout.js — v20
// ─────────────────────────────────────────────────────────────────────────────
// PhenomeBeauty checkout logic
// ─────────────────────────────────────────────────────────────────────────────

/* ── Constants ── */
const SUPABASE_URL    = 'https://papdxjcfimeyjgzmatpl.supabase.co';
const SUPABASE_ANON   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcGR4amNmaW1leWpnem1hdHBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMDk4NjcsImV4cCI6MjA5MjY4NTg2N30.mn_JsORuYUBtHTqIF2RjY8YUJzY9zJQV0uGFXBvrJRc';
const YOCO_PUBLIC_KEY = 'pk_live_1e7a49ddCHsIxIuU83d0';
const SA_HOLIDAYS = [
  '2025-01-01','2025-03-21','2025-04-18','2025-04-21','2025-04-28',
  '2025-05-01','2025-06-16','2025-08-09','2025-09-24','2025-12-16',
  '2025-12-25','2025-12-26',
  '2026-01-01','2026-03-21','2026-04-03','2026-04-06','2026-04-27',
  '2026-05-01','2026-06-16','2026-08-10','2026-09-24','2026-12-16',
  '2026-12-25','2026-12-26'
];

/* ── State ── */
let cart           = [];
let deliveryMethod = 'door';
let deliveryFee    = 0;
let selectedLocker = null;
let giftOn         = false;
let specialOn      = false;
let addonsOpen     = false;
let currentStep    = 1;
let yocoSDK;

/* ── Boot ── */
document.addEventListener('DOMContentLoaded', () => {
  cart = loadCart();
  if (!cart.length) { showEmpty(); return; }
  renderSidebar();
  renderMobileSummary();
  calcDelivery();
  prefillContact();
  initPlacesAutocomplete();
  attachInputListeners();
  setupBeforeUnload();
  setupVisibilityNudge();
  yocoSDK = new YocoSDK({ publicKey: YOCO_PUBLIC_KEY });
});

/* ── Cart helpers ── */
function loadCart() {
  try {
    const raw = sessionStorage.getItem('pb_cart')
             || localStorage.getItem('pb_cart')
             || '[]';
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function saveCart() {
  const json = JSON.stringify(cart);
  localStorage.setItem('pb_cart', json);
  sessionStorage.setItem('pb_cart', json);
}
function cartTotal() {
  return cart.reduce((s, i) => s + i.price * i.qty, 0);
}
function cartSubtotal() { return cartTotal(); }

/* ── Empty state ── */
function showEmpty() {
  document.getElementById('emptyState').classList.add('show');
  document.getElementById('coLayout').style.display = 'none';
  document.getElementById('mobileSummary').style.display = 'none';
}

/* ── Sidebar / summary ── */
function renderSidebar() {
  const wrap = document.getElementById('summaryItems');
  wrap.innerHTML = cart.map(item => `
    <div class="cart-item">
      <img src="${item.image}" alt="${item.name}" loading="lazy" />
      <div>
        <h4>${item.name}</h4>
        <p class="cart-meta">${item.variant ? item.variant + '<br>' : ''}Qty: ${item.qty}</p>
      </div>
      <div class="cart-price">R${(item.price * item.qty).toLocaleString('en-ZA')}</div>
    </div>`).join('');
  renderTotals();
  updateItemCount();
}
function renderTotals() {
  const tot = document.getElementById('summaryTotals');
  const sub = cartSubtotal();
  const feeLabel = deliveryFee === 0 ? 'Free' : 'R' + deliveryFee.toLocaleString('en-ZA');
  tot.innerHTML = `
    <div class="total-row"><span>Subtotal</span><span>R${sub.toLocaleString('en-ZA')}</span></div>
    <div class="total-row"><span>Delivery</span><span>${feeLabel}</span></div>
    <div class="total-row grand"><span>Total</span><span>R${(sub + deliveryFee).toLocaleString('en-ZA')}</span></div>`;
}
function updateItemCount() {
  const total = cart.reduce((s, i) => s + i.qty, 0);
  const lbl = document.getElementById('itemCountLabel');
  if (lbl) lbl.textContent = total + (total === 1 ? ' item in your cart' : ' items in your cart');
}

/* ── Mobile summary bar ── */
function renderMobileSummary() {
  const items  = document.getElementById('mobileItems');
  const totals = document.getElementById('mobileTotals');
  const grand  = document.getElementById('msTotalDisplay');
  const sub    = cartSubtotal();
  if (items) items.innerHTML = cart.map(item => `
    <div class="cart-item" style="margin-bottom:8px">
      <img src="${item.image}" alt="${item.name}" loading="lazy" />
      <div>
        <h4>${item.name}</h4>
        <p class="cart-meta">${item.variant ? item.variant + '<br>' : ''}Qty: ${item.qty}</p>
      </div>
      <div class="cart-price">R${(item.price * item.qty).toLocaleString('en-ZA')}</div>
    </div>`).join('');
  const feeLabel = deliveryFee === 0 ? 'Free' : 'R' + deliveryFee.toLocaleString('en-ZA');
  if (totals) totals.innerHTML = `
    <div class="total-row" style="margin-top:8px"><span>Subtotal</span><span>R${sub.toLocaleString('en-ZA')}</span></div>
    <div class="total-row"><span>Delivery</span><span>${feeLabel}</span></div>
    <div class="total-row grand"><span>Total</span><span>R${(sub + deliveryFee).toLocaleString('en-ZA')}</span></div>`;
  if (grand) grand.textContent = 'R' + (sub + deliveryFee).toLocaleString('en-ZA');
}
function toggleMobileSummary() {
  const body    = document.getElementById('mobileSummaryBody');
  const chevron = document.getElementById('msChevron');
  const open    = body.classList.toggle('open');
  if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : '';
}

/* ── Cart editor ── */
function openCartEditor() {
  renderCartEditor();
  document.getElementById('cartEditorOverlay').classList.add('open');
  document.getElementById('cartEditorPanel').classList.add('open');
  document.body.classList.add('ce-open');
}
function closeCartEditor() {
  document.getElementById('cartEditorOverlay').classList.remove('open');
  document.getElementById('cartEditorPanel').classList.remove('open');
  document.body.classList.remove('ce-open');
  if (!cart.length) { showEmpty(); }
}
function renderCartEditor() {
  const wrap = document.getElementById('cartEditorItems');
  const MAX_INLINE = 4;
  const inline  = cart.slice(0, MAX_INLINE);
  const overflow = cart.slice(MAX_INLINE);
  const renderItem = (item, idx) => `
    <div class="ce-item">
      <img class="ce-item-img" src="${item.image}" alt="${item.name}" loading="lazy" />
      <div class="ce-item-info">
        <div class="ce-item-name">${item.name}</div>
        <div class="ce-item-price">R${(item.price * item.qty).toLocaleString('en-ZA')}</div>
      </div>
      <div class="ce-item-actions">
        <div class="ce-qty-controls">
          <button class="ce-qty-btn" onclick="ceChangeQty(${idx},-1)" aria-label="Decrease quantity" ${item.qty<=1?'disabled':''}>-</button>
          <span class="ce-qty-val">${item.qty}</span>
          <button class="ce-qty-btn" onclick="ceChangeQty(${idx},1)" aria-label="Increase quantity">+</button>
        </div>
        <button class="ce-remove-btn" onclick="ceRemove(${idx})">Remove</button>
      </div>
    </div>`;
  let html = inline.map((item, i) => renderItem(item, i)).join('');
  if (overflow.length) {
    html += `<div class="ce-overflow" id="ceOverflow">${overflow.map((item, i) => renderItem(item, MAX_INLINE + i)).join('')}</div>`;
    html += `<button class="ce-overflow-toggle" id="ceOverflowToggle" onclick="toggleCeOverflow()">Show ${overflow.length} more item${overflow.length>1?'s':''}</button>`;
  }
  wrap.innerHTML = html;
  document.getElementById('ceFooterSubtotal').textContent = 'R' + cartSubtotal().toLocaleString('en-ZA');
}
function toggleCeOverflow() {
  const el  = document.getElementById('ceOverflow');
  const btn = document.getElementById('ceOverflowToggle');
  const MAX_INLINE = 4;
  if (!el) return;
  const open = el.classList.toggle('open');
  const rem  = cart.length - MAX_INLINE;
  btn.textContent = open ? 'Show less' : `Show ${rem} more item${rem>1?'s':''}`;
}
function ceChangeQty(idx, delta) {
  if (!cart[idx]) return;
  cart[idx].qty = Math.max(1, cart[idx].qty + delta);
  saveCart();
  renderCartEditor();
  renderSidebar();
  renderMobileSummary();
  renderTotals();
  updateItemCount();
}
function ceRemove(idx) {
  cart.splice(idx, 1);
  saveCart();
  renderCartEditor();
  renderSidebar();
  renderMobileSummary();
  renderTotals();
  updateItemCount();
}

/* ── Delivery calc ── */
function calcDelivery() {
  const sub = cartSubtotal();
  if (deliveryMethod === 'door') {
    deliveryFee = sub >= 1500 ? 0 : 120;
    document.getElementById('door-price-display').textContent = sub >= 1500 ? 'Free' : 'R120';
    document.getElementById('locker-price-display').textContent = 'R80';
  } else {
    deliveryFee = 80;
    document.getElementById('door-price-display').textContent = sub >= 1500 ? 'Free' : 'R120';
    document.getElementById('locker-price-display').textContent = 'R80';
  }
  renderTotals();
  renderMobileSummary();
  updateDeliveryWindow();
}
function selectDelivery(method) {
  deliveryMethod = method;
  document.getElementById('opt-door').classList.toggle('selected', method === 'door');
  document.getElementById('opt-locker').classList.toggle('selected', method === 'locker');
  document.getElementById('door-fields').style.display   = method === 'door'   ? '' : 'none';
  document.getElementById('locker-fields').style.display = method === 'locker' ? '' : 'none';
  const metaTitle = document.getElementById('deliveryMetaTitle');
  const metaText  = document.getElementById('deliveryMetaText');
  if (method === 'door') {
    metaTitle.textContent = 'Door delivery selected';
    metaText.textContent  = 'Enter your address and we\u2019ll estimate a delivery window based on business days and local holidays.';
  } else {
    metaTitle.textContent = 'Pudo locker selected';
    metaText.textContent  = 'Search for your nearest locker and we\u2019ll estimate a collection window.';
  }
  calcDelivery();
}

/* ── Delivery window ── */
function isBusinessDay(date) {
  const d   = date.getDay();
  const str = date.toISOString().slice(0, 10);
  return d !== 0 && d !== 6 && !SA_HOLIDAYS.includes(str);
}
function addBusinessDays(date, n) {
  const d = new Date(date);
  let added = 0;
  while (added < n) { d.setDate(d.getDate() + 1); if (isBusinessDay(d)) added++; }
  return d;
}
function formatDate(date) {
  return date.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
}
function updateDeliveryWindow() {
  const now  = new Date();
  const cutoff = new Date(now); cutoff.setHours(12, 0, 0, 0);
  const start  = now < cutoff ? addBusinessDays(now, 2) : addBusinessDays(now, 3);
  const end    = addBusinessDays(start, 2);
  const label  = `${formatDate(start)} \u2013 ${formatDate(end)}`;
  const el2    = document.getElementById('deliveryDateText2');
  const rvEl   = document.getElementById('rv-delivery-date');
  if (el2)  el2.textContent  = label;
  if (rvEl) rvEl.textContent = label;
}

/* ── Steps ── */
function goToStep(n) {
  if (n === 2 && !validateStep1()) return;
  if (n === 3 && !validateStep2()) return;
  currentStep = n;
  document.querySelectorAll('.step').forEach((el, i) => el.classList.toggle('active', i + 1 === n));
  document.querySelectorAll('.step-pill').forEach((el, i) => {
    el.classList.remove('active', 'done');
    if (i + 1 === n) el.classList.add('active');
    if (i + 1 < n)  el.classList.add('done');
  });
  if (n === 3) populateReview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── Validation ── */
function setFieldError(fieldId, errId, show) {
  document.getElementById(fieldId)?.classList.toggle('error', show);
  const et = document.getElementById(errId);
  if (et) et.classList.toggle('show', show);
}
function clearFieldError(input) {
  const field = input.closest('.field');
  if (!field) return;
  field.classList.remove('error');
  const et = field.querySelector('.error-text');
  if (et) et.classList.remove('show');
}
function validateStep1() {
  const name  = document.getElementById('f-name').value.trim();
  const phone = document.getElementById('f-phone').value.trim();
  const email = document.getElementById('f-email').value.trim();
  const phoneOk = /^[\d\s+\-()]{7,20}$/.test(phone);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  setFieldError('field-name',  'err-name',  !name);
  setFieldError('field-phone', 'err-phone', !phoneOk);
  setFieldError('field-email', 'err-email', !emailOk);
  return name && phoneOk && emailOk;
}
function validateStep2() {
  if (deliveryMethod === 'door') {
    const street   = document.getElementById('f-street').value.trim();
    const suburb   = document.getElementById('f-suburb').value.trim();
    const city     = document.getElementById('f-city').value.trim();
    const postal   = document.getElementById('f-postal').value.trim();
    const province = document.getElementById('f-province').value.trim();
    setFieldError('field-street',   'err-street',   !street);
    setFieldError('field-suburb',   'err-suburb',   !suburb);
    setFieldError('field-city',     'err-city',     !city);
    setFieldError('field-postal',   'err-postal',   !postal);
    setFieldError('field-province', 'err-province', !province);
    return street && suburb && city && postal && province;
  } else {
    const ok = !!selectedLocker;
    document.getElementById('err-locker')?.classList.toggle('show', !ok);
    return ok;
  }
}

/* ── Input listeners ── */
function attachInputListeners() {
  document.querySelectorAll('.field input, .field textarea').forEach(el => {
    el.addEventListener('input', () => clearFieldError(el));
  });
  document.querySelectorAll('.field select').forEach(el => {
    el.addEventListener('change', () => clearFieldError(el));
  });
}

/* ── Prefill contact ── */
function prefillContact() {
  try {
    const saved = JSON.parse(localStorage.getItem('pb_contact') || '{}');
    if (saved.name)  document.getElementById('f-name').value  = saved.name;
    if (saved.phone) document.getElementById('f-phone').value = saved.phone;
    if (saved.email) document.getElementById('f-email').value = saved.email;
  } catch {}
}
function saveContact() {
  try {
    localStorage.setItem('pb_contact', JSON.stringify({
      name:  document.getElementById('f-name').value.trim(),
      phone: document.getElementById('f-phone').value.trim(),
      email: document.getElementById('f-email').value.trim()
    }));
  } catch {}
}

/* ── Optional add-ons collapse ── */
function toggleAddons() {
  addonsOpen = !addonsOpen;
  const body    = document.getElementById('addonsBody');
  const toggle  = document.getElementById('addonsToggle');
  if (body)   body.style.maxHeight   = addonsOpen ? body.scrollHeight + 'px' : '0';
  if (toggle) toggle.setAttribute('aria-expanded', addonsOpen ? 'true' : 'false');
}

/* ── Gift toggle ── */
function toggleGift() {
  giftOn = !giftOn;
  const cb  = document.getElementById('f-is-gift');
  const btn = document.querySelector('#giftToggleRow .switch');
  const rev = document.getElementById('giftReveal');
  if (cb)  cb.checked = giftOn;
  if (btn) btn.classList.toggle('on', giftOn);
  if (rev) rev.style.maxHeight = giftOn ? rev.scrollHeight + 'px' : '0';
}

/* ── Special instructions toggle ── */
function toggleSpecial() {
  specialOn = !specialOn;
  const btn  = document.getElementById('specialToggle');
  const wrap = document.getElementById('specialFieldWrap');
  if (btn)  btn.classList.toggle('on', specialOn);
  if (wrap) wrap.style.display = specialOn ? '' : 'none';
  if (specialOn && !addonsOpen) {
    addonsOpen = true;
    const body   = document.getElementById('addonsBody');
    const toggle = document.getElementById('addonsToggle');
    if (body)   body.style.maxHeight = body.scrollHeight + 'px';
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
  }
}

/* ── Locker search ── */
function searchLockers() {
  const query = document.getElementById('f-locker-search').value.trim();
  const lat   = document.getElementById('lockerSearchLat').value;
  const lng   = document.getElementById('lockerSearchLng').value;
  if (!query && !lat) { showToast('Enter a location to search for lockers.'); return; }
  const btn = document.getElementById('lockerSearchBtn');
  btn.disabled = true;
  btn.textContent = 'Searching\u2026';
  const sub = cartSubtotal();
  const params = new URLSearchParams({ subtotal: sub });
  if (lat && lng) { params.set('lat', lat); params.set('lng', lng); }
  else            { params.set('q', query); }
  fetch(`${SUPABASE_URL}/functions/v1/pudo-lockers?${params}`, {
    headers: { 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + SUPABASE_ANON }
  })
  .then(r => r.json())
  .then(data => renderLockers(data))
  .catch(() => showToast('Could not fetch lockers. Please try again.'))
  .finally(() => { btn.disabled = false; btn.textContent = 'Search'; });
}
function useMyLocation() {
  if (!navigator.geolocation) { showToast('Geolocation is not supported by your browser.'); return; }
  const hint = document.getElementById('lockerPlacesHint');
  if (hint) { hint.style.display = 'flex'; }
  navigator.geolocation.getCurrentPosition(
    pos => {
      document.getElementById('lockerSearchLat').value = pos.coords.latitude;
      document.getElementById('lockerSearchLng').value = pos.coords.longitude;
      if (hint) hint.style.display = 'none';
      searchLockers();
    },
    () => {
      if (hint) hint.style.display = 'none';
      showToast('Location access denied. Please search manually.');
    }
  );
}
function renderLockers(data) {
  const container   = document.getElementById('lockerResults');
  const sizeNotice  = document.getElementById('lockerSizeNotice');
  const lockers     = data.lockers || [];
  const boxCategory = data.box_category || null;
  const filtered    = data.filtered    || false;
  if (sizeNotice) {
    if (boxCategory) {
      const cls = filtered ? 'locker-size-notice locker-size-notice--filtered' : 'locker-size-notice';
      sizeNotice.className = cls;
      sizeNotice.innerHTML = filtered
        ? `Your order fits a <strong>${boxCategory}</strong> locker. Showing only compatible locations.`
        : `Your order fits a <strong>${boxCategory}</strong> locker.`;
      sizeNotice.style.display = '';
    } else {
      sizeNotice.style.display = 'none';
    }
  }
  if (!lockers.length) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:.88rem;">No lockers found near that location.</p>';
    return;
  }
  container.innerHTML = lockers.map(l => {
    const distLabel = l.distance_km != null ? `${l.distance_km.toFixed(1)} km away` : '';
    const sizeNote  = l.size_compatible === false
      ? `<div class="locker-item-size-warn"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> May not fit your order size</div>`
      : '';
    return `
      <div class="locker-item">
        <div class="locker-item-top">
          <div><h4>${l.name}</h4><p>${l.address}</p>${sizeNote}</div>
          <div class="locker-badges">
            ${distLabel ? `<span class="locker-tag">${distLabel}</span>` : ''}
            ${l.available_sizes ? l.available_sizes.map(s => `<span class="locker-tag">${s}</span>`).join('') : ''}
          </div>
        </div>
        <div class="locker-cta">
          <span style="font-size:.82rem;color:var(--text-muted);">R80 delivery</span>
          <button type="button" class="mini-btn" onclick='selectLocker(${JSON.stringify(l)})'>Select this locker</button>
        </div>
      </div>`;
  }).join('');
}
function selectLocker(locker) {
  selectedLocker = locker;
  document.getElementById('lockerResults').innerHTML = '';
  document.getElementById('lockerSizeNotice').style.display = 'none';
  const display = document.getElementById('lockerSelectedDisplay');
  display.style.display = '';
  document.getElementById('lockerSelectedName').textContent = locker.name;
  document.getElementById('lockerSelectedAddr').textContent = locker.address;
  const sizeNote = document.getElementById('lockerSelectedSizeNote');
  if (locker.size_compatible === false) {
    sizeNote.textContent  = 'This locker may not fit all items in your order.';
    sizeNote.className    = 'locker-size-note locker-size-note--unknown';
    sizeNote.style.display = '';
  } else if (locker.size_compatible === true) {
    sizeNote.textContent  = 'This locker fits your order.';
    sizeNote.className    = 'locker-size-note locker-size-note--confirmed';
    sizeNote.style.display = '';
  } else {
    sizeNote.style.display = 'none';
  }
  document.getElementById('err-locker')?.classList.remove('show');
}
function clearLockerSelection() {
  selectedLocker = null;
  document.getElementById('lockerSelectedDisplay').style.display = 'none';
  document.getElementById('lockerSizeNotice').style.display = 'none';
}

/* ── Places autocomplete (door) ── */
function initPlacesAutocomplete() {
  const streetInput = document.getElementById('f-street');
  const lockerInput = document.getElementById('f-locker-search');
  if (!streetInput || !lockerInput) return;
  if (typeof google === 'undefined' || !google.maps || !google.maps.places) return;
  try {
    const opts = { componentRestrictions: { country: 'za' }, fields: ['address_components','formatted_address','geometry'] };
    const acDoor = new google.maps.places.Autocomplete(streetInput, opts);
    acDoor.addListener('place_changed', () => {
      const place = acDoor.getPlace();
      if (!place.address_components) return;
      autofillAddress(place.address_components);
      document.getElementById('placesHint').style.display = 'none';
    });
    streetInput.addEventListener('input', () => {
      if (streetInput.value.length > 2) document.getElementById('placesHint').style.display = 'block';
    });
    const acLocker = new google.maps.places.Autocomplete(lockerInput, { componentRestrictions: { country: 'za' }, fields: ['geometry','formatted_address'] });
    acLocker.addListener('place_changed', () => {
      const place = acLocker.getPlace();
      if (!place.geometry) return;
      document.getElementById('lockerSearchLat').value = place.geometry.location.lat();
      document.getElementById('lockerSearchLng').value = place.geometry.location.lng();
    });
  } catch (e) { console.warn('Places autocomplete init failed:', e); }
}
function autofillAddress(components) {
  const get = types => {
    const c = components.find(c => types.some(t => c.types.includes(t)));
    return c ? c.long_name : '';
  };
  document.getElementById('f-street').value   = [get(['street_number']), get(['route'])].filter(Boolean).join(' ');
  document.getElementById('f-suburb').value   = get(['sublocality','sublocality_level_1','neighborhood']);
  document.getElementById('f-city').value     = get(['locality','postal_town']);
  document.getElementById('f-postal').value   = get(['postal_code']);
  document.getElementById('f-province').value = get(['administrative_area_level_1']);
  ['field-street','field-suburb','field-city','field-postal','field-province'].forEach(id => {
    document.getElementById(id)?.classList.remove('error');
    const et = document.getElementById(id)?.querySelector('.error-text');
    if (et) et.classList.remove('show');
  });
}

/* ── Review panel ── */
function populateReview() {
  const name    = document.getElementById('f-name').value.trim();
  const phone   = document.getElementById('f-phone').value.trim();
  const email   = document.getElementById('f-email').value.trim();
  const sub     = cartSubtotal();
  const total   = sub + deliveryFee;
  const feeLabel = deliveryFee === 0 ? 'Free' : 'R' + deliveryFee.toLocaleString('en-ZA');
  document.getElementById('done-contact-val').textContent   = `${name} | ${phone} | ${email}`;
  document.getElementById('done-contact-val-2').textContent = `${name} | ${email}`;
  document.getElementById('rv-subtotal').textContent        = 'R' + sub.toLocaleString('en-ZA');
  document.getElementById('rv-delivery').textContent        = feeLabel;
  document.getElementById('rv-total').textContent           = 'R' + total.toLocaleString('en-ZA');
  document.getElementById('payBtnTotal').textContent        = total.toLocaleString('en-ZA');
  let deliveryVal = '';
  if (deliveryMethod === 'door') {
    const street = document.getElementById('f-street').value.trim();
    const suburb = document.getElementById('f-suburb').value.trim();
    const city   = document.getElementById('f-city').value.trim();
    deliveryVal  = [street, suburb, city].filter(Boolean).join(', ');
    document.getElementById('rv-delivery-label').textContent = 'Door delivery';
  } else {
    deliveryVal = selectedLocker ? `${selectedLocker.name} \u2013 ${selectedLocker.address}` : 'Pudo locker';
    document.getElementById('rv-delivery-label').textContent = 'Pudo locker';
  }
  document.getElementById('done-delivery-val').textContent = deliveryVal;
  updateDeliveryWindow();
  const giftBlock = document.getElementById('giftReviewBlock');
  const giftBody  = document.getElementById('giftReviewBody');
  if (giftOn) {
    giftBlock.style.display = '';
    giftBody.textContent    = document.getElementById('f-gift-message').value.trim() || '(No message entered)';
  } else {
    giftBlock.style.display = 'none';
  }
  const reviewItems = document.getElementById('reviewItems');
  reviewItems.innerHTML = cart.map(item => `
    <div class="done-block" style="display:grid;grid-template-columns:52px 1fr auto;gap:12px;align-items:center;">
      <img src="${item.image}" alt="${item.name}" style="width:52px;height:52px;border-radius:10px;object-fit:cover;" loading="lazy" />
      <div>
        <h4 style="margin:0 0 4px;font-size:.9rem;">${item.name}</h4>
        <p style="margin:0;font-size:.8rem;color:var(--text-muted);">${item.variant ? item.variant + ' &bull; ' : ''}Qty: ${item.qty}</p>
      </div>
      <div style="text-align:right;font-weight:700;color:var(--accent);font-size:.9rem;">R${(item.price * item.qty).toLocaleString('en-ZA')}</div>
    </div>`).join('');
  saveContact();
}

/* ── Pay ── */
async function handlePay() {
  const btn = document.getElementById('payBtn');
  btn.disabled = true;
  btn.textContent = 'Processing\u2026';
  const alertEl = document.getElementById('alert-3');
  alertEl.classList.remove('show','warn');
  const name    = document.getElementById('f-name').value.trim();
  const phone   = document.getElementById('f-phone').value.trim();
  const email   = document.getElementById('f-email').value.trim();
  const special = specialOn ? document.getElementById('f-special').value.trim() : '';
  const gift    = giftOn    ? document.getElementById('f-gift-message').value.trim() : '';
  const notes   = document.getElementById('f-notes')?.value.trim() || '';
  let deliveryAddress = {};
  if (deliveryMethod === 'door') {
    deliveryAddress = {
      street:   document.getElementById('f-street').value.trim(),
      suburb:   document.getElementById('f-suburb').value.trim(),
      city:     document.getElementById('f-city').value.trim(),
      postal:   document.getElementById('f-postal').value.trim(),
      province: document.getElementById('f-province').value.trim()
    };
  } else {
    deliveryAddress = { locker: selectedLocker };
  }
  const total = cartSubtotal() + deliveryFee;
  try {
    const tokenResult = await yocoSDK.showPopup({
      amountInCents: total * 100,
      currency:      'ZAR',
      name:          'PhenomeBeauty',
      description:   `Order for ${name}`
    });
    if (!tokenResult || tokenResult.error) throw new Error(tokenResult?.error?.message || 'Payment cancelled.');
    const payload = {
      token:          tokenResult.id,
      amount:         total * 100,
      currency:       'ZAR',
      name, phone, email,
      cart,
      delivery_method:  deliveryMethod,
      delivery_address: deliveryAddress,
      delivery_fee:     deliveryFee,
      notes, special_instructions: special,
      gift_message: gift
    };
    const res  = await fetch(`${SUPABASE_URL}/functions/v1/create-charge`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json','apikey':SUPABASE_ANON,'Authorization':'Bearer '+SUPABASE_ANON },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Payment failed.');
    localStorage.removeItem('pb_cart');
    sessionStorage.removeItem('pb_cart');
    window.location.href = `thank-you.html?order=${encodeURIComponent(data.order_id || '')}&name=${encodeURIComponent(name)}`;
  } catch (err) {
    alertEl.textContent = err.message || 'Something went wrong. Please try again.';
    alertEl.classList.add('show');
    btn.disabled    = false;
    btn.innerHTML   = 'Pay R<span id="payBtnTotal">' + (cartSubtotal() + deliveryFee).toLocaleString('en-ZA') + '</span> <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
  }
}

/* ── Toast ── */
function showToast(msg, duration = 3200) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

/* ── Exit nudge ── */
// Only show the nudge if the user has progressed past step 1 (i.e. they have
// started entering delivery or payment details). Firing on step 1 is
// antagonistic because the user may be deliberately navigating away.
function setupBeforeUnload() {}
function setupVisibilityNudge() {
  let paid = false;
  const nudge = document.getElementById('exitNudge');
  document.addEventListener('visibilitychange', () => {
    if (paid) return;
    if (currentStep < 2) return;
    if (document.visibilityState === 'hidden') nudge?.classList.add('show');
  });
  window.markPaid = () => { paid = true; };
}
function dismissNudge() {
  document.getElementById('exitNudge')?.classList.remove('show');
}
