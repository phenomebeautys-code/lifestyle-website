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

/* ── Expose goStep globally (used by inline onclick) ────── */
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

  renderSidebar(); // update delivery cost in sidebar
};

/* ── Special instructions toggle ───────────────────────── */
window.toggleSpecial = function() {
  const btn  = document.getElementById('specialToggle');
  const wrap = document.getElementById('specialFieldWrap');
  if (!btn || !wrap) return;
  const on = btn.classList.toggle('on');
  wrap.style.display = on ? '' : 'none';
};

/* ── Locker search (stub — uses existing locker UI) ─────── */
window.searchLockers = function() {
  const q = document.getElementById('lockerQuery')?.value?.trim();
  if (!q) { showToast('Enter a suburb or landmark to search.'); return; }
  const res = document.getElementById('lockerResults');
  if (res) res.innerHTML = '<p style="color:var(--text-muted);font-size:.86rem;">Locker search requires the Pudo API — please contact support to enable it.</p>';
};

window.useMyLocation = function() {
  if (!navigator.geolocation) { showToast('Geolocation not supported.'); return; }
  navigator.geolocation.getCurrentPosition(
    pos => {
      document.getElementById('lockerSearchLat').value = pos.coords.latitude;
      document.getElementById('lockerSearchLng').value = pos.coords.longitude;
      showToast('Location captured. Tap "Search lockers" to find nearby options.');
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
  // Locker: just warn if none selected
  const selected = document.getElementById('lockerSelectedDisplay')?.textContent?.trim();
  if (!selected) { showToast('Please select a locker before continuing.'); return false; }
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
    : (document.getElementById('lockerSelectedDisplay')?.textContent?.trim() || 'Locker selected');

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
  const btn   = document.getElementById('payBtn');
  const alert = document.getElementById('payAlert');
  const overlay = document.getElementById('loadingOverlay');
  if (btn) btn.disabled = true;
  if (alert) alert.classList.remove('show');
  if (overlay) overlay.classList.add('show');

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
      } : { locker: document.getElementById('lockerSelectedDisplay')?.textContent?.trim() },
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
    subtotal:    calcSubtotal(),
    deliveryCost: calcDelivery(),
    total:       calcTotal(),
    currency:    'ZAR',
  };

  try {
    const res  = await fetch('https://papdxjcfimeyjgzmatpl.supabase.co/functions/v1/create-payment', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(orderPayload),
    });
    const data = await res.json();
    if (data && data.redirectUrl) {
      // Clear cart only after we have a redirect URL
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

/* ── Wire up "Edit cart" button to shop.html ─────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Find the Edit cart button and point it back to shop.html
  document.querySelectorAll('.mini-btn').forEach(btn => {
    if (btn.textContent.trim().toLowerCase().includes('edit cart')) {
      btn.addEventListener('click', () => { window.location.href = 'shop.html'; });
      // Remove any existing onclick that points to index.html
      btn.removeAttribute('onclick');
    }
  });

  // Also fix the "Return to home" ghost-btn in step 1 — should go to shop.html (cart)
  document.querySelectorAll('.ghost-btn').forEach(btn => {
    if (btn.textContent.trim().toLowerCase().includes('return to home')) {
      btn.textContent = '← Return to cart';
      btn.href = 'shop.html';
      btn.setAttribute('href', 'shop.html');
    }
  });

  initCheckout();
});
