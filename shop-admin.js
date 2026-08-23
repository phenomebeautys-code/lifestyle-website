/* ═══════════════════════════════════════
   SHOP ADMIN — JavaScript
═══════════════════════════════════════ */

const EDGE_URL = 'https://papdxjcfimeyjgzmatpl.supabase.co/functions/v1/shop-admin';
const SUPA_URL = 'https://papdxjcfimeyjgzmatpl.supabase.co';
const SUPA_ANON = 'sb_publishable_XXgqS4qa4-CJJQ7MYxt4Lw_sPbcmGPL';
const PRODUCTS_TABLE = 'products';

let allOrders = [];
let allProducts = [];
let activeFilter = 'all';
let adminToken = '';
let pollTimer = null;
let editingVariants = [];
let editingSizes = [];
let isReorderMode = false;

const BADGE_MAP = {
  pending: 'badge-unpaid',
  processing: 'badge-processing',
  dispatched: 'badge-dispatched',
  delivered: 'badge-delivered',
};

const STATUS_LABELS = {
  pending: 'Payment Pending',
  processing: 'Processing',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
};

const PAGE_TITLES = {
  hub: 'Hub',
  orders: 'Orders',
  products: 'Products',
  inventory: 'Inventory & Stock',
  reports: 'Reports',
};

/* ─── SVG ICONS ────────────────────────────────── */

