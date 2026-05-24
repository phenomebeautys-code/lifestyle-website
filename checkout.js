/* ============================================================
   PhenomeBeauty — checkout.js
   Cache-bust v2 — fixes truncated-file browser cache (2026-05-24).
   - Correct Supabase anon key (iat: May 2026)
   - Correct locker endpoint: pudo-locker-search (GET)
   - renderSummary / renderDeliveryDate / initPlaces / submitOrder
   - DOMContentLoaded wiring
   ============================================================ */

/* -- Constants ------------------------------------------------------------ */
const SUPABASE_URL  = 'https://papdxjcfimeyjgzmatpl.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcGR4amNmaW1leWpnem1hdHBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDcwNTI5MDIsImV4cCI6MjA2MjYyODkwMn0.n0SB7EB91a3uGp5mRTFbIarU4z-R6T5l6Vc4bpNF3Sg';

/* -- State ---------------------------------------------------------------- */
let currentStep      = 1;
let cart             = [];
let deliveryMethod   = 'door';   // 'door' | 'locker'
let selectedLocker   = null;
let lockerSearchLat  = null;
let lockerSearchLng  = null;
let _lockerSearchTimer = null;
let yocoSDK          = null;
let yocoCard         = null;
let specialOpen      = false;

/* -- Delivery pricing ----------------------------------------------------- */
const DOOR_PRICE   = 99;
const LOCKER_PRICE = 59;

function deliveryFee() {
  return deliveryMethod === 'locker' ? LOCKER_PRICE : DOOR_PRICE;
}

/* -- Cart helpers --------------------------------------------------------- */
function loadCart() {
  try {
    const raw = sessionStorage.getItem('pb_cart')
             || localStorage.getItem('pb_cart')
             || localStorage.getItem('phenome_cart')
             || '[]';
    cart = JSON.parse(raw);
    if (!Array.isArray(cart)) cart = [];
    // Migrate legacy key and normalise imageUrl -> image
    cart = cart.map(item => {
      if (item.imageUrl && !item.image) { item.image = item.imageUrl; delete item.imageUrl; }
      return item;
    });
    localStorage.setItem('pb_cart', JSON.stringify(cart));
    localStorage.removeItem('phenome_cart');
  } catch(e) { cart = []; }
}

function cartSubtotal() {
  return cart.reduce((s, item) => s + (Number(item.price) || 0) * (Number(item.qty) || 1), 0);
}

function cartTotal() {
  return cartSubtotal() + deliveryFee();
}

