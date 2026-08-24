/* ─── SHOP ADMIN: MATERIALS, RECIPES & CONVERSIONS ─── */
/*
 * Standalone classic-script module. Uses window.ShopAdmin bridge for
 * adminToken/showToast/esc. Calls the materials-management Edge Function.
 * Inert until ShopAdminMaterials.init() is called (mounts into #materialsContent).
 */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://papdxjcfimeyjgzmatpl.supabase.co';
  const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/materials-management`;

  const UNIT_OPTIONS = ['g', 'ml', 'drops', 'unit', 'cm'];
  const CATEGORY_OPTIONS = [
    { value: 'ingredient', label: 'Ingredient' },
    { value: 'packaging', label: 'Packaging' },
    { value: 'kit_component', label: 'Kit component (not sold alone)' },
  ];

  let materials = [];
  let conversions = [];
  let products = [];
  let activeTab = 'materials';
  let selectedProductId = '';
  let recipeLines = [];
  let recipeComputedCost = 0;

  function app() {
    return window.ShopAdmin || {};
  }

  function getAdminToken() {
    const bridge = app();
    if (typeof bridge.adminToken === 'string' && bridge.adminToken) return bridge.adminToken;
    return '';
  }

  function escapeHtml(value) {
    const bridge = app();
    if (typeof bridge.esc === 'function') return bridge.esc(value == null ? '' : String(value));
    const d = document.createElement('div');
    d.textContent = value == null ? '' : String(value);
    return d.innerHTML;
  }

  function showMessage(message, isError) {
    const bridge = app();
    if (typeof bridge.showToast === 'function') {
      bridge.showToast(message, Boolean(isError));
      return;
    }
    console[isError ? 'error' : 'log'](message);
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('en-ZA', { maximumFractionDigits: 3 });
  }

  function formatCurrency(value) {
    return `R${Number(value || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
    return body;
  }

  async function fetchProducts() {
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/products?select=id,name,category&order=idx.asc`,
        {
          headers: {
            apikey: 'sb_publishable_XXgqS4qa4-CJJQ7MYxt4Lw_sPbcmGPL',
            Authorization: 'Bearer sb_publishable_XXgqS4qa4-CJJQ7MYxt4Lw_sPbcmGPL',
          },
        }
      );
      if (!response.ok) return [];
      return await response.json();
    } catch {
      return [];
    }
  }

  function getContainer() {
    return document.getElementById('materialsContent');
  }

  function renderLoading() {
    const container = getContainer();
    if (container) container.innerHTML = '<div class="materials-loading">Loading…</div>';
  }

  function renderError(message) {
    const container = getContainer();
    if (!container) return;
    container.innerHTML = `
      <div class="materials-error">
        <strong>Could not load Materials &amp; Recipes.</strong>
        <span>${escapeHtml(message)}</span>
        <button type="button" class="btn btn-secondary" data-materials-action="retry">Try again</button>
      </div>`;
    const retry = container.querySelector('[data-materials-action="retry"]');
    if (retry) retry.addEventListener('click', () => refresh());
  }

  function tabsMarkup() {
    const tabs = [
      { key: 'materials', label: 'Raw Materials' },
      { key: 'recipes', label: 'Recipes (BOM)' },
      { key: 'conversions', label: 'Repack Conversions' },
    ];
    return `
      <div class="materials-tabs">
        ${tabs.map(t => `
          <button type="button" class="materials-tab${t.key === activeTab ? ' active' : ''}" data-materials-tab="${t.key}">${t.label}</button>
        `).join('')}
      </div>`;
  }

  function attachTabListeners(container) {
    container.querySelectorAll('[data-materials-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.materialsTab;
        render();
      });
    });
  }

  /* ─── RAW MATERIALS TAB ─── */

  function materialRow(material) {
    const id = material.id || '';
    const isNew = !id;
    const rowKey = id || 'new';

    return `
      <tr data-material-row="${rowKey}">
        <td><input type="text" class="field-input" data-field="name" value="${escapeHtml(material.name || '')}" placeholder="e.g. Sugar" /></td>
        <td>
          <select class="field-input" data-field="category">
            ${CATEGORY_OPTIONS.map(o => `<option value="${o.value}"${material.category === o.value ? ' selected' : ''}>${o.label}</option>`).join('')}
          </select>
        </td>
        <td>
          <select class="field-input" data-field="unit">
            ${UNIT_OPTIONS.map(u => `<option value="${u}"${material.unit === u ? ' selected' : ''}>${u}</option>`).join('')}
          </select>
        </td>
        <td><input type="number" min="0.0001" step="0.0001" class="field-input" data-field="bulk_quantity" value="${material.bulk_quantity ?? ''}" style="width:90px" /></td>
        <td><input type="number" min="0" step="0.01" class="field-input" data-field="bulk_cost" value="${material.bulk_cost ?? ''}" style="width:90px" /></td>
        <td class="materials-readonly">${formatCurrency(material.cost_per_unit)}</td>
        <td class="materials-readonly">${formatNumber(material.stock_on_hand)} ${escapeHtml(material.unit || '')}</td>
        <td><input type="number" min="0" step="0.01" class="field-input" data-field="reorder_level" value="${material.reorder_level ?? 0}" style="width:80px" /></td>
        <td><input type="number" min="0" step="0.01" class="field-input" data-field="reorder_quantity" value="${material.reorder_quantity ?? 0}" style="width:80px" /></td>
        <td style="text-align:center"><input type="checkbox" data-field="sellable_standalone" ${material.sellable_standalone ? 'checked' : ''} /></td>
        <td style="text-align:center"><input type="checkbox" data-field="active" ${material.active !== false ? 'checked' : ''} /></td>
        <td class="materials-actions">
          <button type="button" class="btn btn-primary" data-materials-save="${rowKey}">${isNew ? 'Add' : 'Save'}</button>
          ${!isNew ? `
            <button type="button" class="btn btn-secondary" data-materials-stock="${id}">Stock</button>
            <button type="button" class="btn btn-secondary" data-materials-history="${id}">History</button>
            <button type="button" class="btn btn-danger" data-materials-delete="${id}">Delete</button>
          ` : ''}
        </td>
      </tr>`;
  }

  function renderMaterialsTab() {
    const rows = materials.map(materialRow).join('');
    const newRow = materialRow({ category: 'ingredient', unit: 'g', bulk_quantity: 1, bulk_cost: 0, reorder_level: 0, reorder_quantity: 0, sellable_standalone: false, active: true });

    return `
      <div class="materials-table-wrap">
        <table class="materials-table">
          <thead>
            <tr>
              <th>Name</th><th>Category</th><th>Unit</th>
              <th>Bulk qty</th><th>Bulk cost</th><th>Cost / unit</th>
              <th>On hand</th><th>Reorder at</th><th>Reorder qty</th>
              <th>Sellable alone</th><th>Active</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="12" class="materials-empty">No raw materials yet. Add one below.</td></tr>'}
            <tr class="materials-new-row-label"><td colspan="12">Add new material</td></tr>
            ${newRow}
          </tbody>
        </table>
      </div>
      <div id="materialsHistoryPanel" class="materials-history" hidden></div>
      <div id="materialsStockPanel" class="materials-stock-modal" hidden></div>`;
  }

  function readRowValues(row) {
    const values = {};
    row.querySelectorAll('[data-field]').forEach(input => {
      const field = input.dataset.field;
      if (input.type === 'checkbox') {
        values[field] = input.checked;
      } else if (input.type === 'number') {
        values[field] = input.value === '' ? null : Number(input.value);
      } else {
        values[field] = input.value;
      }
    });
    return values;
  }

  function attachMaterialsListeners(container) {
    container.querySelectorAll('[data-materials-save]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const rowKey = btn.dataset.materialsSave;
        const row = container.querySelector(`[data-material-row="${rowKey}"]`);
        const values = readRowValues(row);
        const material = rowKey === 'new' ? values : { id: rowKey, ...values };
        try {
          btn.disabled = true;
          await request('upsert_material', { material });
          showMessage(rowKey === 'new' ? 'Material added' : 'Material saved');
          await refresh();
        } catch (error) {
          showMessage(error.message || 'Failed to save material', true);
        } finally {
          btn.disabled = false;
        }
      });
    });

    container.querySelectorAll('[data-materials-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const materialId = btn.dataset.materialsDelete;
        if (!confirm('Delete this material? This cannot be undone.')) return;
        try {
          await request('delete_material', { material_id: materialId });
          showMessage('Material deleted');
          await refresh();
        } catch (error) {
          showMessage(error.message || 'Failed to delete material', true);
        }
      });
    });

    container.querySelectorAll('[data-materials-history]').forEach(btn => {
      btn.addEventListener('click', () => loadMaterialHistory(btn.dataset.materialsHistory));
    });

    container.querySelectorAll('[data-materials-stock]').forEach(btn => {
      btn.addEventListener('click', () => showStockPanel(btn.dataset.materialsStock));
    });
  }

  function showStockPanel(materialId) {
    const panel = document.getElementById('materialsStockPanel');
    if (!panel) return;
    const material = materials.find(m => m.id === materialId);
    if (!material) return;

    panel.hidden = false;
    panel.innerHTML = `
      <div class="materials-stock-box">
        <h3>Adjust stock: ${escapeHtml(material.name)}</h3>
        <p>Current: ${formatNumber(material.stock_on_hand)} ${escapeHtml(material.unit)}</p>
        <label>Action
          <select id="stockAction">
            <option value="receive_stock">Receive stock (purchase)</option>
            <option value="adjust_increase">Manual increase</option>
            <option value="adjust_decrease">Manual decrease</option>
            <option value="initial_stock">Set initial stock (only if currently zero)</option>
          </select>
        </label>
        <label>Quantity (${escapeHtml(material.unit)})
          <input type="number" id="stockQuantity" min="0.0001" step="0.0001" />
        </label>
        <label>Note (required)
          <input type="text" id="stockNote" placeholder="e.g. Supplier delivery, stocktake correction" />
        </label>
        <div class="materials-stock-actions">
          <button type="button" class="btn btn-secondary" id="stockCancel">Cancel</button>
          <button type="button" class="btn btn-primary" id="stockSubmit">Save</button>
        </div>
      </div>`;

    document.getElementById('stockCancel').addEventListener('click', () => {
      panel.hidden = true;
      panel.innerHTML = '';
    });

    document.getElementById('stockSubmit').addEventListener('click', async () => {
      const actionValue = document.getElementById('stockAction').value;
      const quantity = Number(document.getElementById('stockQuantity').value);
      const note = document.getElementById('stockNote').value.trim();
      if (!quantity || quantity <= 0) { showMessage('Quantity must be greater than zero', true); return; }
      if (!note) { showMessage('A note is required', true); return; }

      let action = actionValue;
      let direction;
      if (actionValue === 'adjust_increase') { action = 'adjust_stock'; direction = 'increase'; }
      if (actionValue === 'adjust_decrease') { action = 'adjust_stock'; direction = 'decrease'; }

      try {
        await request(action, { material_id: materialId, quantity, note, direction });
        showMessage('Stock updated');
        panel.hidden = true;
        panel.innerHTML = '';
        await refresh();
      } catch (error) {
        showMessage(error.message || 'Failed to update stock', true);
      }
    });
  }

  async function loadMaterialHistory(materialId) {
    try {
      const result = await request('get_material_history', { material_id: materialId });
      const material = materials.find(m => m.id === materialId);
      renderMaterialHistory(material, Array.isArray(result.movements) ? result.movements : []);
    } catch (error) {
      showMessage(error.message || 'Unable to load history', true);
    }
  }

  function renderMaterialHistory(material, movements) {
    const panel = document.getElementById('materialsHistoryPanel');
    if (!panel) return;
    const rows = movements.map(m => {
      const sign = Number(m.quantity) > 0 ? '+' : '';
      return `
        <tr>
          <td>${new Date(m.created_at).toLocaleString('en-ZA')}</td>
          <td>${escapeHtml(String(m.movement_type || '').replace(/_/g, ' '))}</td>
          <td>${sign}${formatNumber(m.quantity)}</td>
          <td>${formatNumber(m.stock_before)} → ${formatNumber(m.stock_after)}</td>
          <td>${escapeHtml(m.reference_type || '—')}</td>
          <td>${escapeHtml(m.note || '—')}</td>
        </tr>`;
    }).join('');

    panel.hidden = false;
    panel.innerHTML = `
      <div class="materials-history-header">
        <h3>Movement history: ${escapeHtml(material ? material.name : '')}</h3>
        <button type="button" class="btn btn-secondary" id="closeMaterialHistory">Close</button>
      </div>
      <table class="materials-table">
        <thead><tr><th>Time</th><th>Type</th><th>Change</th><th>Balance</th><th>Reference</th><th>Note</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="materials-empty">No movements recorded yet.</td></tr>'}</tbody>
      </table>`;

    document.getElementById('closeMaterialHistory').addEventListener('click', () => {
      panel.hidden = true;
      panel.innerHTML = '';
    });
  }

  /* ─── RECIPES (BOM) TAB ─── */

  function renderRecipesTab() {
    const productOptions = products.map(p => `<option value="${escapeHtml(p.id)}"${p.id === selectedProductId ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('');

    const lineRows = recipeLines.map((line, index) => {
      const materialOptions = materials.map(m => `<option value="${m.id}"${m.id === line.material_id ? ' selected' : ''}>${escapeHtml(m.name)} (${escapeHtml(m.unit)})</option>`).join('');
      const material = materials.find(m => m.id === line.material_id);
      const lineCost = material ? Number(line.quantity_required || 0) * Number(material.cost_per_unit || 0) : 0;
      return `
        <tr data-recipe-line="${index}">
          <td>
            <select class="field-input" data-recipe-field="material_id">
              <option value="">Select material…</option>
              ${materialOptions}
            </select>
          </td>
          <td><input type="number" min="0.0001" step="0.0001" class="field-input" data-recipe-field="quantity_required" value="${line.quantity_required ?? ''}" style="width:100px" /></td>
          <td class="materials-readonly">${material ? escapeHtml(material.unit) : '—'}</td>
          <td class="materials-readonly">${formatCurrency(lineCost)}</td>
          <td><button type="button" class="btn btn-danger" data-recipe-remove="${index}">Remove</button></td>
        </tr>`;
    }).join('');

    return `
      <div class="materials-recipe-toolbar">
        <label>Product
          <select id="recipeProductSelect" class="field-input">
            <option value="">Select a product…</option>
            ${productOptions}
          </select>
        </label>
      </div>
      ${selectedProductId ? `
        <div class="materials-table-wrap">
          <table class="materials-table">
            <thead><tr><th>Material</th><th>Quantity required</th><th>Unit</th><th>Line cost</th><th></th></tr></thead>
            <tbody>${lineRows || '<tr><td colspan="5" class="materials-empty">No ingredients added yet.</td></tr>'}</tbody>
          </table>
        </div>
        <div class="materials-recipe-footer">
          <button type="button" class="btn btn-secondary" id="addRecipeLine">+ Add ingredient</button>
          <div class="materials-recipe-total">Computed cost: <strong>${formatCurrency(recipeComputedCost)}</strong></div>
          <button type="button" class="btn btn-primary" id="saveRecipe">Save Recipe</button>
        </div>
      ` : '<p class="materials-empty">Select a product above to view or edit its recipe.</p>'}`;
  }

  function recalculateRecipeCost() {
    recipeComputedCost = recipeLines.reduce((sum, line) => {
      const material = materials.find(m => m.id === line.material_id);
      if (!material) return sum;
      return sum + Number(line.quantity_required || 0) * Number(material.cost_per_unit || 0);
    }, 0);
  }

  function attachRecipesListeners(container) {
    const select = document.getElementById('recipeProductSelect');
    if (select) {
      select.addEventListener('change', async () => {
        selectedProductId = select.value;
        recipeLines = [];
        if (selectedProductId) await loadRecipe(selectedProductId);
        render();
      });
    }

    const addBtn = document.getElementById('addRecipeLine');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        recipeLines.push({ material_id: '', quantity_required: '' });
        render();
      });
    }

    container.querySelectorAll('[data-recipe-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        recipeLines.splice(Number(btn.dataset.recipeRemove), 1);
        recalculateRecipeCost();
        render();
      });
    });

    container.querySelectorAll('[data-recipe-line]').forEach(row => {
      const index = Number(row.dataset.recipeLine);
      row.querySelectorAll('[data-recipe-field]').forEach(input => {
        input.addEventListener('input', () => {
          const field = input.dataset.recipeField;
          recipeLines[index][field] = field === 'quantity_required' ? input.value : input.value;
          recalculateRecipeCost();
          const totalEl = container.querySelector('.materials-recipe-total strong');
          if (totalEl) totalEl.textContent = formatCurrency(recipeComputedCost);
        });
      });
    });

    const saveBtn = document.getElementById('saveRecipe');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const lines = recipeLines
          .filter(l => l.material_id && Number(l.quantity_required) > 0)
          .map(l => ({ material_id: l.material_id, quantity_required: Number(l.quantity_required) }));
        try {
          saveBtn.disabled = true;
          const result = await request('save_recipe', { product_id: selectedProductId, lines, sync_cost_price: true });
          recipeComputedCost = result.computed_cost || 0;
          showMessage('Recipe saved — product cost price updated');
          render();
        } catch (error) {
          showMessage(error.message || 'Failed to save recipe', true);
        } finally {
          saveBtn.disabled = false;
        }
      });
    }
  }

  async function loadRecipe(productId) {
    try {
      const result = await request('get_recipe', { product_id: productId });
      recipeLines = (Array.isArray(result.recipe) ? result.recipe : []).map(line => ({
        material_id: line.material_id,
        quantity_required: line.quantity_required,
      }));
      recipeComputedCost = result.computed_cost || 0;
    } catch (error) {
      showMessage(error.message || 'Failed to load recipe', true);
    }
  }

  /* ─── CONVERSIONS TAB ─── */

  function renderConversionsTab() {
    const materialOptions = materials.map(m => `<option value="${m.id}">${escapeHtml(m.name)} (${escapeHtml(m.unit)})</option>`).join('');

    const rows = conversions.map(c => `
      <tr data-conversion-row="${c.id}">
        <td>${escapeHtml(c.source?.name || '')}</td>
        <td>${formatNumber(c.source_quantity)} ${escapeHtml(c.source?.unit || '')}</td>
        <td>${escapeHtml(c.output?.name || '')}</td>
        <td>${formatNumber(c.output_quantity)} ${escapeHtml(c.output?.unit || '')}</td>
        <td>${escapeHtml(c.note || '—')}</td>
        <td class="materials-actions">
          <input type="number" min="1" value="1" class="field-input" data-conversion-batches="${c.id}" style="width:60px" />
          <input type="text" placeholder="Note" class="field-input" data-conversion-note="${c.id}" style="width:140px" />
          <button type="button" class="btn btn-primary" data-conversion-run="${c.id}">Run</button>
          <button type="button" class="btn btn-danger" data-conversion-delete="${c.id}">Delete</button>
        </td>
      </tr>`).join('');

    return `
      <div class="materials-table-wrap">
        <table class="materials-table">
          <thead><tr><th>Source (bulk)</th><th>Consumes</th><th>Output (retail)</th><th>Produces</th><th>Note</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6" class="materials-empty">No repack rules yet. Add one below.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="materials-new-conversion">
        <h3>Add repack rule</h3>
        <label>Source material (bulk)
          <select id="convSource" class="field-input"><option value="">Select…</option>${materialOptions}</select>
        </label>
        <label>Source quantity consumed per batch
          <input type="number" id="convSourceQty" min="0.0001" step="0.0001" class="field-input" />
        </label>
        <label>Output material (retail)
          <select id="convOutput" class="field-input"><option value="">Select…</option>${materialOptions}</select>
        </label>
        <label>Output quantity produced per batch
          <input type="number" id="convOutputQty" min="0.0001" step="0.0001" class="field-input" />
        </label>
        <label>Yield loss %
          <input type="number" id="convYieldLoss" min="0" max="99" step="0.1" value="0" class="field-input" />
        </label>
        <label>Note
          <input type="text" id="convNote" class="field-input" placeholder="e.g. 1kg drum repacked into 500g bags" />
        </label>
        <button type="button" class="btn btn-primary" id="convSave">Add repack rule</button>
      </div>`;
  }

  function attachConversionsListeners(container) {
    container.querySelectorAll('[data-conversion-run]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.conversionRun;
        const batchesInput = container.querySelector(`[data-conversion-batches="${id}"]`);
        const noteInput = container.querySelector(`[data-conversion-note="${id}"]`);
        const batches = Number(batchesInput.value || 1);
        const note = noteInput.value.trim();
        if (!note) { showMessage('A note is required to run a conversion', true); return; }
        try {
          btn.disabled = true;
          await request('run_conversion', { conversion_id: id, batches, note });
          showMessage('Conversion completed');
          await refresh();
        } catch (error) {
          showMessage(error.message || 'Failed to run conversion', true);
        } finally {
          btn.disabled = false;
        }
      });
    });

    container.querySelectorAll('[data-conversion-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this repack rule?')) return;
        try {
          await request('delete_conversion', { conversion_id: btn.dataset.conversionDelete });
          showMessage('Repack rule deleted');
          await refresh();
        } catch (error) {
          showMessage(error.message || 'Failed to delete rule', true);
        }
      });
    });

    const saveBtn = document.getElementById('convSave');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const conversion = {
          source_material_id: document.getElementById('convSource').value,
          source_quantity: Number(document.getElementById('convSourceQty').value),
          output_material_id: document.getElementById('convOutput').value,
          output_quantity: Number(document.getElementById('convOutputQty').value),
          yield_loss_percent: Number(document.getElementById('convYieldLoss').value || 0),
          note: document.getElementById('convNote').value.trim(),
        };
        try {
          saveBtn.disabled = true;
          await request('save_conversion', { conversion });
          showMessage('Repack rule added');
          await refresh();
        } catch (error) {
          showMessage(error.message || 'Failed to add repack rule', true);
        } finally {
          saveBtn.disabled = false;
        }
      });
    }
  }

  /* ─── MAIN RENDER ─── */

  function render() {
    const container = getContainer();
    if (!container) return;

    let body = '';
    if (activeTab === 'materials') body = renderMaterialsTab();
    if (activeTab === 'recipes') body = renderRecipesTab();
    if (activeTab === 'conversions') body = renderConversionsTab();

    container.innerHTML = `
      <div class="materials-toolbar">
        <div>
          <h2>Materials &amp; Recipes</h2>
          <p>Raw materials, packaging, bill of materials, and bulk repack conversions.</p>
        </div>
        <button type="button" class="btn btn-secondary" data-materials-action="refresh">Refresh</button>
      </div>
      ${tabsMarkup()}
      <div class="materials-tab-body">${body}</div>`;

    const refreshBtn = container.querySelector('[data-materials-action="refresh"]');
    if (refreshBtn) refreshBtn.addEventListener('click', () => refresh());

    attachTabListeners(container);
    if (activeTab === 'materials') { attachMaterialsListeners(container); }
    if (activeTab === 'recipes') { attachRecipesListeners(container); }
    if (activeTab === 'conversions') { attachConversionsListeners(container); }
  }

  async function loadAll() {
    const [materialsResult, conversionsResult, productsResult] = await Promise.all([
      request('get_materials'),
      request('get_conversions'),
      fetchProducts(),
    ]);
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

  window.ShopAdminMaterials = {
    init,
    refresh,
    render,
  };
})();
