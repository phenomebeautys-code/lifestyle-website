/* ============================================================
   PhenomeBeauty — shop.js
   ============================================================ */

const SUPABASE_URL  = 'https://papdxjcfimeyjgzmatpl.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcGR4amNmaW1leWpnem1hdHBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMDk4NjcsImV4cCI6MjA5MjY4NTg2N30.mn_JsORuYUBtHTqIF2RjY8YUJzY9zJQV0uGFXBvrJRc';

/* —— Image transform ———————————————————————————————————————— */

function transformImage(url, width) {
  if (!url || !url.includes('supabase.co/storage')) return url;
  return url + '?width=' + (width || 400) + '&quality=75&format=webp';
}

/* —— Strip label prefix (e.g. "Scent: Bloom" -> "Bloom") ——— */

function stripPrefix(str) {
  if (!str) return str;
  return str.replace(/^[^:]+:\s*/i, '');
}

/* —— Render structured description ————————————————————————— */

function renderDescription(p) {
  const text         = p.description || '';
  const includesList  = Array.isArray(p['includes'])    ? p['includes'].filter(Boolean)    : [];
  const availableList = Array.isArray(p['available_in']) ? p['available_in'].filter(Boolean) : [];

  const includesHTML = includesList.length
    ? `<p class="desc-avail-label">Includes</p><ul>${includesList.map(i => `<li>${i}</li>`).join('')}</ul>`
    : '';

  const availableHTML = availableList.length
    ? `<p class="desc-avail-label">Available in</p><ul>${availableList.map(i => `<li>${i}</li>`).join('')}</ul>`
    : '';

  return `<div class="product-desc"><p>${text}</p>${includesHTML}${availableHTML}</div>`;
}

/* —— Hero variant note copy ————————————————————————————————— */

const HERO_VARIANT_NOTES = {
  self_care:    'For The Woman Who Shows Up For Herself. Our signature chamomile ritual, created for women who understand that confidence is built through care.',
  professional: 'Our benchmark wax. Luxe delivers the finish professionals put their name behind.',
};

/* —— Cart helpers ———————————————————————————————————————————— */

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

/* —— Badge ——————————————————————————————————————————————————— */

function updateBadges() {
  const total = cart.reduce((s, i) => s + (Number(i.qty) || 1), 0);
  document.querySelectorAll('#cartBadge, #heroCartCount').forEach(el => { if (el) el.textContent = total; });
  updateStickyBar();
}

/* —— Sticky cart bar ————————————————————————————————————————— */

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

/* —— Sticky cart expanded inline card ——————————————————————— */

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
        ${item.variant ? `<div class="scb-line-variant">${stripPrefix(item.variant)}</div>` : ''}
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

