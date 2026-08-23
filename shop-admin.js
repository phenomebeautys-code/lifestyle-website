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

/* ─── AVAILABILITY HELPERS ────────────────────── */

const AVAILABILITY_LABELS = {
  available: null,
  coming_soon: 'Coming Soon',
  unavailable: 'Not Available',
};

const RIBBON_LABELS = {
  available: 'Available',
  coming_soon: 'Coming Soon',
  unavailable: 'Not Available',
};

/* ─── PRODUCTS ────────────────────────────────── */

function getProductImages(product) {
  if (Array.isArray(product.image_urls) && product.image_urls.length) {
    return product.image_urls.filter(Boolean).slice(0, 5);
  }

  if (product.image_url) {
    return [product.image_url];
  }

  return [];
}

async function loadProducts() {
  document.getElementById('productsGrid').innerHTML =
    '<div class="products-empty" style="grid-column:1/-1"><span class="spinner"></span> Loading…</div>';

  try {
    const response = await callEdge({
      action: 'get_products',
      password: adminToken,
    });

    if (response.ok) {
      const data = await response.json();

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
    const response = await fetch(
      `${SUPA_URL}/rest/v1/${PRODUCTS_TABLE}?order=idx.asc`,
      {
        headers: {
          apikey: SUPA_ANON,
          Authorization: `Bearer ${SUPA_ANON}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      allProducts = [];
      renderProducts();
      showToast(`Could not load products: ${response.status}`, true);
      return;
    }

    allProducts = await response.json();
    renderProducts();
  } catch {
    allProducts = [];
    renderProducts();
  }
}

function renderProducts() {
  const searchQuery = (
    document.getElementById('productSearch')?.value || ''
  ).toLowerCase();

  const container = document.getElementById('productsGrid');

  const products = searchQuery
    ? allProducts.filter(product => {
      return (
        product.name?.toLowerCase().includes(searchQuery) ||
        product.brand?.toLowerCase().includes(searchQuery)
      );
    })
    : allProducts;

  if (!products.length) {
    container.innerHTML = `
      <div class="products-empty" style="grid-column:1/-1">
        No products yet.<br>
        <button class="btn btn-primary" id="emptyAddBtn" style="margin-top:16px">
          Add your first product
        </button>
      </div>
    `;

    document
      .getElementById('emptyAddBtn')
      ?.addEventListener('click', () => openProductModal());

    return;
  }

  container.innerHTML = '';

  products.forEach((product, productIndex) => {
    const card = document.createElement('div');

    card.className =
      'product-card' + (isReorderMode ? ' reorder-mode' : '');

    card.dataset.productId = product.id;

    const variantDisplay = (product.variants || [])
      .map(variant => {
        const name =
          typeof variant === 'string'
            ? variant
            : variant.name || '';

        const inStock =
          typeof variant === 'string'
            ? true
            : variant.in_stock !== false;

        return name ? (inStock ? name : `${name} ✖`) : null;
      })
      .filter(Boolean)
      .join(', ');

    const sizeDisplay = normaliseSizes(product.sizes)
      .map(size => `${size.name} (R${size.price})`)
      .join(', ');

    const images = getProductImages(product);
    const availability = product.availability || 'available';

    const imageWrap = document.createElement('div');
    imageWrap.className = 'product-img-wrap';

    if (images.length > 1) {
      const carousel = document.createElement('div');
      carousel.className = 'img-carousel';

      const track = document.createElement('div');
      track.className = 'img-carousel-track';

      images.forEach((url, imageIndex) => {
        const slide = document.createElement('div');
        slide.className = 'img-carousel-slide';

        const image = document.createElement('img');

        image.src = url;
        image.alt = `${product.name || ''} ${imageIndex + 1}`;

        image.onerror = () => {
          slide.innerHTML = noImgSVG();
        };

        slide.appendChild(image);
        track.appendChild(slide);
      });

      carousel.appendChild(track);

      const dots = document.createElement('div');
      dots.className = 'img-carousel-dots';

      let currentSlide = 0;

      const dotElements = images.map((_, imageIndex) => {
        const dot = document.createElement('button');

        dot.className =
          'img-carousel-dot' + (imageIndex === 0 ? ' active' : '');

        dot.setAttribute('aria-label', `Image ${imageIndex + 1}`);

        dot.addEventListener('click', () => {
          goToSlide(imageIndex);
        });

        dots.appendChild(dot);

        return dot;
      });

      const previousButton = document.createElement('button');
      previousButton.className = 'img-carousel-btn img-carousel-prev';
      previousButton.innerHTML = '&#8249;';
      previousButton.setAttribute('aria-label', 'Previous image');

      const nextButton = document.createElement('button');
      nextButton.className = 'img-carousel-btn img-carousel-next';
      nextButton.innerHTML = '&#8250;';
      nextButton.setAttribute('aria-label', 'Next image');

      function goToSlide(index) {
        currentSlide = (index + images.length) % images.length;

        track.style.transform =
          `translateX(-${currentSlide * 100}%)`;

        dotElements.forEach((dot, dotIndex) => {
          dot.classList.toggle('active', dotIndex === currentSlide);
        });
      }

      previousButton.addEventListener('click', () => {
        goToSlide(currentSlide - 1);
      });

      nextButton.addEventListener('click', () => {
        goToSlide(currentSlide + 1);
      });

      carousel.appendChild(previousButton);
      carousel.appendChild(nextButton);
      carousel.appendChild(dots);

      imageWrap.appendChild(carousel);
    } else if (images.length === 1) {
      const image = document.createElement('img');

      image.src = images[0];
      image.alt = product.name || '';

      image.onerror = () => {
        imageWrap.innerHTML = noImgSVG();
      };

      imageWrap.appendChild(image);
    } else {
      imageWrap.innerHTML = noImgSVG();
    }

    const ribbon = document.createElement('span');

    ribbon.className =
      `prod-avail-ribbon ribbon-${availability.replace(/_/g, '-')}`;

    ribbon.textContent =
      RIBBON_LABELS[availability] || availability;

    imageWrap.appendChild(ribbon);

    const body = document.createElement('div');
    body.className = 'product-card-body';

    body.innerHTML = `
      <div class="product-price">
        R${Number(product.price || 0).toLocaleString('en-ZA')}
        ${
          sizeDisplay
            ? '<span style="font-size:0.72rem;color:var(--text-muted);font-weight:400">(base)</span>'
            : ''
        }
      </div>

      ${
        product.category
          ? `<div class="product-cat">${esc(product.category)}</div>`
          : ''
      }

      <div class="product-name">
        ${esc(product.name || 'Unnamed product')}
      </div>

      ${
        product.brand
          ? `<div class="product-brand">${esc(product.brand)}</div>`
          : ''
      }

      ${
        variantDisplay
          ? `<div class="product-variant">${esc(variantDisplay)}</div>`
          : ''
      }

      ${
        sizeDisplay
          ? `<div class="product-variant">Sizes: ${esc(sizeDisplay)}</div>`
          : ''
      }

      ${
        product.description
          ? `<div class="product-desc">${esc(product.description)}</div>`
          : ''
      }
    `;

    const footer = document.createElement('div');
    footer.className = 'product-card-footer';

    if (!isReorderMode) {
      const availabilityBadge = document.createElement('span');

      availabilityBadge.className =
        `prod-footer-badge badge-${availability.replace(/_/g, '-')}`;

      availabilityBadge.textContent =
        RIBBON_LABELS[availability] || availability;

      const spacer = document.createElement('span');
      spacer.className = 'prod-footer-spacer';

      const editButton = document.createElement('button');
      editButton.className = 'btn-edit-prod';
      editButton.textContent = 'Edit';

      editButton.addEventListener('click', () => {
        openProductModal(product);
      });

      const deleteButton = document.createElement('button');
      deleteButton.className = 'btn-delete-prod';
      deleteButton.textContent = 'Delete';

      deleteButton.addEventListener('click', () => {
        deleteProduct(product.id, product.name);
      });

      footer.appendChild(availabilityBadge);
      footer.appendChild(spacer);
      footer.appendChild(editButton);
      footer.appendChild(deleteButton);
    } else {
      const totalProducts = products.length;
      const currentPosition = productIndex + 1;

      const moveUpButton = document.createElement('button');

      moveUpButton.className = 'btn-reorder-up';
      moveUpButton.innerHTML = '&#8593;';
      moveUpButton.title = 'Move up';
      moveUpButton.disabled = productIndex === 0;

      moveUpButton.addEventListener('click', () => {
        moveProduct(productIndex, -1);
      });

      const moveDownButton = document.createElement('button');

      moveDownButton.className = 'btn-reorder-down';
      moveDownButton.innerHTML = '&#8595;';
      moveDownButton.title = 'Move down';
      moveDownButton.disabled = productIndex === totalProducts - 1;

      moveDownButton.addEventListener('click', () => {
        moveProduct(productIndex, 1);
      });

      const positionInput = document.createElement('input');

      positionInput.type = 'number';
      positionInput.className = 'reorder-pos-input';
      positionInput.value = currentPosition;
      positionInput.min = 1;
      positionInput.max = totalProducts;
      positionInput.title = 'Type position and press Enter';

      positionInput.addEventListener('change', () => {
        const requestedPosition = parseInt(positionInput.value, 10);

        if (!Number.isNaN(requestedPosition)) {
          moveProductToIndex(productIndex, requestedPosition);
        }
      });

      positionInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          positionInput.blur();
        }
      });

      const positionLabel = document.createElement('span');

      positionLabel.style.cssText =
        'font-size:0.7rem;color:var(--text-muted);white-space:nowrap;';

      positionLabel.textContent = `of ${totalProducts}`;

      footer.appendChild(moveUpButton);
      footer.appendChild(moveDownButton);
      footer.appendChild(positionInput);
      footer.appendChild(positionLabel);
    }

    card.appendChild(imageWrap);
    card.appendChild(body);
    card.appendChild(footer);

    container.appendChild(card);
  });
}

function noImgSVG() {
  return `
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="opacity:0.2">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  `;
}

/* ─── REORDER MODE ────────────────────────────── */

function toggleReorderMode() {
  isReorderMode = !isReorderMode;

  const button = document.getElementById('reorderBtn');
  const hint = document.getElementById('reorderHint');
  const search = document.getElementById('productSearch');

  if (isReorderMode) {
    button.innerHTML = '&#10003; Done Reordering';
    button.classList.add('btn-primary');
    button.classList.remove('btn-secondary');

    hint.style.display = 'flex';
    search.style.display = 'none';
  } else {
    button.innerHTML = '&#8597; Reorder';
    button.classList.remove('btn-primary');
    button.classList.add('btn-secondary');

    hint.style.display = 'none';
    search.style.display = '';
  }

  renderProducts();
}

async function moveProduct(index, direction) {
  const nextIndex = index + direction;

  if (nextIndex < 0 || nextIndex >= allProducts.length) {
    return;
  }

  const movedProduct = allProducts.splice(index, 1)[0];

  allProducts.splice(nextIndex, 0, movedProduct);

  renderProducts();

  await saveProductOrder();
}

async function moveProductToIndex(fromIndex, targetPosition) {
  const targetIndex = Math.min(
    Math.max(targetPosition - 1, 0),
    allProducts.length - 1
  );

  if (targetIndex === fromIndex) {
    return;
  }

  const movedProduct = allProducts.splice(fromIndex, 1)[0];

  allProducts.splice(targetIndex, 0, movedProduct);

  renderProducts();

  await saveProductOrder();
}

async function saveProductOrder() {
  const order = allProducts.map((product, index) => ({
    id: product.id,
    idx: index,
  }));

  try {
    const response = await callEdge({
      action: 'reorder_products',
      password: adminToken,
      order,
    });

    if (!response.ok) {
      showToast('Failed to save order.', true);
      return;
    }

    allProducts.forEach((product, index) => {
      product.idx = index;
    });

    showToast('Order saved');
  } catch {
    showToast('Network error saving order.', true);
  }
}

/* ─── SIZE HELPERS ────────────────────────────── */

function normaliseSizes(rawSizes) {
  if (!Array.isArray(rawSizes)) {
    return [];
  }

  return rawSizes
    .map(size => ({
      name: (size.name || '').trim(),
      price: Number(size.price) || 0,
    }))
    .filter(size => size.name);
}

/* ─── PRODUCT MODAL ───────────────────────────── */

function openProductModal(product = null) {
  document.getElementById('modalTitle').textContent =
    product ? 'Edit Product' : 'Add Product';

  document.getElementById('modalProductId').value =
    product?.id || '';

  document.getElementById('mpName').value =
    product?.name || '';

  document.getElementById('mpPrice').value =
    product?.price || '';

  document.getElementById('mpCost').value =
    product?.cost_price || '';

  document.getElementById('mpSku').value =
    product?.sku || '';

  document.getElementById('mpBrand').value =
    product?.brand || '';

  document.getElementById('mpDesc').value =
    product?.description || '';

  document.getElementById('mpCategory').value =
    product?.category || '';

  document.getElementById('mpAvailability').value =
    product?.availability || 'available';

  const images = product ? getProductImages(product) : [];

  document.getElementById('mpImage1').value = images[0] || '';
  document.getElementById('mpImage2').value = images[1] || '';
  document.getElementById('mpImage3').value = images[2] || '';
  document.getElementById('mpImage4').value = images[3] || '';
  document.getElementById('mpImage5').value = images[4] || '';

  editingVariants = (product?.variants || [])
    .map(variant => {
      if (typeof variant === 'string') {
        return {
          name: variant,
          in_stock: true,
        };
      }

      return {
        name: variant.name || '',
        in_stock: variant.in_stock !== false,
      };
    })
    .filter(variant => variant.name);

  editingSizes = normaliseSizes(product?.sizes || []);

  renderVariantRows();
  renderSizeRows();

  document.getElementById('productModal').removeAttribute('hidden');
  document.getElementById('mpName').focus();
}

function closeProductModal() {
  document.getElementById('productModal').setAttribute('hidden', '');
}

function renderVariantRows() {
  const container = document.getElementById('variantsList');

  container.innerHTML = '';

  editingVariants.forEach((variant, index) => {
    const row = document.createElement('div');

    row.className = 'variant-row';

    row.style.cssText =
      'display:flex;align-items:center;gap:8px;margin-bottom:6px;';

    const input = document.createElement('input');

    input.type = 'text';
    input.value = variant.name;
    input.placeholder = 'e.g. Scent: Calm';
    input.style.flex = '1';

    input.addEventListener('input', () => {
      editingVariants[index].name = input.value;
    });

    const label = document.createElement('label');

    label.style.cssText =
      'display:flex;align-items:center;gap:4px;font-size:0.78rem;color:var(--text-muted);cursor:pointer;white-space:nowrap;user-select:none;';

    const checkbox = document.createElement('input');

    checkbox.type = 'checkbox';
    checkbox.checked = variant.in_stock;

    checkbox.style.cssText =
      'accent-color:var(--accent);width:14px;height:14px;cursor:pointer;';

    const stockText = document.createElement('span');

    stockText.textContent = variant.in_stock
      ? 'In Stock'
      : 'Out of Stock';

    stockText.style.color = variant.in_stock
      ? 'var(--accent)'
      : '#f87171';

    checkbox.addEventListener('change', () => {
      editingVariants[index].in_stock = checkbox.checked;

      stockText.textContent = checkbox.checked
        ? 'In Stock'
        : 'Out of Stock';

      stockText.style.color = checkbox.checked
        ? 'var(--accent)'
        : '#f87171';
    });

    label.appendChild(checkbox);
    label.appendChild(stockText);

    const removeButton = document.createElement('button');

    removeButton.className = 'btn-remove-variant';
    removeButton.innerHTML = '&times;';
    removeButton.type = 'button';

    removeButton.addEventListener('click', () => {
      editingVariants.splice(index, 1);
      renderVariantRows();
    });

    row.appendChild(input);
    row.appendChild(label);
    row.appendChild(removeButton);

    container.appendChild(row);
  });
}

function addVariantRow() {
  editingVariants.push({
    name: '',
    in_stock: true,
  });

  renderVariantRows();

  const inputs = document
    .getElementById('variantsList')
    .querySelectorAll('input[type="text"]');

  inputs[inputs.length - 1]?.focus();
}

function renderSizeRows() {
  const container = document.getElementById('sizesList');

  container.innerHTML = '';

  editingSizes.forEach((size, index) => {
    const row = document.createElement('div');

    row.className = 'variant-row';

    row.style.cssText =
      'display:flex;align-items:center;gap:8px;margin-bottom:6px;';

    const nameInput = document.createElement('input');

    nameInput.type = 'text';
    nameInput.value = size.name;
    nameInput.placeholder = 'e.g. 50ml';
    nameInput.style.flex = '1';

    nameInput.addEventListener('input', () => {
      editingSizes[index].name = nameInput.value;
    });

    const priceWrap = document.createElement('div');

    priceWrap.style.cssText =
      'display:flex;align-items:center;gap:4px;flex-shrink:0;';

    const pricePrefix = document.createElement('span');

    pricePrefix.textContent = 'R';

    pricePrefix.style.cssText =
      'font-size:0.82rem;color:var(--text-muted);font-weight:600;';

    const priceInput = document.createElement('input');

    priceInput.type = 'number';
    priceInput.value = size.price || '';
    priceInput.placeholder = '0.00';
    priceInput.min = '0';
    priceInput.step = '0.01';
    priceInput.style.cssText = 'width:80px;';

    priceInput.addEventListener('input', () => {
      editingSizes[index].price =
        parseFloat(priceInput.value) || 0;
    });

    priceWrap.appendChild(pricePrefix);
    priceWrap.appendChild(priceInput);

    const removeButton = document.createElement('button');

    removeButton.className = 'btn-remove-variant';
    removeButton.innerHTML = '&times;';
    removeButton.type = 'button';

    removeButton.addEventListener('click', () => {
      editingSizes.splice(index, 1);
      renderSizeRows();
    });

    row.appendChild(nameInput);
    row.appendChild(priceWrap);
    row.appendChild(removeButton);

    container.appendChild(row);
  });
}

function addSizeRow() {
  editingSizes.push({
    name: '',
    price: 0,
  });

  renderSizeRows();

  const inputs = document
    .getElementById('sizesList')
    .querySelectorAll('input[type="text"]');

  inputs[inputs.length - 1]?.focus();
}

async function saveProduct() {
  const button = document.getElementById('modalSaveBtn');

  const productId = document.getElementById('modalProductId').value;

  const name = document.getElementById('mpName').value.trim();

  if (!name) {
    showToast('Product name is required.', true);
    return;
  }

  const imageUrls = [
    document.getElementById('mpImage1').value.trim(),
    document.getElementById('mpImage2').value.trim(),
    document.getElementById('mpImage3').value.trim(),
    document.getElementById('mpImage4').value.trim(),
    document.getElementById('mpImage5').value.trim(),
  ].filter(Boolean);

  const cleanSizes = editingSizes
    .filter(size => size.name.trim())
    .map(size => ({
      name: size.name.trim(),
      price: size.price,
    }));

  const payload = {
    action: productId ? 'update_product' : 'add_product',
    password: adminToken,
    product: {
      ...(productId && { id: productId }),
      name,
      price:
        parseFloat(document.getElementById('mpPrice').value) || 0,
      cost_price:
        parseFloat(document.getElementById('mpCost').value) || 0,
      sku:
        document.getElementById('mpSku').value.trim(),
      brand:
        document.getElementById('mpBrand').value.trim(),
      description:
        document.getElementById('mpDesc').value.trim(),
      image_url: imageUrls[0] || '',
      image_urls: imageUrls,
      category:
        document.getElementById('mpCategory').value.trim(),
      availability:
        document.getElementById('mpAvailability').value || 'available',
      variants: editingVariants
        .filter(variant => variant.name.trim())
        .map(variant => ({
          name: variant.name.trim(),
          in_stock: variant.in_stock,
        })),
      sizes: cleanSizes,
    },
  };

  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span>Saving…';

  try {
    const response = await callEdge(payload);

    if (response.status === 429) {
      showToast('Rate limited.', true);
      return;
    }

    if (!response.ok) {
      showToast('Failed to save product.', true);
      return;
    }

    const data = await response.json();

    if (productId) {
      const index = allProducts.findIndex(
        product => product.id === productId
      );

      if (index > -1) {
        allProducts[index] = data.product || allProducts[index];
      }
    } else {
      allProducts.unshift(data.product || payload.product);
    }

    renderProducts();
    closeProductModal();

    showToast(productId ? 'Product updated' : 'Product added');
  } catch {
    showToast('Network error.', true);
  } finally {
    button.disabled = false;
    button.innerHTML = 'Save Product';
  }
}

async function deleteProduct(productId, productName) {
  if (!confirm(`Delete "${productName}"? This cannot be undone.`)) {
    return;
  }

  try {
    const response = await callEdge({
      action: 'delete_product',
      password: adminToken,
      product_id: productId,
    });

    if (!response.ok) {
      showToast('Failed to delete.', true);
      return;
    }

    allProducts = allProducts.filter(
      product => product.id !== productId
    );

    renderProducts();

    showToast('Product deleted.');
  } catch {
    showToast('Network error.', true);
  }
}

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
