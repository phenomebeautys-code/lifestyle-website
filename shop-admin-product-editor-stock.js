/* shop-admin-product-editor-stock.js */
import { state, callEdge, showToast, esc, normaliseSizes } from './shop-admin-core.js';
import { renderProducts } from './shop-admin-products.js';

/* ─── SIZES HELPERS ─────────────────────────────── */
function getProductImages(product) {
  if (Array.isArray(product?.image_urls) && product.image_urls.length) {
    return product.image_urls.filter(Boolean).slice(0, 5);
  }
  return product?.image_url ? [product.image_url] : [];
}

/* ─── PRODUCT MODAL ────────────────────────────── */
export function openProductModal(product = null) {
  document.getElementById('modalTitle').textContent  = product ? 'Edit Product' : 'Add Product';
  document.getElementById('modalProductId').value    = product?.id || '';
  document.getElementById('mpName').value            = product?.name || '';
  document.getElementById('mpPrice').value           = product?.price || '';
  document.getElementById('mpCost').value            = product?.cost_price || '';
  document.getElementById('mpSku').value             = product?.sku || '';
  document.getElementById('mpBrand').value           = product?.brand || '';
  document.getElementById('mpDesc').value            = product?.description || '';
  document.getElementById('mpCategory').value        = product?.category || '';
  document.getElementById('mpAvailability').value    = product?.availability || 'available';
  const imgs = product ? getProductImages(product) : [];
  document.getElementById('mpImage1').value = imgs[0] || '';
  document.getElementById('mpImage2').value = imgs[1] || '';
  document.getElementById('mpImage3').value = imgs[2] || '';
  document.getElementById('mpImage4').value = imgs[3] || '';
  document.getElementById('mpImage5').value = imgs[4] || '';
  state.editingVariants = (product?.variants || []).map(v => {
    if (typeof v === 'string') return { name: v, in_stock: true };
    return { name: v.name || '', in_stock: v.in_stock !== false };
  }).filter(v => v.name);
  state.editingSizes = normaliseSizes(product?.sizes || []);
  renderVariantRows(); renderSizeRows();
  document.getElementById('productModal').removeAttribute('hidden');
  document.getElementById('mpName').focus();
}
export function closeProductModal() { document.getElementById('productModal').setAttribute('hidden', ''); }

export function renderVariantRows() {
  const el = document.getElementById('variantsList'); el.innerHTML = '';
  state.editingVariants.forEach((v, i) => {
    const row = document.createElement('div'); row.className = 'variant-row';
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';
    const inp = document.createElement('input'); inp.type = 'text'; inp.value = v.name; inp.placeholder = 'e.g. Scent: Calm'; inp.style.flex = '1';
    inp.addEventListener('input', () => { state.editingVariants[i].name = inp.value; });
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:0.78rem;color:var(--text-muted);cursor:pointer;white-space:nowrap;user-select:none;';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = v.in_stock;
    checkbox.style.cssText = 'accent-color:var(--accent);width:14px;height:14px;cursor:pointer;';
    const stockText = document.createElement('span'); stockText.textContent = v.in_stock ? 'In Stock' : 'Out of Stock';
    stockText.style.color = v.in_stock ? 'var(--accent)' : '#f87171';
    checkbox.addEventListener('change', () => {
      state.editingVariants[i].in_stock = checkbox.checked;
      stockText.textContent = checkbox.checked ? 'In Stock' : 'Out of Stock';
      stockText.style.color = checkbox.checked ? 'var(--accent)' : '#f87171';
    });
    label.appendChild(checkbox); label.appendChild(stockText);
    const rm = document.createElement('button'); rm.className = 'btn-remove-variant'; rm.innerHTML = '\u00d7'; rm.type = 'button';
    rm.addEventListener('click', () => { state.editingVariants.splice(i, 1); renderVariantRows(); });
    row.appendChild(inp); row.appendChild(label); row.appendChild(rm); el.appendChild(row);
  });
}
export function addVariantRow() {
  state.editingVariants.push({ name: '', in_stock: true }); renderVariantRows();
  const inputs = document.getElementById('variantsList').querySelectorAll('input[type="text"]');
  inputs[inputs.length - 1]?.focus();
}

export function renderSizeRows() {
  const el = document.getElementById('sizesList'); el.innerHTML = '';
  state.editingSizes.forEach((s, i) => {
    const row = document.createElement('div'); row.className = 'variant-row';
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';
    const nameInp = document.createElement('input'); nameInp.type = 'text'; nameInp.value = s.name; nameInp.placeholder = 'e.g. 50ml'; nameInp.style.flex = '1';
    nameInp.addEventListener('input', () => { state.editingSizes[i].name = nameInp.value; });
    const priceWrap = document.createElement('div'); priceWrap.style.cssText = 'display:flex;align-items:center;gap:4px;flex-shrink:0;';
    const pricePrefix = document.createElement('span'); pricePrefix.textContent = 'R'; pricePrefix.style.cssText = 'font-size:0.82rem;color:var(--text-muted);font-weight:600;';
    const priceInp = document.createElement('input'); priceInp.type = 'number'; priceInp.value = s.price || ''; priceInp.placeholder = '0.00'; priceInp.min = '0'; priceInp.step = '0.01'; priceInp.style.cssText = 'width:80px;';
    priceInp.addEventListener('input', () => { state.editingSizes[i].price = parseFloat(priceInp.value) || 0; });
    priceWrap.appendChild(pricePrefix); priceWrap.appendChild(priceInp);
    const rm = document.createElement('button'); rm.className = 'btn-remove-variant'; rm.innerHTML = '\u00d7'; rm.type = 'button';
    rm.addEventListener('click', () => { state.editingSizes.splice(i, 1); renderSizeRows(); });
    row.appendChild(nameInp); row.appendChild(priceWrap); row.appendChild(rm); el.appendChild(row);
  });
}
export function addSizeRow() {
  state.editingSizes.push({ name: '', price: 0 }); renderSizeRows();
  const inputs = document.getElementById('sizesList').querySelectorAll('input[type="text"]');
  inputs[inputs.length - 1]?.focus();
}

