/* ============================================================
   PhenomeBeauty — shop.js
   All shop page logic extracted from shop.html
   ============================================================ */

const SUPABASE_URL  = 'https://papdxjcfimeyjgzmatpl.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcGR4amNmaW1leWpnem1hdHBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMDk4NjcsImV4cCI6MjA5MjY4NTg2N30.mn_JsORuYUBtHTqIF2RjY8YUJzY9zJQV0uGFXBvrJRc';

/* ── Cart helpers ─────────────────────────────────────────── */

function loadCart() {
  try {
    const raw = sessionStorage.getItem('pb_cart')
             || localStorage.getItem('pb_cart')
             || '[]';
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch(e) { return []; }
}

function saveCart(cart) {
  try {
    const json = JSON.stringify(cart);
    localStorage.setItem('pb_cart', json);
    sessionStorage.setItem('pb_cart', json);
  } catch(e) {}
}

let cart = loadCart();

function cartTotal() {
  return cart.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 1), 0);
}

/* ── Badge ────────────────────────────────────────────────── */

function updateBadges() {
  const total = cart.reduce((s, i) => s + (Number(i.qty) || 1), 0);
  document.querySelectorAll('#cartBadge, #heroCartCount').forEach(el => { if (el) el.textContent = total; });
  updateStickyBar();
}

/* ── Sticky cart bar ───────────────────────────────────────── */

function buildScbThumb(imageUrl, altText) {
  const wrap = document.createElement('div');
  wrap.className = 'scb-thumb';
  if (imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl; img.alt = altText || ''; img.loading = 'lazy';
    wrap.appendChild(img);
  } else {
    wrap.innerHTML = '<svg class="scb-thumb-placeholder" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
  }
  return wrap;
}

function showStickyBar() {
  const bar = document.getElementById('stickyCartBar');
  if (!bar) return;
  bar.classList.add('visible');
  document.body.classList.add('cart-bar-active');
}

function updateStickyBar() {
  const bar      = document.getElementById('stickyCartBar');
  const thumbsEl = document.getElementById('scbThumbs');
  const countEl  = document.getElementById('scbCount');
  const totalEl  = document.getElementById('scbTotal');
  if (!bar) return;

  if (!cart.length) {
    bar.classList.remove('visible');
    document.body.classList.remove('cart-bar-active');
    return;
  }

  showStickyBar();

  if (thumbsEl) {
    thumbsEl.innerHTML = '';
    const MAX_THUMBS = 3;
    const shown = cart.slice(0, MAX_THUMBS);
    shown.forEach(item => thumbsEl.appendChild(buildScbThumb(item.image, item.name)));
    if (cart.length > MAX_THUMBS) {
      const more = document.createElement('div');
      more.className = 'scb-thumb-more';
      more.textContent = '+' + (cart.length - MAX_THUMBS);
      thumbsEl.appendChild(more);
    }
  }

  const totalQty = cart.reduce((s, i) => s + (Number(i.qty) || 1), 0);
  if (countEl) countEl.textContent = totalQty + (totalQty === 1 ? ' item' : ' items');
  if (totalEl) totalEl.textContent = 'R' + cartTotal().toFixed(2);
}

/* ── Sticky cart expanded inline card ─────────────────────── */