/* -- Step navigation ------------------------------------------------------ */
function goToStep(n) {
  if (n === 2 && !validateStep1()) return;
  if (n === 3 && !validateStep2()) return;

  // Save progress in sessionStorage so we can restore on back-nav
  saveDraft();

  currentStep = n;

  document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
  const panel = document.getElementById('panel-' + n);
  if (panel) panel.classList.add('active');

  document.querySelectorAll('.step-pill').forEach((pill, i) => {
    pill.classList.remove('active', 'done');
    if (i + 1 < n)  pill.classList.add('done');
    if (i + 1 === n) pill.classList.add('active');
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (n === 3) {
    renderReview();
    initYoco();
  }

  renderDeliveryDate();
  renderSummary();
}

/* -- Validation ----------------------------------------------------------- */
function validateStep1() {
  let ok = true;

  const name  = document.getElementById('f-name')?.value.trim()  || '';
  const phone = document.getElementById('f-phone')?.value.trim() || '';
  const email = document.getElementById('f-email')?.value.trim() || '';

  setFieldError('field-name',  'err-name',  !name,  'Please enter your name.');
  setFieldError('field-phone', 'err-phone', !/^[0-9 +\-()]{7,}$/.test(phone), 'Please enter a valid phone number.');
  setFieldError('field-email', 'err-email', !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Please enter a valid email address.');

  if (!name || !/^[0-9 +\-()]{7,}$/.test(phone) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ok = false;
  return ok;
}

function validateStep2() {
  let ok = true;
  if (deliveryMethod === 'door') {
    const street = document.getElementById('f-street')?.value.trim() || '';
    const suburb = document.getElementById('f-suburb')?.value.trim() || '';
    const city   = document.getElementById('f-city')?.value.trim()   || '';
    const postal = document.getElementById('f-postal')?.value.trim() || '';
    const prov   = document.getElementById('f-province')?.value.trim() || '';

    setFieldError('field-street',   'err-street',   !street, 'Please enter your street address.');
    setFieldError('field-suburb',   'err-suburb',   !suburb, 'Please enter your suburb.');
    setFieldError('field-city',     'err-city',     !city,   'Please enter your city.');
    setFieldError('field-postal',   'err-postal',   !postal, 'Please enter your postal code.');
    setFieldError('field-province', 'err-province', !prov,   'Please enter your province.');

    if (!street || !suburb || !city || !postal || !prov) ok = false;
  } else {
    if (!selectedLocker) {
      const err = document.getElementById('err-locker');
      if (err) err.classList.add('show');
      ok = false;
    }
  }
  return ok;
}

function setFieldError(fieldId, errId, show, msg) {
  const field = document.getElementById(fieldId);
  const err   = document.getElementById(errId);
  if (!field || !err) return;
  if (show) {
    field.classList.add('error');
    err.textContent = msg;
    err.classList.add('show');
  } else {
    field.classList.remove('error');
    err.classList.remove('show');
  }
}

/* -- Draft save / restore ------------------------------------------------- */
function saveDraft() {
  try {
    const draft = {
      name:     document.getElementById('f-name')?.value    || '',
      phone:    document.getElementById('f-phone')?.value   || '',
      email:    document.getElementById('f-email')?.value   || '',
      street:   document.getElementById('f-street')?.value  || '',
      suburb:   document.getElementById('f-suburb')?.value  || '',
      city:     document.getElementById('f-city')?.value    || '',
      postal:   document.getElementById('f-postal')?.value  || '',
      province: document.getElementById('f-province')?.value || '',
      special:  document.getElementById('f-special')?.value  || '',
      method:   deliveryMethod,
      locker:   selectedLocker,
    };
    sessionStorage.setItem('pb_checkout_draft', JSON.stringify(draft));
  } catch(e) {}
}

function restoreDraft() {
  try {
    const raw = sessionStorage.getItem('pb_checkout_draft');
    if (!raw) return false;
    const d = JSON.parse(raw);
    const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
    set('f-name',     d.name);
    set('f-phone',    d.phone);
    set('f-email',    d.email);
    set('f-street',   d.street);
    set('f-suburb',   d.suburb);
    set('f-city',     d.city);
    set('f-postal',   d.postal);
    set('f-province', d.province);
    set('f-special',  d.special);
    if (d.method) selectDelivery(d.method, true);
    if (d.locker) {
      selectedLocker = d.locker;
      const display = document.getElementById('lockerSelectedDisplay');
      const nameEl  = document.getElementById('lockerSelectedName');
      const addrEl  = document.getElementById('lockerSelectedAddr');
      if (display) display.style.display = '';
      if (nameEl)  nameEl.textContent = d.locker.name    || '';
      if (addrEl)  addrEl.textContent = d.locker.address || '';
    }
    return true;
  } catch(e) { return false; }
}

/* -- Delivery method selection -------------------------------------------- */
function selectDelivery(method, silent) {
  deliveryMethod = method;

  const optDoor   = document.getElementById('opt-door');
  const optLocker = document.getElementById('opt-locker');
  const doorFields   = document.getElementById('door-fields');
  const lockerFields = document.getElementById('locker-fields');

  if (optDoor)   optDoor.classList.toggle('selected',   method === 'door');
  if (optLocker) optLocker.classList.toggle('selected', method === 'locker');
  if (doorFields)   doorFields.style.display   = method === 'door'   ? '' : 'none';
  if (lockerFields) lockerFields.style.display = method === 'locker' ? '' : 'none';

  const metaTitle = document.getElementById('deliveryMetaTitle');
  const metaText  = document.getElementById('deliveryMetaText');
  const methodLabel = document.getElementById('deliveryMethodLabel');

  if (method === 'door') {
    if (metaTitle) metaTitle.textContent = 'Door delivery selected';
    if (metaText)  metaText.textContent  = 'Enter your address and we will estimate a delivery window based on business days and local holidays.';
    if (methodLabel) methodLabel.textContent = '';
  } else {
    if (metaTitle) metaTitle.textContent = 'Pudo locker selected';
    if (metaText)  metaText.textContent  = 'Search for a locker near you and select it to confirm.';
    if (methodLabel) methodLabel.textContent = '';
  }

  if (!silent) renderDeliveryDate();
  renderSummary();
}

/* -- Delivery date estimate ----------------------------------------------- */
function renderDeliveryDate() {
  const now    = new Date();
  const hour   = now.getHours();
  const cutoff = 13; // 1 pm

  // Business days to add
  let add = deliveryMethod === 'locker' ? 2 : 3;
  if (hour >= cutoff) add += 1; // past cutoff, add extra day

  let d = new Date(now);
  let counted = 0;
  while (counted < add) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) counted++;
  }

  const opts   = { weekday: 'short', day: 'numeric', month: 'short' };
  const label  = d.toLocaleDateString('en-ZA', opts);
  const els    = ['deliveryDateText', 'deliveryDateText2'];
  els.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = 'Est. ' + label;
  });
}

