/* ============================================================
   PhenomeBeauty — checkout.js
   Cache-bust v5 — live Pudo shipping quote replaces hardcoded fees.
   ============================================================ */

/* -- Constants ------------------------------------------------------------ */
const SUPABASE_URL  = 'https://papdxjcfimeyjgzmatpl.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcGR4amNmaW1leWpnem1hdHBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMDk4NjcsImV4cCI6MjA5MjY4NTg2N30.mn_JsORuYUBtHTqIF2RjY8YUJzY9zJQV0uGFXBvrJRc';

/* Fallback prices shown while the live quote is loading or if the API fails */
const FALLBACK_DOOR_PRICE   = 99;
const FALLBACK_LOCKER_PRICE = 59;

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

/* Live shipping quote state */
let shippingQuote        = null;   // { box, locker_fee, door_fee, total_weight_kg, ... }
let shippingQuoteLoading = false;
let shippingQuoteError   = null;

/* -- Delivery pricing ----------------------------------------------------- */

/**
 * Returns the delivery fee to charge for the currently selected method.
 * Uses the live Pudo quote when available, otherwise falls back to the
 * hardcoded constants so the UI is never blank.
 */
function deliveryFee() {
  if (shippingQuote) {
    const fee = deliveryMethod === 'locker'
      ? Number(shippingQuote.locker_fee)
      : Number(shippingQuote.door_fee);
    if (Number.isFinite(fee) && fee > 0) return fee;
  }
  return deliveryMethod === 'locker' ? FALLBACK_LOCKER_PRICE : FALLBACK_DOOR_PRICE;
}

/**
 * Calls the get-shipping-quote edge function with the current cart items.
 * Updates shippingQuote and re-renders the summary and delivery option cards
 * once the response arrives.
 */
async function loadShippingQuote() {
  if (!cart.length) return;

  shippingQuoteLoading = true;
  shippingQuoteError   = null;
  shippingQuote        = null;

  // Show "Calculating..." immediately so the user knows something is happening
  renderSummary();
  renderDeliveryOptions();

  try {
    const resp = await fetch(
      `${SUPABASE_URL}/functions/v1/get-shipping-quote`,
      {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        SUPABASE_ANON,
          'Authorization': `Bearer ${SUPABASE_ANON}`,
        },
        body: JSON.stringify({
          items: cart.map(i => ({
            productId: i.productId || i.id || '',
            qty:       Number(i.qty) || 1,
          })),
        }),
      }
    );

    const data = await resp.json();

    if (!resp.ok || data.error) {
      shippingQuoteError = data.error || 'Could not retrieve delivery rates.';
      console.warn('[checkout] Shipping quote error:', shippingQuoteError);
    } else {
      shippingQuote = data;
      console.log('[checkout] Shipping quote received:', data);
    }
  } catch (e) {
    shippingQuoteError = 'Network error fetching delivery rates.';
    console.warn('[checkout] Shipping quote fetch failed:', e);
  } finally {
    shippingQuoteLoading = false;
    renderSummary();
    renderDeliveryOptions();
  }
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

/* -- Delivery options render ---------------------------------------------- */

/**
 * Renders the two delivery option cards (door / locker).
 * While the quote is loading, prices show "Calculating...".
 * If the quote failed, prices fall back to the hardcoded constants.
 */