function renderStickyExpanded() {
  const container = document.getElementById('scbExpanded');
  if (!container) return;

  if (!cart.length) {
    container.innerHTML = '';
    container.classList.remove('open');
    container.setAttribute('aria-hidden', 'true');
    return;
  }

  const items = cart.map((item, idx) => `
    <div class="scb-line">
      <img class="scb-line-img" src="${item.image || ''}" alt="${item.name || ''}" loading="lazy" />
      <div class="scb-line-info">
        <div class="scb-line-name">${item.name || 'Product'}</div>
        ${item.variant ? `<div class="scb-line-variant">${item.variant}</div>` : ''}
      </div>
      <div class="scb-line-qty">
        <button type="button" class="scb-qty-btn" onclick="changeCartQty(${idx},-1)" aria-label="Decrease quantity">-</button>
        <span class="scb-qty-val">${item.qty}</span>
        <button type="button" class="scb-qty-btn" onclick="changeCartQty(${idx},1)" aria-label="Increase quantity">+</button>
      </div>
      <div class="scb-line-price">R${((Number(item.price)||0)*(Number(item.qty)||1)).toFixed(2)}</div>
    </div>`).join('');

  const subtotal = cartTotal();

  container.innerHTML = `
    <div class="scb-expanded-items">${items}</div>
    <div class="scb-expanded-footer">
      <div class="scb-expanded-subtotal">
        <span>Subtotal</span>
        <span>R${subtotal.toFixed(2)}</span>
      </div>
      <p class="scb-expanded-note">Delivery calculated at checkout</p>
      <a href="checkout.html" class="btn btn-primary scb-checkout-btn">Checkout</a>
    </div>`;
}

function toggleStickyCart() {
  const container = document.getElementById('scbExpanded');
  if (!container) return;
  const isOpen = container.classList.contains('open');
  if (isOpen) {
    container.classList.remove('open');
    container.setAttribute('aria-hidden', 'true');
  } else {
    renderStickyExpanded();
    container.classList.add('open');
    container.setAttribute('aria-hidden', 'false');
  }
}

/* ── Cart drawer ──────────────────────────────────────────── */

function buildCartThumb(imageUrl, altText, size) {
  const thumb = document.createElement('div');
  thumb.className = 'cart-item-thumb';
  thumb.style.width = size + 'px'; thumb.style.height = size + 'px';
  if (imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl; img.alt = altText || ''; img.loading = 'lazy';
    thumb.appendChild(img);
  } else {
    thumb.innerHTML = '<svg class="cart-item-thumb-placeholder" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
  }
  return thumb;
}

function renderCartDrawer() {
  const itemsEl    = document.getElementById('cartItems');
  const footerEl   = document.getElementById('cartFooter');
  const subtotalEl = document.getElementById('subtotalDisplay');
  if (!itemsEl) return;
  if (!cart.length) {
    itemsEl.innerHTML = '<p class="cart-empty">Your cart is empty.</p>';
    if (footerEl) footerEl.style.display = 'none';
    return;
  }
  if (footerEl) footerEl.style.display = '';
  if (subtotalEl) subtotalEl.textContent = 'R' + cartTotal().toFixed(2);
  itemsEl.innerHTML = '';
  cart.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'cart-item';
    const thumb = buildCartThumb(item.image, item.name, 72);
    row.appendChild(thumb);
    const info = document.createElement('div');
    info.className = 'cart-item-info';
    info.innerHTML = `
      <div class="cart-item-name">${item.name || 'Product'}</div>
      <div class="cart-item-variant">${[item.variant, item.size].filter(Boolean).join(' / ') || ''}</div>
      <div class="cart-item-price">R${((Number(item.price)||0)*(Number(item.qty)||1)).toFixed(2)}</div>
      <div class="cart-item-qty">
        <button class="qty-btn" onclick="changeQty(${idx},-1)" aria-label="Decrease quantity">&#8722;</button>
        <span class="qty-num">${item.qty || 1}</span>
        <button class="qty-btn" onclick="changeQty(${idx},1)" aria-label="Increase quantity">&#43;</button>
      </div>`;
    row.appendChild(info);
    itemsEl.appendChild(row);
  });
}
function changeCartQty(idx, delta) {
  if (!cart[idx]) return;

const current = Number(cart[idx].qty) || 1;
const next = current + delta;

  if (next <= 0) {
    // Remove line if quantity would drop below 1
    cart.splice(idx, 1);
  } else {
    cart[idx].qty = next;
  }

  saveCart(cart);
  renderCartDrawer();
  updateBadges();
const expanded = document.getElementById('scbExpanded');
if (expanded?.classList.contains('open')) renderStickyExpanded();
}

function changeQty(idx, delta) {
  changeCartQty(idx, delta);
}

function removeItem(idx) {
  changeCartQty(idx, -999);
}