/* —— Cart drawer ———————————————————————————————————————————— */

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
    const variantDisplay = [stripPrefix(item.variant), stripPrefix(item.size)].filter(Boolean).join(' / ') || '';
    info.innerHTML = `
      <div class="cart-item-name">${item.name || 'Product'}</div>
      <div class="cart-item-variant">${variantDisplay}</div>
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

/* —— Add to cart ———————————————————————————————————————————— */

function getVariantImage(p, variant) {
  if (!variant || !p.variants) return (p.image_urls?.[0] || p.image_url || '');
  const vObj = p.variants.find(v => (v.name || v.label || v.value || '') === variant);
  return vObj?.image || p.image_urls?.[0] || p.image_url || '';
}

function addToCartFromDetail(pid) {
  const panel = document.getElementById('pdpPanel');
  const p = window._products?.find(x => String(x.id) === String(pid));
  if (!p || !panel) return;

  const variantEl = panel.querySelector('.pdp-thumb-col.active');
  const sizeEl    = panel.querySelector('.s-pill.active');
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

  saveCart(cart);
  updateBadges();
  showStickyBar();

  const btn = panel.querySelector('.pdp-atc-btn');
  if (btn) {
    const orig = btn.innerHTML;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Added to Cart';
    btn.disabled = true;
    setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; }, 1500);
  }
}

function addToCart(pid, cardEl) {
  const p = window._products?.find(x => String(x.id) === String(pid));
  if (!p) return;
  const variantEl = cardEl.querySelector('.pdp-thumb-col.active');
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
}

/* —— Product Detail Panel ——————————————————————————————————— */

let _pdpCurrentPid = null;

function openProductDetail(pid) {
  const p = window._products?.find(x => String(x.id) === String(pid));
  if (!p) return;
  _pdpCurrentPid = pid;

  const panel   = document.getElementById('pdpPanel');
  const overlay = document.getElementById('pdpOverlay');
  const inner   = document.getElementById('pdpInner');
  if (!panel || !inner) return;

  const images    = Array.isArray(p.image_urls) ? p.image_urls.filter(Boolean) : (p.image_url ? [p.image_url] : []);
  const available = p.active === true &&
    p.availability !== 'coming_soon' &&
    p.availability !== 'out_of_stock';
  const price      = Number(p.price) || 0;
  const priceLabel = price > 0 ? `R${price.toFixed(2)}` : 'Coming Soon';

  /* —— For hero products, find the featured variant index (Calm / Luxe) —— */
  let heroVariantIdx = -1;
  if (p.hero_segment === 'self_care' && Array.isArray(p.variants)) {
    heroVariantIdx = p.variants.findIndex(v => /calm/i.test(v.name || v.label || v.value || ''));
  } else if (p.hero_segment === 'professional' && Array.isArray(p.variants)) {
    heroVariantIdx = p.variants.findIndex(v => /luxe/i.test(v.name || v.label || v.value || ''));
  }

  /* Active index: hero variant if found, otherwise 0 */
  const activeIdx = heroVariantIdx >= 0 ? heroVariantIdx : 0;

  /* Hero image: use variant image if hero variant found, otherwise image_urls[activeIdx] */
  const heroVariantObj = heroVariantIdx >= 0 && p.variants ? p.variants[heroVariantIdx] : null;
  const heroImgSrc = heroVariantObj?.image
    ? heroVariantObj.image
    : (images[activeIdx] || images[0] || '');

  const heroHTML = heroImgSrc
    ? `<img class="pdp-hero-img" id="pdpHeroImg" src="${transformImage(heroImgSrc, 800)}" alt="${p.name || ''}" loading="eager" width="800" height="533" />`
    : `<div class="pdp-hero-img pdp-hero-placeholder"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="1" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>`;

  let thumbsHTML = '';
  if (images.length > 1) {
    const cols = images.map((img, i) => {
      const variantObj   = p.variants && p.variants[i] ? p.variants[i] : null;
      const variantRaw   = variantObj ? (variantObj.name || variantObj.label || variantObj.value || '') : '';
      const variantLabel = variantRaw ? stripPrefix(variantRaw) : '';
      const isActive     = i === activeIdx;
      const isHero       = i === heroVariantIdx;
      const activeClass  = isActive ? ' active' : '';
      const heroClass    = isHero   ? ' hero-variant' : '';
      const outClass     = (variantObj && variantObj.stock != null && variantObj.stock <= 0) ? ' out-of-stock' : '';
      /* For hero variant thumb, use the variant's own image so the thumbnail matches */
      const thumbImgSrc  = isHero && variantObj?.image ? variantObj.image : img;
      const labelHTML    = variantLabel
        ? `<span class="pdp-thumb-label">${variantLabel}</span>`
        : '';
      return `<div class="pdp-thumb-col${activeClass}${heroClass}${outClass}" data-variant="${variantRaw}" data-img="${transformImage(isHero && variantObj?.image ? variantObj.image : img, 800)}" onclick="pdpSelectThumbCol(this,'${pid}')" role="button" tabindex="0" aria-label="${variantLabel || ('Image ' + (i+1))}" aria-pressed="${isActive}">
        <div class="pdp-thumb-img-wrap">
          <img src="${transformImage(thumbImgSrc, 120)}" alt="" loading="lazy" width="120" height="80" />
        </div>
        ${labelHTML}
      </div>`;
    }).join('');
    thumbsHTML = `<div class="pdp-thumbs" role="list">${cols}</div>`;
  }

  let sizeHTML = '';
  if (p.sizes && p.sizes.length) {
    const pills = p.sizes.map((s, si) => {
      const raw      = s.name || s.label || s.value || ('Size ' + (si+1));
      const label    = stripPrefix(raw);
      const actClass = si === 0 ? ' active' : '';
      return `<button class="s-pill${actClass}" data-size="${raw}" onclick="pdpSelectSize(this,'${pid}')">${label}</button>`;
    }).join('');
    sizeHTML = `<div class="pdp-option-group"><div class="pdp-option-label">Size</div><div class="pill-group">${pills}</div></div>`;
  }

  let variantHTML = '';
  if (p.variants && p.variants.length && images.length <= 1) {
    const pills = p.variants.map((v, vi) => {
      const raw      = v.name || v.label || v.value || ('Option ' + (vi+1));
      const label    = stripPrefix(raw);
      const outClass = (v.stock != null && v.stock <= 0) ? ' out-of-stock' : '';
      const actClass = vi === 0 && !outClass ? ' active' : '';
      return `<button class="v-pill${actClass}${outClass}" data-variant="${raw}" onclick="pdpSelectVariant(this,'${pid}')" ${outClass ? 'aria-disabled="true" tabindex="-1"' : ''}>${label}</button>`;
    }).join('');
    variantHTML = `<div class="pdp-option-group"><div class="pdp-option-label">Variant</div><div class="pill-group">${pills}</div></div>`;
  }

  const catHTML  = p.category ? `<div class="pdp-category">${p.category}</div>` : '';
  const descHTML = renderDescription(p);

  /* —— Hero variant on-brand note — only for hero products —— */
  const noteText  = p.hero_segment ? (HERO_VARIANT_NOTES[p.hero_segment] || '') : '';
  const noteHTML  = noteText ? `<p class="pdp-hero-variant-note">${noteText}</p>` : '';

  inner.innerHTML = `
    <div class="pdp-scroll-area">
      <div class="pdp-image-block">
        ${heroHTML}
        ${thumbsHTML}
      </div>
      <div class="pdp-content">
        ${catHTML}
        <h2 class="pdp-name">${p.name || 'Product'}</h2>
        ${descHTML}
        ${noteHTML}
        ${variantHTML}
        ${sizeHTML}
        <div class="pdp-spacer"></div>
      </div>
    </div>
    <div class="pdp-footer">
      <div class="pdp-footer-price" id="pdpFooterPrice">${priceLabel}</div>
      <button class="pdp-atc-btn" onclick="addToCartFromDetail('${pid}')" ${available ? '' : 'disabled aria-disabled="true"'}>
        ${available ? 'Add to Cart' : 'Unavailable'}
      </button>
    </div>`;

  panel.querySelector('.pdp-close-btn')?.remove();
  const closeBtn = document.createElement('button');
  closeBtn.className = 'pdp-close-btn';
  closeBtn.setAttribute('aria-label', 'Close product detail');
  closeBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  closeBtn.addEventListene