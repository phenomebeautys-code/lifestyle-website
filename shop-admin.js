// shop-admin.js (minimal changes for modular Stock Management)

// ============ Globals & constants ============
const EDGE_URL = 'https://papdxjcfimeyjgzmatpl.supabase.co/functions/v1/shop-admin';
const SUPA_URL = 'https://papdxjcfimeyjgzmatpl.supabase.co';
const SUPA_ANON = 'sb_publishable_XXgqS4qa4-CJJQ7MYxt4Lw_sPbcmGPL';
const PRODUCTS_TABLE = 'products';

let allOrders = [];
let allProducts = [];
let adminToken = '';
let currentFilter = 'all';
let searchQuery = '';
let reorderMode = false;
let pollingInterval = null;

const BADGE_MAP = {
  pending: 'badge-pending',
  paid: 'badge-paid',
  processing: 'badge-processing',
  shipped: 'badge-shipped',
  delivered: 'badge-delivered',
  cancelled: 'badge-cancelled',
};

const STATUS_LABELS = {
  pending: 'Pending',
  paid: 'Paid',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const PAGE_TITLES = {
  hub: 'Hub',
  orders: 'Orders',
  products: 'Products',
  'stock-management': 'Stock Management',
};

const SVG = {
  refresh: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.84.82 6.75 2.22M21 3v6h-6"/></svg>`,
  print: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>`,
  download: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>`,
};

// ============ Utilities ============
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function showToast(msg, isError) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = isError ? 'error' : 'success';
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}

// Expose for modular code
window.ShopAdmin = {
  getToken: () => adminToken,
  showToast,
};

// ============ Auth ============
function hashToken(token) {
  return btoa(token);
}

async function login() {
  const pwd = document.getElementById('adminPassword').value.trim();
  if (!pwd) {
    showToast('Enter admin password', true);
    return;
  }
  adminToken = hashToken(pwd);
  document.getElementById('loginPanel').style.display = 'none';
  document.getElementById('adminApp').style.display = 'flex';
  await refreshData();
  startPolling();
  showToast('Logged in');
}

function logout() {
  adminToken = '';
  stopPolling();
  document.getElementById('loginPanel').style.display = 'flex';
  document.getElementById('adminApp').style.display = 'none';
  showToast('Logged out');
}

async function callEdge(body) {
  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, token: adminToken }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// ============ Polling ============
function startPolling() {
  stopPolling();
  pollingInterval = setInterval(async () => {
    try {
      await refreshData();
    } catch (e) {
      console.error('[polling] refresh failed:', e);
    }
  }, 30000);
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

// ============ Navigation ============
function navTo(page, btn) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  document.querySelectorAll('.page-content').forEach(el => (el.style.display = 'none'));

  const container = document.getElementById(page + 'Content');
  if (!container) return;

  container.style.display = 'block';

  if (page === 'stock-management') {
    if (window.PhenomeAdmin?.renderStockManagement) {
      window.PhenomeAdmin.renderStockManagement(container);
    } else {
      loadStockManagement();
    }
  } else if (page === 'hub') {
    updateStats();
  } else if (page === 'orders') {
    renderTable();
  } else if (page === 'products') {
    renderProducts();
  }
}

// ============ Data refresh ============
async function refreshData() {
  try {
    const [ordersRes, productsRes] = await Promise.all([
      callEdge({ action: 'get_orders' }),
      callEdge({ action: 'get_products' }),
    ]);
    allOrders = ordersRes.orders || [];
    allProducts = productsRes.products || [];
    updateStats();
    updateOrdersBadge();
    if (document.getElementById('ordersContent').style.display !== 'none') {
      renderTable();
    }
    if (document.getElementById('productsContent').style.display !== 'none') {
      renderProducts();
    }
  } catch (e) {
    console.error('[refreshData] failed:', e);
  }
}

// ============ Stats & UI updates ============
function updateStats() {
  const total = allOrders.length;
  const paid = allOrders.filter(o => o.payment_status === 'paid').length;
  const pending = allOrders.filter(o => o.payment_status === 'unpaid').length;
  setText('statTotalOrders', total);
  setText('statPaidOrders', paid);
  setText('statPendingOrders', pending);
}

function updateOrdersBadge() {
  const count = allOrders.filter(o => o.payment_status === 'unpaid').length;
  const badge = document.getElementById('ordersBadge');
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  }
}

function updateReports() {
  // Placeholder for reports section
}

function renderRecent() {
  // Placeholder for recent sales
}

// ============ Delivery helpers ============
function getDeliveryLabel(method) {
  return method === 'door' ? 'Door Delivery' : 'Pudo Locker';
}

// ============ Orders UI ============
function applyFilter(filter) {
  currentFilter = filter;
  renderTable();
}

function getFiltered() {
  let filtered = allOrders;
  if (currentFilter === 'unpaid') {
    filtered = filtered.filter(o => o.payment_status === 'unpaid');
  } else if (currentFilter === 'paid') {
    filtered = filtered.filter(o => o.payment_status === 'paid');
  }
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(
      o =>
        (o.customer_name || '').toLowerCase().includes(q) ||
        (o.customer_email || '').toLowerCase().includes(q) ||
        (o.id || '').toLowerCase().includes(q)
    );
  }
  return filtered;
}

function renderTable() {
  const tbody = document.getElementById('ordersTableBody');
  if (!tbody) return;
  const filtered = getFiltered();
  tbody.innerHTML = filtered
    .map(
      o => `
      <tr>
        ${mkTd(o.id)}
        ${mkCustomerTd(o)}
        ${mkItemsTd(o)}
        ${mkBadgeTd(o)}
        ${mkDeliveryTd(o)}
        ${mkSelectTd(o)}
        ${mkMarkPaidTd(o)}
      </tr>
    `
    )
    .join('');
}