function openCart() {
  renderCartDrawer();
  document.getElementById('cartDrawer')?.classList.add('open');
  document.getElementById('overlay')?.classList.add('open');
  document.body.classList.add('cart-open');
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  document.getElementById('cartDrawer')?.classList.remove('open');
  document.getElementById('overlay')?.classList.remove('open');
  document.body.classList.remove('cart-open');
  document.body.style.overflow = '';
}

/* ── Add to cart ──────────────────────────────────────────── */

function getVariantImage(p, variant) {
  if (!variant || !p.variants) return (p.image_urls?.[0] || p.image_url || '');
  const vObj = p.variants.find(v => (v.name || v.label || v.value || '') === variant);
  return vObj?.image || p.image_urls?.[0] || p.image_url || '';
}

function addToCart(pid, cardEl) {
  const p = window._products?.find(x => String(x.id) === String(pid));
  if (!p) return;
  const variantEl = cardEl.querySelector('.v-pill.active');
  const sizeEl    = cardEl.querySelector('.s-pill.active');
  const variant   = variantEl?.dataset.variant || '';
  const sizeName  = sizeEl?.dataset.size       || '';
  let unitPrice = Number(p.price) || 0;
  if (variant && p.variants) {
    const vObj = p.variants.find(v => (v.name || v.label || v.value || '') === variant);
    if (vObj && vObj.price != null) unitPrice = Number(vObj.price);
  }
  if (sizeName && p.sizes) {
    const sObj = p.sizes.find(s => (s.name || s.label || s.value || '') === sizeName);
    if (sObj && sObj.price != null) unitPrice = Number(sObj.price);
  }
  const imageUrl = getVariantImage(p, variant);
  const key      = `${pid}__${variant}__${sizeName}`;
  const ex       = cart.find(i => i.key === key);
  if (ex) { ex.qty++; if (!ex.image && imageUrl) ex.image = imageUrl; }
  else cart.push({ key, productId: pid, name: p.name, variant: variant || '', size: sizeName || '', price: unitPrice, qty: 1, image: imageUrl || '' });
  saveCart(cart); updateBadges(); showStickyBar();
  const btn = cardEl.querySelector('.btn-add-to-cart');
  if (btn) {
    const orig = btn.innerHTML;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Added';
    btn.disabled = true;
    setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; }, 1400);
  }
}

/* ── Segment logic ────────────────────────────────────────── */

const SEGMENT_KEY = 'pb_segment';

function getSegment() {
  return localStorage.getItem(SEGMENT_KEY) || null;
}

function selectSegment(segment) {
  localStorage.setItem(SEGMENT_KEY, segment);
  const mount = document.getElementById('segmentSelectorMount');
  if (mount) mount.style.display = 'none';
  const prompt = document.getElementById('heroSubPrompt');
  if (prompt) prompt.classList.add('hidden');
  applySegment(segment);
  fetchProducts();
}

function browseAll() {
  localStorage.removeItem(SEGMENT_KEY);
  const mount = document.getElementById('segmentSelectorMount');
  if (mount) mount.style.display = 'none';
  const prompt = document.getElementById('heroSubPrompt');
  if (prompt) prompt.classList.add('hidden');
  document.getElementById('segmentActiveBar')?.classList.remove('visible');
  updateShopHero(null);
  fetchProducts();
}

function resetSegment() {
  localStorage.removeItem(SEGMENT_KEY);
  window._products = null;
  const grid = document.getElementById('productGrid');
  if (grid) grid.innerHTML = '';
  const mount = document.getElementById('segmentSelectorMount');
  if (mount) mount.style.display = '';
  const prompt = document.getElementById('heroSubPrompt');
  if (prompt) prompt.classList.remove('hidden');
  document.getElementById('segmentActiveBar')?.classList.remove('visible');
  updateShopHero(null);
}

function applySegment(segment) {
  const bar   = document.getElementById('segmentActiveBar');
  const label = document.getElementById('segmentActiveLabel');
  const labelMap = { self_care: 'Self-Care', professional: 'Professional' };
  if (segment) {
    bar?.classList.add('visible');
    if (label) label.textContent = labelMap[segment] || segment;
  } else {
    bar?.classList.remove('visible');
  }
  updateShopHero(segment);
}

