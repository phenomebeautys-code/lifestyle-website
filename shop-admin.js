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
// editingVariants is now an array of { name: string, in_stock: boolean }
let editingVariants = [];

const BADGE_MAP = {
  pending:    'badge-unpaid',
  processing: 'badge-processing',
  dispatched: 'badge-dispatched',
  delivered:  'badge-delivered',
};
const PAGE_TITLES = { hub: 'Hub', orders: 'Orders', products: 'Products', reports: 'Reports' };

/* ─── INIT ──────────────────────────── */
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
document.getElementById('productModal').addEventListener('click', e => {
  if (e.target === document.getElementById('productModal')) closeProductModal();
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

/* ─── AUTH ──────────────────────────── */
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
function logout() { sessionStorage.removeItem('_at_hash'); adminToken = ''; location.reload(); }
function callEdge(body) {
  return fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/* ─── NAVIGATION ────────────────────── */
function navTo(page, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  if (btn) btn.classList.add('active');
  document.getElementById('topbarTitle').textContent = PAGE_TITLES[page] || page;
  if (page === 'products') loadProducts();
}

/* ─── REFRESH ───────────────────────── */
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
    showToast('Refreshed \u2713');
  } catch { showToast('Network error.', true); }
  finally { btn.disabled = false; }
}

/* ─── STATS ─────────────────────────── */
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

/* ─── RECENT SALES ──────────────────── */
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
      <div class="recent-item">
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

/* ─── ORDERS TABLE ──────────────────── */
function applyFilter(filter, btn) {
  activeFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  const target = btn || document.querySelector(`.filter-btn[data-filter="${filter}"]`);
  if (target) target.classList.add('active');
  renderTable(); renderCards();
}
function getFiltered() {
  const q = (document.getElementById('searchInput').value || '').toLowerCase();
  let orders = allOrders;
  if (activeFilter !== 'all') {
    orders = orders.filter(o => o.payment_status === activeFilter || o.status === activeFilter);
  }
  if (q) {
    orders = orders.filter(o =>
      o.customer_name?.toLowerCase().includes(q) ||
      o.customer_email?.toLowerCase().includes(q)
    );
  }
  return orders;
}
function renderTable() {
  const orders = getFiltered();
  const tbody  = document.getElementById('ordersBody');
  if (!orders.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No orders found.</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  orders.forEach(o => {
    const tr    = document.createElement('tr');
    const date  = new Date(o.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
    const items = Array.isArray(o.items) ? o.items : [];
    [
      mkTd(date, 'white-space:nowrap;color:var(--text-muted)'),
      mkCustomerTd(o),
      mkItemsTd(items),
      mkTd('R' + Number(o.total_amount).toLocaleString('en-ZA'), 'font-weight:700;color:var(--accent);white-space:nowrap'),
      mkBadgeTd(o.payment_status === 'paid' ? 'badge-paid' : 'badge-unpaid', o.payment_status === 'paid' ? 'Paid' : 'Unpaid'),
      mkBadgeTd(BADGE_MAP[o.status] || 'badge-unpaid', o.status || 'pending'),
      mkSelectTd(o),
    ].forEach(c => tr.appendChild(c));
    tbody.appendChild(tr);
  });
}
function renderCards() {
  const orders = getFiltered();
  const el     = document.getElementById('orderCards');
  if (!orders.length) {
    el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-muted)">No orders found.</div>';
    return;
  }
  el.innerHTML = '';
  orders.forEach(o => {
    const items = Array.isArray(o.items) ? o.items : [];
    const date  = new Date(o.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
    const card  = document.createElement('div'); card.className = 'order-card';
    const payBadge    = makeBadge(o.payment_status === 'paid' ? 'badge-paid' : 'badge-unpaid', o.payment_status === 'paid' ? 'Paid' : 'Unpaid');
    const statusBadge = makeBadge(BADGE_MAP[o.status] || 'badge-unpaid', o.status || 'pending');
    const sel = makeStatusSelect(o, statusBadge);

    card.innerHTML = `
      <div class="oc-top">
        <div>
          <div class="oc-name">${esc(o.customer_name)}</div>
          <div class="oc-meta">${esc(o.customer_email || '')} &middot; ${esc(o.customer_phone || '')}</div>
        </div>
        <div class="oc-amount">R${Number(o.total_amount).toLocaleString('en-ZA')}</div>
      </div>`;

    const badges = document.createElement('div'); badges.className = 'oc-badges';
    badges.appendChild(payBadge); badges.appendChild(statusBadge);

    const itemsEl = document.createElement('div'); itemsEl.className = 'oc-items';
    items.forEach((item, i) => {
      if (i > 0) itemsEl.appendChild(document.createElement('br'));
      itemsEl.appendChild(document.createTextNode(`${item.qty}\u00d7 ${item.name}${item.variant ? ' (' + item.variant + ')' : ''}`));
    });
    if (!items.length) itemsEl.textContent = 'No items';

    const footer  = document.createElement('div'); footer.className = 'oc-footer';
    const dateEl  = document.createElement('div'); dateEl.className = 'oc-date'; dateEl.textContent = date;

    const actions = document.createElement('div'); actions.className = 'oc-actions';

    const printBtn = document.createElement('button');
    printBtn.className = 'btn-print-label';
    printBtn.textContent = 'Print Label';
    printBtn.addEventListener('click', () => printLabel(o));

    actions.appendChild(sel);
    actions.appendChild(printBtn);
    footer.appendChild(dateEl);
    footer.appendChild(actions);

    card.appendChild(badges);
    card.appendChild(itemsEl);
    card.appendChild(footer);
    el.appendChild(card);
  });
}
function makeBadge(cls, label) {
  const span = document.createElement('span');
  span.className = 'badge ' + cls; span.textContent = label; return span;
}
function makeStatusSelect(o, statusBadge) {
  const sel = document.createElement('select'); sel.className = 'status-select';
  ['pending', 'processing', 'dispatched', 'delivered'].forEach(v => {
    const opt = document.createElement('option'); opt.value = v;
    opt.textContent = v.charAt(0).toUpperCase() + v.slice(1);
    if (o.status === v) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => updateOrderStatus(o.id, sel.value, statusBadge));
  return sel;
}
function mkTd(text, style = '') {
  const td = document.createElement('td');
  if (style) td.style.cssText = style; td.textContent = text; return td;
}
function mkCustomerTd(o) {
  const td = document.createElement('td');
  [['font-weight:600;color:var(--accent-strong)', o.customer_name],
   ['color:var(--text-muted);font-size:0.74rem',  o.customer_email],
   ['color:var(--text-muted);font-size:0.74rem',  o.customer_phone],
   ['color:var(--text-muted);font-size:0.71rem;margin-top:2px', o.delivery_address],
  ].forEach(([style, val]) => {
    const d = document.createElement('div'); d.style.cssText = style; d.textContent = val || ''; td.appendChild(d);
  }); return td;
}
function mkItemsTd(items) {
  const td = document.createElement('td'); const wrap = document.createElement('div'); wrap.className = 'items-mini';
  items.forEach((item, i) => {
    if (i > 0) wrap.appendChild(document.createElement('br'));
    wrap.appendChild(document.createTextNode(`${item.qty}\u00d7 ${item.name}${item.variant ? ' (' + item.variant + ')' : ''}`));
  }); td.appendChild(wrap); return td;
}
function mkBadgeTd(cls, label) {
  const td = document.createElement('td'); td.appendChild(makeBadge(cls, label)); return td;
}
function mkSelectTd(o) {
  const td = document.createElement('td'); td.appendChild(makeStatusSelect(o)); return td;
}
async function updateOrderStatus(id, status, badgeEl) {
  try {
    const res = await callEdge({ action: 'update_status', password: adminToken, order_id: id, status });
    if (res.status === 429) { showToast('Rate limited.', true); return; }
    if (!res.ok)            { showToast('Failed to update.', true); return; }
    const o = allOrders.find(x => x.id === id); if (o) o.status = status;
    if (badgeEl) { badgeEl.className = 'badge ' + (BADGE_MAP[status] || 'badge-unpaid'); badgeEl.textContent = status; }
    updateStats(); renderRecent(); updateReports();
    showToast('Status \u2192 ' + status + ' \u2713');
  } catch { showToast('Network error.', true); }
}

/* ─── PRINT LABEL ───────────────────── */
function printLabel(order) {
  const items   = Array.isArray(order.items) ? order.items : [];
  const date    = new Date(order.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
  const isPaid  = order.payment_status === 'paid';
  const orderNo = String(order.id).slice(0, 8).toUpperCase();

  const itemsHTML = items.map(item => `
    <div class="label-item">${item.qty}\u00d7 &nbsp;<strong>${esc(item.name)}</strong></div>
    ${item.variant ? `<div class="label-item-variant">${esc(item.variant)}</div>` : ''}
  `).join('');

  const area = document.getElementById('printLabelArea');
  area.innerHTML = `
    <div class="label-sheet">
      <div class="label-header">
        <div class="label-brand">PhenomeBeauty</div>
        <div class="label-date">${date}</div>
      </div>

      <div class="label-section">
        <div class="label-section-title">Deliver To</div>
        <div class="label-name">${esc(order.customer_name)}</div>
        ${order.customer_phone   ? `<div class="label-sub">${esc(order.customer_phone)}</div>`   : ''}
        ${order.customer_email   ? `<div class="label-sub">${esc(order.customer_email)}</div>`   : ''}
        ${order.delivery_address ? `<div class="label-sub">${esc(order.delivery_address)}</div>` : ''}
      </div>

      <hr class="label-divider" />

      <div class="label-section">
        <div class="label-section-title">Order #${orderNo}</div>
        ${itemsHTML || '<div class="label-item">No items</div>'}
      </div>

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

/* ─── PRODUCTS ──────────────────────── */

/* Normalise stored images into an array of up to 3 URLs */
function getProductImages(p) {
  if (Array.isArray(p.image_urls) && p.image_urls.length) {
    return p.image_urls.filter(Boolean).slice(0, 3);
  }
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
      if (Array.isArray(data.products)) {
        allProducts = data.products;
        renderProducts();
        return;
      }
    }
    await loadProductsFromRest();
  } catch {
    await loadProductsFromRest();
  }
}
async function loadProductsFromRest() {
  try {
    const res = await fetch(
      `${SUPA_URL}/rest/v1/${PRODUCTS_TABLE}?order=idx.asc`,
      { headers: { 'apikey': SUPA_ANON, 'Authorization': `Bearer ${SUPA_ANON}`, 'Content-Type': 'application/json' } }
    );
    if (!res.ok) {
      console.error('Products REST error:', await res.text());
      allProducts = []; renderProducts();
      showToast('Could not load products: ' + res.status, true);
      return;
    }
    allProducts = await res.json();
    renderProducts();
  } catch (e) {
    console.error('Products fetch failed:', e);
    allProducts = []; renderProducts();
  }
}
function renderProducts() {
  const q    = (document.getElementById('productSearch')?.value || '').toLowerCase();
  const el   = document.getElementById('productsGrid');
  const list = q
    ? allProducts.filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.brand?.toLowerCase().includes(q)
      )
    : allProducts;

  if (!list.length) {
    el.innerHTML = `
      <div class="products-empty" style="grid-column:1/-1">
        No products yet.<br>
        <button class="btn btn-primary" id="emptyAddBtn" style="margin-top:16px">Add your first product</button>
      </div>`;
    document.getElementById('emptyAddBtn')?.addEventListener('click', () => openProductModal());
    return;
  }
  el.innerHTML = '';
  list.forEach(p => {
    const card     = document.createElement('div'); card.className = 'product-card';
    // Show variant names with stock status indicator in the admin card
    const variantDisplay = (p.variants || [])
      .map(v => {
        const name    = typeof v === 'string' ? v : (v.name || '');
        const inStock = typeof v === 'string' ? true : v.in_stock !== false;
        return name ? (inStock ? name : `${name} \u2716`) : null;
      })
      .filter(Boolean)
      .join(', ');
    const images   = getProductImages(p);

    /* ── Image carousel ── */
    const imgWrap = document.createElement('div'); imgWrap.className = 'product-img-wrap';
    if (images.length > 1) {
      const carousel = document.createElement('div'); carousel.className = 'img-carousel';
      const track    = document.createElement('div'); track.className = 'img-carousel-track';
      images.forEach((url, idx) => {
        const slide = document.createElement('div'); slide.className = 'img-carousel-slide';
        const img   = document.createElement('img'); img.src = url; img.alt = (p.name || '') + ' ' + (idx + 1);
        img.onerror = () => { slide.innerHTML = noImgSVG(); };
        slide.appendChild(img);
        track.appendChild(slide);
      });
      carousel.appendChild(track);

      const dots = document.createElement('div'); dots.className = 'img-carousel-dots';
      let currentSlide = 0;
      const dotEls = images.map((_, idx) => {
        const d = document.createElement('button'); d.className = 'img-carousel-dot' + (idx === 0 ? ' active' : '');
        d.setAttribute('aria-label', 'Image ' + (idx + 1));
        d.addEventListener('click', () => goToSlide(idx));
        dots.appendChild(d); return d;
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

      carousel.appendChild(prev);
      carousel.appendChild(next);
      carousel.appendChild(dots);
      imgWrap.appendChild(carousel);
    } else if (images.length === 1) {
      const img = document.createElement('img'); img.src = images[0]; img.alt = p.name || '';
      img.onerror = () => { imgWrap.innerHTML = noImgSVG(); };
      imgWrap.appendChild(img);
    } else {
      imgWrap.innerHTML = noImgSVG();
    }

    const body = document.createElement('div'); body.className = 'product-card-body';
    body.innerHTML = `
      ${p.category       ? `<div class="product-cat">${esc(p.category)}</div>`           : ''}
      <div class="product-name">${esc(p.name || 'Unnamed product')}</div>
      ${p.brand          ? `<div class="product-brand">${esc(p.brand)}</div>`             : ''}
      ${variantDisplay   ? `<div class="product-variant">${esc(variantDisplay)}</div>`   : ''}
      ${p.description    ? `<div class="product-desc">${esc(p.description)}</div>`       : ''}
      <div class="product-price">R${Number(p.price || 0).toLocaleString('en-ZA')}</div>`;
    const footer  = document.createElement('div'); footer.className = 'product-card-footer';
    const editBtn = document.createElement('button'); editBtn.className = 'btn-edit-prod'; editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openProductModal(p));
    const delBtn  = document.createElement('button'); delBtn.className = 'btn-delete-prod'; delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => deleteProduct(p.id, p.name));
    footer.appendChild(editBtn); footer.appendChild(delBtn);
    card.appendChild(imgWrap); card.appendChild(body); card.appendChild(footer);
    el.appendChild(card);
  });
}
function noImgSVG() {
  return `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="opacity:0.2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
}

/* ─── PRODUCT MODAL ─────────────────── */
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

  const imgs = product ? getProductImages(product) : [];
  document.getElementById('mpImage1').value = imgs[0] || '';
  document.getElementById('mpImage2').value = imgs[1] || '';
  document.getElementById('mpImage3').value = imgs[2] || '';

  // Normalise existing variants into { name, in_stock } objects
  editingVariants = (product?.variants || []).map(v => {
    if (typeof v === 'string') return { name: v, in_stock: true };
    return { name: v.name || '', in_stock: v.in_stock !== false };
  }).filter(v => v.name);

  renderVariantRows();
  document.getElementById('productModal').removeAttribute('hidden');
  document.getElementById('mpName').focus();
}
function closeProductModal() {
  document.getElementById('productModal').setAttribute('hidden', '');
}

/**
 * Renders the variant list inside the modal.
 * Each row: [text input for name] [In Stock toggle] [remove button]
 */
function renderVariantRows() {
  const el = document.getElementById('variantsList');
  el.innerHTML = '';

  editingVariants.forEach((v, i) => {
    const row = document.createElement('div');
    row.className = 'variant-row';
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';

    // Name input
    const inp = document.createElement('input');
    inp.type        = 'text';
    inp.value       = v.name;
    inp.placeholder = 'e.g. Scent: Calm';
    inp.style.flex  = '1';
    inp.addEventListener('input', () => { editingVariants[i].name = inp.value; });

    // In-stock toggle label + checkbox
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:0.78rem;color:var(--text-muted);cursor:pointer;white-space:nowrap;user-select:none;';
    label.setAttribute('title', 'Toggle stock availability for this variant');

    const checkbox = document.createElement('input');
    checkbox.type    = 'checkbox';
    checkbox.checked = v.in_stock;
    checkbox.style.cssText = 'accent-color:var(--accent);width:14px;height:14px;cursor:pointer;';
    checkbox.addEventListener('change', () => {
      editingVariants[i].in_stock = checkbox.checked;
      stockText.textContent = checkbox.checked ? 'In Stock' : 'Out of Stock';
      stockText.style.color = checkbox.checked ? 'var(--accent)' : '#f87171';
    });

    const stockText = document.createElement('span');
    stockText.textContent = v.in_stock ? 'In Stock' : 'Out of Stock';
    stockText.style.color = v.in_stock ? 'var(--accent)' : '#f87171';

    label.appendChild(checkbox);
    label.appendChild(stockText);

    // Remove button
    const rm = document.createElement('button');
    rm.className = 'btn-remove-variant';
    rm.innerHTML = '\u00d7';
    rm.type      = 'button';
    rm.addEventListener('click', () => { editingVariants.splice(i, 1); renderVariantRows(); });

    row.appendChild(inp);
    row.appendChild(label);
    row.appendChild(rm);
    el.appendChild(row);
  });
}

function addVariantRow() {
  // New variants default to in_stock: true
  editingVariants.push({ name: '', in_stock: true });
  renderVariantRows();
  const inputs = document.getElementById('variantsList').querySelectorAll('input[type="text"]');
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
  ].filter(Boolean);

  const payload = {
    action:   id ? 'update_product' : 'add_product',
    password: adminToken,
    product: {
      ...(id && { id }),
      name,
      price:       parseFloat(document.getElementById('mpPrice').value)    || 0,
      cost_price:  parseFloat(document.getElementById('mpCost').value)     || 0,
      sku:         document.getElementById('mpSku').value.trim(),
      brand:       document.getElementById('mpBrand').value.trim(),
      description: document.getElementById('mpDesc').value.trim(),
      image_url:   imageUrls[0] || '',
      image_urls:  imageUrls,
      category:    document.getElementById('mpCategory').value.trim(),
      // Save full { name, in_stock } objects — filters out blank names
      variants:    editingVariants
        .filter(v => v.name.trim())
        .map(v => ({ name: v.name.trim(), in_stock: v.in_stock })),
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
    } else {
      allProducts.unshift(data.product || payload.product);
    }
    renderProducts(); closeProductModal();
    showToast(id ? 'Product updated \u2713' : 'Product added \u2713');
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

/* ─── UTILITIES ─────────────────────── */
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function esc(str) { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }
function showToast(msg, isError = false) {
  const t = document.getElementById('adminToast');
  t.textContent = msg;
  t.className = 'admin-toast show' + (isError ? ' error' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2800);
}