function renderDeliveryOptions() {
  const container = document.getElementById('deliveryOptions');
  if (!container) return;

  const doorLabel   = shippingQuoteLoading
    ? 'Calculating...'
    : `R${deliveryMethod === 'door'
        ? deliveryFee().toFixed(2)
        : (shippingQuote ? Number(shippingQuote.door_fee).toFixed(2) : FALLBACK_DOOR_PRICE.toFixed(2))}`;

  const lockerLabel = shippingQuoteLoading
    ? 'Calculating...'
    : `R${deliveryMethod === 'locker'
        ? deliveryFee().toFixed(2)
        : (shippingQuote ? Number(shippingQuote.locker_fee).toFixed(2) : FALLBACK_LOCKER_PRICE.toFixed(2))}`;

  container.innerHTML = `
    <div class="delivery-card ${deliveryMethod === 'door' ? 'selected' : ''}" id="opt-door" onclick="selectDelivery('door')">
      <div class="delivery-chip"></div>
      <h3>Door delivery</h3>
      <p>We deliver straight to your door anywhere in South Africa.</p>
      <div class="delivery-price">${doorLabel}</div>
    </div>
    <div class="delivery-card ${deliveryMethod === 'locker' ? 'selected' : ''}" id="opt-locker" onclick="selectDelivery('locker')">
      <div class="delivery-chip"></div>
      <h3>Pudo locker</h3>
      <p>Collect at a Pudo locker near you at a time that suits you.</p>
      <div class="delivery-price">${lockerLabel}</div>
    </div>
  `;

  // Show the meta bar and set initial state
  const meta = document.getElementById('deliveryMeta');
  if (meta) meta.style.display = '';

  // Show correct fields based on current method
  const doorFields   = document.getElementById('door-fields');
  const lockerFields = document.getElementById('locker-fields');
  if (doorFields)   doorFields.style.display   = deliveryMethod === 'door'   ? '' : 'none';
  if (lockerFields) lockerFields.style.display = deliveryMethod === 'locker' ? '' : 'none';
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
    if (methodLabel) methodLabel.textContent = 'Pudo locker';
  }

  renderSummary();
}

/* -- Cart summary render -------------------------------------------------- */
function renderSummary() {
  const subtotalEl  = document.getElementById('sum-subtotal');
  const deliveryEl  = document.getElementById('sum-delivery');
  const totalEl     = document.getElementById('sum-total');
  const itemsEl     = document.getElementById('sum-items');

  const sub = cartSubtotal();
  const fee = deliveryFee();
  const tot = sub + fee;

  if (subtotalEl) subtotalEl.textContent = `R${sub.toFixed(2)}`;
  if (deliveryEl) deliveryEl.textContent = shippingQuoteLoading ? 'Calculating...' : `R${fee.toFixed(2)}`;
  if (totalEl)    totalEl.textContent    = shippingQuoteLoading ? 'Calculating...' : `R${tot.toFixed(2)}`;

  if (itemsEl) {
    itemsEl.innerHTML = cart.map(item => {
      const price = (Number(item.price) || 0) * (Number(item.qty) || 1);
      return `
        <div class="sum-item">
          <img src="${item.image || ''}" alt="${item.name || ''}" onerror="this.style.display='none'">
          <div class="sum-item-info">
            <span>${item.name || 'Product'}</span>
            ${item.qty > 1 ? `<span class="sum-qty">x${item.qty}</span>` : ''}
          </div>
          <span class="sum-item-price">R${price.toFixed(2)}</span>
        </div>
      `;
    }).join('');
  }
}

/* -- Delivery date estimate ----------------------------------------------- */
function renderDeliveryDate() {
  const el = document.getElementById('deliveryDateEstimate');
  if (!el) return;

  // Simple business day estimate: 3-5 days from today, skipping weekends
  const today = new Date();
  let added = 0;
  let date = new Date(today);
  while (added < 3) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) added++;
  }
  const earliest = new Date(date);
  while (added < 5) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) added++;
  }
  const latest = new Date(date);

  const fmt = d => d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
  el.textContent = `Estimated delivery: ${fmt(earliest)} - ${fmt(latest)}`;
}