function updateShopHero(segment) {
  const heroTitle = document.getElementById('shopHeroTitle');
  const heroDesc  = document.getElementById('shopHeroDesc');
  if (!heroTitle || !heroDesc) return;
  if (segment === 'self_care') {
    heroTitle.innerHTML = 'Your Routine.<br/>Your Rules.';
    heroDesc.textContent = 'The products behind your self-care. No salon needed, no compromise on results.';
  } else if (segment === 'professional') {
    heroTitle.innerHTML = 'Built for<br/>Professionals.';
    heroDesc.textContent = 'Supplies for the therapist who holds the standard for every woman entrusted in their care.';
  } else {
    heroTitle.innerHTML = 'The Phenome<br/>Collection';
    heroDesc.textContent = 'Carefully curated essentials for women who maintain their standards, and the professionals who help others do the same.';
  }
}

/* ── Product rendering ────────────────────────────────────── */

function renderSkeletons(n) {
  const grid = document.getElementById('productGrid');
  if (!grid) return;
  grid.innerHTML = Array(n).fill(0).map(() => `
    <div class="skeleton-card" aria-hidden="true">
      <div class="skeleton-img"></div>
      <div class="skeleton-body">
        <div class="skeleton-line" style="height:12px;width:40%"></div>
        <div class="skeleton-line" style="height:28px;width:70%"></div>
        <div class="skeleton-line" style="height:36px;width:50%;margin-top:8px;border-radius:20px"></div>
      </div>
    </div>`).join('');
}

function renderProducts(products) {
  window._products = products;
  const grid = document.getElementById('productGrid');
  if (!grid) return;

  const segment = getSegment();
  if (segment) {
    products = products.filter(p => !p.market || p.market === segment);
  }

  if (!products.length) {
    grid.innerHTML = '<div class="shop-error"><p>No products found.</p></div>';
    return;
  }

  grid.innerHTML = products.map(p => {
    const pid       = p.id;
    const images    = Array.isArray(p.image_urls) ? p.image_urls.filter(Boolean) : (p.image_url ? [p.image_url] : []);
    const available = p.available !== false;
    const unavailableClass = available ? '' : ' is-unavailable';

    let imgHTML = '';
    if (images.length >= 1) {
      imgHTML = `<img id="card-img-${pid}" src="${images[0]}" alt="${p.name || ''}" loading="eager" width="600" height="800" />`;
    } else {
      imgHTML = `<div class="no-img-placeholder"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>`;
    }

    let variantHTML = '';
    if (p.variants && p.variants.length) {
      const pills = p.variants.map((v, vi) => {
        const label    = v.name || v.label || v.value || ('Option ' + (vi+1));
        const outClass = (v.stock != null && v.stock <= 0) ? ' out-of-stock' : '';
        const actClass = vi === 0 && !outClass ? ' active' : '';
        return `<button class="v-pill${actClass}${outClass}" data-variant="${label}" onclick="selectVariant(this,'${pid}')" ${outClass ? 'aria-disabled="true" tabindex="-1"' : ''}>${label}</button>`;
      }).join('');
      variantHTML = `<div><div class="variant-label">Variant</div><div class="pill-group">${pills}</div></div>`;
    }

    let sizeHTML = '';
    if (p.sizes && p.sizes.length) {
      const pills = p.sizes.map((s, si) => {
        const label    = s.name || s.label || s.value || ('Size ' + (si+1));
        const actClass = si === 0 ? ' active' : '';
        return `<button class="s-pill${actClass}" data-size="${label}" onclick="selectSize(this,'${pid}')">${label}</button>`;
      }).join('');
      sizeHTML = `<div><div class="variant-label">Size</div><div class="pill-group">${pills}</div></div>`;
    }

    const price      = Number(p.price) || 0;
    const priceLabel = price > 0 ? `R${price.toFixed(2)}` : 'Contact for price';
    const badge      = available ? '' : `<div class="product-availability-badge" aria-label="Currently unavailable">Unavailable</div>`;

    return `
    <article class="product-card${unavailableClass}" data-pid="${pid}">
      <div class="product-img">
        ${badge}
        ${imgHTML}
      </div>
      <div class="product-body">
        ${p.category ? `<div class="product-tag">${p.category}</div>` : ''}
        <h2 class="product-name">${p.name || 'Product'}</h2>
        ${variantHTML}
        ${sizeHTML}
        <div class="product-price" id="price-${pid}">${priceLabel}</div>
        <button class="btn btn-primary btn-add-to-cart" onclick="addToCart('${pid}',this.closest('.product-card'))" ${available?'':'disabled aria-disabled="true"'}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
          ${available ? 'Add to Cart' : 'Unavailable'}
        </button>
      </div>
    </article>`;
  }).join('');

  updateBadges();
}

