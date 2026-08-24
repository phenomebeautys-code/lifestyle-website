/* ─── SHOP ADMIN: MATERIALS, RECIPES & CONVERSIONS ─── */
/*
 * Reuses the app's existing design system (shop-admin.css) — stat-card,
 * filters/filter-btn, table/badge, modal, variant-row, flow-card — no new
 * tokens or colors are introduced. Same public API (window.ShopAdminMaterials
 * .init/refresh/render), same container (#materialsContent), same
 * materials-management Edge Function contract.
 */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://papdxjcfimeyjgzmatpl.supabase.co';
  const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/materials-management`;
  const UNIT_OPTIONS = ['g', 'ml', 'drops', 'unit', 'cm'];
  const CATEGORY_META = {
    ingredient: { label: 'Ingredient' },
    packaging: { label: 'Packaging' },
    kit_component: { label: 'Kit component' },
  };

  let materials = [];
  let conversions = [];
  let products = [];
  let activeTab = 'materials';
  let categoryFilter = 'all';
  let searchTerm = '';
  let panelMaterial = null;
  let panelMode = 'overview';
  let panelHistory = null;
  let isNewMaterial = false;

  let selectedProductId = '';
  let recipeLines = [];
  let recipeComputedCost = 0;
  let showConversionForm = false;

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
  function fmtNum(v) { return Number(v || 0).toLocaleString('en-ZA', { maximumFractionDigits: 3 }); }
  function fmtCurrency(v) { return `R${Number(v || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

  async function request(action, payload) {
    const password = getAdminToken();
    if (!password) throw new Error('Admin session is not available. Please sign in again.');
    const res = await fetch(FUNCTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, password, ...(payload || {}) }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
    return body;
  }

  async function fetchProducts() {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id,name,category&order=idx.asc`, {
        headers: { apikey: 'sb_publishable_XXgqS4qa4-CJJQ7MYxt4Lw_sPbcmGPL', Authorization: 'Bearer sb_publishable_XXgqS4qa4-CJJQ7MYxt4Lw_sPbcmGPL' },
      });
      if (!res.ok) return [];
      return await res.json();
    } catch { return []; }
  }

  function getContainer() { return document.getElementById('materialsContent'); }
  function renderLoading() { const c = getContainer(); if (c) c.innerHTML = `<div class="recent-empty"><span class="spinner"></span>Loading…</div>`; }
  function renderError(message) {
    const c = getContainer();
    if (!c) return;
    c.innerHTML = `
      <div class="panel">
        <div class="panel-header"><span class="panel-title">Materials &amp; Recipes</span></div>
        <div class="recent-empty">Could not load Materials &amp; Recipes.<br>${escapeHtml(message)}<br><br>
          <button type="button" class="btn-print-label" id="matRetry">Try again</button>
        </div>
      </div>`;
    document.getElementById('matRetry')?.addEventListener('click', refresh);
  }

  function tabsMarkup() {
    const tabs = [
      { key: 'materials', label: 'Raw Materials' },
      { key: 'recipes', label: 'Recipes (BOM)' },
      { key: 'conversions', label: 'Repack Conversions' },
    ];
    return `<div class="filters" style="margin-bottom:20px">${tabs.map(t => `<button type="button" class="filter-btn${activeTab === t.key ? ' active' : ''}" data-mat-tab="${t.key}">${t.label}</button>`).join('')}</div>`;
  }

  /* ─── MATERIALS TAB ─── */

  function gaugePercent(m) {
    const stock = Number(m.stock_on_hand || 0);
    const target = Number(m.reorder_level || 0) + Number(m.reorder_quantity || 0);
    if (target <= 0) return stock > 0 ? 100 : 0;
    return Math.max(0, Math.min(100, (stock / target) * 100));
  }
  function materialStatus(m) {
    const stock = Number(m.stock_on_hand || 0);
    const level = Number(m.reorder_level || 0);
    if (m.active === false) return { label: 'Inactive', badge: 'badge-inactive', gauge: '' };
    if (stock <= 0) return { label: 'Out of stock', badge: 'badge-out-of-stock', gauge: 'danger' };
    if (level > 0 && stock <= level) return { label: 'Low stock', badge: 'badge-low-stock', gauge: 'warn' };
    return { label: 'In stock', badge: 'badge-in-stock', gauge: '' };
  }
  function computeMatKpis() {
    const active = materials.filter(m => m.active !== false);
    const low = materials.filter(m => materialStatus(m).badge === 'badge-low-stock');
    const out = materials.filter(m => materialStatus(m).badge === 'badge-out-of-stock');
    const standalone = materials.filter(m => m.sellable_standalone);
    return { activeCount: active.length, lowCount: low.length, outCount: out.length, standaloneCount: standalone.length };
  }

  function renderMatKpis() {
    const k = computeMatKpis();
    return `
      <div class="stat-bar">
        <div class="stat-card"><span class="stat-label">Active Materials</span><span class="stat-value gold">${k.activeCount}</span></div>
        <div class="stat-card${k.lowCount ? ' warn' : ''}"><span class="stat-label">Low Stock</span><span class="stat-value">${k.lowCount}</span></div>
        <div class="stat-card${k.outCount ? ' danger' : ''}"><span class="stat-label">Out of Stock</span><span class="stat-value">${k.outCount}</span></div>
        <div class="stat-card"><span class="stat-label">Sellable Standalone</span><span class="stat-value gold">${k.standaloneCount}</span></div>
      </div>`;
  }

  function matchesCategory(m) { return categoryFilter === 'all' || m.category === categoryFilter; }
  function matchesMatSearch(m) { return !searchTerm || (m.name || '').toLowerCase().includes(searchTerm.toLowerCase()); }
  function getFilteredMaterials() { return materials.filter(m => matchesCategory(m) && matchesMatSearch(m)); }

  function renderMatToolbar() {
    const chips = [{ key: 'all', label: 'All' }, ...Object.entries(CATEGORY_META).map(([k, v]) => ({ key: k, label: v.label }))];
    return `
      <div class="page-head">
        <div><h2>Raw Materials</h2><p>Ingredients, packaging and kit-only components.</p></div>
        <div class="products-actions"><button type="button" class="btn-add-product" id="matAddNew">+ New Material</button></div>
      </div>
      <div class="products-toolbar">
        <input type="text" class="search-input products-search" id="matSearch" placeholder="Search materials…" value="${escapeHtml(searchTerm)}" />
        <div class="filters">${chips.map(c => `<button type="button" class="filter-btn${categoryFilter === c.key ? ' active' : ''}" data-mat-category="${c.key}">${c.label}</button>`).join('')}</div>
      </div>`;
  }

  function renderMatRow(m) {
    const status = materialStatus(m);
    const pct = gaugePercent(m);
    const catLabel = CATEGORY_META[m.category]?.label || m.category;
    return `
      <tr data-mat-row="${m.id}" style="cursor:pointer">
        <td><strong>${escapeHtml(m.name || 'Unnamed material')}</strong>${!m.sellable_standalone ? ' <span class="badge badge-kit-only">Kit only</span>' : ''}<br><span class="items-mini">${escapeHtml(catLabel)}</span></td>
        <td>${fmtNum(m.stock_on_hand)} ${escapeHtml(m.unit)}<div class="stock-gauge"><div class="stock-gauge-fill ${status.gauge}" style="width:${pct}%"></div></div></td>
        <td><span class="badge ${status.badge}">${status.label}</span></td>
        <td>${fmtCurrency(m.cost_per_unit)}/${escapeHtml(m.unit)}</td>
        <td>
          <button type="button" class="btn-print-label" data-mat-action="history" data-id="${m.id}">History</button>
          <button type="button" class="btn-print-label" data-mat-action="stock" data-id="${m.id}">Adjust</button>
        </td>
      </tr>`;
  }

  function renderMatCard(m) {
    const status = materialStatus(m);
    const pct = gaugePercent(m);
    return `
      <div class="stock-card" data-mat-row="${m.id}">
        <div class="stock-card-top">
          <div>
            <div class="stock-card-name">${escapeHtml(m.name || 'Unnamed material')}</div>
            <div class="stock-card-meta">${fmtCurrency(m.cost_per_unit)}/${escapeHtml(m.unit)}</div>
          </div>
          <span class="badge ${status.badge}">${status.label}</span>
        </div>
        <div>${fmtNum(m.stock_on_hand)} ${escapeHtml(m.unit)} on hand
          <div class="stock-gauge full-width"><div class="stock-gauge-fill ${status.gauge}" style="width:${pct}%"></div></div>
        </div>
        <div class="stock-card-footer">
          <button type="button" class="btn-print-label" data-mat-action="history" data-id="${m.id}">History</button>
          <button type="button" class="btn-print-label" data-mat-action="stock" data-id="${m.id}">Adjust</button>
        </div>
      </div>`;
  }

  function renderMaterialsTab() {
    const list = getFilteredMaterials();
    const table = !list.length
      ? `<div class="table-wrap materials-table"><table><tbody><tr class="empty-row"><td>No materials match this view.</td></tr></tbody></table></div>`
      : `
        <div class="table-wrap materials-table">
          <table><thead><tr><th>Material</th><th>Stock</th><th>Status</th><th>Cost</th><th></th></tr></thead>
          <tbody>${list.map(renderMatRow).join('')}</tbody></table>
        </div>
        <div class="stock-cards">${list.map(renderMatCard).join('')}</div>`;
    return `${renderMatKpis()}${renderMatToolbar()}${table}`;
  }

  function attachMaterialsTabListeners(container) {
    container.querySelectorAll('[data-mat-category]').forEach(btn => btn.addEventListener('click', () => { categoryFilter = btn.dataset.matCategory; render(); }));
    const search = document.getElementById('matSearch');
    if (search) search.addEventListener('input', () => { searchTerm = search.value; render(); search.focus(); search.setSelectionRange(search.value.length, search.value.length); });
    document.getElementById('matAddNew')?.addEventListener('click', () => openMaterialPanel(null));
    container.querySelectorAll('[data-mat-row]').forEach(row => row.addEventListener('click', (e) => { if (e.target.closest('[data-mat-action]')) return; openMaterialPanel(materials.find(m => m.id === row.dataset.matRow)); }));
    container.querySelectorAll('[data-mat-action]').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const material = materials.find(m => m.id === btn.dataset.id);
      openMaterialPanel(material, btn.dataset.matAction === 'history' ? 'history' : 'stock');
    }));
  }

  /* ─── MATERIAL DETAIL / EDIT MODAL ─── */

  function openMaterialPanel(material, mode) {
    isNewMaterial = !material;
    panelMaterial = material ? { ...material } : { category: 'ingredient', unit: 'g', bulk_quantity: 1, bulk_cost: 0, reorder_level: 0, reorder_quantity: 0, sellable_standalone: false, active: true };
    panelMode = mode || 'overview';
    panelHistory = null;
    renderMaterialPanel();
    if (panelMode === 'history' && material) loadMatHistory(material.id);
  }

  function closeMaterialPanel() {
    panelMaterial = null;
    panelHistory = null;
    document.getElementById('matPanelOverlay')?.remove();
  }

  function renderMaterialPanel() {
    let overlay = document.getElementById('matPanelOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'matPanelOverlay';
      overlay.className = 'modal-overlay';
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeMaterialPanel(); });
      document.body.appendChild(overlay);
    }
    if (!panelMaterial) { overlay.remove(); return; }
    const m = panelMaterial;
    const status = isNewMaterial ? null : materialStatus(m);

    overlay.innerHTML = `
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <div class="modal-title">${isNewMaterial ? 'New Material' : escapeHtml(m.name || 'Material')}</div>
          ${status ? `<div class="modal-subtitle"><span class="badge ${status.badge}">${status.label}</span></div>` : ''}
        </div>
        <div id="matPanelBody">${panelMode === 'history' ? renderMatHistorySection() : renderMatOverviewSection()}</div>
        <div class="modal-actions"><button type="button" class="btn btn-secondary" id="matPanelClose">Close</button></div>
      </div>`;
    document.getElementById('matPanelClose').addEventListener('click', closeMaterialPanel);
    attachMaterialPanelListeners();
  }

  function renderMatOverviewSection() {
    const m = panelMaterial;
    const pct = isNewMaterial ? 0 : gaugePercent(m);
    return `
      ${!isNewMaterial ? `
      <div class="modal-section">
        <div class="modal-section-label">Current Stock</div>
        <span class="stat-value gold" style="font-size:2rem">${fmtNum(m.stock_on_hand)}</span>
        <span class="stat-sub"> ${escapeHtml(m.unit)} on hand</span>
        <div class="stock-gauge full-width" style="margin-top:10px"><div class="stock-gauge-fill warn" style="width:${pct}%"></div></div>
      </div>
      <div class="modal-section">
        <div class="modal-section-label">Quick Actions</div>
        <div class="filters">
          <button type="button" class="filter-btn" data-mat-quick="receive_stock">Receive stock</button>
          <button type="button" class="filter-btn" data-mat-quick="adjust_stock">Adjust stock</button>
          ${Number(m.stock_on_hand) === 0 ? '<button type="button" class="filter-btn" data-mat-quick="initial_stock">Set initial stock</button>' : ''}
        </div>
        <div id="matQuickForm"></div>
      </div>` : ''}
      <div class="modal-section">
        <div class="modal-section-label">Details</div>
        <div class="modal-field full"><label class="field-label">Name</label><input type="text" class="field-input" id="mfName" value="${escapeHtml(m.name || '')}" placeholder="e.g. Sugar" /></div>
        <div class="modal-grid">
          <div class="modal-field"><label class="field-label">Category</label>
            <select class="field-input" id="mfCategory">${Object.entries(CATEGORY_META).map(([k, v]) => `<option value="${k}"${m.category === k ? ' selected' : ''}>${v.label}</option>`).join('')}</select>
          </div>
          <div class="modal-field"><label class="field-label">Unit</label>
            <select class="field-input" id="mfUnit">${UNIT_OPTIONS.map(u => `<option value="${u}"${m.unit === u ? ' selected' : ''}>${u}</option>`).join('')}</select>
          </div>
          <div class="modal-field"><label class="field-label">Bulk quantity</label><input type="number" class="field-input" id="mfBulkQty" min="0.0001" step="0.0001" value="${m.bulk_quantity ?? ''}" /></div>
          <div class="modal-field"><label class="field-label">Bulk cost</label><input type="number" class="field-input" id="mfBulkCost" min="0" step="0.01" value="${m.bulk_cost ?? ''}" /></div>
          <div class="modal-field"><label class="field-label">Reorder level</label><input type="number" class="field-input" id="mfReorderLevel" min="0" step="0.01" value="${m.reorder_level ?? 0}" /></div>
          <div class="modal-field"><label class="field-label">Reorder quantity</label><input type="number" class="field-input" id="mfReorderQty" min="0" step="0.01" value="${m.reorder_quantity ?? 0}" /></div>
        </div>
        <label class="field-label" style="display:flex;align-items:center;gap:8px;text-transform:none;letter-spacing:0;font-weight:500;margin-top:6px">
          <input type="checkbox" id="mfStandalone" ${m.sellable_standalone ? 'checked' : ''} /> Sellable as a standalone product
        </label>
        <label class="field-label" style="display:flex;align-items:center;gap:8px;text-transform:none;letter-spacing:0;font-weight:500">
          <input type="checkbox" id="mfActive" ${m.active !== false ? 'checked' : ''} /> Active
        </label>
      </div>
      <div class="modal-section" style="display:flex;gap:10px;flex-wrap:wrap;border-bottom:none">
        <button type="button" class="btn btn-primary modal-save-btn" id="matSave">${isNewMaterial ? 'Add Material' : 'Save Changes'}</button>
        ${!isNewMaterial ? `
          <button type="button" class="btn-print-label" id="matViewHistory">View History</button>
          <button type="button" class="btn btn-secondary" id="matDelete" style="color:#f87171">Delete</button>` : ''}
      </div>`;
  }

  function renderMatHistorySection() {
    if (!panelHistory) return `<div class="recent-empty"><span class="spinner"></span>Loading history…</div>`;
    if (!panelHistory.length) return `<div class="modal-section"><button type="button" class="btn-print-label" id="matBackToOverview">← Back</button></div><div class="recent-empty">No movements recorded yet.</div>`;
    const items = panelHistory.map(mv => {
      const qty = Number(mv.quantity || 0);
      const sign = qty > 0 ? '+' : '';
      return `
        <div class="recent-item">
          <div class="ri-avatar">${qty > 0 ? '↑' : '↓'}</div>
          <div class="ri-info">
            <div class="ri-name">${escapeHtml(String(mv.movement_type || '').replace(/_/g, ' '))}</div>
            <div class="ri-meta">${fmtNum(mv.stock_before)} → ${fmtNum(mv.stock_after)}${mv.note ? ' · ' + escapeHtml(mv.note) : ''}</div>
          </div>
          <div class="ri-right">
            <div class="ri-amount">${sign}${fmtNum(qty)}</div>
            <div class="ri-date">${new Date(mv.created_at).toLocaleDateString('en-ZA')}</div>
          </div>
        </div>`;
    }).join('');
    return `<div class="modal-section"><button type="button" class="btn-print-label" id="matBackToOverview">← Back to overview</button></div><div class="recent-list">${items}</div>`;
  }

  async function loadMatHistory(materialId) {
    try {
      const result = await request('get_material_history', { material_id: materialId });
      panelHistory = Array.isArray(result.movements) ? result.movements : [];
    } catch (error) {
      showMessage(error.message || 'Unable to load history', true);
      panelHistory = [];
    }
    if (panelMaterial) renderMaterialPanel();
  }

  function attachMaterialPanelListeners() {
    document.getElementById('matBackToOverview')?.addEventListener('click', () => { panelMode = 'overview'; renderMaterialPanel(); });
    document.getElementById('matViewHistory')?.addEventListener('click', () => { panelMode = 'history'; renderMaterialPanel(); loadMatHistory(panelMaterial.id); });

    document.getElementById('matSave')?.addEventListener('click', async () => {
      const values = {
        name: document.getElementById('mfName').value.trim(),
        category: document.getElementById('mfCategory').value,
        unit: document.getElementById('mfUnit').value,
        bulk_quantity: Number(document.getElementById('mfBulkQty').value || 0),
        bulk_cost: Number(document.getElementById('mfBulkCost').value || 0),
        reorder_level: Number(document.getElementById('mfReorderLevel').value || 0),
        reorder_quantity: Number(document.getElementById('mfReorderQty').value || 0),
        sellable_standalone: document.getElementById('mfStandalone').checked,
        active: document.getElementById('mfActive').checked,
      };
      if (!values.name) { showMessage('Material name is required', true); return; }
      const material = isNewMaterial ? values : { id: panelMaterial.id, ...values };
      try {
        await request('upsert_material', { material });
        showMessage(isNewMaterial ? 'Material added' : 'Material saved');
        closeMaterialPanel();
        await refresh();
      } catch (error) {
        showMessage(error.message || 'Failed to save material', true);
      }
    });

    document.getElementById('matDelete')?.addEventListener('click', async () => {
      if (!confirm('Delete this material? This cannot be undone.')) return;
      try {
        await request('delete_material', { material_id: panelMaterial.id });
        showMessage('Material deleted');
        closeMaterialPanel();
        await refresh();
      } catch (error) {
        showMessage(error.message || 'Failed to delete material', true);
      }
    });

    document.querySelectorAll('[data-mat-quick]').forEach(btn => btn.addEventListener('click', () => renderMatQuickForm(btn.dataset.matQuick)));
  }

  function renderMatQuickForm(action) {
    const holder = document.getElementById('matQuickForm');
    if (!holder) return;
    const isAdjust = action === 'adjust_stock';
    holder.innerHTML = `
      <div class="modal-sub-section">
        ${isAdjust ? `<div class="modal-field"><label class="field-label">Direction</label><select class="field-input" id="matQtyDirection"><option value="increase">Increase stock</option><option value="decrease">Decrease stock</option></select></div>` : ''}
        <div class="modal-field">
          <label class="field-label">Quantity (${escapeHtml(panelMaterial.unit)})</label>
          <div class="qty-stepper">
            <button type="button" id="matQtyMinus">−</button>
            <input type="number" class="field-input" id="matQtyInput" min="0.0001" step="0.0001" value="1" />
            <button type="button" id="matQtyPlus">+</button>
          </div>
        </div>
        <div class="modal-field"><label class="field-label">Note (required)</label><input type="text" class="field-input" id="matQtyNote" placeholder="e.g. Supplier delivery" /></div>
        <button type="button" class="btn btn-primary" id="matQtySubmit" style="width:100%">Confirm</button>
      </div>`;
    document.getElementById('matQtyMinus').addEventListener('click', () => { const i = document.getElementById('matQtyInput'); i.value = Math.max(0.0001, Number(i.value || 1) - 1); });
    document.getElementById('matQtyPlus').addEventListener('click', () => { const i = document.getElementById('matQtyInput'); i.value = Number(i.value || 1) + 1; });
    document.getElementById('matQtySubmit').addEventListener('click', async () => {
      const quantity = Number(document.getElementById('matQtyInput').value);
      const note = document.getElementById('matQtyNote').value.trim();
      if (!quantity || quantity <= 0) { showMessage('Quantity must be greater than zero', true); return; }
      if (!note) { showMessage('A note is required', true); return; }
      const payload = { material_id: panelMaterial.id, quantity, note };
      if (isAdjust) payload.direction = document.getElementById('matQtyDirection').value;
      try {
        await request(action, payload);
        showMessage('Stock updated');
        closeMaterialPanel();
        await refresh();
      } catch (error) {
        showMessage(error.message || 'Failed to update stock', true);
      }
    });
  }

  /* ─── RECIPES (BOM) TAB ─── */

  function renderRecipesTab() {
    const productOptions = products.map(p => `<option value="${escapeHtml(p.id)}"${p.id === selectedProductId ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
    if (!selectedProductId) {
      return `
        <div class="page-head"><div><h2>Recipes (Bill of Materials)</h2><p>Pick a product to build or edit its ingredient list.</p></div></div>
        <div class="modal-field full" style="max-width:420px"><label class="field-label">Product</label><select class="field-input" id="recipeProductSelect"><option value="">Select a product…</option>${productOptions}</select></div>`;
    }
    const lineRows = recipeLines.map((line, index) => {
      const material = materials.find(m => m.id === line.material_id);
      const lineCost = material ? Number(line.quantity_required || 0) * Number(material.cost_per_unit || 0) : 0;
      const materialOptions = materials.map(m => `<option value="${m.id}"${m.id === line.material_id ? ' selected' : ''}>${escapeHtml(m.name)} (${escapeHtml(m.unit)})</option>`).join('');
      return `
        <div class="variant-row" data-recipe-line="${index}">
          <select class="field-input" data-recipe-field="material_id" style="flex:2"><option value="">Select material…</option>${materialOptions}</select>
          <input type="number" min="0.0001" step="0.0001" data-recipe-field="quantity_required" value="${line.quantity_required ?? ''}" placeholder="Qty" style="max-width:100px" />
          <span class="items-mini" style="min-width:64px;text-align:right">${fmtCurrency(lineCost)}</span>
          <button type="button" class="btn-remove-variant" data-recipe-remove="${index}">×</button>
        </div>`;
    }).join('');
    return `
      <div class="page-head">
        <div><h2>Recipes (Bill of Materials)</h2><p>Editing the recipe for the selected product.</p></div>
        <div class="products-actions"><select class="search-input" id="recipeProductSelect">${productOptions}</select></div>
      </div>
      <div class="panel">
        <div class="panel-header"><span class="panel-title">Ingredients</span></div>
        <div class="variants-list" style="padding:16px 20px">
          ${lineRows || '<div class="recent-empty">No ingredients added yet.</div>'}
          <button type="button" class="btn-add-variant" id="addRecipeLine">+ Add ingredient</button>
        </div>
        <div class="recipe-cost-row">
          <span class="recipe-cost-label">Computed cost per unit</span>
          <span class="recipe-cost-value">${fmtCurrency(recipeComputedCost)}</span>
        </div>
      </div>
      <button type="button" class="btn btn-primary modal-save-btn" id="saveRecipe" style="align-self:flex-end">Save Recipe</button>`;
  }

  function recalculateRecipeCost() {
    recipeComputedCost = recipeLines.reduce((sum, line) => {
      const material = materials.find(m => m.id === line.material_id);
      return material ? sum + Number(line.quantity_required || 0) * Number(material.cost_per_unit || 0) : sum;
    }, 0);
  }

  function attachRecipesListeners(container) {
    const select = document.getElementById('recipeProductSelect');
    if (select) select.addEventListener('change', async () => {
      selectedProductId = select.value;
      recipeLines = [];
      if (selectedProductId) await loadRecipe(selectedProductId);
      render();
    });
    document.getElementById('addRecipeLine')?.addEventListener('click', () => { recipeLines.push({ material_id: '', quantity_required: '' }); render(); });
    container.querySelectorAll('[data-recipe-remove]').forEach(btn => btn.addEventListener('click', () => { recipeLines.splice(Number(btn.dataset.recipeRemove), 1); recalculateRecipeCost(); render(); }));
    container.querySelectorAll('[data-recipe-line]').forEach(row => {
      const index = Number(row.dataset.recipeLine);
      row.querySelectorAll('[data-recipe-field]').forEach(input => input.addEventListener('input', () => {
        recipeLines[index][input.dataset.recipeField] = input.value;
        recalculateRecipeCost();
        const el = document.querySelector('.recipe-cost-value');
        if (el) el.textContent = fmtCurrency(recipeComputedCost);
      }));
    });
    document.getElementById('saveRecipe')?.addEventListener('click', async () => {
      const lines = recipeLines.filter(l => l.material_id && Number(l.quantity_required) > 0).map(l => ({ material_id: l.material_id, quantity_required: Number(l.quantity_required) }));
      try {
        const result = await request('save_recipe', { product_id: selectedProductId, lines, sync_cost_price: true });
        recipeComputedCost = result.computed_cost || 0;
        showMessage('Recipe saved — product cost price updated');
        render();
      } catch (error) {
        showMessage(error.message || 'Failed to save recipe', true);
      }
    });
  }

  async function loadRecipe(productId) {
    try {
      const result = await request('get_recipe', { product_id: productId });
      recipeLines = (Array.isArray(result.recipe) ? result.recipe : []).map(l => ({ material_id: l.material_id, quantity_required: l.quantity_required }));
      recipeComputedCost = result.computed_cost || 0;
    } catch (error) {
      showMessage(error.message || 'Failed to load recipe', true);
    }
  }

  /* ─── CONVERSIONS TAB ─── */

  function renderConversionCard(c) {
    return `
      <div class="flow-card">
        <div class="flow-row">
          <div class="flow-box"><div class="flow-box-label">Consumes</div><div class="flow-box-name">${fmtNum(c.source_quantity)} ${escapeHtml(c.source?.unit || '')} · ${escapeHtml(c.source?.name || '')}</div></div>
          <div class="flow-arrow">→</div>
          <div class="flow-box"><div class="flow-box-label">Produces</div><div class="flow-box-name">${fmtNum(c.output_quantity)} ${escapeHtml(c.output?.unit || '')} · ${escapeHtml(c.output?.name || '')}</div></div>
        </div>
        ${c.note ? `<div class="items-mini">${escapeHtml(c.note)}</div>` : ''}
        <div class="flow-footer">
          <div style="display:flex;gap:8px;align-items:center;flex:1;min-width:220px">
            <input type="number" min="1" value="1" class="field-input" style="max-width:70px" data-conversion-batches="${c.id}" />
            <input type="text" placeholder="Note (required)" class="field-input" style="flex:1" data-conversion-note="${c.id}" />
          </div>
          <div style="display:flex;gap:8px">
            <button type="button" class="btn btn-primary" data-conversion-run="${c.id}">Run Batch</button>
            <button type="button" class="btn-remove-variant" data-conversion-delete="${c.id}">×</button>
          </div>
        </div>
      </div>`;
  }

  function renderConversionsTab() {
    const cards = conversions.map(renderConversionCard).join('');
    const materialOptions = materials.map(m => `<option value="${m.id}">${escapeHtml(m.name)} (${escapeHtml(m.unit)})</option>`).join('');
    return `
      <div class="page-head">
        <div><h2>Repack Conversions</h2><p>Bulk-to-retail repack rules, e.g. 1 kg drum → 2 × 500 g bags.</p></div>
        <div class="products-actions"><button type="button" class="btn-add-product" id="convToggleForm">+ New Repack Rule</button></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">${cards || '<div class="recent-empty">No repack rules yet.</div>'}</div>
      ${showConversionForm ? `
        <div class="panel" style="max-width:520px">
          <div class="panel-header"><span class="panel-title">New Repack Rule</span></div>
          <div class="modal-section" style="border-bottom:none">
            <div class="modal-field full"><label class="field-label">Source material (bulk)</label><select class="field-input" id="convSource"><option value="">Select…</option>${materialOptions}</select></div>
            <div class="modal-field full"><label class="field-label">Source quantity consumed per batch</label><input type="number" class="field-input" id="convSourceQty" min="0.0001" step="0.0001" /></div>
            <div class="modal-field full"><label class="field-label">Output material (retail)</label><select class="field-input" id="convOutput"><option value="">Select…</option>${materialOptions}</select></div>
            <div class="modal-field full"><label class="field-label">Output quantity produced per batch</label><input type="number" class="field-input" id="convOutputQty" min="0.0001" step="0.0001" /></div>
            <div class="modal-field full"><label class="field-label">Yield loss %</label><input type="number" class="field-input" id="convYieldLoss" min="0" max="99" step="0.1" value="0" /></div>
            <div class="modal-field full"><label class="field-label">Note</label><input type="text" class="field-input" id="convNote" placeholder="e.g. 1kg drum repacked into 500g bags" /></div>
            <button type="button" class="btn btn-primary modal-save-btn" id="convSave" style="width:100%">Add Repack Rule</button>
          </div>
        </div>` : ''}`;
  }

  function attachConversionsListeners(container) {
    document.getElementById('convToggleForm')?.addEventListener('click', () => { showConversionForm = !showConversionForm; render(); });
    container.querySelectorAll('[data-conversion-run]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.dataset.conversionRun;
      const batches = Number(container.querySelector(`[data-conversion-batches="${id}"]`).value || 1);
      const note = container.querySelector(`[data-conversion-note="${id}"]`).value.trim();
      if (!note) { showMessage('A note is required to run a conversion', true); return; }
      try {
        await request('run_conversion', { conversion_id: id, batches, note });
        showMessage('Conversion completed');
        await refresh();
      } catch (error) {
        showMessage(error.message || 'Failed to run conversion', true);
      }
    }));
    container.querySelectorAll('[data-conversion-delete]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('Delete this repack rule?')) return;
      try {
        await request('delete_conversion', { conversion_id: btn.dataset.conversionDelete });
        showMessage('Repack rule deleted');
        await refresh();
      } catch (error) {
        showMessage(error.message || 'Failed to delete rule', true);
      }
    }));
    document.getElementById('convSave')?.addEventListener('click', async () => {
      const conversion = {
        source_material_id: document.getElementById('convSource').value,
        source_quantity: Number(document.getElementById('convSourceQty').value),
        output_material_id: document.getElementById('convOutput').value,
        output_quantity: Number(document.getElementById('convOutputQty').value),
        yield_loss_percent: Number(document.getElementById('convYieldLoss').value || 0),
        note: document.getElementById('convNote').value.trim(),
      };
      try {
        await request('save_conversion', { conversion });
        showMessage('Repack rule added');
        showConversionForm = false;
        await refresh();
      } catch (error) {
        showMessage(error.message || 'Failed to add repack rule', true);
      }
    });
  }

  /* ─── MAIN RENDER ─── */

  function render() {
    const container = getContainer();
    if (!container) return;
    let body = '';
    if (activeTab === 'materials') body = renderMaterialsTab();
    if (activeTab === 'recipes') body = renderRecipesTab();
    if (activeTab === 'conversions') body = renderConversionsTab();

    container.innerHTML = `${tabsMarkup()}${body}`;

    container.querySelectorAll('[data-mat-tab]').forEach(btn => btn.addEventListener('click', () => { activeTab = btn.dataset.matTab; render(); }));
    if (activeTab === 'materials') attachMaterialsTabListeners(container);
    if (activeTab === 'recipes') attachRecipesListeners(container);
    if (activeTab === 'conversions') attachConversionsListeners(container);
    if (panelMaterial) renderMaterialPanel();
  }

  async function loadAll() {
    const [materialsResult, conversionsResult, productsResult] = await Promise.all([request('get_materials'), request('get_conversions'), fetchProducts()]);
    materials = Array.isArray(materialsResult.materials) ? materialsResult.materials : [];
    conversions = Array.isArray(conversionsResult.conversions) ? conversionsResult.conversions : [];
    products = Array.isArray(productsResult) ? productsResult : [];
  }

  async function refresh() {
    renderLoading();
    try {
      await loadAll();
      if (selectedProductId) await loadRecipe(selectedProductId);
      render();
    } catch (error) {
      console.error('Materials load failed:', error);
      renderError(error.message || 'Unknown error');
    }
  }

  async function init() {
    const container = getContainer();
    if (!container) return;
    await refresh();
  }

  window.ShopAdminMaterials = { init, refresh, render };
})();