function renderCards() {
  // Placeholder for card view
}

function mkTd(text) {
  return `<td>${esc(text || '')}</td>`;
}

function mkCustomerTd(o) {
  return `<td>${esc(o.customer_name || '')}<br/><small>${esc(o.customer_email || '')}</small></td>`;
}

function mkItemsTd(o) {
  const items = Array.isArray(o.items) ? o.items : [];
  return `<td>${items.map(i => esc(i.name || '') + ' × ' + (i.quantity || 1)).join('<br/>')}</td>`;
}

function mkBadgeTd(o) {
  const cls = BADGE_MAP[o.status] || 'badge-pending';
  const label = STATUS_LABELS[o.status] || o.status;
  return `<td><span class="badge ${cls}">${esc(label)}</span></td>`;
}

function mkDeliveryTd(o) {
  return `<td>${esc(getDeliveryLabel(o.delivery_method))}</td>`;
}

function mkSelectTd(o) {
  const selected = o.status === 'paid' ? 'paid' : o.status === 'processing' ? 'processing' : 'pending';
  return `
    <td>
      <select onchange="updateOrderStatus('${esc(o.id)}', this.value)">
        <option value="pending" ${selected === 'pending' ? 'selected' : ''}>Pending</option>
        <option value="paid" ${selected === 'paid' ? 'selected' : ''}>Paid</option>
        <option value="processing" ${selected === 'processing' ? 'selected' : ''}>Processing</option>
        <option value="shipped" ${selected === 'shipped' ? 'selected' : ''}>Shipped</option>
        <option value="delivered" ${selected === 'delivered' ? 'selected' : ''}>Delivered</option>
        <option value="cancelled" ${selected === 'cancelled' ? 'selected' : ''}>Cancelled</option>
      </select>
    </td>
  `;
}

function mkMarkPaidTd(o) {
  if (o.payment_status === 'paid') return `<td><button disabled>Paid</button></td>`;
  return `<td><button onclick="markAsPaid('${esc(o.id)}')">Mark Paid</button></td>`;
}

async function updateOrderStatus(orderId, newStatus) {
  try {
    await callEdge({ action: 'update_order_status', order_id: orderId, status: newStatus });
    showToast('Order status updated');
    await refreshData();
  } catch (e) {
    showToast('Failed to update status: ' + e.message, true);
  }
}

async function markAsPaid(orderId) {
  try {
    await callEdge({ action: 'mark_order_paid', order_id: orderId });
    showToast('Order marked as paid');
    await refreshData();
  } catch (e) {
    showToast('Failed to mark as paid: ' + e.message, true);
  }
}

// ============ Order detail modal ============
function openOrderDetail(order) {
  // Placeholder
}

function updateFromDetail(orderId, field, value) {
  // Placeholder
}

function closeOrderDetail() {
  // Placeholder
}

// ============ Export & print ============
function exportOrdersCSV() {
  // Placeholder
}

function printLabel(orderId) {
  // Placeholder
}

function closePrintLabel() {
  // Placeholder
}

// ============ Products ============
function getProductImages(product) {
  return Array.isArray(product.image_urls) && product.image_urls.length
    ? product.image_urls
    : product.image_url
      ? [product.image_url]
      : [];
}

async function loadProducts() {
  try {
    const res = await callEdge({ action: 'get_products' });
    allProducts = res.products || [];
    renderProducts();
  } catch (e) {
    showToast('Failed to load products: ' + e.message, true);
  }
}

async function loadProductsFromRest() {
  // Placeholder
}

function renderProducts() {
  const container = document.getElementById('productsGrid');
  if (!container) return;
  container.innerHTML = allProducts
    .map(
      p => `
      <div class="product-card">
        <img src="${esc(getProductImages(p)[0] || '')}" alt="${esc(p.name)}" />
        <h4>${esc(p.name)}</h4>
        <p>R${(p.price || 0).toFixed(2)}</p>
        <button onclick="openProductModal('${esc(p.id)}')">Edit</button>
      </div>
    `
    )
    .join('');
}

function toggleReorderMode() {
  reorderMode = !reorderMode;
  showToast(reorderMode ? 'Reorder mode ON' : 'Reorder mode OFF');
}

function moveProduct(productId, direction) {
  // Placeholder
}

function moveProductToIndex(productId, newIndex) {
  // Placeholder
}

async function saveProductOrder() {
  // Placeholder
}

function normaliseSizes(sizes) {
  return Array.isArray(sizes) ? sizes : [];
}

function openProductModal(productId) {
  // Placeholder
}

function closeProductModal() {
  // Placeholder
}

function renderVariantRows() {
  // Placeholder
}

function addVariantRow() {
  // Placeholder
}

function renderSizeRows() {
  // Placeholder
}

function addSizeRow() {
  // Placeholder
}

async function saveProduct() {
  // Placeholder
}

async function deleteProduct(productId) {
  // Placeholder
}

// ============ Stock Management ============
function loadStockManagement() {
  const container = document.getElementById('stockManagementContent');
  if (!container) return;
  container.innerHTML = `
    <div class="stock-dashboard">
      <h2>Stock Management</h2>
      <p class="muted">Legacy stock management view. Use modular version when available.</p>
    </div>
  `;
}

// ============ Event listeners ============
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loginBtn')?.addEventListener('click', login);
  document.getElementById('logoutBtn')?.addEventListener('click', logout);

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navTo(btn.dataset.page, btn));
  });

  const searchInput = document.getElementById('orderSearch');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      searchQuery = e.target.value;
      renderTable();
    });
  }

  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFilter(btn.dataset.filter);
    });
  });
});