function selectVariant(btn, pid) {
  btn.closest('.pill-group').querySelectorAll('.v-pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  const p = window._products?.find(x => String(x.id) === String(pid));
  if (p) {
    const variant = btn.dataset.variant || '';
    const imgEl   = document.getElementById('card-img-' + pid);
    if (imgEl) imgEl.src = getVariantImage(p, variant);
  }
  updateCardPrice(pid, btn.closest('.product-card'));
}

function selectSize(btn, pid) {
  btn.closest('.pill-group').querySelectorAll('.s-pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  updateCardPrice(pid, btn.closest('.product-card'));
}

function updateCardPrice(pid, cardEl) {
  const p = window._products?.find(x => String(x.id) === String(pid));
  if (!p || !cardEl) return;
  const priceEl   = cardEl.querySelector(`#price-${pid}`);
  if (!priceEl) return;
  const variantEl = cardEl.querySelector('.v-pill.active');
  const sizeEl    = cardEl.querySelector('.s-pill.active');
  const variant   = variantEl?.dataset.variant || '';
  const sizeName  = sizeEl?.dataset.size       || '';
  let price = Number(p.price) || 0;
  if (variant && p.variants) { const vObj = p.variants.find(v => (v.name || v.label || v.value || '') === variant); if (vObj && vObj.price != null) price = Number(vObj.price); }
  if (sizeName && p.sizes)   { const sObj = p.sizes.find(s => (s.name || s.label || s.value || '') === sizeName);   if (sObj && sObj.price != null) price = Number(sObj.price); }
  priceEl.textContent = price > 0 ? 'R' + price.toFixed(2) : 'Contact for price';
}

/* ── Product fetch ────────────────────────────────────────── */

async function fetchProducts() {
  renderSkeletons(4);
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/functions/v1/get-products`,
      { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
    );
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    renderProducts(Array.isArray(data) ? data : []);
  } catch(err) {
    console.error('fetchProducts error:', err);
    const grid = document.getElementById('productGrid');
    if (grid) grid.innerHTML = `
      <div class="shop-error">
        <p>Unable to load products. Please check your connection and try again.</p>
        <button class="btn btn-secondary" onclick="fetchProducts()">Retry</button>
      </div>`;
  }
}

/* ── Segment selector loader ──────────────────────────────── */

async function loadSegmentSelector() {
  try {
    const res  = await fetch('segment-selector.html');
    const html = await res.text();
    const mount = document.getElementById('segmentSelectorMount');
    if (mount) mount.innerHTML = html;
  } catch(e) {
    console.warn('Segment selector failed to load:', e);
  }
}

/* ── Init ─────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', async function() {
  await loadSegmentSelector();
  const savedSegment = getSegment();
  if (savedSegment) {
    const mount = document.getElementById('segmentSelectorMount');
    if (mount) mount.style.display = 'none';
    const prompt = document.getElementById('heroSubPrompt');
    if (prompt) prompt.classList.add('hidden');
    applySegment(savedSegment);
    fetchProducts();
  }
  updateBadges();
  if (cart.length) showStickyBar();
  if (new URLSearchParams(location.search).get('payment') === 'cancelled') {
    document.getElementById('cancelBanner').classList.add('show');
    window.history.replaceState({}, '', 'shop.html');
  }
});
