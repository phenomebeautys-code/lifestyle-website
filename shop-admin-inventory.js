/* ─── SHOP ADMIN: INVENTORY (app-style redesign) ─── */
/*
 * Redesigned per Laws of UX: KPI strip (chunking/orientation), filter chips +
 * search (recognition over recall), list rows with stock gauges and status
 * pills (Von Restorff / Goal-Gradient), and a slide-over detail panel for
 * edits instead of an always-open spreadsheet grid (Hick's Law).
 * Same public API (window.ShopAdminInventory.init/refresh/render), same
 * container (#inventoryContent), same stock-management Edge Function
 * contract (get_summary, update_settings, initial_stock, receive_stock,
 * adjust_stock, get_history) — purely a rendering-layer rewrite.
 */
(function () {
  if (document.getElementById('aa-app-ui-styles')) return;
  var style = document.createElement('style');
  style.id = 'aa-app-ui-styles';
  style.textContent = `
.aa-toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:18px}
.aa-toolbar-left{display:flex;flex-direction:column;gap:2px}
.aa-toolbar-left h2{margin:0;font-size:1.15rem}
.aa-toolbar-left p{margin:0;font-size:.82rem;color:var(--text-muted,#8a8a8a)}
.aa-toolbar-right{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.aa-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px}
.aa-kpi{background:var(--card-bg,#fff);border:1px solid var(--border,#ececec);border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.aa-kpi.warn{border-color:#f0c37e;background:linear-gradient(180deg,#fff9ef,#fff)}
.aa-kpi.danger{border-color:#eda9a4;background:linear-gradient(180deg,#fff3f2,#fff)}
.aa-kpi-icon{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:var(--accent,#c9a15a);color:#fff;flex-shrink:0}
.aa-kpi-icon svg{width:18px;height:18px}
.aa-kpi-num{font-size:1.35rem;font-weight:700;line-height:1.1}
.aa-kpi-label{font-size:.72rem;color:var(--text-muted,#8a8a8a);margin-top:2px}
.aa-chips{display:flex;gap:8px;flex-wrap:wrap}
.aa-chip{border:1px solid var(--border,#e2e2e2);background:#fff;border-radius:999px;padding:6px 14px;font-size:.79rem;cursor:pointer;color:var(--text-muted,#666);transition:.15s;white-space:nowrap}
.aa-chip:hover{border-color:var(--accent,#c9a15a)}
.aa-chip.active{background:var(--accent,#c9a15a);border-color:var(--accent,#c9a15a);color:#fff;font-weight:600}
.aa-search{border:1px solid var(--border,#e2e2e2);border-radius:10px;padding:9px 12px;font-size:.85rem;min-width:200px}
.aa-list{display:flex;flex-direction:column;gap:8px}
.aa-row{display:flex;align-items:center;gap:14px;background:#fff;border:1px solid var(--border,#eee);border-left:4px solid #d8d8d8;border-radius:14px;padding:12px 14px;cursor:pointer;transition:.15s}
.aa-row:hover{box-shadow:0 3px 12px rgba(0,0,0,.06);transform:translateY(-1px)}
.aa-row.status-low{border-left-color:#e8a33d}
.aa-row.status-out{border-left-color:#e2544c}
.aa-row.status-ok{border-left-color:#4caf7d}
.aa-row.status-muted{border-left-color:#c8c8c8;opacity:.65}
.aa-row-icon{width:42px;height:42px;border-radius:11px;background:#f5f2ec;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--accent,#c9a15a)}
.aa-row-icon svg{width:19px;height:19px}
.aa-row-main{flex:1;min-width:0}
.aa-row-title-line{display:flex;align-items:center;gap:8px}
.aa-row-title{font-weight:600;font-size:.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.aa-row-sub{font-size:.76rem;color:var(--text-muted,#8a8a8a);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.aa-gauge{width:110px;height:6px;border-radius:99px;background:#eee;overflow:hidden;margin-top:7px}
.aa-gauge-fill{height:100%;border-radius:99px;background:#4caf7d;transition:width .2s}
.aa-gauge-fill.warn{background:#e8a33d}
.aa-gauge-fill.danger{background:#e2544c}
.aa-row-stat{text-align:right;min-width:78px;flex-shrink:0}
.aa-row-stat-num{font-weight:700;font-size:.98rem;white-space:nowrap}
.aa-row-stat-label{font-size:.66rem;color:var(--text-muted,#8a8a8a)}
.aa-pill{display:inline-block;font-size:.66rem;font-weight:700;padding:3px 10px;border-radius:999px;white-space:nowrap;letter-spacing:.02em;text-transform:uppercase}
.aa-pill.ok{background:#e6f5ec;color:#2f8a5b}
.aa-pill.warn{background:#fdf1de;color:#b3711a}
.aa-pill.danger{background:#fbe6e5;color:#c23b32}
.aa-pill.muted{background:#f0f0f0;color:#888}
.aa-actions{display:flex;gap:6px;flex-shrink:0}
.aa-iconbtn{width:34px;height:34px;border-radius:9px;border:1px solid var(--border,#e2e2e2);background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text-muted,#666);transition:.15s;flex-shrink:0}
.aa-iconbtn svg{width:15px;height:15px}
.aa-iconbtn:hover{background:var(--accent,#c9a15a);color:#fff;border-color:var(--accent,#c9a15a)}
.aa-iconbtn.danger:hover{background:#e2544c;border-color:#e2544c}
.aa-empty{text-align:center;padding:56px 20px;color:var(--text-muted,#8a8a8a)}
.aa-empty svg{width:52px;height:52px;opacity:.35;margin-bottom:12px}
.aa-loading{text-align:center;padding:56px 20px;color:var(--text-muted,#8a8a8a)}
.aa-error{text-align:center;padding:40px 20px;display:flex;flex-direction:column;align-items:center;gap:10px}
.aa-overlay{position:fixed;inset:0;background:rgba(20,16,10,.42);display:flex;justify-content:flex-end;z-index:920;animation:aaFade .15s ease}
.aa-panel{width:min(440px,100%);height:100%;background:#fff;box-shadow:-10px 0 34px rgba(0,0,0,.16);display:flex;flex-direction:column;animation:aaSlide .2s ease}
.aa-panel-header{padding:18px 20px;border-bottom:1px solid var(--border,#eee);display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.aa-panel-header h3{margin:0;font-size:1.05rem}
.aa-panel-header p{margin:2px 0 0;font-size:.78rem;color:var(--text-muted,#8a8a8a)}
.aa-panel-close{width:32px;height:32px;border-radius:9px;border:1px solid var(--border,#e2e2e2);background:#fff;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.aa-panel-body{padding:20px;overflow-y:auto;flex:1}
.aa-panel-footer{padding:14px 20px;border-top:1px solid var(--border,#eee);display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}
.aa-section{margin-bottom:22px}
.aa-section-title{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted,#8a8a8a);margin-bottom:10px}
.aa-bignum-row{display:flex;align-items:baseline;gap:16px;margin-bottom:8px}
.aa-bignum{font-size:2.1rem;font-weight:700;line-height:1}
.aa-bignum-unit{font-size:.8rem;color:var(--text-muted,#8a8a8a)}
.aa-field{margin-bottom:14px}
.aa-field label{display:block;font-size:.76rem;color:var(--text-muted,#8a8a8a);margin-bottom:5px;font-weight:600}
.aa-field input,.aa-field select{width:100%;border:1px solid var(--border,#e2e2e2);border-radius:9px;padding:9px 11px;font-size:.88rem;box-sizing:border-box}
.aa-field-row{display:flex;gap:10px}
.aa-field-row .aa-field{flex:1}
.aa-stepper{display:flex;align-items:center;gap:8px}
.aa-stepper button{width:34px;height:34px;border-radius:9px;border:1px solid var(--border,#e2e2e2);background:#fff;font-size:1.15rem;cursor:pointer;flex-shrink:0}
.aa-stepper button:hover{background:#f5f2ec}
.aa-stepper input{flex:1;text-align:center}
.aa-chiprow{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.aa-quickchip{border:1px solid var(--border,#e2e2e2);background:#faf9f6;border-radius:8px;padding:6px 10px;font-size:.76rem;cursor:pointer}
.aa-quickchip:hover{border-color:var(--accent,#c9a15a)}
.aa-actionrow{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px}
.aa-actionbtn{border:1px solid var(--border,#e2e2e2);background:#fff;border-radius:11px;padding:12px;text-align:center;cursor:pointer;font-size:.82rem;font-weight:600;color:#333;transition:.15s}
.aa-actionbtn:hover{border-color:var(--accent,#c9a15a);background:#faf7f0}
.aa-actionbtn.full{grid-column:1 / -1}
.aa-timeline{display:flex;flex-direction:column;gap:10px}
.aa-tl-item{display:flex;gap:10px;padding:11px;border-radius:10px;background:#faf9f6}
.aa-tl-icon{width:30px;height:30px;border-radius:8px;background:#fff;border:1px solid var(--border,#eee);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:.85rem}
.aa-tl-main{flex:1;font-size:.8rem;min-width:0}
.aa-tl-top{display:flex;justify-content:space-between;gap:8px}
.aa-tl-type{font-weight:600;text-transform:capitalize}
.aa-tl-qty{font-weight:700}
.aa-tl-qty.pos{color:#2f8a5b}
.aa-tl-qty.neg{color:#c23b32}
.aa-tl-meta{color:var(--text-muted,#8a8a8a);font-size:.72rem;margin-top:2px}
.aa-tl-note{color:#555;font-size:.76rem;margin-top:3px}
.aa-inline-form{background:#faf9f6;border:1px solid var(--border,#eee);border-radius:12px;padding:14px;margin-top:10px}
.aa-flowcard{background:#fff;border:1px solid var(--border,#eee);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px}
.aa-flow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.aa-flow-box{flex:1;min-width:150px;background:#faf9f6;border-radius:10px;padding:10px 12px}
.aa-flow-box-label{font-size:.68rem;color:var(--text-muted,#8a8a8a);text-transform:uppercase;letter-spacing:.03em;margin-bottom:2px}
.aa-flow-box-name{font-weight:600;font-size:.88rem}
.aa-flow-arrow{color:var(--accent,#c9a15a);font-size:1.4rem;flex-shrink:0}
.aa-flow-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;border-top:1px solid var(--border,#eee);padding-top:12px}
.aa-recipebuilder{display:flex;flex-direction:column;gap:10px}
.aa-ingredient-row{display:flex;align-items:center;gap:10px;background:#faf9f6;border-radius:11px;padding:10px 12px}
.aa-ingredient-row select{flex:2}
.aa-ingredient-row input{flex:1;min-width:0}
.aa-sticky-footer{position:sticky;bottom:0;background:#fff;border-top:1px solid var(--border,#eee);padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-radius:0 0 14px 14px;margin-top:14px}
.aa-costlabel{font-size:.76rem;color:var(--text-muted,#8a8a8a)}
.aa-costval{font-size:1.3rem;font-weight:700}
.aa-btn{border:none;border-radius:10px;padding:10px 18px;font-size:.85rem;font-weight:600;cursor:pointer;transition:.15s}
.aa-btn-primary{background:var(--accent,#c9a15a);color:#fff}
.aa-btn-primary:hover{opacity:.9}
.aa-btn-secondary{background:#f2f0eb;color:#333}
.aa-btn-secondary:hover{background:#e8e5dd}
.aa-btn-danger{background:#fbe6e5;color:#c23b32}
.aa-btn-danger:hover{background:#f6d3d1}
.aa-btn:disabled{opacity:.5;cursor:not-allowed}
@keyframes aaFade{from{opacity:0}to{opacity:1}}
@keyframes aaSlide{from{transform:translateX(30px)}to{transform:translateX(0)}}
@media (max-width:640px){
  .aa-row{flex-wrap:wrap}
  .aa-gauge{display:none}
  .aa-actionrow{grid-template-columns:1fr}
}
`;
  document.head.appendChild(style);
})();