/* -- Summary render ------------------------------------------------------- */
function renderSummary() {
  renderSummaryInto(
    document.getElementById('asideSummaryRows'),
    document.getElementById('asideTotals'),
    document.getElementById('asideItemCount')
  );
  renderSummaryInto(
    document.getElementById('mobileSummaryRows'),
    document.getElementById('mobileTotals'),
    null
  );

  const mobileTotalEl = document.getElementById('mobileSummaryTotal');
  if (mobileTotalEl) mobileTotalEl.textContent = 'R' + cartTotal().toFixed(2);

  const mobileLabel = document.getElementById('mobileSummaryLabel');
  if (mobileLabel) mobileLabel.textContent = cart.length + ' item' + (cart.length !== 1 ? 's' : '') + ' in order';
}

function renderSummaryInto(rowsEl, totalsEl, countEl) {
  if (!rowsEl) return;

  if (countEl) {
    countEl.textContent = cart.length + ' item' + (cart.length !== 1 ? 's' : '');
  }

  rowsEl.innerHTML = cart.map(item => {
    const qty   = Number(item.qty)   || 1;
    const price = Number(item.price) || 0;
    const img   = item.image || item.img || '';
    return `<div class="cart-item">
      <img src="${img}" alt="${item.name || ''}" width="60" height="60" loading="lazy" onerror="this.style.background='rgba(255,255,255,0.05)';this.src=''" />
      <div>
        <h4>${item.name || 'Product'}</h4>
        <div class="cart-meta">${item.variant ? item.variant + '<br>' : ''}Qty: ${qty}</div>
      </div>
      <div class="cart-price">R${(price * qty).toFixed(2)}</div>
    </div>`;
  }).join('');

  if (!totalsEl) return;
  const sub = cartSubtotal();
  const fee = deliveryFee();
  const tot = sub + fee;

  totalsEl.innerHTML = `
    <div class="co-total-row"><span>Subtotal</span><span>R${sub.toFixed(2)}</span></div>
    <div class="co-total-row"><span>Delivery (${deliveryMethod === 'locker' ? 'Pudo locker' : 'Door'})</span><span>R${fee.toFixed(2)}</span></div>
    <div class="co-total-row grand"><span>Total</span><span>R${tot.toFixed(2)}</span></div>
  `;
}

