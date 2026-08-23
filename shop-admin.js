/* ═══════════════════════════════════════
   SHOP ADMIN — JavaScript
═══════════════════════════════════════ */

const EDGE_URL       = 'https://papdxjcfimeyjgzmatpl.supabase.co/functions/v1/shop-admin';
const SUPA_URL       = 'https://papdxjcfimeyjgzmatpl.supabase.co';
const SUPA_ANON      = 'sb_publishable_XXgqS4qa4-CJJQ7MYxt4Lw_sPbcmGPL';
const PRODUCTS_TABLE = 'products';

let allOrders       = [];
let allProducts     = [];
let activeFilter    = 'all';
let adminToken      = '';
let pollTimer       = null;
let editingVariants = [];
let editingSizes    = [];
let isReorderMode   = false;

const BADGE_MAP = {
  pending:    'badge-unpaid',
  processing: 'badge-processing',
  dispatched: 'badge-dispatched',
  delivered:  'badge-delivered',
};
const STATUS_LABELS = {
  pending:    'Payment Pending',
  processing: 'Processing',
  dispatched: 'Dispatched',
  delivered:  'Delivered',
};
const PAGE_TITLES = { hub: 'Hub', orders: 'Orders', products: 'Products', reports: 'Reports' };

/* ─── SVG ICONS ────────────────────────────────── */
const SVG = {
  locker: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;flex-shrink:0" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/><line x1="12" y1="12" x2="12" y2="16"/><circle cx="12" cy="12" r="1"/></svg>`,
  door:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;flex-shrink:0" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  gift:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;flex-shrink:0" aria-hidden="true"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>`,
  check:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;flex-shrink:0" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`,
  star:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="display:inline-block;vertical-align:-2px;flex-shrink:0" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
};

/* ─── INIT ─────────────────────────────────────── */
document.getElementById('adminDate').textContent =
  new Date().toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'long' });

document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
  btn.addEventListener('click', () => { navTo(btn.dataset.page, btn); closeSidebar(); });
});
document.querySelectorAll('[data-nav]').forEach(el => {
  el.addEventListener('click', () => {
    const navBtn = document.querySelector(`.nav-item[data-page="${el.dataset.nav}"]`);
    navTo(el.dataset.nav, navBtn);
    if (el.dataset.filter) applyFilter(el.dataset.filter);
  });
});
document.querySelectorAll('.report-card[data-nav]').forEach(card => {
  card.addEventListener('click', () => {
    const navBtn = document.querySelector(`.nav-item[data-page="${card.dataset.nav}"]`);
    navTo(card.dataset.nav, navBtn);
    if (card.dataset.filter) applyFilter(card.dataset.filter);
  });
});
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => applyFilter(btn.dataset.filter, btn));
});
document.getElementById('searchInput').addEventListener('input', () => { renderTable(); renderCards(); });
document.getElementById('productSearch').addEventListener('input', renderProducts);
document.getElementById('loginBtn').addEventListener('click', login);
document.getElementById('pwInput').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('topbarSignout').addEventListener('click', logout);
document.getElementById('refreshBtn').addEventListener('click', refreshData);
document.getElementById('addProductBtn').addEventListener('click', () => openProductModal());
document.getElementById('modalCancelBtn').addEventListener('click', closeProductModal);
document.getElementById('modalSaveBtn').addEventListener('click', saveProduct);
document.getElementById('addVariantBtn').addEventListener('click', addVariantRow);
document.getElementById('addSizeBtn').addEventListener('click', addSizeRow);
document.getElementById('reorderBtn').addEventListener('click', toggleReorderMode);
document.getElementById('productModal').addEventListener('click', e => {
  if (e.target === document.getElementById('productModal')) closeProductModal();
});
document.getElementById('orderDetailModal').addEventListener('click', e => {
  if (e.target === document.getElementById('orderDetailModal')) closeOrderDetail();
});
document.getElementById('hamburgerBtn').addEventListener('click', toggleSidebar);
document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);