/* -- Review panel render -------------------------------------------------- */
function renderReview() {
  const name  = document.getElementById('f-name')?.value    || '';
  const phone = document.getElementById('f-phone')?.value   || '';
  const email = document.getElementById('f-email')?.value   || '';

  const rName  = document.getElementById('r-name');
  const rPhone = document.getElementById('r-phone');
  const rEmail = document.getElementById('r-email');

  if (rName)  rName.textContent  = name;
  if (rPhone) rPhone.textContent = phone;
  if (rEmail) rEmail.textContent = email;

  const rDelivery = document.getElementById('r-delivery');
  if (rDelivery) {
    let deliveryHTML = '';
    if (deliveryMethod === 'door') {
      const street   = document.getElementById('f-street')?.value   || '';
      const suburb   = document.getElementById('f-suburb')?.value   || '';
      const city     = document.getElementById('f-city')?.value     || '';
      const postal   = document.getElementById('f-postal')?.value   || '';
      const province = document.getElementById('f-province')?.value || '';
      deliveryHTML = `<p>${street}</p><p>${suburb}, ${city}, ${postal}</p><p>${province}</p>`;
    } else {
      deliveryHTML = `<p>${selectedLocker.name}</p><p style="font-size:.84rem;color:var(--text-muted);margin-top:4px;">${selectedLocker.address}</p>`;
    }
    rDelivery.innerHTML = deliveryHTML;
  }

  const rSpecial = document.getElementById('r-special');
  const special  = document.getElementById('f-special')?.value || '';
  if (rSpecial) rSpecial.textContent = special || 'None';

  const rSubtotal    = document.getElementById('r-subtotal');
  const rDeliveryFee = document.getElementById('r-delivery-fee');
  const rTotal       = document.getElementById('r-total');
  const rYocoTotal   = document.getElementById('yoco-amount-display');

  const sub = cartSubtotal();
  const fee = deliveryFee();
  const tot = sub + fee;

  if (rSubtotal)    rSubtotal.textContent    = `R${sub.toFixed(2)}`;
  if (rDeliveryFee) rDeliveryFee.textContent = `R${fee.toFixed(2)}`;
  if (rTotal)       rTotal.textContent       = `R${tot.toFixed(2)}`;
  if (rYocoTotal)   rYocoTotal.textContent   = `R${tot.toFixed(2)}`;
}

/* -- Yoco payment init ---------------------------------------------------- */
async function initYoco() {
  try {
    if (!window.YocoSDK) {
      console.warn('Yoco SDK not loaded');
      return;
    }
    if (yocoSDK && yocoCard) return; // already initialised

    yocoSDK = new window.YocoSDK({ publicKey: 'pk_live_0c4e5cd8PJGgxIlxfcb6c4e1' });
    yocoCard = yocoSDK.inline({
      layout: 'field',
      showErrors: true,
    });

    const mountEl = document.getElementById('yoco-card-frame');
    if (mountEl && mountEl.children.length === 0) {
      yocoCard.mount('#yoco-card-frame');
    }
  } catch(e) {
    console.error('Yoco init error:', e);
  }
}

/* -- Payment submission --------------------------------------------------- */
async function submitPayment() {
  const btn = document.getElementById('payBtn');
  const errEl = document.getElementById('payment-error');
  if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }
  if (errEl) errEl.style.display = 'none';

  try {
    if (!yocoCard) throw new Error('Card not ready. Please refresh.');

    const sub = cartSubtotal();
    const fee = deliveryFee();
    const tot = sub + fee;
    const amountCents = Math.round(tot * 100);

    // Create Yoco token
    const result = await yocoCard.createToken();
    if (result.error) throw new Error(result.error.message || 'Card error');
    const token = result.id;

    // Gather order data
    const name  = document.getElementById('f-name')?.value.trim()  || '';
    const phone = document.getElementById('f-phone')?.value.trim() || '';
    const email = document.getElementById('f-email')?.value.trim() || '';

    const address = deliveryMethod === 'door' ? {
      street:   document.getElementById('f-street')?.value.trim()   || '',
      suburb:   document.getElementById('f-suburb')?.value.trim()   || '',
      city:     document.getElementById('f-city')?.value.trim()     || '',
      postal:   document.getElementById('f-postal')?.value.trim()   || '',
      province: document.getElementById('f-province')?.value.trim() || '',
    } : null;

    const special = document.getElementById('f-special')?.value.trim() || '';

    const orderPayload = {
      token,
      amount_cents: amountCents,
      customer: { name, phone, email },
      delivery_method: deliveryMethod,
      delivery_address: address,
      delivery_fee: fee,
      locker_id:      selectedLocker?.id      || '',
      locker_name:    selectedLocker?.name    || '',
      locker_address: selectedLocker?.address || '',
      special_instructions: special,
      cart: cart.map(item => ({
        id:    item.id    || '',
        name:  item.name  || '',
        price: item.price || 0,
        qty:   item.qty   || 1,
        image: item.image || '',
      })),
    };

    const resp = await fetch(
      `${SUPABASE_URL}/functions/v1/create-order`,
      {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        SUPABASE_ANON,
          'Authorization': `Bearer ${SUPABASE_ANON}`,
        },
        body: JSON.stringify(orderPayload),
      }
    );

    const data = await resp.json();
    if (!resp.ok || data.error) throw new Error(data.error || data.message || 'Payment failed');

    // Clear cart
    localStorage.removeItem('pb_cart');
    sessionStorage.removeItem('pb_cart');
    sessionStorage.removeItem('pb_checkout_draft');

    // Redirect to success
    const orderRef = data.order_ref || data.id || '';
    window.location.href = `shop-success.html?ref=${encodeURIComponent(orderRef)}&email=${encodeURIComponent(email)}`;

  } catch(e) {
    if (errEl) {
      errEl.textContent = e.message || 'Something went wrong. Please try again.';
      errEl.style.display = '';
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Pay now'; }
  }
}