/* -- Review panel render -------------------------------------------------- */
function renderReview() {
  const panel = document.getElementById('reviewPanel');
  if (!panel) return;

  const name    = document.getElementById('f-name')?.value.trim()    || '';
  const phone   = document.getElementById('f-phone')?.value.trim()   || '';
  const email   = document.getElementById('f-email')?.value.trim()   || '';
  const special = document.getElementById('f-special')?.value.trim() || '';

  let deliveryHTML = '';
  if (deliveryMethod === 'door') {
    const street = document.getElementById('f-street')?.value.trim()   || '';
    const suburb = document.getElementById('f-suburb')?.value.trim()   || '';
    const city   = document.getElementById('f-city')?.value.trim()     || '';
    const postal = document.getElementById('f-postal')?.value.trim()   || '';
    const prov   = document.getElementById('f-province')?.value.trim() || '';
    deliveryHTML = `<p>${[street, suburb, city, prov, postal].filter(Boolean).join(', ')}</p>`;
    if (special) deliveryHTML += `<p style="margin-top:6px;font-size:.82rem;color:var(--text-muted);">${special}</p>`;
  } else if (selectedLocker) {
    deliveryHTML = `<p>${selectedLocker.name}</p><p style="font-size:.84rem;color:var(--text-muted);margin-top:4px;">${selectedLocker.address}</p>`;
  }

  const sub = cartSubtotal();
  const fee = deliveryFee();
  const tot = sub + fee;

  panel.innerHTML = `
    <div class="review-grid">
      <div class="done-block">
        <h4>Contact</h4>
        <p>${name}</p>
        <p>${phone}</p>
        <p>${email}</p>
      </div>
      <div class="done-block">
        <h4>${deliveryMethod === 'locker' ? 'Pudo locker' : 'Door delivery'}</h4>
        ${deliveryHTML}
      </div>
    </div>
    <div class="review-lines">
      <div class="review-line"><span>Subtotal</span><span>R${sub.toFixed(2)}</span></div>
      <div class="review-line"><span>Delivery</span><span>R${fee.toFixed(2)}</span></div>
      <div class="review-line" style="font-weight:800;color:var(--accent-strong);"><span>Total</span><span>R${tot.toFixed(2)}</span></div>
    </div>
  `;
}

/* -- Yoco ----------------------------------------------------------------- */
function initYoco() {
  if (yocoCard) return; // already mounted
  try {
    yocoSDK  = new window.YocoSDK({ publicKey: 'pk_live_bed4c9d0cVWtkj9h8d7e' });
    yocoCard = yocoSDK.card();
    yocoCard.mount('#yoco-card-frame');
  } catch(e) {
    console.error('Yoco init error:', e);
  }
}

function submitPayment() {
  const btn = document.getElementById('payBtn');
  if (btn) btn.disabled = true;

  const alertEl = document.getElementById('payAlert');
  if (alertEl) { alertEl.classList.remove('show'); alertEl.textContent = ''; }

  if (!yocoCard) {
    showPayAlert('Payment form not ready. Please refresh and try again.');
    if (btn) btn.disabled = false;
    return;
  }

  const total = Math.round(cartTotal() * 100); // in cents

  yocoCard.createToken(function(result) {
    if (result.error) {
      showPayAlert(result.error.message || 'Card error. Please try again.');
      if (btn) btn.disabled = false;
      return;
    }
    submitOrder(result.id, total);
  });
}

function showPayAlert(msg) {
  const el = document.getElementById('payAlert');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
}