(function () {
  'use strict';

  const SUPABASE_URL = 'https://papdxjcfimeyjgzmatpl.supabase.co';
  const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/stock-management`;

  const ICONS = {
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    rands: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
    inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/></svg>',
  };

  const STATUS_META = {
    out_of_stock: { label: 'Out of stock', pill: 'danger', row: 'out' },
    low_stock: { label: 'Low stock', pill: 'warn', row: 'low' },
    in_stock: { label: 'In stock', pill: 'ok', row: 'ok' },
    not_configured: { label: 'Needs setup', pill: 'muted', row: 'muted' },
    not_ready_for_sale: { label: 'Not for sale', pill: 'muted', row: 'muted' },
    discontinued: { label: 'Discontinued', pill: 'muted', row: 'muted' },
  };

  let products = [];
  let activeFilter = 'all';
  let searchTerm = '';
  let panelProduct = null;
  let panelHistory = null;
  let panelMode = 'overview';

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
    if (c) c.innerHTML = `<div class="aa-loading">Loading inventory…</div>`;
  }

  function renderError(message) {
    const c = getContainer();
    if (!c) return;
    c.innerHTML = `<div class="aa-error"><strong>Could not load inventory.</strong><span>${escapeHtml(message)}</span><button type="button" class="aa-btn aa-btn-secondary" id="invRetry">Try again</button></div>`;
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

  function getFilteredList() {
    return products.filter(p => matchesFilter(p) && matchesSearch(p));
  }

  function renderKpis(kpis) {
    return `
      <div class="aa-kpis">
        <div class="aa-kpi"><div class="aa-kpi-icon">${ICONS.box}</div><div><div class="aa-kpi-num">${kpis.activeCount}</div><div class="aa-kpi-label">Active SKUs</div></div></div>
        <div class="aa-kpi${kpis.lowCount ? ' warn' : ''}"><div class="aa-kpi-icon">${ICONS.alert}</div><div><div class="aa-kpi-num">${kpis.lowCount}</div><div class="aa-kpi-label">Low stock</div></div></div>
        <div class="aa-kpi${kpis.outCount ? ' danger' : ''}"><div class="aa-kpi-icon">${ICONS.x}</div><div><div class="aa-kpi-num">${kpis.outCount}</div><div class="aa-kpi-label">Out of stock</div></div></div>
        <div class="aa-kpi"><div class="aa-kpi-icon">${ICONS.rands}</div><div><div class="aa-kpi-num">${fmtCurrency(kpis.reorderCost)}</div><div class="aa-kpi-label">Reorder cost due</div></div></div>
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
      <div class="aa-toolbar">
        <div class="aa-toolbar-left">
          <h2>Inventory</h2>
          <p>Live stock levels, reorder thresholds and movement history.</p>
        </div>
        <div class="aa-toolbar-right">
          <div class="aa-chips">${chips.map(c => `<button type="button" class="aa-chip${activeFilter === c.key ? ' active' : ''}" data-inv-filter="${c.key}">${c.label}</button>`).join('')}</div>
          <input type="text" class="aa-search" id="invSearch" placeholder="Search products or SKU…" value="${escapeHtml(searchTerm)}" />
          <button type="button" class="aa-btn aa-btn-secondary" id="invRefresh">Refresh</button>
        </div>
      </div>`;
  }

  function renderRow(p) {
    const meta = STATUS_META[p.computed_status] || STATUS_META.in_stock;
    const pct = gaugePercent(p);
    const gaugeClass = meta.row === 'out' ? 'danger' : meta.row === 'low' ? 'warn' : '';
    return `
      <div class="aa-row status-${meta.row}" data-inv-row="${p.id}">
        <div class="aa-row-icon">${ICONS.box}</div>
        <div class="aa-row-main">
          <div class="aa-row-title-line">
            <span class="aa-row-title">${escapeHtml(p.name || 'Unnamed product')}</span>
            <span class="aa-pill ${meta.pill}">${meta.label}</span>
          </div>
          <div class="aa-row-sub">${escapeHtml(p.sku || 'No SKU')} · ${fmtCurrency(p.price)}</div>
          <div class="aa-gauge"><div class="aa-gauge-fill ${gaugeClass}" style="width:${pct}%"></div></div>
        </div>
        <div class="aa-row-stat">
          <div class="aa-row-stat-num">${fmtNum(p.stock_on_hand)}</div>
          <div class="aa-row-stat-label">on hand</div>
        </div>
        <div class="aa-actions">
          <button type="button" class="aa-iconbtn" data-inv-action="history" data-id="${p.id}" title="History">${ICONS.history}</button>
          <button type="button" class="aa-iconbtn" data-inv-action="stock" data-id="${p.id}" title="Adjust stock">${ICONS.truck}</button>
        </div>
      </div>`;
  }

  function renderList() {
    const list = getFilteredList();
    if (!list.length) {
      return `<div class="aa-empty">${ICONS.inbox}<div>No products match this view.</div></div>`;
    }
    return `<div class="aa-list">${list.map(renderRow).join('')}</div>`;
  }

  function render() {
    const c = getContainer();
    if (!c) return;
    const kpis = computeKpis(products);
    c.innerHTML = `${renderKpis(kpis)}${renderToolbar()}${renderList()}`;
    attachListeners(c);
    if (panelProduct) renderPanel();
  }

  function attachListeners(container) {
    container.querySelectorAll('[data-inv-filter]').forEach(btn => {
      btn.addEventListener('click', () => { activeFilter = btn.dataset.invFilter; render(); });
    });
    const search = document.getElementById('invSearch');
    if (search) {
      search.addEventListener('input', () => { searchTerm = search.value; render(); search.focus(); search.setSelectionRange(search.value.length, search.value.length); });
    }
    const refreshBtn = document.getElementById('invRefresh');
    if (refreshBtn) refreshBtn.addEventListener('click', refresh);

    container.querySelectorAll('[data-inv-row]').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-inv-action]')) return;
        openPanel(row.dataset.invRow, 'overview');
      });
    });
    container.querySelectorAll('[data-inv-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openPanel(btn.dataset.id, btn.dataset.invAction === 'history' ? 'history' : 'stock');
      });
    });
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
    const existing = document.getElementById('invPanelOverlay');
    if (existing) existing.remove();
  }

  function renderPanel() {
    let overlay = document.getElementById('invPanelOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'invPanelOverlay';
      overlay.className = 'aa-overlay';
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closePanel(); });
      document.body.appendChild(overlay);
    }
    if (!panelProduct) { overlay.remove(); return; }
    const p = panelProduct;
    const meta = STATUS_META[p.computed_status] || STATUS_META.in_stock;

    overlay.innerHTML = `
      <div class="aa-panel">
        <div class="aa-panel-header">
          <div>
            <h3>${escapeHtml(p.name || 'Product')}</h3>
            <p>${escapeHtml(p.sku || 'No SKU')} · <span class="aa-pill ${meta.pill}">${meta.label}</span></p>
          </div>
          <button type="button" class="aa-panel-close" id="invPanelClose">${ICONS.x}</button>
        </div>
        <div class="aa-panel-body" id="invPanelBody">
          ${panelMode === 'history' ? renderHistorySection(p) : renderOverviewSection(p)}
        </div>
      </div>`;

    document.getElementById('invPanelClose').addEventListener('click', closePanel);
    attachPanelListeners();
  }

  function renderOverviewSection(p) {
    const pct = gaugePercent(p);
    return `
      <div class="aa-section">
        <div class="aa-section-title">Current stock</div>
        <div class="aa-bignum-row"><span class="aa-bignum">${fmtNum(p.stock_on_hand)}</span><span class="aa-bignum-unit">units on hand</span></div>
        <div class="aa-gauge" style="width:100%"><div class="aa-gauge-fill ${pct < 100 ? (p.computed_status === 'out_of_stock' ? 'danger' : 'warn') : ''}" style="width:${pct}%"></div></div>
      </div>
      <div class="aa-section">
        <div class="aa-section-title">Quick actions</div>
        <div class="aa-actionrow">
          <button type="button" class="aa-actionbtn" data-inv-quick="receive">Receive stock</button>
          <button type="button" class="aa-actionbtn" data-inv-quick="adjust">Adjust stock</button>
          ${Number(p.stock_on_hand) === 0 ? '<button type="button" class="aa-actionbtn full" data-inv-quick="initial">Set initial stock</button>' : ''}
        </div>
        <div id="invQuickForm"></div>
      </div>
      <div class="aa-section">
        <div class="aa-section-title">Reorder settings</div>
        <div class="aa-field-row">
          <div class="aa-field"><label>Reorder level</label><input type="number" id="invReorderLevel" min="0" step="1" value="${p.reorder_level ?? 0}" /></div>
          <div class="aa-field"><label>Reorder quantity</label><input type="number" id="invReorderQty" min="0" step="1" value="${p.reorder_quantity ?? 0}" /></div>
        </div>
        <button type="button" class="aa-btn aa-btn-primary" id="invSaveSettings">Save reorder settings</button>
      </div>
      <div class="aa-section">
        <button type="button" class="aa-btn aa-btn-secondary" id="invViewHistory" style="width:100%">View movement history</button>
      </div>`;
  }

  function renderHistorySection() {
    if (!panelHistory) return `<div class="aa-loading">Loading history…</div>`;
    if (!panelHistory.length) return `<div class="aa-empty">${ICONS.inbox}<div>No stock movements recorded yet.</div></div>`;
    const items = panelHistory.map(m => {
      const qty = Number(m.quantity || 0);
      const sign = qty > 0 ? '+' : '';
      return `
        <div class="aa-tl-item">
          <div class="aa-tl-icon">${qty > 0 ? '↑' : '↓'}</div>
          <div class="aa-tl-main">
            <div class="aa-tl-top"><span class="aa-tl-type">${escapeHtml(String(m.movement_type || '').replace(/_/g, ' '))}</span><span class="aa-tl-qty ${qty > 0 ? 'pos' : 'neg'}">${sign}${fmtNum(qty)}</span></div>
            <div class="aa-tl-meta">${new Date(m.created_at).toLocaleString('en-ZA')} · ${fmtNum(m.stock_before)} → ${fmtNum(m.stock_after)}</div>
            ${m.note ? `<div class="aa-tl-note">${escapeHtml(m.note)}</div>` : ''}
          </div>
        </div>`;
    }).join('');
    return `<div class="aa-section"><button type="button" class="aa-btn aa-btn-secondary" id="invBackToOverview">← Back to overview</button></div><div class="aa-timeline">${items}</div>`;
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
    const backBtn = document.getElementById('invBackToOverview');
    if (backBtn) backBtn.addEventListener('click', () => { panelMode = 'overview'; renderPanel(); });

    const historyBtn = document.getElementById('invViewHistory');
    if (historyBtn) historyBtn.addEventListener('click', () => { panelMode = 'history'; renderPanel(); loadHistory(panelProduct.id); });

    const saveBtn = document.getElementById('invSaveSettings');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const reorder_level = Number(document.getElementById('invReorderLevel').value || 0);
        const reorder_quantity = Number(document.getElementById('invReorderQty').value || 0);
        try {
          saveBtn.disabled = true;
          const result = await request('update_settings', { product_id: panelProduct.id, reorder_level, reorder_quantity });
          applyProductUpdate(result.product);
          showMessage('Reorder settings saved');
          renderPanel();
          render();
        } catch (error) {
          showMessage(error.message || 'Failed to save settings', true);
        } finally {
          saveBtn.disabled = false;
        }
      });
    }

    document.querySelectorAll('[data-inv-quick]').forEach(btn => {
      btn.addEventListener('click', () => renderQuickForm(btn.dataset.invQuick));
    });
  }

  function renderQuickForm(kind) {
    const holder = document.getElementById('invQuickForm');
    if (!holder) return;
    const isAdjust = kind === 'adjust';
    holder.innerHTML = `
      <div class="aa-inline-form">
        ${isAdjust ? `
          <div class="aa-field"><label>Direction</label>
            <select id="invQtyDirection"><option value="increase">Increase stock</option><option value="decrease">Decrease stock</option></select>
          </div>` : ''}
        <div class="aa-field"><label>Quantity</label>
          <div class="aa-stepper">
            <button type="button" id="invQtyMinus">−</button>
            <input type="number" id="invQtyInput" min="1" step="1" value="1" />
            <button type="button" id="invQtyPlus">+</button>
          </div>
        </div>
        <div class="aa-field"><label>Note (required)</label><input type="text" id="invQtyNote" placeholder="e.g. Supplier delivery, stocktake correction" /></div>
        <button type="button" class="aa-btn aa-btn-primary" id="invQtySubmit" style="width:100%">Confirm</button>
      </div>`;

    document.getElementById('invQtyMinus').addEventListener('click', () => {
      const input = document.getElementById('invQtyInput');
      input.value = Math.max(1, Number(input.value || 1) - 1);
    });
    document.getElementById('invQtyPlus').addEventListener('click', () => {
      const input = document.getElementById('invQtyInput');
      input.value = Number(input.value || 1) + 1;
    });
    document.getElementById('invQtySubmit').addEventListener('click', async () => {
      const quantity = Number(document.getElementById('invQtyInput').value);
      const note = document.getElementById('invQtyNote').value.trim();
      if (!quantity || quantity <= 0) { showMessage('Quantity must be greater than zero', true); return; }
      if (!note) { showMessage('A note is required', true); return; }
      const action = kind === 'receive' ? 'receive_stock' : kind === 'initial' ? 'initial_stock' : 'adjust_stock';
      const payload = { product_id: panelProduct.id, quantity, note };
      if (kind === 'adjust') payload.direction = document.getElementById('invQtyDirection').value;
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