function toggleSidebar() {
  const sidebar   = document.getElementById('sidebar');
  const overlay   = document.getElementById('sidebarOverlay');
  const hamburger = document.getElementById('hamburgerBtn');
  const isOpen    = sidebar.classList.toggle('open');
  overlay.classList.toggle('active', isOpen);
  hamburger.classList.toggle('open', isOpen);
  document.body.classList.toggle('sidebar-open', isOpen);
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('active');
  document.getElementById('hamburgerBtn').classList.remove('open');
  document.body.classList.remove('sidebar-open');
}

/* ─── AUTH ─────────────────────────────────────── */
async function hashToken(pw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function login() {
  const pw  = document.getElementById('pwInput').value;
  const btn = document.getElementById('loginBtn');
  if (!pw) { showLoginError('Please enter your password.'); return; }
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Signing in\u2026';
  hideLoginError();
  try {
    const res = await callEdge({ action: 'get_orders', password: pw });
    if (res.status === 429) { showLoginError('Too many attempts. Wait 60 seconds.'); return; }
    if (res.status === 401) { showLoginError('Incorrect password.'); return; }
    if (!res.ok)            { showLoginError('Server error. Try again.'); return; }
    const data = await res.json();
    adminToken = pw;
    sessionStorage.setItem('_at_hash', await hashToken(pw));
    document.getElementById('loginWrap').style.display = 'none';
    const ui = document.getElementById('adminUI');
    ui.classList.add('visible');
    ui.removeAttribute('aria-hidden');
    allOrders = data.orders || [];
    updateStats(); renderRecent(); renderTable(); renderCards(); updateReports(); updateOrdersBadge();
    startPolling();
  } catch {
    showLoginError('Network error. Check your connection.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Sign In';
  }
}
function showLoginError(msg) {
  const el = document.getElementById('loginError');
  el.textContent = msg; el.style.display = 'block';
}
function hideLoginError() { document.getElementById('loginError').style.display = 'none'; }
function logout() {
  stopPolling();
  sessionStorage.removeItem('_at_hash');
  adminToken = '';
  location.reload();
}
function callEdge(body) {
  return fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/* ─── AUTO-REFRESH POLLING ────────────────────── */
function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    try {
      const res = await callEdge({ action: 'get_orders', password: adminToken });
      if (!res.ok) return;
      const data = await res.json();
      const newOrders = data.orders || [];
      const newlyPaid = newOrders.filter(o => {
        const prev = allOrders.find(x => x.id === o.id);
        return o.payment_status === 'paid' && prev && prev.payment_status !== 'paid';
      });
      allOrders = newOrders;
      updateStats(); renderRecent(); renderTable(); renderCards(); updateReports(); updateOrdersBadge();
      if (newlyPaid.length) {
        showToast(`${newlyPaid.length} new payment${newlyPaid.length > 1 ? 's' : ''} received`);
      }
    } catch { /* silent fail */ }
  }, 30000);
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

/* ─── NAVIGATION ──────────────────────────────── */
function navTo(page, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  if (btn) btn.classList.add('active');
  document.getElementById('topbarTitle').textContent = PAGE_TITLES[page] || page;
  if (page === 'products') loadProducts();
}

/* ─── REFRESH ──────────────────────────────────── */
async function refreshData() {
  const btn = document.getElementById('refreshBtn');
  btn.disabled = true;
  try {
    const res = await callEdge({ action: 'get_orders', password: adminToken });
    if (res.status === 429) { showToast('Rate limited. Wait 60 seconds.', true); return; }
    if (!res.ok)            { showToast('Failed to refresh.', true); return; }
    const data = await res.json();
    allOrders = data.orders || [];
    updateStats(); renderRecent(); renderTable(); renderCards(); updateReports(); updateOrdersBadge();
    showToast('Refreshed');
  } catch { showToast('Network error.', true); }
  finally { btn.disabled = false; }
}

/* ─── STATS ────────────────────────────────────── */
function updateStats() {
  const paid       = allOrders.filter(o => o.payment_status === 'paid');
  const unpaid     = allOrders.filter(o => o.payment_status !== 'paid');
  const dispatched = allOrders.filter(o => o.status === 'dispatched');
  const delivered  = allOrders.filter(o => o.status === 'delivered');
  const rev = paid.reduce((s, o) => s + Number(o.total_amount), 0);
  const avg = paid.length ? Math.round(rev / paid.length) : 0;
  const pct = allOrders.length ? Math.round((paid.length / allOrders.length) * 100) : 0;
  setText('statTotal',        allOrders.length);
  setText('statPaid',         paid.length);
  setText('statPaidPct',      allOrders.length ? pct + '% conversion' : '\u00a0');
  setText('statRevenue',      'R' + rev.toLocaleString('en-ZA'));
  setText('statPending',      unpaid.length);
  setText('payoutRevenue',    'R' + rev.toLocaleString('en-ZA'));
  setText('payoutPaidCount',  paid.length);
  setText('payoutAvg',        'R' + avg.toLocaleString('en-ZA'));
  setText('payoutDispatched', dispatched.length);
  setText('payoutDelivered',  delivered.length);
  setText('payoutUnpaid',     unpaid.length);
}
function updateOrdersBadge() {
  const unpaid = allOrders.filter(o => o.payment_status !== 'paid').length;
  const badge  = document.getElementById('navOrdersBadge');
  badge.textContent = unpaid;
  badge.hidden = unpaid === 0;
}
function updateReports() {
  const paid  = allOrders.filter(o => o.payment_status === 'paid');
  const now   = Date.now();
  const week  = paid.filter(o => now - new Date(o.created_at) < 7  * 864e5);
  const month = paid.filter(o => now - new Date(o.created_at) < 30 * 864e5);
  const wRev  = week.reduce((s, o) => s + Number(o.total_amount), 0);
  const mRev  = month.reduce((s, o) => s + Number(o.total_amount), 0);
  setText('repWeekRev',    'R' + wRev.toLocaleString('en-ZA'));
  setText('repWeekCount',  week.length + ' orders');
  setText('repMonthRev',   'R' + mRev.toLocaleString('en-ZA'));
  setText('repMonthCount', month.length + ' orders');
  const freq = {};
  paid.forEach(o => (o.items || []).forEach(i => { freq[i.name] = (freq[i.name] || 0) + i.qty; }));
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
  setText('repTopProduct', top ? top[0] : '\u2014');
  const delivered = paid.filter(o => o.status === 'delivered').length;
  const rate = paid.length ? Math.round((delivered / paid.length) * 100) : 0;
  setText('repDeliveryRate', paid.length ? rate + '%' : '\u2014');
}

/* ─── RECENT SALES ────────────────────────────── */
function renderRecent() {
  const el   = document.getElementById('recentList');
  const list = [...allOrders]
    .filter(o => o.payment_status === 'paid')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 6);
  if (!list.length) { el.innerHTML = '<div class="recent-empty">No paid orders yet.</div>'; return; }
  el.innerHTML = list.map(o => {
    const date     = new Date(o.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
    const items    = Array.isArray(o.items) ? o.items : [];
    const itemStr  = items.map(i => i.qty + '\u00d7 ' + i.name).join(', ');
    const initials = (o.customer_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    return `
      <div class="recent-item" onclick="openOrderDetail('${o.id}')" style="cursor:pointer">
        <div class="ri-avatar">${initials}</div>
        <div class="ri-info">
          <div class="ri-name">${esc(o.customer_name)}</div>
          <div class="ri-meta">${esc(itemStr || 'No items')}</div>
        </div>
        <div class="ri-right">
          <div class="ri-amount">R${Number(o.total_amount).toLocaleString('en-ZA')}</div>
          <div class="ri-date">${date}</div>
        </div>
      </div>`;
  }).join('');
}

/* ─── DELIVERY HELPERS ────────────────────────── */
function getDeliveryLabel(o) {
  const method = o.delivery_method || 'door';
  const meta   = o.delivery_meta || {};
  if (method === 'locker') {
    return { icon: SVG.locker, label: meta.locker_name || 'Pudo Locker', sub: meta.locker_address || '' };
  }
  return { icon: SVG.door, label: 'Door Delivery', sub: o.delivery_address || '' };
}

const applyFilter = (...args) => window.ShopAdminOrdersTable.applyFilter(...args);
const getFiltered = () => window.ShopAdminOrdersTable.getFiltered();
const renderTable = () => window.ShopAdminOrdersTable.renderTable();
const renderCards = () => window.ShopAdminOrdersTable.renderCards();
const updateOrderStatus = (...args) =>
  window.ShopAdminOrdersTable.updateOrderStatus(...args);

/* ─── MARK AS PAID ───────────────────────────── */
async function markAsPaid(orderId) {
  const btn = document.querySelector(`[data-mark-paid="${orderId}"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'Saving\u2026'; }
  try {
    const res = await callEdge({ action: 'mark_paid', password: adminToken, order_id: orderId });
    if (res.status === 429) { showToast('Rate limited.', true); return; }
    if (!res.ok)            { showToast('Failed to mark as paid.', true); return; }
    const o = allOrders.find(x => x.id === orderId);
    if (o) {
      o.payment_status = 'paid';
      o.paid_at = o.paid_at || new Date().toISOString();
    }
    updateStats(); renderRecent(); renderTable(); renderCards(); updateReports(); updateOrdersBadge();
    const modal = document.getElementById('orderDetailModal');
    if (!modal.hasAttribute('hidden')) openOrderDetail(orderId);
    showToast('Payment marked as paid');
  } catch { showToast('Network error.', true); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Mark as Paid'; } }
}

/* ─── CSV EXPORT ──────────────────────────────── */
function exportOrdersCSV() {
  const orders = getFiltered();
  if (!orders.length) { showToast('No orders to export.', true); return; }
  const headers = ['Date','Order ID','Customer','Email','Phone','Items','Subtotal','Delivery Fee','Total','Payment','Delivery Method','Delivery Address','Status','Gift','Gift Message'];
  const rows = orders.map(o => {
    const items = (o.items || []).map(i => `${i.qty}x ${i.name}${i.variant ? ' ('+i.variant+')' : ''}`).join(' | ');
    return [
      new Date(o.created_at).toLocaleDateString('en-ZA'),
      String(o.id).slice(0,8).toUpperCase(),
      o.customer_name || '',
      o.customer_email || '',
      o.customer_phone || '',
      items,
      o.subtotal || '',
      o.delivery_fee || '',
      o.total_amount || '',
      o.payment_status || '',
      o.delivery_method === 'locker' ? 'Pudo Locker' : 'Door Delivery',
      o.delivery_address || '',
      o.status || '',
      o.is_gift ? 'Yes' : 'No',
      o.gift_message || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`)
  });
  const csv  = [headers.map(h => `"${h}"`), ...rows].map(r => r.join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a'); a.href = url;
  a.download = `phenome-orders-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
  showToast('CSV exported');
}

/* ─── PRINT LABEL ─────────────────────────────── */
function printLabel(order) {
  if (!order) return;
  const items   = Array.isArray(order.items) ? order.items : [];
  const date    = new Date(order.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
  const isPaid  = order.payment_status === 'paid';
  const orderNo = String(order.id).slice(0, 8).toUpperCase();
  const delivInfo = getDeliveryLabel(order);
  const itemsHTML = items.map(item => `
    <div class="label-item">${item.qty}\u00d7 &nbsp;<strong>${esc(item.name)}</strong></div>
    ${item.variant ? `<div class="label-item-variant">${esc(item.variant)}</div>` : ''}
    ${item.size    ? `<div class="label-item-variant">Size: ${esc(item.size)}</div>` : ''}
  `).join('');
  const giftHTML = (order.is_gift && order.gift_message)
    ? `<div class="label-section" style="border-top:1px dashed #ccc;margin-top:10px;padding-top:10px">
         <div class="label-section-title">Gift Message</div>
         <div style="font-size:0.8rem;font-style:italic;color:#555;line-height:1.5">${esc(order.gift_message)}</div>
       </div>`
    : (order.is_gift ? '<div style="font-size:0.75rem;color:#888;margin-top:6px">Gift order (no message)</div>' : '');
  const area = document.getElementById('printLabelArea');
  area.innerHTML = `
    <div class="label-sheet">
      <div class="label-header"><div class="label-brand">PhenomeBeauty</div><div class="label-date">${date}</div></div>
      <div class="label-section">
        <div class="label-section-title">Deliver To</div>
        <div class="label-name">${esc(order.customer_name)}</div>
        ${order.customer_phone ? `<div class="label-sub">${esc(order.customer_phone)}</div>` : ''}
        ${order.customer_email ? `<div class="label-sub">${esc(order.customer_email)}</div>` : ''}
        <div class="label-sub" style="margin-top:4px;font-weight:600">${esc(delivInfo.label)}</div>
        ${delivInfo.sub ? `<div class="label-sub">${esc(delivInfo.sub)}</div>` : ''}
      </div>
      <hr class="label-divider" />
      <div class="label-section">
        <div class="label-section-title">Order #${orderNo}</div>
        ${itemsHTML || '<div class="label-item">No items</div>'}
      </div>
      ${giftHTML}
      <div class="label-total">
        <span>Total</span>
        <span>R${Number(order.total_amount).toLocaleString('en-ZA')}&nbsp;
          <span class="label-paid-badge">${isPaid ? 'PAID' : 'UNPAID'}</span>
        </span>
      </div>
      <button class="label-print-btn" onclick="window.print()">Print</button>
      <button class="label-close-btn" onclick="closePrintLabel()">Close</button>
    </div>`;
  area.style.display = 'block';
  document.body.style.overflow = 'hidden';
}
function closePrintLabel() {
  document.getElementById('printLabelArea').style.display = 'none';
  document.body.style.overflow = '';
}

/* ─── AVAILABILITY HELPERS ──────────────────────── */
const AVAILABILITY_LABELS = {
  available:   null,
  coming_soon: 'Coming Soon',
  unavailable: 'Not Available',
};

/* ─── PRODUCTS ───────────────────────────────────── */
function getProductImages(p) {
  if (Array.isArray(p.image_urls) && p.image_urls.length) return p.image_urls.filter(Boolean).slice(0, 5);
  if (p.image_url) return [p.image_url];
  return [];
}
async function loadProducts() {
  document.getElementById('productsGrid').innerHTML =
    '<div class="products-empty" style="grid-column:1/-1"><span class="spinner"></span> Loading\u2026</div>';
  try {
    const res = await callEdge({ action: 'get_products', password: adminToken });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.products)) { allProducts = data.products; renderProducts(); return; }
    }
    await loadProductsFromRest();
  } catch { await loadProductsFromRest(); }
}
async function loadProductsFromRest() {
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/${PRODUCTS_TABLE}?order=idx.asc`,
      { headers: { 'apikey': SUPA_ANON, 'Authorization': `Bearer ${SUPA_ANON}`, 'Content-Type': 'application/json' } });
    if (!res.ok) { allProducts = []; renderProducts(); showToast('Could not load products: ' + res.status, true); return; }
    allProducts = await res.json(); renderProducts();
  } catch { allProducts = []; renderProducts(); }
}

