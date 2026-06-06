/* ============================================================
   PhenomeBeauty — checkout.js
   Cache-bust v9 — create-order + yoco-shop-checkout two-step pay.
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

/* Locker search results — stored here so cards only pass an index to onclick */
let _lockerResults = [];

/* Live shipping quote state */
let shippingQuote        = null;
let shippingQuoteLoading = false;
let shippingQuoteError   = null;

/* Maps lazy-load guard */
let _mapsLoaded = false;

/* -- Google Maps lazy loader --------------------------------------------- */
async function loadMapsIfNeeded() {
  if (_mapsLoaded) return;
  _mapsLoaded = true;
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/functions/v1/get-places-key`,
      {
        headers: {
          'apikey':        SUPABASE_ANON,
          'Authorization': `Bearer ${SUPABASE_ANON}`,
        }
      }
    );
    const data = await resp.json();
    if (!data.key) throw new Error('No key returned');
    const s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + data.key + '&libraries=places&loading=async&callback=initPlaces';
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  } catch(e) {
    console.warn('[checkout] Could not load Maps API:', e);
    _mapsLoaded = false;
  }
}

/* -- Delivery pricing ----------------------------------------------------- */
function deliveryFee() {
  if (shippingQuote) {
    const fee = deliveryMethod === 'locker'
      ? Number(shippingQuote.locker_fee)
      : Number(shippingQuote.door_fee);
    if (Number.isFinite(fee) && fee > 0) return fee;
  }
  return deliveryMethod === 'locker' ? FALLBACK_LOCKER_PRICE : FALLBACK_DOOR_PRICE;
}

async function loadShippingQuote() {
  if (!cart.length) return;

  shippingQuoteLoading = true;
  shippingQuoteError   = null;
  shippingQuote        = null;

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
  if (n === 2) loadMapsIfNeeded();
  if (n === 2 && !validateStep1()) return;
  if (n === 3 && !validateStep2()) return;

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

  if (n === 2) {
    renderDeliveryOptions();
  }

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
function renderDeliveryOptions() {
  const doorSpan   = document.getElementById('door-price-display');
  const lockerSpan = document.getElementById('locker-price-display');

  if (shippingQuoteLoading) {
    if (doorSpan)   doorSpan.textContent   = 'Calculating...';
    if (lockerSpan) lockerSpan.textContent = 'Calculating...';
  } else {
    const doorPrice   = shippingQuote ? Number(shippingQuote.door_fee)   : FALLBACK_DOOR_PRICE;
    const lockerPrice = shippingQuote ? Number(shippingQuote.locker_fee) : FALLBACK_LOCKER_PRICE;
    if (doorSpan)   doorSpan.textContent   = `R${doorPrice.toFixed(2)}`;
    if (lockerSpan) lockerSpan.textContent = `R${lockerPrice.toFixed(2)}`;
  }

  const doorFields   = document.getElementById('door-fields');
  const lockerFields = document.getElementById('locker-fields');
  if (doorFields)   doorFields.style.display   = deliveryMethod === 'door'   ? '' : 'none';
  if (lockerFields) lockerFields.style.display = deliveryMethod === 'locker' ? '' : 'none';
}

/* -- Delivery method selection -------------------------------------------- */
function selectDelivery(method, silent) {
  deliveryMethod = method;

  const optDoor      = document.getElementById('opt-door');
  const optLocker    = document.getElementById('opt-locker');
  const doorFields   = document.getElementById('door-fields');
  const lockerFields = document.getElementById('locker-fields');

  if (optDoor)      optDoor.classList.toggle('selected',   method === 'door');
  if (optLocker)    optLocker.classList.toggle('selected', method === 'locker');
  if (doorFields)   doorFields.style.display   = method === 'door'   ? '' : 'none';
  if (lockerFields) lockerFields.style.display = method === 'locker' ? '' : 'none';

  const metaTitle   = document.getElementById('deliveryMetaTitle');
  const metaText    = document.getElementById('deliveryMetaText');
  const methodLabel = document.getElementById('deliveryMethodLabel');

  if (method === 'door') {
    if (metaTitle)   metaTitle.textContent   = 'Door delivery selected';
    if (metaText)    metaText.textContent    = 'Enter your address and we will estimate a delivery window based on business days and local holidays.';
    if (methodLabel) methodLabel.textContent = '';
  } else {
    if (metaTitle)   metaTitle.textContent   = 'Pudo locker selected';
    if (metaText)    metaText.textContent    = 'Search for a locker near you and select it to confirm.';
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

  const rvSubtotal  = document.getElementById('rv-subtotal');
  const rvDelivery  = document.getElementById('rv-delivery');
  const rvTotal     = document.getElementById('rv-total');
  const payBtnTotal = document.getElementById('payBtnTotal');
  if (rvSubtotal)  rvSubtotal.textContent  = `R${sub.toFixed(2)}`;
  if (rvDelivery)  rvDelivery.textContent  = shippingQuoteLoading ? 'Calculating...' : `R${fee.toFixed(2)}`;
  if (rvTotal)     rvTotal.textContent     = shippingQuoteLoading ? 'Calculating...' : `R${tot.toFixed(2)}`;
  if (payBtnTotal) payBtnTotal.textContent = tot.toFixed(2);

  const msTotalDisplay = document.getElementById('msTotalDisplay');
  if (msTotalDisplay) msTotalDisplay.textContent = shippingQuoteLoading ? 'Calculating...' : `R${tot.toFixed(2)}`;
}

/* -- Delivery date estimate ----------------------------------------------- */
function renderDeliveryDate() {
  const targets = [
    document.getElementById('deliveryDateText2'),
    document.getElementById('deliveryDateEstimate'),
  ];

  const today = new Date();
  let added = 0;
  let date  = new Date(today);
  while (added < 3) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) added++;
  }
  const earliest = new Date(date);
  while (added < 5) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) added++;
  }
  const latest = date;

  const fmt = d => d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
  const text = `${fmt(earliest)} - ${fmt(latest)}`;

  targets.forEach(el => { if (el) el.textContent = text; });

  const rvDate = document.getElementById('rv-delivery-date');
  if (rvDate) rvDate.textContent = text;
}

/* -- Review panel render -------------------------------------------------- */
function renderReview() {
  const name  = document.getElementById('f-name')?.value  || '';
  const phone = document.getElementById('f-phone')?.value || '';
  const email = document.getElementById('f-email')?.value || '';

  const doneContact = document.getElementById('done-contact-val');
  if (doneContact) doneContact.textContent = [name, phone, email].filter(Boolean).join(' | ');

  const doneContact2 = document.getElementById('done-contact-val-2');
  if (doneContact2) doneContact2.textContent = email;

  let deliveryText = '';
  if (deliveryMethod === 'door') {
    const street   = document.getElementById('f-street')?.value   || '';
    const suburb   = document.getElementById('f-suburb')?.value   || '';
    const city     = document.getElementById('f-city')?.value     || '';
    const postal   = document.getElementById('f-postal')?.value   || '';
    const province = document.getElementById('f-province')?.value || '';
    deliveryText = [street, suburb, city, postal, province].filter(Boolean).join(', ');
  } else if (selectedLocker) {
    deliveryText = `${selectedLocker.name} -- ${selectedLocker.address}`;
  }

  const doneDelivery = document.getElementById('done-delivery-val');
  if (doneDelivery) doneDelivery.textContent = deliveryText;

  const rvDeliveryLabel = document.getElementById('rv-delivery-label');
  if (rvDeliveryLabel) rvDeliveryLabel.textContent = deliveryMethod === 'locker' ? 'Pudo locker' : 'Door delivery';

  const giftMsg   = document.getElementById('f-gift-message')?.value || '';
  const giftBlock = document.getElementById('giftReviewBlock');
  const giftBody  = document.getElementById('giftReviewBody');
  if (giftBlock) giftBlock.style.display = giftMsg ? '' : 'none';
  if (giftBody)  giftBody.textContent    = giftMsg;

  renderSummary();
}

/* -- Sidebar / mobile summary render ------------------------------------- */
function renderSidebarItems() {
  const summaryItems   = document.getElementById('summaryItems');
  const summaryTotals  = document.getElementById('summaryTotals');
  const itemCountLabel = document.getElementById('itemCountLabel');
  const mobileItems    = document.getElementById('mobileItems');
  const mobileTotals   = document.getElementById('mobileTotals');

  const sub = cartSubtotal();
  const fee = deliveryFee();
  const tot = sub + fee;

  const itemsHTML = cart.map(item => {
    const price = (Number(item.price) || 0) * (Number(item.qty) || 1);
    return `
      <div class="cart-item">
        <img src="${item.image || ''}" alt="${item.name || ''}" onerror="this.style.display='none'" />
        <div>
          <h4>${item.name || 'Product'}</h4>
          <div class="cart-meta">${item.qty > 1 ? `Qty: ${item.qty}` : ''}</div>
        </div>
        <div class="cart-price">R${price.toFixed(2)}</div>
      </div>
    `;
  }).join('');

  const totalsHTML = `
    <div class="total-row"><span>Subtotal</span><span>R${sub.toFixed(2)}</span></div>
    <div class="total-row"><span>Delivery</span><span>${shippingQuoteLoading ? 'Calculating...' : `R${fee.toFixed(2)}`}</span></div>
    <div class="total-row grand"><span>Total</span><span>${shippingQuoteLoading ? 'Calculating...' : `R${tot.toFixed(2)}`}</span></div>
  `;

  if (summaryItems)  summaryItems.innerHTML  = itemsHTML;
  if (summaryTotals) summaryTotals.innerHTML = totalsHTML;
  if (mobileItems)   mobileItems.innerHTML   = itemsHTML;
  if (mobileTotals)  mobileTotals.innerHTML  = totalsHTML;
  if (itemCountLabel) {
    const n = cart.reduce((s, i) => s + (Number(i.qty) || 1), 0);
    itemCountLabel.textContent = `${n} item${n === 1 ? '' : 's'} in your cart`;
  }
}

function toggleMobileSummary() {
  const body    = document.getElementById('mobileSummaryBody');
  const chevron = document.getElementById('msChevron');
  if (!body) return;
  const open = body.classList.toggle('open');
  if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : '';
}

/* -- Gift toggle ---------------------------------------------------------- */
function toggleGift() {
  const reveal   = document.getElementById('giftReveal');
  const checkbox = document.getElementById('f-is-gift');
  const switches = document.querySelectorAll('#giftToggleRow .switch');
  if (!reveal) return;

  const isOpen = reveal.classList.toggle('open');
  if (checkbox) checkbox.checked = isOpen;
  switches.forEach(sw => sw.classList.toggle('on', isOpen));
  reveal.style.maxHeight = isOpen ? reveal.scrollHeight + 'px' : '0';
}

/* -- Exit nudge ----------------------------------------------------------- */
function dismissNudge() {
  const nudge = document.getElementById('exitNudge');
  if (nudge) nudge.classList.remove('show');
}

/* -- Yoco payment init ---------------------------------------------------- */
async function initYoco() {
  try {
    if (!window.YocoSDK) {
      console.warn('Yoco SDK not loaded');
      return;
    }
    if (yocoSDK && yocoCard) return;

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

/* -- Payment handler ------------------------------------------------------ */
async function handlePay() {
  const btn      = document.getElementById('payBtn');
  const alertEl  = document.getElementById('alert-3');

  if (btn)     { btn.disabled = true; }
  if (alertEl) { alertEl.classList.remove('show'); }

  try {
    const sub = cartSubtotal();
    const fee = deliveryFee();
    const tot = sub + fee;

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
    const giftMsg = document.getElementById('f-gift-message')?.value.trim() || '';
    const isGift  = !!document.getElementById('f-is-gift')?.checked;

    const orderPayload = {
      amount_cents:         Math.round(tot * 100),
      customer:             { name, phone, email },
      delivery_method:      deliveryMethod,
      delivery_address:     address,
      delivery_fee:         fee,
      locker_id:            selectedLocker?.id      || '',
      locker_name:          selectedLocker?.name    || '',
      locker_address:       selectedLocker?.address || '',
      special_instructions: special,
      is_gift:              isGift,
      gift_message:         giftMsg || null,
      cart: cart.map(item => ({
        id:    item.id    || '',
        name:  item.name  || '',
        price: item.price || 0,
        qty:   item.qty   || 1,
        image: item.image || '',
      })),
    };

    /* ── Step 1: create the order row ── */
    const orderResp = await fetch(
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

    const orderData = await orderResp.json();
    if (!orderResp.ok || orderData.error) throw new Error(orderData.error || 'Could not create order.');

    const orderId = orderData.order_id;

    /* ── Step 2: create Yoco payment session ── */
    const yocoResp = await fetch(
      `${SUPABASE_URL}/functions/v1/yoco-shop-checkout`,
      {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        SUPABASE_ANON,
          'Authorization': `Bearer ${SUPABASE_ANON}`,
        },
        body: JSON.stringify({
          order_id:    orderId,
          success_url: `${window.location.origin}/shop-success.html?ref=${encodeURIComponent(orderId)}&email=${encodeURIComponent(email)}`,
          cancel_url:  `${window.location.origin}/checkout.html`,
        }),
      }
    );

    const yocoData = await yocoResp.json();
    if (!yocoResp.ok || yocoData.error) throw new Error(yocoData.error || 'Payment session failed.');

    /* ── Step 3: clear cart and redirect to Yoco ── */
    localStorage.removeItem('pb_cart');
    sessionStorage.removeItem('pb_cart');
    sessionStorage.removeItem('pb_checkout_draft');

    window.location.href = yocoData.redirectUrl;

  } catch(e) {
    if (alertEl) {
      alertEl.textContent = e.message || 'Something went wrong. Please try again.';
      alertEl.classList.add('show');
    }
    if (btn) btn.disabled = false;
  }
}

/* -- DOMContentLoaded ----------------------------------------------------- */
document.addEventListener('DOMContentLoaded', function() {
  loadCart();

  if (!cart.length) {
    const emptyState = document.getElementById('emptyState');
    const coLayout   = document.getElementById('coLayout');
    if (emptyState) emptyState.classList.add('show');
    if (coLayout)   coLayout.style.display = 'none';
    return;
  }

  renderDeliveryOptions();
  renderSummary();
  renderSidebarItems();
  renderDeliveryDate();
  restoreDraft();

  loadShippingQuote();

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

  const streetInput = document.getElementById('f-street');
  if (streetInput) {
    const ac = new Autocomplete(streetInput, {
      componentRestrictions: { country: 'za' },
      fields: ['address_components'],
      types: ['address'],
    });

    const hint = document.getElementById('placesHint');
    if (hint) hint.style.display = '';

    streetInput.addEventListener('input', function() {
      if (this.value.length < 3) {
        const saved = this.value;
        this.value = '';
        requestAnimationFrame(() => { this.value = saved; });
      }
    });

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

  const lockerInput = document.getElementById('f-locker-search');
  if (lockerInput) {
    const lacHint = document.getElementById('lockerPlacesHint');
    if (lacHint) lacHint.style.display = 'flex';
    const lac = new Autocomplete(lockerInput, {
      componentRestrictions: { country: 'za' },
      fields: ['geometry', 'formatted_address'],
      types: ['geocode'],
    });

    lockerInput.addEventListener('input', function() {
      if (this.value.length < 3) {
        const saved = this.value;
        this.value = '';
        requestAnimationFrame(() => { this.value = saved; });
      }
    });

    lac.addListener('place_changed', function() {
      const p = lac.getPlace();
      if (p.geometry) {
        lockerSearchLat = p.geometry.location.lat();
        lockerSearchLng = p.geometry.location.lng();
        window.lockerSearchLat = lockerSearchLat;
        window.lockerSearchLng = lockerSearchLng;
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

    const lockers = Array.isArray(data)
      ? data
      : Array.isArray(data.results)
        ? data.results
        : Array.isArray(data.lockers)
          ? data.lockers
          : [];

    _lockerResults = lockers;

    if (!lockers.length) {
      list.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:.82rem;">No lockers found nearby. Try a different address.</div>';
      return;
    }

    list.innerHTML = lockers.map((l, i) => {
      const name    = l.name    || 'Locker';
      const address = l.address || '';
      const dist    = l.distance_km != null ? `${l.distance_km} km away` : '';
      const sizeTag = (l.available_sizes && l.available_sizes.length)
        ? l.available_sizes.join(', ')
        : '';
      return `
        <div class="locker-item" onclick="selectLockerByIndex(${i})">
          <div class="locker-item-top">
            <div>
              <h4>${name}</h4>
              <p>${address}</p>
              ${dist ? `<p class="locker-dist">${dist}</p>` : ''}
            </div>
            ${sizeTag ? `<span class="locker-tag">${sizeTag}</span>` : ''}
          </div>
          <div class="locker-cta">
            <button type="button" class="mini-btn" onclick="event.stopPropagation();selectLockerByIndex(${i})">Select</button>
          </div>
        </div>
      `;
    }).join('');

    lockerSearchLat = null;
    lockerSearchLng = null;
    window.lockerSearchLat = null;
    window.lockerSearchLng = null;

  } catch(e) {
    console.error('[checkout] Locker search failed:', e);
    list.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:.82rem;">Search failed. Please try again.</div>';
  }
}

/* Selects a locker by its index in _lockerResults. Safe for any name/address. */
function selectLockerByIndex(i) {
  const l = _lockerResults[i];
  if (!l) return;

  const boxSize     = (l.available_sizes && l.available_sizes.length) ? l.available_sizes.join(', ') : '';
  const sizeUnknown = !boxSize;

  selectedLocker = {
    id:        l.id      || '',
    name:      l.name    || '',
    address:   l.address || '',
    boxSize,
    sizeUnknown,
  };

  const display  = document.getElementById('lockerSelectedDisplay');
  const nameEl   = document.getElementById('lockerSelectedName');
  const addrEl   = document.getElementById('lockerSelectedAddr');
  const errEl    = document.getElementById('err-locker');
  const sizeNote = document.getElementById('lockerSelectedSizeNote');

  if (display) display.style.display = '';
  if (nameEl)  nameEl.textContent = selectedLocker.name;
  if (addrEl)  addrEl.textContent = selectedLocker.address;
  if (errEl)   errEl.classList.remove('show');

  if (sizeNote) {
    if (sizeUnknown) {
      sizeNote.style.display = 'none';
    } else {
      sizeNote.textContent   = `Box size: ${boxSize}`;
      sizeNote.className     = 'locker-size-note locker-size-note--confirmed';
      sizeNote.style.display = '';
    }
  }

  const list = document.getElementById('lockerResults');
  if (list) list.innerHTML = '';
}

/* Keep old name as alias in case any inline HTML still references it */
function selectLocker(id, name, address, boxSize, sizeUnknown) {
  selectedLocker = { id, name, address, boxSize, sizeUnknown };

  const display  = document.getElementById('lockerSelectedDisplay');
  const nameEl   = document.getElementById('lockerSelectedName');
  const addrEl   = document.getElementById('lockerSelectedAddr');
  const errEl    = document.getElementById('err-locker');
  const sizeNote = document.getElementById('lockerSelectedSizeNote');

  if (display) display.style.display = '';
  if (nameEl)  nameEl.textContent = name;
  if (addrEl)  addrEl.textContent = address;
  if (errEl)   errEl.classList.remove('show');

  if (sizeNote) {
    if (sizeUnknown) {
      sizeNote.style.display = 'none';
    } else if (boxSize) {
      sizeNote.textContent   = `Box size: ${boxSize}`;
      sizeNote.className     = 'locker-size-note locker-size-note--confirmed';
      sizeNote.style.display = '';
    } else {
      sizeNote.style.display = 'none';
    }
  }

  const list = document.getElementById('lockerResults');
  if (list) list.innerHTML = '';
}

function clearLockerSelection() {
  selectedLocker = null;
  const display = document.getElementById('lockerSelectedDisplay');
  if (display) display.style.display = 'none';
}