export async function saveProduct() {
  const btn  = document.getElementById('modalSaveBtn');
  const id   = document.getElementById('modalProductId').value;
  const name = document.getElementById('mpName').value.trim();
  if (!name) { showToast('Product name is required.', true); return; }
  const imageUrls = [
    document.getElementById('mpImage1').value.trim(),
    document.getElementById('mpImage2').value.trim(),
    document.getElementById('mpImage3').value.trim(),
    document.getElementById('mpImage4').value.trim(),
    document.getElementById('mpImage5').value.trim(),
  ].filter(Boolean);
  const cleanSizes = state.editingSizes.filter(s => s.name.trim()).map(s => ({ name: s.name.trim(), price: s.price }));
  const payload = {
    action: id ? 'update_product' : 'add_product', password: state.adminToken,
    product: {
      ...(id && { id }), name,
      price:        parseFloat(document.getElementById('mpPrice').value)    || 0,
      cost_price:   parseFloat(document.getElementById('mpCost').value)     || 0,
      sku:          document.getElementById('mpSku').value.trim(),
      brand:        document.getElementById('mpBrand').value.trim(),
      description:  document.getElementById('mpDesc').value.trim(),
      image_url:    imageUrls[0] || '',
      image_urls:   imageUrls,
      category:     document.getElementById('mpCategory').value.trim(),
      availability: document.getElementById('mpAvailability').value || 'available',
      variants:     state.editingVariants.filter(v => v.name.trim()).map(v => ({ name: v.name.trim(), in_stock: v.in_stock })),
      sizes:        cleanSizes,
    },
  };
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Saving\u2026';
  try {
    const res = await callEdge(payload);
    if (res.status === 429) { showToast('Rate limited.', true); return; }
    if (!res.ok)            { showToast('Failed to save product.', true); return; }
    const data = await res.json();
    if (id) {
      const idx = state.allProducts.findIndex(p => p.id === id);
      if (idx > -1) state.allProducts[idx] = data.product || state.allProducts[idx];
    } else { state.allProducts.unshift(data.product || payload.product); }
    renderProducts(); closeProductModal(); showToast(id ? 'Product updated' : 'Product added');
  } catch { showToast('Network error.', true); }
  finally  { btn.disabled = false; btn.innerHTML = 'Save Product'; }
}
export async function deleteProduct(id, name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  try {
    const res = await callEdge({ action: 'delete_product', password: state.adminToken, product_id: id });
    if (!res.ok) { showToast('Failed to delete.', true); return; }
    state.allProducts = state.allProducts.filter(p => p.id !== id);
    renderProducts(); showToast('Product deleted.');
  } catch { showToast('Network error.', true); }
}

/* ─── STOCK MANAGEMENT ──────────────────────────── */
export async function loadStockManagement() {
  const el = document.getElementById('stockManagementContent');
  el.innerHTML = '<div class="products-empty"><span class="spinner"></span> Loading stock\u2026</div>';
  if (!state.allProducts.length) await loadProducts();

  if (!state.allProducts.length) {
    el.innerHTML = '<div class="products-empty">No products to show stock for yet.</div>';
    return;
  }

  const rows = state.allProducts.map(p => {
    const variants = (p.variants || []).map(v => {
      const name    = typeof v === 'string' ? v : (v.name || '');
      const inStock = typeof v === 'string' ? true : v.in_stock !== false;
      return { name, inStock };
    }).filter(v => v.name);

    const variantHTML = variants.length
      ? variants.map(v => `
          <span class="badge ${v.inStock ? 'badge-delivered' : 'badge-unpaid'}" style="margin:2px 4px 2px 0;font-size:0.7rem;">
            ${esc(v.name)} &middot; ${v.inStock ? 'In Stock' : 'Out of Stock'}
          </span>`).join('')
      : '<span style="color:var(--text-muted);font-size:0.78rem">No variants tracked</span>';

    return `
      <div class="panel" style="margin-bottom:12px;padding:16px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px;">
          <div>
            <div style="font-weight:700;color:var(--accent-strong);">${esc(p.name || 'Unnamed product')}</div>
            ${p.sku ? `<div style="font-size:0.74rem;color:var(--text-muted);margin-top:2px;">SKU: ${esc(p.sku)}</div>` : ''}
          </div>
          <span class="badge badge-${(p.availability || 'available').replace(/_/g, '-')}">
            ${esc(p.availability === 'coming_soon' ? 'Coming Soon' : p.availability === 'unavailable' ? 'Not Available' : 'Available')}
          </span>
        </div>
        <div>${variantHTML}</div>
      </div>`;
  }).join('');

  el.innerHTML = rows;
}

/* ─── UTILITIES ─────────────────────────────────── */
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function esc(str) { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }
function showToast(msg, isError = false) {
  const t = document.getElementById('adminToast');
  t.textContent = msg;
  t.className = 'admin-toast show' + (isError ? ' error' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2800);
}