/* Availability ribbon labels */
const RIBBON_LABELS = {
  available:   'Available',
  coming_soon: 'Coming Soon',
  unavailable: 'Not Available',
};

function renderProducts() {
  const q    = (document.getElementById('productSearch')?.value || '').toLowerCase();
  const el   = document.getElementById('productsGrid');
  const list = q ? allProducts.filter(p => p.name?.toLowerCase().includes(q) || p.brand?.toLowerCase().includes(q)) : allProducts;
  if (!list.length) {
    el.innerHTML = `<div class="products-empty" style="grid-column:1/-1">No products yet.<br><button class="btn btn-primary" id="emptyAddBtn" style="margin-top:16px">Add your first product</button></div>`;
    document.getElementById('emptyAddBtn')?.addEventListener('click', () => openProductModal()); return;
  }
  el.innerHTML = '';
  list.forEach((p, listIdx) => {
    const card = document.createElement('div');
    card.className = 'product-card' + (isReorderMode ? ' reorder-mode' : '');
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

    if (!isReorderMode) {
      const footerBadge = document.createElement('span');
      footerBadge.className = `prod-footer-badge badge-${avail.replace(/_/g, '-')}`;
      footerBadge.textContent = RIBBON_LABELS[avail] || avail;

      const spacer = document.createElement('span');
      spacer.className = 'prod-footer-spacer';

      const editBtn = document.createElement('button'); editBtn.className = 'btn-edit-prod'; editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => openProductModal(p));

      const delBtn = document.createElement('button'); delBtn.className = 'btn-delete-prod'; delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => deleteProduct(p.id, p.name));

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
function noImgSVG() {
  return `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="opacity:0.2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
}

/* ─── REORDER MODE ────────────────────────────── */
function toggleReorderMode() {
  isReorderMode = !isReorderMode;
  const btn    = document.getElementById('reorderBtn');
  const hint   = document.getElementById('reorderHint');
  const search = document.getElementById('productSearch');
  if (isReorderMode) {
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

async function moveProduct(idx, direction) {
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= allProducts.length) return;
  const moved = allProducts.splice(idx, 1)[0];
  allProducts.splice(newIdx, 0, moved);
  renderProducts();
  await saveProductOrder();
}

async function moveProductToIndex(fromIdx, toPos) {
  const toIdx = Math.min(Math.max(toPos - 1, 0), allProducts.length - 1);
  if (toIdx === fromIdx) return;
  const moved = allProducts.splice(fromIdx, 1)[0];
  allProducts.splice(toIdx, 0, moved);
  renderProducts();
  await saveProductOrder();
}

async function saveProductOrder() {
  const order = allProducts.map((p, i) => ({ id: p.id, idx: i }));
  try {
    const res = await callEdge({ action: 'reorder_products', password: adminToken, order });
    if (!res.ok) { showToast('Failed to save order.', true); return; }
    allProducts.forEach((p, i) => { p.idx = i; });
    showToast('Order saved');
  } catch { showToast('Network error saving order.', true); }
}

/* ─── SIZES HELPERS ─────────────────────────────── */
function normaliseSizes(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(s => ({ name: (s.name || '').trim(), price: Number(s.price) || 0 })).filter(s => s.name);
}

/* ─── PRODUCT MODAL ────────────────────────────── */
function openProductModal(product = null) {
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
  editingVariants = (product?.variants || []).map(v => {
    if (typeof v === 'string') return { name: v, in_stock: true };
    return { name: v.name || '', in_stock: v.in_stock !== false };
  }).filter(v => v.name);
  editingSizes = normaliseSizes(product?.sizes || []);
  renderVariantRows(); renderSizeRows();
  document.getElementById('productModal').removeAttribute('hidden');
  document.getElementById('mpName').focus();
}
function closeProductModal() { document.getElementById('productModal').setAttribute('hidden', ''); }

function renderVariantRows() {
  const el = document.getElementById('variantsList'); el.innerHTML = '';
  editingVariants.forEach((v, i) => {
    const row = document.createElement('div'); row.className = 'variant-row';
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';
    const inp = document.createElement('input'); inp.type = 'text'; inp.value = v.name; inp.placeholder = 'e.g. Scent: Calm'; inp.style.flex = '1';
    inp.addEventListener('input', () => { editingVariants[i].name = inp.value; });
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:0.78rem;color:var(--text-muted);cursor:pointer;white-space:nowrap;user-select:none;';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = v.in_stock;
    checkbox.style.cssText = 'accent-color:var(--accent);width:14px;height:14px;cursor:pointer;';
    const stockText = document.createElement('span'); stockText.textContent = v.in_stock ? 'In Stock' : 'Out of Stock';
    stockText.style.color = v.in_stock ? 'var(--accent)' : '#f87171';
    checkbox.addEventListener('change', () => {
      editingVariants[i].in_stock = checkbox.checked;
      stockText.textContent = checkbox.checked ? 'In Stock' : 'Out of Stock';
      stockText.style.color = checkbox.checked ? 'var(--accent)' : '#f87171';
    });
    label.appendChild(checkbox); label.appendChild(stockText);
    const rm = document.createElement('button'); rm.className = 'btn-remove-variant'; rm.innerHTML = '\u00d7'; rm.type = 'button';
    rm.addEventListener('click', () => { editingVariants.splice(i, 1); renderVariantRows(); });
    row.appendChild(inp); row.appendChild(label); row.appendChild(rm); el.appendChild(row);
  });
}
function addVariantRow() {
  editingVariants.push({ name: '', in_stock: true }); renderVariantRows();
  const inputs = document.getElementById('variantsList').querySelectorAll('input[type="text"]');
  inputs[inputs.length - 1]?.focus();
}

function renderSizeRows() {
  const el = document.getElementById('sizesList'); el.innerHTML = '';
  editingSizes.forEach((s, i) => {
    const row = document.createElement('div'); row.className = 'variant-row';
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';
    const nameInp = document.createElement('input'); nameInp.type = 'text'; nameInp.value = s.name; nameInp.placeholder = 'e.g. 50ml'; nameInp.style.flex = '1';
    nameInp.addEventListener('input', () => { editingSizes[i].name = nameInp.value; });
    const priceWrap = document.createElement('div'); priceWrap.style.cssText = 'display:flex;align-items:center;gap:4px;flex-shrink:0;';
    const pricePrefix = document.createElement('span'); pricePrefix.textContent = 'R'; pricePrefix.style.cssText = 'font-size:0.82rem;color:var(--text-muted);font-weight:600;';
    const priceInp = document.createElement('input'); priceInp.type = 'number'; priceInp.value = s.price || ''; priceInp.placeholder = '0.00'; priceInp.min = '0'; priceInp.step = '0.01'; priceInp.style.cssText = 'width:80px;';
    priceInp.addEventListener('input', () => { editingSizes[i].price = parseFloat(priceInp.value) || 0; });
    priceWrap.appendChild(pricePrefix); priceWrap.appendChild(priceInp);
    const rm = document.createElement('button'); rm.className = 'btn-remove-variant'; rm.innerHTML = '\u00d7'; rm.type = 'button';
    rm.addEventListener('click', () => { editingSizes.splice(i, 1); renderSizeRows(); });
    row.appendChild(nameInp); row.appendChild(priceWrap); row.appendChild(rm); el.appendChild(row);
  });
}
function addSizeRow() {
  editingSizes.push({ name: '', price: 0 }); renderSizeRows();
  const inputs = document.getElementById('sizesList').querySelectorAll('input[type="text"]');
  inputs[inputs.length - 1]?.focus();
}

async function saveProduct() {
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
  const cleanSizes = editingSizes.filter(s => s.name.trim()).map(s => ({ name: s.name.trim(), price: s.price }));
  const payload = {
    action: id ? 'update_product' : 'add_product', password: adminToken,
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
      variants:     editingVariants.filter(v => v.name.trim()).map(v => ({ name: v.name.trim(), in_stock: v.in_stock })),
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
      const idx = allProducts.findIndex(p => p.id === id);
      if (idx > -1) allProducts[idx] = data.product || allProducts[idx];
    } else { allProducts.unshift(data.product || payload.product); }
    renderProducts(); closeProductModal(); showToast(id ? 'Product updated' : 'Product added');
  } catch { showToast('Network error.', true); }
  finally  { btn.disabled = false; btn.innerHTML = 'Save Product'; }
}
async function deleteProduct(id, name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  try {
    const res = await callEdge({ action: 'delete_product', password: adminToken, product_id: id });
    if (!res.ok) { showToast('Failed to delete.', true); return; }
    allProducts = allProducts.filter(p => p.id !== id);
    renderProducts(); showToast('Product deleted.');
  } catch { showToast('Network error.', true); }
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
