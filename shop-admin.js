/* shop-admin.js
   Entry point. All feature logic lives in seven focused modules.
*/

import { state, hooks } from './shop-admin-core.js';
import {
  login,
  logout,
} from './shop-admin-auth.js';
import {
  startPolling,
  stopPolling,
  navTo,
  refreshData,
  updateStats,
  updateOrdersBadge,
  updateReports,
  renderRecent,
} from './shop-admin-dashboard.js';
import {
  applyFilter,
  renderTable,
  renderCards,
  updateOrderStatus,
  markAsPaid,
} from './shop-admin-orders.js';
import {
  openOrderDetail,
  updateFromDetail,
  closeOrderDetail,
  exportOrdersCSV,
  printLabel,
  printOrderLabelById,
  closePrintLabel,
} from './shop-admin-order-detail.js';
import {
  loadProducts,
  renderProducts,
  toggleReorderMode,
} from './shop-admin-products.js';
import {
  openProductModal,
  closeProductModal,
  saveProduct,
  addVariantRow,
  addSizeRow,
  deleteProduct,
  loadStockManagement,
} from './shop-admin-product-editor-stock.js';

/* ─── CROSS-MODULE HOOKS ───────────────────────── */
Object.assign(hooks, {
  login,
  logout,
  startPolling,
  stopPolling,
  navTo,
  refreshData,
  updateStats,
  updateOrdersBadge,
  updateReports,
  renderRecent,
  renderTable,
  renderCards,
  applyFilter,
  updateOrderStatus,
  markAsPaid,
  openOrderDetail,
  updateFromDetail,
  closeOrderDetail,
  exportOrdersCSV,
  printLabel,
  printOrderLabelById,
  closePrintLabel,
  loadProducts,
  renderProducts,
  toggleReorderMode,
  openProductModal,
  closeProductModal,
  saveProduct,
  addVariantRow,
  addSizeRow,
  deleteProduct,
  loadStockManagement,
});

/* ─── LEGACY GLOBALS ─────────────────────────────
   Existing HTML uses inline onclick handlers in a few places.
   Keep those handlers working while the implementation is modular.
*/
Object.assign(window, {
  openOrderDetail,
  updateFromDetail,
  closeOrderDetail,
  markAsPaid,
  updateOrderStatus,
  printLabel,
  printOrderLabelById,
  closePrintLabel,
  exportOrdersCSV,
  openProductModal,
  closeProductModal,
  saveProduct,
  addVariantRow,
  addSizeRow,
  deleteProduct,
  loadStockManagement,
});

/* ─── SIDEBAR ──────────────────────────────────── */
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

/* ─── INIT ─────────────────────────────────────── */
function init() {
  const dateEl = document.getElementById('adminDate');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-ZA', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
    });
  }

  document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      navTo(btn.dataset.page, btn);
      closeSidebar();
    });
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

  document.getElementById('searchInput')?.addEventListener('input', () => {
    renderTable();
    renderCards();
  });

  document.getElementById('productSearch')?.addEventListener('input', renderProducts);
  document.getElementById('loginBtn')?.addEventListener('click', login);
  document.getElementById('pwInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') login();
  });
  document.getElementById('logoutBtn')?.addEventListener('click', logout);
  document.getElementById('topbarSignout')?.addEventListener('click', logout);
  document.getElementById('refreshBtn')?.addEventListener('click', refreshData);

  document.getElementById('addProductBtn')?.addEventListener('click', () => openProductModal());
  document.getElementById('modalCancelBtn')?.addEventListener('click', closeProductModal);
  document.getElementById('modalSaveBtn')?.addEventListener('click', saveProduct);
  document.getElementById('addVariantBtn')?.addEventListener('click', addVariantRow);
  document.getElementById('addSizeBtn')?.addEventListener('click', addSizeRow);
  document.getElementById('reorderBtn')?.addEventListener('click', toggleReorderMode);

  document.getElementById('productModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('productModal')) closeProductModal();
  });

  document.getElementById('orderDetailModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('orderDetailModal')) closeOrderDetail();
  });

  document.getElementById('hamburgerBtn')?.addEventListener('click', toggleSidebar);
  document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebar);
  document.getElementById('refreshStockBtn')?.addEventListener('click', loadStockManagement);
}

init();
