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

/* ─── ORDERS TABLE ────────────────────────────── */
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
      o.customer_email?.toLowerCase().includes(q) ||
      String(o.id).slice(0, 8).toLowerCase().includes(q)
    );
  }
  return orders;
}
function renderTable() {
  const orders = getFiltered();
  const tbody  = document.getElementById('ordersBody');
  if (!orders.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9">No orders found.</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  orders.forEach(o => {
    const tr   = document.createElement('tr');
    tr.style.cursor = 'pointer';
    const date = new Date(o.created_at).toLocaleDateString('en-ZA', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    const items = Array.isArray(o.items) ? o.items : [];
    [
      mkTd(date, 'white-space:nowrap;color:var(--text-muted)'),
      mkCustomerTd(o),
      mkItemsTd(items),
      mkTd('R' + Number(o.total_amount).toLocaleString('en-ZA'), 'font-weight:700;color:var(--accent);white-space:nowrap'),
      mkBadgeTd(o.payment_status === 'paid' ? 'badge-paid' : 'badge-unpaid', o.payment_status === 'paid' ? 'Paid' : 'Unpaid'),
      mkDeliveryTd(o),
      mkBadgeTd(BADGE_MAP[o.status] || 'badge-unpaid', STATUS_LABELS[o.status] || o.status || 'Payment Pending'),
      mkSelectTd(o),
      mkMarkPaidTd(o),
    ].forEach(c => tr.appendChild(c));
    tr.addEventListener('click', e => {
      if (e.target.closest('select, button')) return;
      openOrderDetail(o.i