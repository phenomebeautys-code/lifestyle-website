/* shop-admin-products.js */
import { state, hooks, SUPA_URL, SUPA_ANON, PRODUCTS_TABLE, callEdge, esc, showToast, normaliseSizes } from './shop-admin-core.js';
/* ─── AVAILABILITY HELPERS ──────────────────────── */
const AVAILABILITY_LABELS = {
  available:   null,
  coming_soon: 'Coming Soon',
  unavailable: 'Not Available',
};

/* ─── PRODUCTS ───────────────────────────────────── */
export function getProductImages(p) {
  if (Array.isArray(p.image_urls) && p.image_urls.length) return p.image_urls.filter(Boolean).slice(0, 5);
  if (p.image_url) return [p.image_url];
  return [];
}
export async function loadProducts() {
  document.getElementById('productsGrid').innerHTML =
    '<div class="products-empty" style="grid-column:1/-1"><span class="spinner"></span> Loading\u2026</div>';
  try {
    const res = await callEdge({ action: 'get_products', password: state.adminToken });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.products)) { state.allProducts = data.products; renderProducts(); return; }
    }
    await loadProductsFromRest();
  } catch { await loadProductsFromRest(); }
}
export export async function loadProductsFromRest() {
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/${PRODUCTS_TABLE}?order=idx.asc`,
      { headers: { 'apikey': SUPA_ANON, 'Authorization': `Bearer ${SUPA_ANON}`, 'Content-Type': 'application/json' } });
    if (!res.ok) { state.allProducts = []; renderProducts(); showToast('Could not load products: ' + res.status, true); return; }
    state.allProducts = await res.json(); renderProducts();
  } catch { state.allProducts = []; renderProducts(); }
}

/* Availability ribbon labels */
const RIBBON_LABELS = {
  available:   'Available',
  coming_soon: 'Coming Soon',
  unavailable: 'Not Available',
};

export function renderProducts() {
  const q    = (document.getElementById('productSearch')?.value || '').toLowerCase();
  const el   = document.getElementById('productsGrid');
  const list = q ? state.allProducts.filter(p => p.name?.toLowerCase().includes(q) || p.brand?.toLowerCase().includes(q)) : state.allProducts;
  if (!list.length) {
    el.innerHTML = `<div class="products-empty" style="grid-column:1/-1">No products yet.<br><button class="btn btn-primary" id="emptyAddBtn" style="margin-top:16px">Add your first product</button></div>`;
    document.getElementById('emptyAddBtn')?.addEventListener('click', () => hooks.openProductModal?.()); return;
  }
  el.innerHTML = '';
  list.forEach((p, listIdx) => {
    const card = document.createElement('div');
    card.className = 'product-card' + (state.isReorderMode ? ' reorder-mode' : '');
    card.dataset.productId = p.id;

    const variantDisplay = (p.variants || []).map(v => {
      const name    = typeof v === 'string' ? v : (v.name || '');
      const inStock = typeof v === 'string' ? true : v.in_stock !== false;
      return name ? (inStock ? name : `${name} \u2716`) : null;
    }).filter(Boolean).join(', ');
    const sizeDisplay = normaliseSizes(p.sizes).map(s => `${s.name} (R${s.price})`).join(', ');
    const images  = getProductImages(p);
    const avail   = p.availability || 'available';

    /* IMAGE WRAP */
    const imgWrap = document.createElement('div'); imgWrap.className = 'product-img-wrap';
    if (images.length > 1) {
      const carousel = document.createElement('div'); carousel.className = 'img-carousel';
      const track    = document.createElement('div'); track.className = 'img-carousel-track';
      images.forEach((url, idx) => {
        const slide = document.createElement('div'); slide.className = 'img-carousel-slide';
        const img   = document.createElement('img'); img.src = url; img.alt = (p.name || '') + ' ' + (idx + 1);
        img.onerror = () => { slide.innerHTML = noImgSVG(); }; slide.appendChild(img); track.appendChild(slide);
      });
      carousel.appendChild(track);
      const dots = document.createElement('div'); dots.className = 'img-carousel-dots';
      let currentSlide = 0;
      const dotEls = images.map((_, idx) => {
        const d = document.createElement('button'); d.className = 'img-carousel-dot' + (idx === 0 ? ' active' : '');
        d.setAttribute('aria-label', 'Image ' + (idx + 1));
        d.addEventListener('click', () => goToSlide(idx)); dots.appendChild(d); return d;
      });
      const prev = document.createElement('button'); prev.className = 'img-carousel-btn img-carousel-prev'; prev.innerHTML = '&#8249;'; prev.setAttribute('aria-label', 'Previous image');
      const next = document.createElement('button'); next.className = 'img-carousel-btn img-carousel-next'; next.innerHTML = '&#8250;'; next.setAttribute('aria-label', 'Next image');
      function goToSlide(idx) {
        currentSlide = (idx + images.length) % images.length;
        track.style.transform = `translateX(-${currentSlide * 100}%)`;
        dotEls.forEach((d, i) => d.classList.toggle('active', i === currentSlide));
      }
      prev.addEventListener('click', () => goToSlide(currentSlide - 1));
      next.addEventListener('click', () => goToSlide(currentSlide + 1));
      carousel.appendChild(prev); carousel.appendChild(next); carousel.appendChild(dots);
      imgWrap.appendChild(carousel);
    } else if (images.length === 1) {
      const img = document.createElement('img'); img.src = images[0]; img.alt = p.name || '';
      img.onerror = () => { imgWrap.innerHTML = noImgSVG(); }; imgWrap.appendChild(img);
    } else { imgWrap.innerHTML = noImgSVG(); }

    const ribbon = document.createElement('span');
    ribbon.className = `prod-avail-ribbon ribbon-${avail.replace(/_/g, '-')}`;
    ribbon.textContent = RIBBON_LABELS[avail] || avail;
    imgWrap.appendChild(ribbon);

    /* CARD BODY */
    const body = document.createElement('div'); body.className = 'product-card-body';
    body.innerHTML = `
      <div class="product-price">R${Number(p.price || 0).toLocaleString('en-ZA')}${sizeDisplay ? ' <span style="font-size:0.72rem;color:var(--text-muted);font-weight:400">(base)</span>' : ''}</div>
      ${p.category     ? `<div class="product-cat">${esc(p.category)}</div>` : ''}
      <div class="product-name">${esc(p.name || 'Unnamed product')}</div>
      ${p.brand        ? `<div class="product-brand">${esc(p.brand)}</div>` : ''}
      ${variantDisplay ? `<div class="product-variant">${esc(variantDisplay)}</div>` : ''}
      ${sizeDisplay    ? `<div class="product-variant">Sizes: ${esc(sizeDisplay)}</div>` : ''}
      ${p.description  ? `<div class="product-desc">${esc(p.description)}</div>` : ''}`;

    /* CARD FOOTER */
    const footer = document.createElement('div'); footer.className = 'product-card-footer';

    if (!state.isReorderMode) {
      const footerBadge = document.createElement('span');
      footerBadge.className = `prod-footer-badge badge-${avail.replace(/_/g, '-')}`;
      footerBadge.textContent = RIBBON_LABELS[avail] || avail;

      const spacer = document.createElement('span');
      spacer.className = 'prod-footer-spacer';

      const editBtn = document.createElement('button'); editBtn.className = 'btn-edit-prod'; editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => hooks.openProductModal?.(p));

      const delBtn = document.createElement('button'); delBtn.className = 'btn-delete-prod'; delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => hooks.deleteProduct?.(p.id, p.name));

      footer.appendChild(footerBadge);
      footer.appendChild(spacer);
      footer.appendChild(editBtn);
      footer.appendChild(delBtn);
    } else {
      /* ── REORDER CONTROLS: Up / Down + position input ── */
      const total = list.length;
      const currentPos = listIdx + 1;

      const upBtn = document.createElement('button');
      upBtn.className = 'btn-reorder-up';
      upBtn.innerHTML = '&#8593;';
      upBtn.title = 'Move up';
      upBtn.disabled = listIdx === 0;
      upBtn.addEventListener('click', () => moveProduct(listIdx, -1));

      const downBtn = document.createElement('button');
      downBtn.className = 'btn-reorder-down';
      downBtn.innerHTML = '&#8595;';
      downBtn.title = 'Move down';
      downBtn.disabled = listIdx === total - 1;
      downBtn.addEventListener('click', () => moveProduct(listIdx, 1));

      const posInput = document.createElement('input');
      posInput.type = 'number';
      posInput.className = 'reorder-pos-input';
      posInput.value = currentPos;
      posInput.min = 1;
      posInput.max = total;
      posInput.title = 'Type position and press Enter';
      posInput.addEventListener('change', () => {
        const target = parseInt(posInput.value, 10);
        if (!isNaN(target)) moveProductToIndex(listIdx, target);
      });
      posInput.addEventListener('keydown', e => { if (e.key === 'Enter') posInput.blur(); });

      const posLabel = document.createElement('span');
      posLabel.style.cssText = 'font-size:0.7rem;color:var(--text-muted);white-space:nowrap;';
      posLabel.textContent = `of ${total}`;

      footer.appendChild(upBtn);
      footer.appendChild(downBtn);
      footer.appendChild(posInput);
      footer.appendChild(posLabel);
    }

    card.appendChild(imgWrap); card.appendChild(body); card.appendChild(footer);
    el.appendChild(card);
  });
}
export function noImgSVG() {
  return `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="opacity:0.2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
}

