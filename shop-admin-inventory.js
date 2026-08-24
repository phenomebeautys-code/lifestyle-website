/* ─── SHOP ADMIN: INVENTORY ─── */
/*
 * Reuses the app's existing design system (shop-admin.css) — stat-card,
 * filters/filter-btn, table/badge, modal, recent-list — no new tokens or
 * colors are introduced. Same public API (window.ShopAdminInventory.init/
 * refresh/render), same container (#inventoryContent), same stock-management
 * Edge Function contract (get_summary, update_settings, initial_stock,
 * receive_stock, adjust_stock, get_history).
 */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://papdxjcfimeyjgzmatpl.supabase.co';
  const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/stock-management`;

  const STATUS_META = {
    out_of_stock:       { label: 'Out of stock', badge: 'badge-out-of-stock', gauge: 'danger', kpi: 'danger' },
    low_stock:          { label: 'Low stock',    badge: 'badge-low-stock',    gauge: 'warn',   kpi: 'warn' },
    in_stock:           { label: 'In stock',     badge: 'badge-in-stock',     gauge: '',       kpi: '' },
    not_configured:     { label: 'Needs setup',  badge: 'badge-not-configured', gauge: '',    kpi: '' },
    not_ready_for_sale: { label: 'Not for sale',  badge: 'badge-not-ready',    gauge: '',       kpi: '' },
    discontinued:       { label: 'Discontinued',  badge: 'badge-inactive',     gauge: '',       kpi: '' },
  };

  let products = [];
  let activeFilter = 'all';
  let searchTerm = '';
  let panelProduct = null;
  let panelMode = 'overview';
  let panelHistory = null;

  function app() { return window.ShopAdmin || {}; }
  function getAdminToken() { const b = app(); return typeof b.adminToken === 'string' ? b.adminToken : ''; }
  function escapeHtml(value) {
    const b = app();
    if (typeof b.esc === 'function') return b.esc(value == null ? '' : String(value));
    const d = document.createElement('div'); d.textContent = value == null ? '' : String(value); return d.innerHTML;
  }
  function showMessage(msg, isError) {
    const b = app();
    if (typeof b.showToast === 'function') return b.showToast(msg, Boolean(isError));
    console[isError ? 'error' : 'log'](msg);
  }
  function fmtNum(v) { return Number(v || 0).toLocaleString('en-ZA', { maximumFractionDigits: 2 }); }
  function fmtCurrency(v) { return `R${Number(v || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

  async function request(action, payload) {
    const password = getAdminToken();
    if (!password) throw new Error('Admin session is not available. Please sign in again.');
    const res = await fetch(FUNCTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, password, ...(payload || {}) }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
    return body;
  }

  function getContainer() { return document.getElementById('inventoryContent'); }

  function renderLoading() {
    const c = getContainer();
    if (c) c.innerHTML = `<div class="recent-empty"><span class="spinner"></span>Loading inventory…</div>`;
  }

  function renderError(message) {
    const c = getContainer();
    if (!c) return;
    c.innerHTML = `
      <div class="panel">
        <div class="panel-header"><span class="panel-title">Inventory</span></div>
        <div class="recent-empty">Could not load inventory.<br>${escapeHtml(message)}<br><br>
          <button type="button" class="btn-print-label" id="invRetry">Try again</button>
        </div>
      </div>`;
    document.getElementById('invRetry')?.addEventListener('click', refresh);
  }

  function computeKpis(list) {
    const active = list.filter(p => p.active !== false);
    const low = list.filter(p => p.computed_status === 'low_stock');
    const out = list.filter(p => p.computed_status === 'out_of_stock');
    const reorderCost = list.reduce((s, p) => s + Number(p.estimated_reorder_cost || 0), 0);
    return { activeCount: active.length, lowCount: low.length, outCount: out.length, reorderCost };
  }

  function gaugePercent(p) {
    const stock = Number(p.stock_on_hand || 0);
    const target = Number(p.reorder_level || 0) + Number(p.reorder_quantity || 0);
    if (target <= 0) return stock > 0 ? 100 : 0;
    return Math.max(0, Math.min(100, (stock / target) * 100));
  }

  function matchesFilter(p) {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'low') return p.computed_status === 'low_stock';
    if (activeFilter === 'out') return p.computed_status === 'out_of_stock';
    if (activeFilter === 'setup') return p.computed_status === 'not_configured';
    if (activeFilter === 'inactive') return p.computed_status === 'not_ready_for_sale' || p.computed_status === 'discontinued';
    return true;
  }
  function matchesSearch(p) {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q);
  }
  function getFilteredList() { return products.filter(p => matchesFilter(p) && matchesSearch(p)); }

  function renderKpis(kpis) {
    return `
      <div class="stat-bar">
        <div class="stat-card">
          <span class="stat-label">Active SKUs</span>
          <span class="stat-value gold">${kpis.activeCount}</span>
        </div>
        <div class="stat-card${kpis.lowCount ? ' warn' : ''}">
          <span class="stat-label">Low Stock</span>
          <span class="stat-value">${kpis.lowCount}</span>
        </div>
        <div class="stat-card${kpis.outCount ? ' danger' : ''}">
          <span class="stat-label">Out of Stock</span>
          <span class="stat-value">${kpis.outCount}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Reorder Cost Due</span>
          <span class="stat-value gold">${fmtCurrency(kpis.reorderCost)}</span>
        </div>
      </div>`;
  }

  function renderToolbar() {
    const chips = [
      { key: 'all', label: 'All' },
      { key: 'low', label: 'Low stock' },
      { key: 'out', label: 'Out of stock' },
      { key: 'setup', label: 'Needs setup' },
      { key: 'inactive', label: 'Inactive' },
    ];
    return `
      <div class="products-toolbar">
        <input type="text" class="search-input products-search" id="invSearch" placeholder="Search products or SKU…" value="${escapeHtml(searchTerm)}" />
        <div class="filters">${chips.map(c => `<button type="button" class="filter-btn${activeFilter === c.key ? ' active' : ''}" data-inv-filter="${c.key}">${c.label}</button>`).join('')}</div>
      </div>`;
  }

  function renderRow(p) {
    const meta = STATUS_META[p.computed_status] || STATUS_META.in_stock;
    const pct = gaugePercent(p);
    return `
      <tr data-inv-row="${p.id}" style="cursor:pointer">
        <td>
          <strong>${escapeHtml(p.name || 'Unnamed product')}</strong><br>
          <span class="items-mini">${escapeHtml(p.sku || 'No SKU')}</span>
        </td>
        <td>
          ${fmtNum(p.stock_on_hand)}
          <div class="stock-gauge"><div class="stock-gauge-fill ${meta.gauge}" style="width:${pct}%"></div></div>
        </td>
        <td><span class="badge ${meta.badge}">${meta.label}</span></td>
        <td>${fmtCurrency(p.price)}</td>
        <td>
          <button type="button" class="btn-print-label" data-inv-action="history" data-id="${p.id}">History</button>
          <button type="button" class="btn-print-label" data-inv-action="stock" data-id="${p.id}">Adjust</button>
        </td>
      </tr>`;
  }

  function renderCard(p) {
    const meta = STATUS_META[p.computed_status] || STATUS_META.in_stock;
    const pct = gaugePercent(p);
    return `
      <div class="stock-card" data-inv-row="${p.id}">
        <div class="stock-card-top">
          <div>
            <div class="stock-card-name">${escapeHtml(p.name || 'Unnamed product')}</div>
            <div class="stock-card-meta">${escapeHtml(p.sku || 'No SKU')} · ${fmtCurrency(p.price)}</div>
          </div>
          <span class="badge ${meta.badge}">${meta.label}</span>
        </div>
        <div>
          ${fmtNum(p.stock_on_hand)} on hand
          <div class="stock-gauge full-width"><div class="stock-gauge-fill ${meta.gauge}" style="width:${pct}%"></div></div>
        </div>
        <div class="stock-card-footer">
          <button type="button" class="btn-print-label" data-inv-action="history" data-id="${p.id}">History</button>
          <button type="button" class="btn-print-label" data-inv-action="stock" data-id="${p.id}">Adjust</button>
        </div>
      </div>`;
  }

  function renderList() {
    const list = getFilteredList();
    if (!list.length) {
      return `<div class="table-wrap inventory-table"><table><tbody><tr class="empty-row"><td>No products match this view.</td></tr></tbody></table></div>`;
    }
    return `
      <div class="table-wrap inventory-table">
        <table>
          <thead><tr><th>Product</th><th>Stock</th><th>Status</th><th>Price</th><th></th></tr></thead>
          <tbody>${list.map(renderRow).join('')}</tbody>
        </table>
      </div>
      <div class="stock-cards">${list.map(renderCard).join('')}</div>`;
  }

  function render() {
    const c = getContainer();
    if (!c) return;
    const kpis = computeKpis(products);
    c.innerHTML = `
      <div class="page-head"><div><h2>Inventory</h2><p>Live stock levels, reorder thresholds and movement history.</p></div></div>
      ${renderKpis(kpis)}
      ${renderToolbar()}
      ${renderList()}`;
    attachListeners(c);
    if (panelProduct) renderPanel();
  }

  function attachListeners(container) {
    container.querySelectorAll('[data-inv-filter]').forEach(btn => btn.addEventListener('click', () => { activeFilter = btn.dataset.invFilter; render(); }));
    const search = document.getElementById('invSearch');
    if (search) search.addEventListener('input', () => { searchTerm = search.value; render(); search.focus(); search.setSelectionRange(search.value.length, search.value.length); });
    container.querySelectorAll('[data-inv-row]').forEach(row => row.addEventListener('click', (e) => { if (e.target.closest('[data-inv-action]')) return; openPanel(row.dataset.invRow, 'overview'); }));
    container.querySelectorAll('[data-inv-action]').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPanel(btn.dataset.id, btn.dataset.invAction === 'history' ? 'history' : 'stock');
    }));
  }

  function openPanel(productId, mode) {
    panelProduct = products.find(p => p.id === productId) || null;
    panelMode = mode || 'overview';
    panelHistory = null;
    renderPanel();
    if (panelMode === 'history') loadHistory(productId);
  }

  function closePanel() {
    panelProduct = null;
    panelHistory = null;
    document.getElementById('invPanelOverlay')?.remove();
  }

  function renderPanel() {
    let overlay = document.getElementById('invPanelOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'invPanelOverlay';
      overlay.className = 'modal-overlay';
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closePanel(); });
      document.body.appendChild(overlay);
    }
    overlay.removeAttribute('hidden');
    if (!panelProduct) { overlay.remove(); return; }
    const p = panelProduct;
    const meta = STATUS_META[p.computed_status] || STATUS_META.in_stock;

    overlay.innerHTML = `
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <div class="modal-title">${escapeHtml(p.name || 'Product')}</div>
          <div class="modal-subtitle">${escapeHtml(p.sku || 'No SKU')} · <span class="badge ${meta.badge}">${meta.label}</span></div>
        </div>
        <div id="invPanelBody">
          ${panelMode === 'history' ? renderHistorySection() : renderOverviewSection()}
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" id="invPanelClose">Close</button>
        </div>
      </div>`;
    document.getElementById('invPanelClose').addEventListener('click', closePanel);
    attachPanelListeners();
  }

  function renderOverviewSection() {
    const p = panelProduct;
    const pct = gaugePercent(p);
    return `
      <div class="modal-section">
        <div class="modal-section-label">Current Stock</div>
        <span class="stat-value gold" style="font-size:2rem">${fmtNum(p.stock_on_hand)}</span>
        <span class="stat-sub"> units on hand</span>
        <div class="stock-gauge full-width" style="margin-top:10px"><div class="stock-gauge-fill ${p.computed_status === 'out_of_stock' ? 'danger' : 'warn'}" style="width:${pct}%"></div></div>
      </div>
      <div class="modal-section">
        <div class="modal-section-label">Quick Actions</div>
        <div class="filters">
          <button type="button" class="filter-btn" data-inv-quick="receive_stock">Receive stock</button>
          <button type="button" class="filter-btn" data-inv-quick="adjust_stock">Adjust stock</button>
          ${Number(p.stock_on_hand) === 0 ? '<button type="button" class="filter-btn" data-inv-quick="initial_stock">Set initial stock</button>' : ''}
        </div>
        <div id="invQuickForm"></div>
      </div>
      <div class="modal-section">
        <div class="modal-section-label">Reorder Settings</div>
        <div class="modal-grid">
          <div class="modal-field"><label class="field-label">Reorder level</label><input type="number" class="field-input" id="invReorderLevel" min="0" step="1" value="${p.reorder_level ?? 0}" /></div>
          <div class="modal-field"><label class="field-label">Reorder quantity</label><input type="number" class="field-input" id="invReorderQty" min="0" step="1" value="${p.reorder_quantity ?? 0}" /></div>
        </div>
        <button type="button" class="btn btn-primary" id="invSaveSettings" style="margin-top:12px">Save Reorder Settings</button>
      </div>
      <div class="modal-section">
        <button type="button" class="btn-print-label" id="invViewHistory" style="width:100%;text-align:center">View Movement History</button>
      </div>`;
  }

  function renderHistorySection() {
    if (!panelHistory) return `<div class="recent-empty"><span class="spinner"></span>Loading history…</div>`;
    if (!panelHistory.length) {
      return `<div class="modal-section"><button type="button" class="btn-print-label" id="invBackToOverview">← Back</button></div><div class="recent-empty">No stock movements recorded yet.</div>`;
    }
    const items = panelHistory.map(m => {
      const qty = Number(m.quantity || 0);
      const sign = qty > 0 ? '+' : '';
      return `
        <div class="recent-item">
          <div class="ri-avatar">${qty > 0 ? '↑' : '↓'}</div>
          <div class="ri-info">
            <div class="ri-name">${escapeHtml(String(m.movement_type || '').replace(/_/g, ' '))}</div>
            <div class="ri-meta">${fmtNum(m.stock_before)} → ${fmtNum(m.stock_after)}${m.note ? ' · ' + escapeHtml(m.note) : ''}</div>
          </div>
          <div class="ri-right">
            <div class="ri-amount">${sign}${fmtNum(qty)}</div>
            <div class="ri-date">${new Date(m.created_at).toLocaleDateString('en-ZA')}</div>
          </div>
        </div>`;
    }).join('');
    return `<div class="modal-section"><button type="button" class="btn-print-label" id="invBackToOverview">← Back to overview</button></div><div class="recent-list">${items}</div>`;
  }

  async function loadHistory(productId) {
    try {
      const result = await request('get_history', { product_id: productId });
      panelHistory = Array.isArray(result.movements) ? result.movements : [];
    } catch (error) {
      showMessage(error.message || 'Failed to load history', true);
      panelHistory = [];
    }
    if (panelProduct) renderPanel();
  }

  function attachPanelListeners() {
    document.getElementById('invBackToOverview')?.addEventListener('click', () => { panelMode = 'overview'; renderPanel(); });
    document.getElementById('invViewHistory')?.addEventListener('click', () => { panelMode = 'history'; renderPanel(); loadHistory(panelProduct.id); });

    document.getElementById('invSaveSettings')?.addEventListener('click', async () => {
      const reorder_level = Number(document.getElementById('invReorderLevel').value || 0);
      const reorder_quantity = Number(document.getElementById('invReorderQty').value || 0);
      try {
        const result = await request('update_settings', { product_id: panelProduct.id, reorder_level, reorder_quantity });
        applyProductUpdate(result.product);
        showMessage('Reorder settings saved');
        renderPanel();
        render();
      } catch (error) {
        showMessage(error.message || 'Failed to save settings', true);
      }
    });

    document.querySelectorAll('[data-inv-quick]').forEach(btn => btn.addEventListener('click', () => renderQuickForm(btn.dataset.invQuick)));
  }

  function renderQuickForm(action) {
    const holder = document.getElementById('invQuickForm');
    if (!holder) return;
    const isAdjust = action === 'adjust_stock';
    holder.innerHTML = `
      <div class="modal-sub-section">
        ${isAdjust ? `<div class="modal-field"><label class="field-label">Direction</label><select class="field-input" id="invQtyDirection"><option value="increase">Increase stock</option><option value="decrease">Decrease stock</option></select></div>` : ''}
        <div class="modal-field">
          <label class="field-label">Quantity</label>
          <div class="qty-stepper">
            <button type="button" id="invQtyMinus">−</button>
            <input type="number" class="field-input" id="invQtyInput" min="1" step="1" value="1" />
            <button type="button" id="invQtyPlus">+</button>
          </div>
        </div>
        <div class="modal-field"><label class="field-label">Note (required)</label><input type="text" class="field-input" id="invQtyNote" placeholder="e.g. Supplier delivery" /></div>
        <button type="button" class="btn btn-primary" id="invQtySubmit" style="width:100%">Confirm</button>
      </div>`;
    document.getElementById('invQtyMinus').addEventListener('click', () => { const i = document.getElementById('invQtyInput'); i.value = Math.max(1, Number(i.value || 1) - 1); });
    document.getElementById('invQtyPlus').addEventListener('click', () => { const i = document.getElementById('invQtyInput'); i.value = Number(i.value || 1) + 1; });
    document.getElementById('invQtySubmit').addEventListener('click', async () => {
      const quantity = Number(document.getElementById('invQtyInput').value);
      const note = document.getElementById('invQtyNote').value.trim();
      if (!quantity || quantity <= 0) { showMessage('Quantity must be greater than zero', true); return; }
      if (!note) { showMessage('A note is required', true); return; }
      const payload = { product_id: panelProduct.id, quantity, note };
      if (isAdjust) payload.direction = document.getElementById('invQtyDirection').value;
      try {
        const result = await request(action, payload);
        applyProductUpdate(result.product);
        showMessage('Stock updated');
        panelMode = 'overview';
        renderPanel();
        render();
      } catch (error) {
        showMessage(error.message || 'Failed to update stock', true);
      }
    });
  }

  function applyProductUpdate(updated) {
    if (!updated) return;
    const idx = products.findIndex(p => p.id === updated.id);
    if (idx !== -1) products[idx] = { ...products[idx], ...updated };
    panelProduct = products.find(p => p.id === updated.id) || panelProduct;
  }

  async function refresh() {
    renderLoading();
    try {
      const result = await request('get_summary');
      products = Array.isArray(result.products) ? result.products : [];
      render();
    } catch (error) {
      console.error('Inventory load failed:', error);
      renderError(error.message || 'Unknown error');
    }
  }

  async function init() {
    const container = getContainer();
    if (!container) return;
    await refresh();
  }

  window.ShopAdminInventory = { init, refresh, render };
})();