/* -- DOMContentLoaded ----------------------------------------------------- */
document.addEventListener('DOMContentLoaded', function() {
  loadCart();

  if (!cart.length) {
    // Empty cart — redirect back to shop
    window.location.href = 'shop.html';
    return;
  }

  renderDeliveryOptions();
  renderSummary();
  renderDeliveryDate();
  restoreDraft();

  // Kick off the live shipping quote as soon as the page loads
  loadShippingQuote();

  // Clear field errors on input
  document.querySelectorAll('input, select, textarea').forEach(el => {
    el.addEventListener('input', () => {
      const fieldWrap = el.closest('[id^="field-"]');
      if (fieldWrap) {
        fieldWrap.classList.remove('error');
        const errId = fieldWrap.id.replace('field-', 'err-');
        const err = document.getElementById(errId);
        if (err) err.classList.remove('show');
      }
    });
  });
});

/* -- Google Places autocomplete callback ---------------------------------- */
window.initPlaces = async function() {
  if (typeof google === 'undefined') return;

  const { Autocomplete } = await google.maps.importLibrary('places');

  // Street address autocomplete (door delivery)
  const streetInput = document.getElementById('f-street');
  if (streetInput) {
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

      const streetEl   = document.getElementById('f-street');
      const suburbEl   = document.getElementById('f-suburb');
      const cityEl     = document.getElementById('f-city');
      const provinceEl = document.getElementById('f-province');
      const postalEl   = document.getElementById('f-postal');

      if (streetEl)   streetEl.value   = [streetNum, route].filter(Boolean).join(' ');
      if (suburbEl)   suburbEl.value   = suburb;
      if (cityEl)     cityEl.value     = city;
      if (provinceEl) provinceEl.value = province;
      if (postalEl)   postalEl.value   = postalCode;
    });
  }

  // Locker search autocomplete — initialised independently so it works
  // even when the user goes straight to locker delivery without visiting
  // the door-delivery fields first.
  const lockerInput = document.getElementById('f-locker-search');
  if (lockerInput) {
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
      const sizeUnknown = !boxSize;
      const addrJ   = JSON.stringify(address);
      const nameJ   = JSON.stringify(name);
      return `
        <div class="locker-item" onclick="selectLocker('${id}', ${nameJ}, ${addrJ}, '${boxSize}', ${sizeUnknown})">
          <div class="locker-item-info">
            <strong>${name}</strong>
            <p>${address}</p>
          </div>
          ${boxSize ? `<span class="locker-size-badge">${boxSize}</span>` : ''}
        </div>
      `;
    }).join('');

    // Reset coords after search so next text search works
    lockerSearchLat = null;
    lockerSearchLng = null;
    window.lockerSearchLat = null;
    window.lockerSearchLng = null;

  } catch(e) {
    list.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:.82rem;">Search failed. Please try again.</div>';
  }
}

function selectLocker(id, name, address, boxSize, sizeUnknown) {
  selectedLocker = { id, name, address, boxSize, sizeUnknown };

  const display = document.getElementById('lockerSelectedDisplay');
  const nameEl  = document.getElementById('lockerSelectedName');
  const addrEl  = document.getElementById('lockerSelectedAddr');
  const errEl   = document.getElementById('err-locker');

  if (display) display.style.display = '';
  if (nameEl)  nameEl.textContent = name;
  if (addrEl)  addrEl.textContent = address;
  if (errEl)   errEl.classList.remove('show');

  // Clear locker list
  const list = document.getElementById('lockerResults');
  if (list) list.innerHTML = '';
}