/* ─── REORDER MODE ────────────────────────────── */
export function toggleReorderMode() {
  state.isReorderMode = !state.isReorderMode;
  const btn    = document.getElementById('reorderBtn');
  const hint   = document.getElementById('reorderHint');
  const search = document.getElementById('productSearch');
  if (state.isReorderMode) {
    btn.innerHTML = '&#10003; Done Reordering';
    btn.classList.add('btn-primary');
    btn.classList.remove('btn-secondary');
    hint.style.display = 'flex';
    search.style.display = 'none';
  } else {
    btn.innerHTML = '&#8597; Reorder';
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-secondary');
    hint.style.display = 'none';
    search.style.display = '';
  }
  renderProducts();
}

export async function moveProduct(idx, direction) {
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= state.allProducts.length) return;
  const moved = state.allProducts.splice(idx, 1)[0];
  state.allProducts.splice(newIdx, 0, moved);
  renderProducts();
  await saveProductOrder();
}

export export async function moveProductToIndex(fromIdx, toPos) {
  const toIdx = Math.min(Math.max(toPos - 1, 0), state.allProducts.length - 1);
  if (toIdx === fromIdx) return;
  const moved = state.allProducts.splice(fromIdx, 1)[0];
  state.allProducts.splice(toIdx, 0, moved);
  renderProducts();
  await saveProductOrder();
}

export async function saveProductOrder() {
  const order = state.allProducts.map((p, i) => ({ id: p.id, idx: i }));
  try {
    const res = await callEdge({ action: 'reorder_products', password: state.adminToken, order });
    if (!res.ok) { showToast('Failed to save order.', true); return; }
    state.allProducts.forEach((p, i) => { p.idx = i; });
    showToast('Order saved');
  } catch { showToast('Network error saving order.', true); }
}

