(() => {
  const ENDPOINT = 'https://papdxjcfimeyjgzmatpl.supabase.co/functions/v1/stock-management';
  const mount = document.getElementById('stock-management-panel');
  const adminUI = document.getElementById('adminUI');
  if (!mount || !adminUI) return;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
  const money = (value) => `R${Number(value || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const label = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());

  mount.hidden = true;
  mount.innerHTML = `<div class="stock-drawer-backdrop" data-stock-close></div><aside class="stock-drawer" role="dialog" aria-modal="true" aria-labelledby="stock-title"><div class="stock-drawer-header"><div><h2 id="stock-title">Stock management</h2><p>Replenishment overview</p></div><button type="button" class="stock-close" data-stock-close aria-label="Close stock management">×</button></div><div class="stock-drawer-body"><div id="stock-state">Loading stock…</div><div id="stock-summary"></div><div id="stock-table"></div></div></aside>`;

  const state = mount.querySelector('#stock-state');
  const summary = mount.querySelector('#stock-summary');
  const table = mount.querySelector('#stock-table');
  let password = '';
  let loaded = false;

  function render(data) {
    const products = Array.isArray(data.products) ? data.products : [];
    const counts = products.reduce((acc, product) => { acc[product.computed_status] = (acc[product.computed_status] || 0) + 1; return acc; }, {});
    summary.innerHTML = `<div class="stock-summary-grid">${[['Setup required', counts.not_configured || 0], ['Low stock', counts.low_stock || 0], ['Out of stock', counts.out_of_stock || 0], ['Not ready', counts.not_ready_for_sale || 0]].map(([title, value]) => `<div class="stock-summary-card"><span>${title}</span><strong>${value}</strong></div>`).join('')}</div>`;
    table.innerHTML = `<div class="stock-table-wrap"><table><thead><tr><th>Product</th><th>Status</th><th>Stock</th><th>Reorder</th><th>Suggested</th><th>Cost</th></tr></thead><tbody>${products.map((product) => `<tr><td>${escapeHtml(product.name)}</td><td>${escapeHtml(label(product.computed_status))}</td><td>${product.stock_on_hand ?? 0}</td><td>${product.reorder_level ?? 0}</td><td>${product.suggested_reorder_quantity ?? 0}</td><td>${money(product.estimated_reorder_cost)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  async function load() {
    if (!password) { state.textContent = 'Admin session unavailable. Sign out and back in to open stock.'; return; }
    state.textContent = 'Loading stock…';
    try {
      const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get_summary', password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Stock request failed');
      state.textContent = `Updated ${new Date(data.generated_at).toLocaleString('en-ZA')}`;
      render(data);
      loaded = true;
    } catch (error) { state.textContent = `Unable to load stock: ${error.message}`; }
  }

  function open() { mount.hidden = false; document.body.classList.add('stock-drawer-open'); if (!loaded) load(); }
  function close() { mount.hidden = true; document.body.classList.remove('stock-drawer-open'); }
  mount.addEventListener('click', (event) => { if (event.target.closest('[data-stock-close]')) close(); });
  document.addEventListener('click', (event) => { if (event.target.closest('[data-open-stock]')) open(); });
  window.setStockAdminPassword = (value) => { password = value || ''; loaded = false; };
  window.openStockManagement = open;
  window.closeStockManagement = close;
  window.stockPanelIsLoaded = () => loaded;
  const signedIn = () => adminUI.getAttribute('aria-hidden') === 'false';
  new MutationObserver(() => { if (!signedIn()) { password = ''; loaded = false; close(); } }).observe(adminUI, { attributes: true, attributeFilter: ['aria-hidden'] });
})();