const SVG = {
  locker: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;flex-shrink:0" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/><line x1="12" y1="12" x2="12" y2="16"/><circle cx="12" cy="12" r="1"/></svg>`,

  door: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;flex-shrink:0" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,

  gift: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;flex-shrink:0" aria-hidden="true"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>`,

  check: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;flex-shrink:0" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`,

  star: `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="display:inline-block;vertical-align:-2px;flex-shrink:0" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
};

/* ─── INIT ─────────────────────────────────────── */

document.getElementById('adminDate').textContent =
  new Date().toLocaleDateString('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });

document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
  btn.addEventListener('click', () => {
    navTo(btn.dataset.page, btn);
    closeSidebar();
  });
});

document.querySelectorAll('[data-nav]').forEach(el => {
  el.addEventListener('click', () => {
    const navBtn = document.querySelector(
      `.nav-item[data-page="${el.dataset.nav}"]`
    );

    navTo(el.dataset.nav, navBtn);

    if (el.dataset.filter) {
      applyFilter(el.dataset.filter);
    }
  });
});

document.querySelectorAll('.report-card[data-nav]').forEach(card => {
  card.addEventListener('click', () => {
    const navBtn = document.querySelector(
      `.nav-item[data-page="${card.dataset.nav}"]`
    );

    navTo(card.dataset.nav, navBtn);

    if (card.dataset.filter) {
      applyFilter(card.dataset.filter);
    }
  });
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    applyFilter(btn.dataset.filter, btn);
  });
});

document.getElementById('searchInput').addEventListener('input', () => {
  renderTable();
  renderCards();
});

document.getElementById('productSearch').addEventListener('input', renderProducts);

document.getElementById('loginBtn').addEventListener('click', login);

document.getElementById('pwInput').addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    login();
  }
});

document.getElementById('logoutBtn').addEventListener('click', logout);

document.getElementById('topbarSignout').addEventListener('click', logout);

document.getElementById('refreshBtn').addEventListener('click', refreshData);

document.getElementById('addProductBtn').addEventListener('click', () => {
  openProductModal();
});

document.getElementById('modalCancelBtn').addEventListener('click', closeProductModal);

document.getElementById('modalSaveBtn').addEventListener('click', saveProduct);

document.getElementById('addVariantBtn').addEventListener('click', addVariantRow);

document.getElementById('addSizeBtn').addEventListener('click', addSizeRow);

document.getElementById('reorderBtn').addEventListener('click', toggleReorderMode);

document.getElementById('productModal').addEventListener('click', event => {
  if (event.target === document.getElementById('productModal')) {
    closeProductModal();
  }
});

document.getElementById('orderDetailModal').addEventListener('click', event => {
  if (event.target === document.getElementById('orderDetailModal')) {
    closeOrderDetail();
  }
});

document.getElementById('hamburgerBtn').addEventListener('click', toggleSidebar);

document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);

/* ─── SIDEBAR ──────────────────────────────────── */

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const hamburger = document.getElementById('hamburgerBtn');

  const isOpen = sidebar.classList.toggle('open');

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

async function hashToken(password) {
  const buffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(password)
  );

  return Array.from(new Uint8Array(buffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function login() {
  const password = document.getElementById('pwInput').value;
  const button = document.getElementById('loginBtn');

  if (!password) {
    showLoginError('Please enter your password.');
    return;
  }

  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span>Signing in…';

  hideLoginError();

  try {
    const response = await callEdge({
      action: 'get_orders',
      password,
    });

    if (response.status === 429) {
      showLoginError('Too many attempts. Wait 60 seconds.');
      return;
    }

    if (response.status === 401) {
      showLoginError('Incorrect password.');
      return;
    }

    if (!response.ok) {
      showLoginError('Server error. Try again.');
      return;
    }

    const data = await response.json();

    adminToken = password;
    sessionStorage.setItem('_at_hash', await hashToken(password));

    document.getElementById('loginWrap').style.display = 'none';

    const adminUI = document.getElementById('adminUI');
    adminUI.classList.add('visible');
    adminUI.removeAttribute('aria-hidden');

    allOrders = data.orders || [];

    updateStats();
    renderRecent();
    renderTable();
    renderCards();
    updateReports();
    updateOrdersBadge();

    startPolling();
  } catch {
    showLoginError('Network error. Check your connection.');
  } finally {
    button.disabled = false;
    button.innerHTML = 'Sign In';
  }
}

function showLoginError(message) {
  const errorElement = document.getElementById('loginError');
  errorElement.textContent = message;
  errorElement.style.display = 'block';
}

function hideLoginError() {
  document.getElementById('loginError').style.display = 'none';
}

function logout() {
  stopPolling();

  sessionStorage.removeItem('_at_hash');

  adminToken = '';

  location.reload();
}

function callEdge(body) {
  return fetch(EDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

/* ─── AUTO-REFRESH POLLING ────────────────────── */

function startPolling() {
  stopPolling();

  pollTimer = setInterval(async () => {
    try {
      const response = await callEdge({
        action: 'get_orders',
        password: adminToken,
      });

      if (!response.ok) {
        return;
      }

      const data = await response.json();
      const newOrders = data.orders || [];

      const newlyPaid = newOrders.filter(order => {
        const previous = allOrders.find(existing => existing.id === order.id);

        return (
          order.payment_status === 'paid' &&
          previous &&
          previous.payment_status !== 'paid'
        );
      });

      allOrders = newOrders;

      updateStats();
      renderRecent();
      renderTable();
      renderCards();
      updateReports();
      updateOrdersBadge();

      if (newlyPaid.length) {
        showToast(
          `${newlyPaid.length} new payment${newlyPaid.length > 1 ? 's' : ''} received`
        );
      }
    } catch {
      /* Silent polling failure. */
    }
  }, 30000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/* ─── NAVIGATION ──────────────────────────────── */

function navTo(page, btn) {
  document.querySelectorAll('.page').forEach(section => {
    section.classList.remove('active');
  });

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });

  const targetPage = document.getElementById(`page-${page}`);

  if (!targetPage) {
    showToast(`Page "${page}" is not available.`, true);
    return;
  }

  targetPage.classList.add('active');

  if (btn) {
    btn.classList.add('active');
  }

  document.getElementById('topbarTitle').textContent =
    PAGE_TITLES[page] || page;

  if (page === 'products') {
    loadProducts();
  }

  if (page === 'inventory' && window.ShopAdminInventory) {
    window.ShopAdminInventory.init();
  }
}

/* ─── REFRESH ──────────────────────────────────── */

async function refreshData() {
  const button = document.getElementById('refreshBtn');

  button.disabled = true;

  try {
    const response = await callEdge({
      action: 'get_orders',
      password: adminToken,
    });

    if (response.status === 429) {
      showToast('Rate limited. Wait 60 seconds.', true);
      return;
    }

    if (!response.ok) {
      showToast('Failed to refresh.', true);
      return;
    }

    const data = await response.json();

    allOrders = data.orders || [];

    updateStats();
    renderRecent();
    renderTable();
    renderCards();
    updateReports();
    updateOrdersBadge();

    const inventoryPage = document.getElementById('page-inventory');

    if (
      inventoryPage &&
      inventoryPage.classList.contains('active') &&
      window.ShopAdminInventory
    ) {
      window.ShopAdminInventory.refresh().catch(() => {
        /* Inventory module renders its own error state. */
      });
    }

    showToast('Refreshed');
  } catch {
    showToast('Network error.', true);
  } finally {
    button.disabled = false;
  }
}

/* ─── HUB AND REPORTS ─────────────────────────── */

function updateStats() {
  const paid = allOrders.filter(order => order.payment_status === 'paid');
  const unpaid = allOrders.filter(order => order.payment_status !== 'paid');
  const dispatched = allOrders.filter(order => order.status === 'dispatched');
  const delivered = allOrders.filter(order => order.status === 'delivered');

  const revenue = paid.reduce(
    (sum, order) => sum + Number(order.total_amount || 0),
    0
  );

  const averageOrderValue = paid.length
    ? Math.round(revenue / paid.length)
    : 0;

  const paidPercentage = allOrders.length
    ? Math.round((paid.length / allOrders.length) * 100)
    : 0;

  setText('statTotal', allOrders.length);
  setText('statPaid', paid.length);
  setText(
    'statPaidPct',
    allOrders.length ? `${paidPercentage}% conversion` : '\u00A0'
  );
  setText('statRevenue', `R${revenue.toLocaleString('en-ZA')}`);
  setText('statPending', unpaid.length);

  setText('payoutRevenue', `R${revenue.toLocaleString('en-ZA')}`);
  setText('payoutPaidCount', paid.length);
  setText('payoutAvg', `R${averageOrderValue.toLocaleString('en-ZA')}`);
  setText('payoutDispatched', dispatched.length);
  setText('payoutDelivered', delivered.length);
  setText('payoutUnpaid', unpaid.length);
}

function updateOrdersBadge() {
  const unpaidCount = allOrders.filter(
    order => order.payment_status !== 'paid'
  ).length;

  const badge = document.getElementById('navOrdersBadge');

  badge.textContent = unpaidCount;
  badge.hidden = unpaidCount === 0;
}

function updateReports() {
  const paidOrders = allOrders.filter(
    order => order.payment_status === 'paid'
  );

  const now = Date.now();

  const weekOrders = paidOrders.filter(order => {
    return now - new Date(order.created_at) < 7 * 864e5;
  });

  const monthOrders = paidOrders.filter(order => {
    return now - new Date(order.created_at) < 30 * 864e5;
  });

  const weekRevenue = weekOrders.reduce(
    (sum, order) => sum + Number(order.total_amount || 0),
    0
  );

  const monthRevenue = monthOrders.reduce(
    (sum, order) => sum + Number(order.total_amount || 0),
    0
  );

  setText('repWeekRev', `R${weekRevenue.toLocaleString('en-ZA')}`);
  setText('repWeekCount', `${weekOrders.length} orders`);

  setText('repMonthRev', `R${monthRevenue.toLocaleString('en-ZA')}`);
  setText('repMonthCount', `${monthOrders.length} orders`);

  const productFrequency = {};

  paidOrders.forEach(order => {
    (order.items || []).forEach(item => {
      const productName = item.name || 'Unnamed product';

      productFrequency[productName] =
        (productFrequency[productName] || 0) + Number(item.qty || 0);
    });
  });

  const topProduct = Object.entries(productFrequency).sort(
    (a, b) => b[1] - a[1]
  )[0];

  setText('repTopProduct', topProduct ? topProduct[0] : '—');

  const deliveredCount = paidOrders.filter(
    order => order.status === 'delivered'
  ).length;

  const deliveryRate = paidOrders.length
    ? Math.round((deliveredCount / paidOrders.length) * 100)
    : 0;

  setText(
    'repDeliveryRate',
    paidOrders.length ? `${deliveryRate}%` : '—'
  );
}

/* ─── RECENT SALES ────────────────────────────── */

function renderRecent() {
  const container = document.getElementById('recentList');

  const recentOrders = [...allOrders]
    .filter(order => order.payment_status === 'paid')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 6);

  if (!recentOrders.length) {
    container.innerHTML =
      '<div class="recent-empty">No paid orders yet.</div>';
    return;
  }

  container.innerHTML = recentOrders
    .map(order => {
      const date = new Date(order.created_at).toLocaleDateString('en-ZA', {
        day: 'numeric',
        month: 'short',
      });

      const items = Array.isArray(order.items) ? order.items : [];

      const itemSummary = items
        .map(item => `${item.qty}× ${item.name}`)
        .join(', ');

      const initials = (order.customer_name || '?')
        .split(' ')
        .map(word => word[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

      return `
        <div class="recent-item" onclick="openOrderDetail('${order.id}')" style="cursor:pointer">
          <div class="ri-avatar">${initials}</div>

          <div class="ri-info">
            <div class="ri-name">${esc(order.customer_name)}</div>
            <div class="ri-meta">${esc(itemSummary || 'No items')}</div>
          </div>

          <div class="ri-right">
            <div class="ri-amount">R${Number(order.total_amount || 0).toLocaleString('en-ZA')}</div>
            <div class="ri-date">${date}</div>
          </div>
        </div>
      `;
    })
    .join('');
}

/* ─── DELIVERY HELPERS ────────────────────────── */

function getDeliveryLabel(order) {
  const method = order.delivery_method || 'door';
  const meta = order.delivery_meta || {};

  if (method === 'locker') {
    return {
      icon: SVG.locker,
      label: meta.locker_name || 'Pudo Locker',
      sub: meta.locker_address || '',
    };
  }

  return {
    icon: SVG.door,
    label: 'Door Delivery',
    sub: order.delivery_address || '',
  };
}

/* ─── EXTRACTED ORDERS TABLE DELEGATES ─────────── */

const applyFilter = (...args) =>
  window.ShopAdminOrdersTable.applyFilter(...args);

const getFiltered = () =>
  window.ShopAdminOrdersTable.getFiltered();

const renderTable = () =>
  window.ShopAdminOrdersTable.renderTable();

const renderCards = () =>
  window.ShopAdminOrdersTable.renderCards();

const updateOrderStatus = (...args) =>
  window.ShopAdminOrdersTable.updateOrderStatus(...args);

/* ─── MARK AS PAID ───────────────────────────── */

async function markAsPaid(orderId) {
  const button = document.querySelector(
    `[data-mark-paid="${orderId}"]`
  );

  if (button) {
    button.disabled = true;
    button.textContent = 'Saving…';
  }

  try {
    const response = await callEdge({
      action: 'mark_paid',
      password: adminToken,
      order_id: orderId,
    });

    if (response.status === 429) {
      showToast('Rate limited.', true);
      return;
    }

    if (!response.ok) {
      showToast('Failed to mark as paid.', true);
      return;
    }

    const order = allOrders.find(item => item.id === orderId);

    if (order) {
      order.payment_status = 'paid';
      order.paid_at = order.paid_at || new Date().toISOString();
    }

    updateStats();
    renderRecent();
    renderTable();
    renderCards();
    updateReports();
    updateOrdersBadge();

    const detailModal = document.getElementById('orderDetailModal');

    if (!detailModal.hasAttribute('hidden')) {
      openOrderDetail(orderId);
    }

    showToast('Payment marked as paid');
  } catch {
    showToast('Network error.', true);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Mark as Paid';
    }
  }
}

/* ─── CSV EXPORT ──────────────────────────────── */

function exportOrdersCSV() {
  const orders = getFiltered();

  if (!orders.length) {
    showToast('No orders to export.', true);
    return;
  }

  const headers = [
    'Date',
    'Order ID',
    'Customer',
    'Email',
    'Phone',
    'Items',
    'Subtotal',
    'Delivery Fee',
    'Total',
    'Payment',
    'Delivery Method',
    'Delivery Address',
    'Status',
    'Gift',
    'Gift Message',
  ];

  const rows = orders.map(order => {
    const itemText = (order.items || [])
      .map(item => {
        return `${item.qty}x ${item.name}${
          item.variant ? ` (${item.variant})` : ''
        }`;
      })
      .join(' | ');

    return [
      new Date(order.created_at).toLocaleDateString('en-ZA'),
      String(order.id).slice(0, 8).toUpperCase(),
      order.customer_name || '',
      order.customer_email || '',
      order.customer_phone || '',
      itemText,
      order.subtotal || '',
      order.delivery_fee || '',
      order.total_amount || '',
      order.payment_status || '',
      order.delivery_method === 'locker'
        ? 'Pudo Locker'
        : 'Door Delivery',
      order.delivery_address || '',
      order.status || '',
      order.is_gift ? 'Yes' : 'No',
      order.gift_message || '',
    ].map(value => `"${String(value).replace(/"/g, '""')}"`);
  });

  const csv = [headers.map(header => `"${header}"`), ...rows]
    .map(row => row.join(','))
    .join('\r\n');

  const blob = new Blob([csv], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = `phenome-orders-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  anchor.click();

  URL.revokeObjectURL(url);

  showToast('CSV exported');
}

/* ─── PRINT LABEL ─────────────────────────────── */

function printLabel(order) {
  if (!order) {
    return;
  }

  const items = Array.isArray(order.items) ? order.items : [];

  const date = new Date(order.created_at).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const isPaid = order.payment_status === 'paid';
  const orderNumber = String(order.id).slice(0, 8).toUpperCase();
  const delivery = getDeliveryLabel(order);

  const itemsHTML = items
    .map(item => {
      return `
        <div class="label-item">
          ${item.qty}× &nbsp;<strong>${esc(item.name)}</strong>
        </div>

        ${
          item.variant
            ? `<div class="label-item-variant">${esc(item.variant)}</div>`
            : ''
        }

        ${
          item.size
            ? `<div class="label-item-variant">Size: ${esc(item.size)}</div>`
            : ''
        }
      `;
    })
    .join('');

  const giftHTML =
    order.is_gift && order.gift_message
      ? `
        <div class="label-section" style="border-top:1px dashed #ccc;margin-top:10px;padding-top:10px">
          <div class="label-section-title">Gift Message</div>
          <div style="font-size:0.8rem;font-style:italic;color:#555;line-height:1.5">
            ${esc(order.gift_message)}
          </div>
        </div>
      `
      : order.is_gift
        ? '<div style="font-size:0.75rem;color:#888;margin-top:6px">Gift order (no message)</div>'
        : '';

  const printArea = document.getElementById('printLabelArea');

  printArea.innerHTML = `
    <div class="label-sheet">
      <div class="label-header">
        <div class="label-brand">PhenomeBeauty</div>
        <div class="label-date">${date}</div>
      </div>

      <div class="label-section">
        <div class="label-section-title">Deliver To</div>
        <div class="label-name">${esc(order.customer_name)}</div>

        ${
          order.customer_phone
            ? `<div class="label-sub">${esc(order.customer_phone)}</div>`
            : ''
        }

        ${
          order.customer_email
            ? `<div class="label-sub">${esc(order.customer_email)}</div>`
            : ''
        }

        <div class="label-sub" style="margin-top:4px;font-weight:600">
          ${esc(delivery.label)}
        </div>

        ${
          delivery.sub
            ? `<div class="label-sub">${esc(delivery.sub)}</div>`
            : ''
        }
      </div>

      <hr class="label-divider" />

      <div class="label-section">
        <div class="label-section-title">Order #${orderNumber}</div>
        ${itemsHTML || '<div class="label-item">No items</div>'}
      </div>

      ${giftHTML}

      <div class="label-total">
        <span>Total</span>

        <span>
          R${Number(order.total_amount || 0).toLocaleString('en-ZA')}&nbsp;
          <span class="label-paid-badge">${isPaid ? 'PAID' : 'UNPAID'}</span>
        </span>
      </div>

      <button class="label-print-btn" onclick="window.print()">Print</button>
      <button class="label-close-btn" onclick="closePrintLabel()">Close</button>
    </div>
  `;

  printArea.style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function closePrintLabel() {
  document.getElementById('printLabelArea').style.display = 'none';
  document.body.style.overflow = '';
}

const loadProducts = (...args) =>
  window.ShopAdminProducts.loadProducts(...args);

const renderProducts = (...args) =>
  window.ShopAdminProducts.renderProducts(...args);

const openProductModal = (...args) =>
  window.ShopAdminProducts.openProductModal(...args);

const closeProductModal = (...args) =>
  window.ShopAdminProducts.closeProductModal(...args);

const addVariantRow = (...args) =>
  window.ShopAdminProducts.addVariantRow(...args);

const addSizeRow = (...args) =>
  window.ShopAdminProducts.addSizeRow(...args);

const toggleReorderMode = (...args) =>
  window.ShopAdminProducts.toggleReorderMode(...args);

const saveProduct = (...args) =>
  window.ShopAdminProducts.saveProduct(...args);

const deleteProduct = (...args) =>
  window.ShopAdminProducts.deleteProduct(...args);

/* ─── UTILITIES ───────────────────────────────── */

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

function esc(value) {
  const element = document.createElement('div');

  element.textContent = value || '';

  return element.innerHTML;
}

function showToast(message, isError = false) {
  const toast = document.getElementById('adminToast');

  toast.textContent = message;

  toast.className =
    'admin-toast show' + (isError ? ' error' : '');

  clearTimeout(toast._timer);

  toast._timer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2800);
}