/* -- Submit order to Supabase --------------------------------------------- */
async function submitOrder(tokenId, amountCents) {
  showLoading('Processing payment', 'Please wait while we securely process your payment\u2026');

  const name    = document.getElementById('f-name')?.value.trim()    || '';
  const phone   = document.getElementById('f-phone')?.value.trim()   || '';
  const email   = document.getElementById('f-email')?.value.trim()   || '';
  const special = document.getElementById('f-special')?.value.trim() || '';

  const address = deliveryMethod === 'door' ? {
    street:   document.getElementById('f-street')?.value.trim()   || '',
    suburb:   document.getElementById('f-suburb')?.value.trim()   || '',
    city:     document.getElementById('f-city')?.value.trim()     || '',
    postal:   document.getElementById('f-postal')?.value.trim()   || '',
    province: document.getElementById('f-province')?.value.trim() || '',
    special,
  } : {
    locker_id:      selectedLocker?.id      || '',
    locker_name:    selectedLocker?.name    || '',
    locker_address: selectedLocker?.address || '',
  };

  const body = {
    token:          tokenId,
    amount_cents:   amountCents,
    currency:       'ZAR',
    customer: { name, phone, email },
    delivery_method: deliveryMethod,
    delivery_address: address,
    items: cart,
  };

  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey:         SUPABASE_ANON,
        Authorization:  `Bearer ${SUPABASE_ANON}`,
      },
      body: JSON.stringify(body),
    });

    const data = await resp.json();

    hideLoading();

    if (data.redirect_url) {
      sessionStorage.removeItem('pb_checkout_draft');
      window.location.href = data.redirect_url;
      return;
    }

    if (data.success) {
      sessionStorage.removeItem('pb_checkout_draft');
      window.location.href = 'order-success.html?ref=' + encodeURIComponent(data.order_id || '');
      return;
    }

    showPayAlert(data.error || data.message || 'Payment failed. Please try again.');
    const btn = document.getElementById('payBtn');
    if (btn) btn.disabled = false;

  } catch(err) {
    hideLoading();
    showPayAlert('Network error. Please check your connection and try again.');
    const btn = document.getElementById('payBtn');
    if (btn) btn.disabled = false;
    console.error('submitOrder error:', err);
  }
}

/* -- Loading overlay ------------------------------------------------------ */
function showLoading(title, text) {
  const overlay = document.getElementById('loadingOverlay');
  const t = document.getElementById('loadingTitle');
  const p = document.getElementById('loadingText');
  if (t) t.textContent = title || 'Loading';
  if (p) p.textContent = text  || '';
  if (overlay) overlay.classList.add('show');
}

function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.remove('show');
}

