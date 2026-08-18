(() => {
  const ENDPOINT = 'https://papdxjcfimeyjgzmatpl.supabase.co/functions/v1/stock-management';
  const mount = document.getElementById('stock-management-panel');
  const adminUI = document.getElementById('adminUI');
  if (!mount || !adminUI) return;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
  const money = (value) => `R${Number(value || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const label = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());

  mount.hidden = false;
  mount.style.cssText = 'display:block;margin:24px 0;padding:24px;border:1px solid rgba(255,255,255,.12);border-radius:16px;background:rgba(255,255,255,.04);color:inherit;font-family:inherit;';
  mount.innerHTML = '<div style="font-size:20px;font-weight:700;">Stock overview</div><div id="stock-state" style="margin-top:12px;opacity:.75;">Sign in to load stock.</div><div id="stock-summary"></div><div id="stock-table" style="margin-top:18px;overflow:auto;"></div>';

  const state = mount.querySelector('#stock-state');
  const summary = mount.querySelector('#stock-summary');
  const table = mount.querySelector('#stock-table');
  let loaded = false;

  function render(data) {
    const products = Array.isArray(data.products) ? data.products : [];
    const counts = products.reduce((acc, product) => { acc[product.computed_status] = (acc[product.computed_status] || 0) + 1; return acc; }, {});
    summary.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:18px;">${[['Setup required', counts.not_configured || 0], ['Low stock', counts.low_stock || 0], ['Out of stock', counts.out_of_stock || 0], ['Not ready', counts.not_ready_for_sale || 0]].map(([title, value]) => `<div style="padding:14px;border-radius:10px;background:rgba(255,255,255,.05);"><div style="font-size:12px;opacity:.65;">${title}</div><div style="font-size:24px;font-weight:700;margin-top:4px;">${value}</div></div>`).join('')}</div>`;
    table.innerHTML = `<table style="width:100%;border-collapse:collapse;min-width:760px;"><thead><tr style="text-align:left;opacity:.65;font-size:12px;"><th style="padding:10px 8px;">Product</th><th style="padding:10px 8px;">Status</th><th style="padding:10px 8px;">Stock</th><th style="padding:10px 8px;">Reorder level</th><th style="padding:10px 8px;">Suggested reorder</th><th style="padding:10px 8px;">Estimated cost</th></tr></thead><tbody>${products.map((product) => `<tr style="border-top:1px solid rgba(255,255,255,.08);"><td style="padding:12px 8px;font-weight:600;">${escapeHtml(product.name)}</td><td style="padding:12px 8px;">${escapeHtml(label(product.computed_status))}</td><td style="padding:12px 8px;">${product.stock_on_hand ?? 0}</td><td style="padding:12px 8px;">${product.reorder_level ?? 0}</td><td style="padding:12px 8px;">${product.suggested_reorder_quantity ?? 0}</td><td style="padding:12px 8px;">${money(product.estimated_reorder_cost)}</td></tr>`).join('')}</tbody></table>`;
  }

  async function load() {
    const password = window.prompt('Enter shop admin password to load stock:');
    if (password === null) return;
    state.textContent = 'Loading stock summary…';
    try {
      const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get_summary', password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Stock request failed');
      state.textContent = `Updated ${new Date(data.generated_at).toLocaleString('en-ZA')}`;
      render(data);
      loaded = true;
    } catch (error) { state.textContent = `Unable to load stock: ${error.message}`; }
  }

  const signedIn = () => adminUI.getAttribute('aria-hidden') === 'false';
  function sync() {
    mount.hidden = false;
    if (signedIn() && !loaded) load();
  }
  new MutationObserver(sync).observe(adminUI, { attributes: true, attributeFilter: ['aria-hidden'] });
  sync();
})();
