/* ─── SHOP ADMIN: INVENTORY & STOCK ──────────── */
/*
 * Standalone classic-script module.
 * Requires the existing adminToken and calls the existing stock-management Edge Function.
 * This file is inert until ShopAdminInventory.init() or render() is called.
 */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://papdxjcfimeyjgzmatpl.supabase.co';
  const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/stock-management`;

  let products = [];
  let lastLoadedAt = null;

  const STATUS_META = {
    in_stock: { label: 'In stock', className: 'inventory-status-in-stock' },
    low_stock: { label: 'Low stock', className: 'inventory-status-low-stock' },
    out_of_stock: { label: 'Out of stock', className: 'inventory-status-out-of-stock' },
    discontinued: { label: 'Discontinued', className: 'inventory-status-discontinued' },
    not_ready_for_sale: { label: 'Not ready for sale', className: 'inventory-status-not-ready' },
    not_configured: { label: 'Not configured', className: 'inventory-status-not-configured' },
  };

  function getAdminToken() {
    if (typeof window.adminToken === 'string' && window.adminToken) return window.adminToken;
    if (typeof adminToken === 'string' && adminToken) return adminToken;
    return '';
  }

  function escapeHtml(value) {
    if (typeof window.esc === 'function') return window.esc(value == null ? '' : String(value));
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('en-ZA', { maximumFractionDigits: 2 });
  }

  function formatCurrency(value) {
    return `R${Number(value || 0).toLocaleString('en-ZA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function showMessage(message, isError) {
    if (typeof window.showToast === 'function') {
      window.showToast(message, Boolean(isError));
      return;
    }
    console[isError ? 'error' : 'log'](message);
  }

  async function request(action, payload) {
    const password = getAdminToken();
    if (!password) throw new Error('Admin session is not available. Please sign in again.');

    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, password, ...(payload || {}) }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Inventory request failed (${response.status})`);
    return body;
  }

  function calculateSummary(list) {
    return list.reduce((summary, product) => {
      const stock = Number(product.stock_on_hand || 0);
      const cost = Number(product.cost_price || 0);
      const status = product.computed_status || product.stock_status || 'not_configured';
      summary.products += 1;
      summary.unitsOnHand += stock;
      summary.stockValue += stock * cost;
      summary.reorderSpend += Number(product.estimated_reorder_cost || 0);
      if (status === 'low_stock') summary.lowStock += 1;
      if (status === 'out_of_stock') summary.outOfStock += 1;
      return summary;
    }, {
      products: 0,
      unitsOnHand: 0,
      lowStock: 0,
      outOfStock: 0,
      stockValue: 0,
      reorderSpend: 0,
    });
  }

  function statusMarkup(status) {
    const meta = STATUS_META[status] || STATUS_META.not_configured;
    return `<span class="inventory-status ${meta.className}">${escapeHtml(meta.label)}</span>`;
  }

  function getContainer() {
    return document.getElementById('inventoryContent');
  }

  function renderLoading() {
    const container = getContainer();
    if (!container) return;
    container.innerHTML = '<div class="inventory-loading">Loading inventory…</div>';
  }

  function renderError(message) {
    const container = getContainer();
    if (!container) return;
    container.innerHTML = `
      <div class="inventory-error">
        <strong>Inventory could not load.</strong>
        <span>${escapeHtml(message)}</span>
        <button type="button" class="btn btn-secondary" data-inventory-action="retry">Try again</button>
      </div>`;
    const retry = container.querySelector('[data-inventory-action="retry"]');
    if (retry) retry.addEventListener('click', () => refresh());
  }

  function render() {
    const container = getContainer();
    if (!container) return;

    const summary = calculateSummary(products);
    const rows = products.map(product => {
      const status = product.computed_status || product.stock_status || 'not_configured';
      const lastMovement = product.last_movement_at
        ? new Date(product.last_movement_at).toLocaleString('en-ZA')
        : 'No movements';
      return `
        <tr data-product-id="${escapeHtml(product.id)}">
          <td>
            <div class="inventory-product-name">${escapeHtml(product.name)}</div>
            <div class="inventory-product-meta">${escapeHtml(product.brand || product.category || '')}</div>
          </td>
          <td>${escapeHtml(product.sku || '—')}</td>
          <td class="inventory-number">${formatNumber(product.stock_on_hand)}</td>
          <td class="inventory-number">${formatNumber(product.reorder_level)}</td>
          <td class="inventory-number">${formatNumber(product.reorder_quantity)}</td>
          <td>${statusMarkup(status)}</td>
          <td class="inventory-number">${formatCurrency(Number(product.stock_on_hand || 0) * Number(product.cost_price || 0))}</td>
          <td>${escapeHtml(lastMovement)}</td>
          <td>
            <button type="button" class="btn btn-secondary inventory-history-btn" data-inventory-history="${escapeHtml(product.id)}">History</button>
          </td>
        </tr>`;
    }).join('');

    container.innerHTML = `
      <div class="inventory-toolbar">
        <div>
          <h2>Inventory &amp; Stock</h2>
          <p>Product records, stock on hand, reorder settings, and stock movement history.</p>
        </div>
        <button type="button" class="btn btn-secondary" data-inventory-action="refresh">Refresh</button>
      </div>

      <div class="inventory-summary-grid">
        <div class="inventory-summary-card"><span>Products tracked</span><strong>${formatNumber(summary.products)}</strong></div>
        <div class="inventory-summary-card"><span>Units on hand</span><strong>${formatNumber(summary.unitsOnHand)}</strong></div>
        <div class="inventory-summary-card"><span>Low stock</span><strong>${formatNumber(summary.lowStock)}</strong></div>
        <div class="inventory-summary-card"><span>Out of stock</span><strong>${formatNumber(summary.outOfStock)}</strong></div>
        <div class="inventory-summary-card"><span>Stock value</span><strong>${formatCurrency(summary.stockValue)}</strong></div>
        <div class="inventory-summary-card"><span>Suggested reorder spend</span><strong>${formatCurrency(summary.reorderSpend)}</strong></div>
      </div>

      <div class="inventory-table-wrap">
        <table class="inventory-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>On hand</th>
              <th>Reorder at</th>
              <th>Reorder qty</th>
              <th>Status</th>
              <th>Stock value</th>
              <th>Last movement</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="9" class="inventory-empty">No products found.</td></tr>'}
          </tbody>
        </table>
      </div>

      <div id="inventoryHistory" class="inventory-history" hidden></div>`;

    const refreshButton = container.querySelector('[data-inventory-action="refresh"]');
    if (refreshButton) refreshButton.addEventListener('click', () => refresh());
    container.querySelectorAll('[data-inventory-history]').forEach(button => {
      button.addEventListener('click', () => loadHistory(button.dataset.inventoryHistory));
    });
  }

  async function loadSummary() {
    const result = await request('get_summary');
    products = Array.isArray(result.products) ? result.products : [];
    lastLoadedAt = result.generated_at || new Date().toISOString();
    return products;
  }

  async function refresh() {
    renderLoading();
    try {
      await loadSummary();
      render();
      return products;
    } catch (error) {
      console.error('Inventory summary failed:', error);
      renderError(error.message || 'Unknown inventory error');
      throw error;
    }
  }

  async function init() {
    const container = getContainer();
    if (!container) return null;
    return refresh();
  }

  function renderHistory(product, movements) {
    const panel = document.getElementById('inventoryHistory');
    if (!panel) return;

    const rows = movements.map(movement => {
      const sign = Number(movement.quantity) > 0 ? '+' : '';
      return `
        <tr>
          <td>${new Date(movement.created_at).toLocaleString('en-ZA')}</td>
          <td>${escapeHtml(String(movement.movement_type || '').replace(/_/g, ' '))}</td>
          <td class="inventory-number">${sign}${formatNumber(movement.quantity)}</td>
          <td class="inventory-number">${formatNumber(movement.stock_before)} → ${formatNumber(movement.stock_after)}</td>
          <td>${escapeHtml(movement.reference_type || '—')}</td>
          <td>${escapeHtml(movement.note || '—')}</td>
        </tr>`;
    }).join('');

    panel.hidden = false;
    panel.innerHTML = `
      <div class="inventory-history-header">
        <div>
          <h3>Movement history: ${escapeHtml(product ? product.name : '')}</h3>
          <p>Every manual stock change is recorded with its reason and resulting balance.</p>
        </div>
        <button type="button" class="btn btn-secondary" data-inventory-action="close-history">Close</button>
      </div>
      <div class="inventory-table-wrap">
        <table class="inventory-table">
          <thead><tr><th>Time</th><th>Type</th><th>Change</th><th>Balance</th><th>Reference</th><th>Note</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6" class="inventory-empty">No movements recorded yet.</td></tr>'}</tbody>
        </table>
      </div>`;

    const close = panel.querySelector('[data-inventory-action="close-history"]');
    if (close) close.addEventListener('click', () => {
      panel.hidden = true;
      panel.innerHTML = '';
    });
  }

  async function loadHistory(productId) {
    try {
      const result = await request('get_history', { product_id: productId });
      const product = products.find(item => item.id === productId);
      renderHistory(product, Array.isArray(result.movements) ? result.movements : []);
      return result.movements || [];
    } catch (error) {
      showMessage(error.message || 'Unable to load stock history.', true);
      throw error;
    }
  }

  async function updateSettings(productId, settings) {
    const result = await request('update_settings', {
      product_id: productId,
      reorder_level: settings.reorder_level,
      reorder_quantity: settings.reorder_quantity,
    });
    await refresh();
    return result.product;
  }

  async function receiveStock(productId, quantity, note) {
    const result = await request('receive_stock', {
      product_id: productId,
      quantity,
      note,
    });
    await refresh();
    return result.product;
  }

  async function initialStock(productId, quantity, note) {
    const result = await request('initial_stock', {
      product_id: productId,
      quantity,
      note,
    });
    await refresh();
    return result.product;
  }

  async function adjustStock(productId, quantity, direction, note) {
    const result = await request('adjust_stock', {
      product_id: productId,
      quantity,
      direction,
      note,
    });
    await refresh();
    return result.product;
  }

  window.ShopAdminInventory = {
    init,
    refresh,
    loadSummary,
    loadHistory,
    updateSettings,
    initialStock,
    receiveStock,
    adjustStock,
    render,
    get products() { return products.slice(); },
    get lastLoadedAt() { return lastLoadedAt; },
  };
})();