/* -- Toast ---------------------------------------------------------------- */
function showToast(msg, duration) {
  const el = document.getElementById('coToast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration || 3000);
}

/* -- Mobile summary toggle ----------------------------------------------- */
function toggleMobileSummary() {
  const body    = document.getElementById('mobileSummaryBody');
  const chevron = document.getElementById('mobileSummaryChevron');
  const btn     = document.querySelector('.mobile-summary-toggle');
  if (!body) return;
  const isOpen = body.classList.toggle('open');
  if (chevron) chevron.style.transform = isOpen ? 'rotate(180deg)' : '';
  if (btn) btn.setAttribute('aria-expanded', isOpen);
}

/* -- Exit-intent nudge ---------------------------------------------------- */
function dismissNudge() {
  const el = document.getElementById('exitNudge');
  if (el) el.classList.remove('show');
}

document.addEventListener('mouseleave', function(e) {
  if (e.clientY < 20 && currentStep === 3) {
    const el = document.getElementById('exitNudge');
    if (el) el.classList.add('show');
  }
});

/* -- Google Places autocomplete callback ---------------------------------- */
window.initPlaces = async function() {
  const streetInput = document.getElementById('f-street');
  if (!streetInput || typeof google === 'undefined') return;

  const { Autocomplete } = await google.maps.importLibrary('places');
  const ac = new Autocomplete(streetInput, {
    componentRestrictions: { country: 'za' },
    fields: ['address_components'],
    types: ['address'],
  });

  const hint = document.getElementById('placesHint');
  if (hint) hint.style.display = '';

  ac.addListener('place_changed', function() {
    const place = ac.getPlace();
    if (!place.address_components) return;

    const get = (types) => {
      const comp = place.address_components.find(c => types.some(t => c.types.includes(t)));
      return comp ? comp.long_name : '';
    };

    const streetNum  = get(['street_number']);
    const route      = get(['route']);
    const suburb     = get(['sublocality', 'sublocality_level_1', 'neighborhood']);
    const city       = get(['locality', 'administrative_area_level_2']);
    const province   = get(['administrative_area_level_1']);
    const postalCode = get(['postal_code']);

    const streetEl  = document.getElementById('f-street');
    const suburbEl  = document.getElementById('f-suburb');
    const cityEl    = document.getElementById('f-city');
    const provinceEl= document.getElementById('f-province');
    const postalEl  = document.getElementById('f-postal');

    if (streetEl)   streetEl.value   = [streetNum, route].filter(Boolean).join(' ');
    if (suburbEl)   suburbEl.value   = suburb;
    if (cityEl)     cityEl.value     = city;
    if (provinceEl) provinceEl.value = province;
    if (postalEl)   postalEl.value   = postalCode;

    // Also try to wire Places for locker search
    const lockerInput = document.getElementById('f-locker-search');
    if (lockerInput && typeof Autocomplete !== 'undefined') {
      const lacHint = document.getElementById('lockerPlacesHint');
      if (lacHint) lacHint.style.display = 'flex';
      const lac = new Autocomplete(lockerInput, {
        componentRestrictions: { country: 'za' },
        fields: ['geometry', 'formatted_address'],
        types: ['geocode'],
      });
      lac.addListener('place_changed', function() {
        const p = lac.getPlace();
        if (p.geometry) {
          window.lockerSearchLat = p.geometry.location.lat();
          window.lockerSearchLng = p.geometry.location.lng();
          searchLockers();
        }
      });
    }
  });
};

/* -- Locker search -------------------------------------------------------- */
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
      notice.className = 'locker-size-notice locker-size-notice--filtered';
      notice.textContent = 'This locker supports a ' + boxSize + ' box. Your order will be packed to fit.';
      notice.style.display = '';
    } else {
      notice.className = 'locker-size-notice';
      notice.textContent = 'Box size for this locker is unconfirmed. We will contact you if there is a sizing issue.';
      notice.style.display = '';
    }
  }

  renderSummary();
}

/* -- DOMContentLoaded ----------------------------------------------------- */
document.addEventListener('DOMContentLoaded', function() {
  loadCart();

  const layout     = document.getElementById('coLayout');
  const emptyState = document.getElementById('emptyState');

  if (!cart.length) {
    if (layout)     layout.style.display     = 'none';
    if (emptyState) emptyState.classList.add('show');
    return;
  }

  if (layout)     layout.style.display     = '';
  if (emptyState) emptyState.classList.remove('show');

  // Restore draft
  const restored = restoreDraft();
  if (restored) showToast('Your details have been restored.');

  renderDeliveryDate();
  renderSummary();

  // Wire Step 1 inputs — clear errors on input
  ['f-name','f-phone','f-email'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', function() {
      const fieldId = 'field-' + id.replace('f-','');
      const errId   = 'err-'   + id.replace('f-','');
      setFieldError(fieldId, errId, false, '');
    });
  });

  // Wire Step 2 door inputs
  ['street','suburb','city','postal','province'].forEach(k => {
    const el = document.getElementById('f-' + k);
    if (!el) return;
    el.addEventListener('input', function() {
      setFieldError('field-' + k, 'err-' + k, false, '');
    });
  });

  // Locker search keyup
  const lockerSearchInput = document.getElementById('f-locker-search');
  if (lockerSearchInput) {
    lockerSearchInput.addEventListener('keyup', function(e) {
      if (e.key === 'Enter') { searchLockers(); return; }
      clearTimeout(_lockerSearchTimer);
      _lockerSearchTimer = setTimeout(searchLockers, 500);
    });
  }
});
