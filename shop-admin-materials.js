/* ─── SHOP ADMIN: MATERIALS, RECIPES & CONVERSIONS (app-style redesign) ─── */
/*
 * Redesigned per Laws of UX: category chips + search, list rows with stock
 * gauges (Von Restorff/Goal-Gradient), slide-over panel for material edits
 * and stock actions (Hick's Law), a card-based recipe builder with a sticky
 * cost total (Goal-Gradient), and flow-diagram cards for repack conversions
 * (Jakob's Law — visual bulk→retail metaphor over raw table rows).
 * Same public API (window.ShopAdminMaterials.init/refresh/render), same
 * container (#materialsContent), same materials-management Edge Function
 * contract — purely a rendering-layer rewrite.
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
  const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/materials-management`;
  const UNIT_OPTIONS = ['g', 'ml', 'drops', 'unit', 'cm'];
  const CATEGORY_META = {
    ingredient: { label: 'Ingredient', chip: 'ingredient' },
    packaging: { label: 'Packaging', chip: 'packaging' },
    kit_component: { label: 'Kit component', chip: 'kit_component' },
  };

  const ICONS = {
    flask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6"/><path d="M10 3v6.5L5.5 17a2 2 0 0 0 1.7 3h9.6a2 2 0 0 0 1.7-3L14 9.5V3"/></svg>',
    box2: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>',
    truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
    inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
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
  function renderLoading() { const c = getContainer(); if (c) c.innerHTML = `<div class="aa-loading">Loading…</div>`; }
  function renderError(message) {
    const c = getContainer();
    if (!c) return;
    c.innerHTML = `<div class="aa-error"><strong>Could not load Materials &amp; Recipes.</strong><span>${escapeHtml(message)}</span><button type="button" class="aa-btn aa-btn-secondary" id="matRetry">Try again</button></div>`;
    document.getElementById('matRetry')?.addEventListener('click', refresh);
  }

  function tabsMarkup() {
    const tabs = [
      { key: 'materials', label: 'Raw Materials' },
      { key: 'recipes', label: 'Recipes (BOM)' },
      { key: 'conversions', label: 'Repack Conversions' },
    ];
    return `<div class="aa-chips" style="margin-bottom:18px">${tabs.map(t => `<button type="button" class="aa-chip${activeTab === t.key ? ' active' : ''}" data-mat-tab="${t.key}">${t.label}</button>`).join('')}</div>`;
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
    if (m.active === false) return { label: 'Inactive', pill: 'muted', row: 'muted' };
    if (stock <= 0) return { label: 'Out of stock', pill: 'danger', row: 'out' };
    if (level > 0 && stock <= level) return { label: 'Low stock', pill: 'warn', row: 'low' };
    return { label: 'In stock', pill: 'ok', row: 'ok' };
  }
  function computeMatKpis() {
    const active = materials.filter(m => m.active !== false);
    const low = materials.filter(m => materialStatus(m).row === 'low');
    const out = materials.filter(m => materialStatus(m).row === 'out');
    const standalone = materials.filter(m => m.sellable_standalone);
    return { activeCount: active.length, lowCount: low.length, outCount: out.length, standaloneCount: standalone.length };
  }

  function renderMatKpis() {
    const k = computeMatKpis();
    return `
      <div class="aa-kpis">
        <div class="aa-kpi"><div class="aa-kpi-icon">${ICONS.flask}</div><div><div class="aa-kpi-num">${k.activeCount}</div><div class="aa-kpi-label">Active materials</div></div></div>
        <div class="aa-kpi${k.lowCount ? ' warn' : ''}"><div class="aa-kpi-icon">${ICONS.alert}</div><div><div class="aa-kpi-num">${k.lowCount}</div><div class="aa-kpi-label">Low stock</div></div></div>
        <div class="aa-kpi${k.outCount ? ' danger' : ''}"><div class="aa-kpi-icon">${ICONS.x}</div><div><div class="aa-kpi-num">${k.outCount}</div><div class="aa-kpi-label">Out of stock</div></div></div>
        <div class="aa-kpi"><div class="aa-kpi-icon">${ICONS.box2}</div><div><div class="aa-kpi-num">${k.standaloneCount}</div><div class="aa-kpi-label">Sellable standalone</div></div></div>
      </div>`;
  }

  function matchesCategory(m) { return categoryFilter === 'all' || m.category === categoryFilter; }
  function matchesMatSearch(m) {
    if (!searchTerm) return true;
    return (m.name || '').toLowerCase().includes(searchTerm.toLowerCase());
  }
  function getFilteredMaterials() { return materials.filter(m => matchesCategory(m) && matchesMatSearch(m)); }

  function renderMatToolbar() {
    const chips = [{ key: 'all', label: 'All' }, ...Object.entries(CATEGORY_META).map(([k, v]) => ({ key: k, label: v.label }))];
    return `
      <div class="aa-toolbar">
        <div class="aa-toolbar-left"><h2>Raw Materials</h2><p>Ingredients, packaging and kit-only components.</p></div>
        <div class="aa-toolbar-right">
          <div class="aa-chips">${chips.map(c => `<button type="button" class="aa-chip${categoryFilter === c.key ? ' active' : ''}" data-mat-category="${c.key}">${c.label}</button>`).join('')}</div>
          <input type="text" class="aa-search" id="matSearch" placeholder="Search materials…" value="${escapeHtml(searchTerm)}" />
          <button type="button" class="aa-btn aa-btn-primary" id="matAddNew">${ICONS.plus} New material</button>
        </div>
      </div>`;
  }

  function renderMatRow(m) {
    const status = materialStatus(m);
    const pct = gaugePercent(m);
    const gaugeClass = status.row === 'out' ? 'danger' : status.row === 'low' ? 'warn' : '';
    const catLabel = CATEGORY_META[m.category]?.label || m.category;
    return `
      <div class="aa-row status-${status.row}" data-mat-row="${m.id}">
        <div class="aa-row-icon">${ICONS.flask}</div>
        <div class="aa-row-main">
          <div class="aa-row-title-line">
            <span class="aa-row-title">${escapeHtml(m.name || 'Unnamed material')}</span>
            <span class="aa-pill ${status.pill}">${status.label}</span>
            ${!m.sellable_standalone ? '<span class="aa-pill muted">Kit only</span>' : ''}
          </div>
          <div class="aa-row-sub">${escapeHtml(catLabel)} · ${fmtCurrency(m.cost_per_unit)}/${escapeHtml(m.unit)}</div>
          <div class="aa-gauge"><div class="aa-gauge-fill ${gaugeClass}" style="width:${pct}%"></div></div>
        </div>
        <div class="aa-row-stat">
          <div class="aa-row-stat-num">${fmtNum(m.stock_on_hand)}</div>
          <div class="aa-row-stat-label">${escapeHtml(m.unit)}</div>
        </div>
        <div class="aa-actions">
          <button type="button" class="aa-iconbtn" data-mat-action="history" data-id="${m.id}" title="History">${ICONS.history}</button>
          <button type="button" class="aa-iconbtn" data-mat-action="stock" data-id="${m.id}" title="Adjust stock">${ICONS.truck}</button>
        </div>
      </div>`;
  }

  function renderMaterialsTab() {
    const list = getFilteredMaterials();
    const body = !list.length
      ? `<div class="aa-empty">${ICONS.inbox}<div>No materials match this view.</div></div>`
      : `<div class="aa-list">${list.map(renderMatRow).join('')}</div>`;
    return `${renderMatKpis()}${renderMatToolbar()}${body}`;
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

  /* ─── MATERIAL DETAIL / EDIT PANEL ─── */

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
      overlay.className = 'aa-overlay';
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeMaterialPanel(); });
      document.body.appendChild(overlay);
    }
    if (!panelMaterial) { overlay.remove(); return; }
    const m = panelMaterial;
    const status = isNewMaterial ? null : materialStatus(m);

    overlay.innerHTML = `
      <div class="aa-panel">
        <div class="aa-panel-header">
          <div>
            <h3>${isNewMaterial ? 'New material' : escapeHtml(m.name || 'Material')}</h3>
            ${status ? `<p><span class="aa-pill ${status.pill}">${status.label}</span></p>` : ''}
          </div>
          <button type="button" class="aa-panel-close" id="matPanelClose">${ICONS.x}</button>
        </div>
        <div class="aa-panel-body" id="matPanelBody">
          ${panelMode === 'history' ? renderMatHistorySection() : renderMatOverviewSection()}
        </div>
      </div>`;
    document.getElementById('matPanelClose').addEventListener('click', closeMaterialPanel);
    attachMaterialPanelListeners();
  }

  function renderMatOverviewSection() {
    const m = panelMaterial;
    const pct = isNewMaterial ? 0 : gaugePercent(m);
    return `
      ${!isNewMaterial ? `
      <div class="aa-section">
        <div class="aa-section-title">Current stock</div>
        <div class="aa-bignum-row"><span class="aa-bignum">${fmtNum(m.stock_on_hand)}</span><span class="aa-bignum-unit">${escapeHtml(m.unit)} on hand</span></div>
        <div class="aa-gauge" style="width:100%"><div class="aa-gauge-fill ${pct < 100 ? 'warn' : ''}" style="width:${pct}%"></div></div>
      </div>
      <div class="aa-section">
        <div class="aa-section-title">Quick actions</div>
        <div class="aa-actionrow">
          <button type="button" class="aa-actionbtn" data-mat-quick="receive_stock">Receive stock</button>
          <button type="button" class="aa-actionbtn" data-mat-quick="adjust_stock">Adjust stock</button>
          ${Number(m.stock_on_hand) === 0 ? '<button type="button" class="aa-actionbtn full" data-mat-quick="initial_stock">Set initial stock</button>' : ''}
        </div>
        <div id="matQuickForm"></div>
      </div>` : ''}
      <div class="aa-section">
        <div class="aa-section-title">Details</div>
        <div class="aa-field"><label>Name</label><input type="text" id="mfName" value="${escapeHtml(m.name || '')}" placeholder="e.g. Sugar" /></div>
        <div class="aa-field-row">
          <div class="aa-field"><label>Category</label>
            <select id="mfCategory">${Object.entries(CATEGORY_META).map(([k, v]) => `<option value="${k}"${m.category === k ? ' selected' : ''}>${v.label}</option>`).join('')}</select>
          </div>
          <div class="aa-field"><label>Unit</label>
            <select id="mfUnit">${UNIT_OPTIONS.map(u => `<option value="${u}"${m.unit === u ? ' selected' : ''}>${u}</option>`).join('')}</select>
          </div>
        </div>
        <div class="aa-field-row">
          <div class="aa-field"><label>Bulk quantity</label><input type="number" id="mfBulkQty" min="0.0001" step="0.0001" value="${m.bulk_quantity ?? ''}" /></div>
          <div class="aa-field"><label>Bulk cost</label><input type="number" id="mfBulkCost" min="0" step="0.01" value="${m.bulk_cost ?? ''}" /></div>
        </div>
        <div class="aa-field-row">
          <div class="aa-field"><label>Reorder level</label><input type="number" id="mfReorderLevel" min="0" step="0.01" value="${m.reorder_level ?? 0}" /></div>
          <div class="aa-field"><label>Reorder quantity</label><input type="number" id="mfReorderQty" min="0" step="0.01" value="${m.reorder_quantity ?? 0}" /></div>
        </div>
        <div class="aa-field" style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="mfStandalone" ${m.sellable_standalone ? 'checked' : ''} style="width:16px;height:16px" />
          <label style="margin:0" for="mfStandalone">Sellable as a standalone product</label>
        </div>
        <div class="aa-field" style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="mfActive" ${m.active !== false ? 'checked' : ''} style="width:16px;height:16px" />
          <label style="margin:0" for="mfActive">Active</label>
        </div>
      </div>
      <div class="aa-section" style="display:flex;gap:10px;flex-wrap:wrap">
        <button type="button" class="aa-btn aa-btn-primary" id="matSave">${isNewMaterial ? 'Add material' : 'Save changes'}</button>
        ${!isNewMaterial ? `
          <button type="button" class="aa-btn aa-btn-secondary" id="matViewHistory">View history</button>
          <button type="button" class="aa-btn aa-btn-danger" id="matDelete">Delete</button>` : ''}
      </div>`;
  }

  function renderMatHistorySection() {
    if (!panelHistory) return `<div class="aa-loading">Loading history…</div>`;
    if (!panelHistory.length) return `<div class="aa-section"><button type="button" class="aa-btn aa-btn-secondary" id="matBackToOverview">← Back</button></div><div class="aa-empty">${ICONS.inbox}<div>No movements recorded yet.</div></div>`;
    const items = panelHistory.map(mv => {
      const qty = Number(mv.quantity || 0);
      const sign = qty > 0 ? '+' : '';
      return `
        <div class="aa-tl-item">
          <div class="aa-tl-icon">${qty > 0 ? '↑' : '↓'}</div>
          <div class="aa-tl-main">
            <div class="aa-tl-top"><span class="aa-tl-type">${escapeHtml(String(mv.movement_type || '').replace(/_/g, ' '))}</span><span class="aa-tl-qty ${qty > 0 ? 'pos' : 'neg'}">${sign}${fmtNum(qty)}</span></div>
            <div class="aa-tl-meta">${new Date(mv.created_at).toLocaleString('en-ZA')} · ${fmtNum(mv.stock_before)} → ${fmtNum(mv.stock_after)}</div>
            ${mv.note ? `<div class="aa-tl-note">${escapeHtml(mv.note)}</div>` : ''}
          </div>
        </div>`;
    }).join('');
    return `<div class="aa-section"><button type="button" class="aa-btn aa-btn-secondary" id="matBackToOverview">← Back to overview</button></div><div class="aa-timeline">${items}</div>`;
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
      <div class="aa-inline-form">
        ${isAdjust ? `<div class="aa-field"><label>Direction</label><select id="matQtyDirection"><option value="increase">Increase stock</option><option value="decrease">Decrease stock</option></select></div>` : ''}
        <div class="aa-field"><label>Quantity (${escapeHtml(panelMaterial.unit)})</label>
          <div class="aa-stepper">
            <button type="button" id="matQtyMinus">−</button>
            <input type="number" id="matQtyInput" min="0.0001" step="0.0001" value="1" />
            <button type="button" id="matQtyPlus">+</button>
          </div>
        </div>
        <div class="aa-field"><label>Note (required)</label><input type="text" id="matQtyNote" placeholder="e.g. Supplier delivery" /></div>
        <button type="button" class="aa-btn aa-btn-primary" id="matQtySubmit" style="width:100%">Confirm</button>
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
        <div class="aa-toolbar"><div class="aa-toolbar-left"><h2>Recipes (Bill of Materials)</h2><p>Pick a product to build or edit its ingredient list.</p></div></div>
        <div class="aa-field" style="max-width:420px"><label>Product</label><select id="recipeProductSelect"><option value="">Select a product…</option>${productOptions}</select></div>
        <div class="aa-empty">${ICONS.layers}<div>Select a product above to view or edit its recipe.</div></div>`;
    }
    const lineRows = recipeLines.map((line, index) => {
      const material = materials.find(m => m.id === line.material_id);
      const lineCost = material ? Number(line.quantity_required || 0) * Number(material.cost_per_unit || 0) : 0;
      const materialOptions = materials.map(m => `<option value="${m.id}"${m.id === line.material_id ? ' selected' : ''}>${escapeHtml(m.name)} (${escapeHtml(m.unit)})</option>`).join('');
      return `
        <div class="aa-ingredient-row" data-recipe-line="${index}">
          <select data-recipe-field="material_id"><option value="">Select material…</option>${materialOptions}</select>
          <input type="number" min="0.0001" step="0.0001" data-recipe-field="quantity_required" value="${line.quantity_required ?? ''}" placeholder="Qty" />
          <span class="aa-costlabel" style="min-width:70px;text-align:right">${fmtCurrency(lineCost)}</span>
          <button type="button" class="aa-iconbtn danger" data-recipe-remove="${index}">${ICONS.x}</button>
        </div>`;
    }).join('');
    return `
      <div class="aa-toolbar">
        <div class="aa-toolbar-left"><h2>Recipes (Bill of Materials)</h2><p>Editing the recipe for the selected product.</p></div>
        <div class="aa-toolbar-right"><select id="recipeProductSelect" class="aa-search">${productOptions}</select></div>
      </div>
      <div class="aa-recipebuilder">${lineRows || `<div class="aa-empty">${ICONS.inbox}<div>No ingredients added yet.</div></div>`}</div>
      <div class="aa-section" style="margin-top:14px">
        <button type="button" class="aa-btn aa-btn-secondary" id="addRecipeLine">${ICONS.plus} Add ingredient</button>
      </div>
      <div class="aa-sticky-footer">
        <div><div class="aa-costlabel">Computed cost per unit</div><div class="aa-costval">${fmtCurrency(recipeComputedCost)}</div></div>
        <button type="button" class="aa-btn aa-btn-primary" id="saveRecipe">Save Recipe</button>
      </div>`;
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
        const el = document.querySelector('.aa-costval');
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
      <div class="aa-flowcard">
        <div class="aa-flow">
          <div class="aa-flow-box"><div class="aa-flow-box-label">Consumes</div><div class="aa-flow-box-name">${fmtNum(c.source_quantity)} ${escapeHtml(c.source?.unit || '')} · ${escapeHtml(c.source?.name || '')}</div></div>
          <div class="aa-flow-arrow">${ICONS.arrow}</div>
          <div class="aa-flow-box"><div class="aa-flow-box-label">Produces</div><div class="aa-flow-box-name">${fmtNum(c.output_quantity)} ${escapeHtml(c.output?.unit || '')} · ${escapeHtml(c.output?.name || '')}</div></div>
        </div>
        ${c.note ? `<div class="aa-costlabel">${escapeHtml(c.note)}</div>` : ''}
        <div class="aa-flow-footer">
          <div style="display:flex;gap:8px;align-items:center;flex:1;min-width:220px">
            <input type="number" min="1" value="1" class="aa-search" style="width:70px" data-conversion-batches="${c.id}" />
            <input type="text" placeholder="Note (required)" class="aa-search" style="flex:1" data-conversion-note="${c.id}" />
          </div>
          <div style="display:flex;gap:8px">
            <button type="button" class="aa-btn aa-btn-primary" data-conversion-run="${c.id}">Run batch</button>
            <button type="button" class="aa-iconbtn danger" data-conversion-delete="${c.id}">${ICONS.x}</button>
          </div>
        </div>
      </div>`;
  }

  function renderConversionsTab() {
    const cards = conversions.map(renderConversionCard).join('');
    const materialOptions = materials.map(m => `<option value="${m.id}">${escapeHtml(m.name)} (${escapeHtml(m.unit)})</option>`).join('');
    return `
      <div class="aa-toolbar">
        <div class="aa-toolbar-left"><h2>Repack Conversions</h2><p>Bulk-to-retail repack rules, e.g. 1 kg drum → 2 × 500 g bags.</p></div>
        <div class="aa-toolbar-right"><button type="button" class="aa-btn aa-btn-primary" id="convToggleForm">${ICONS.plus} New repack rule</button></div>
      </div>
      ${cards ? `<div class="aa-list" style="gap:14px">${cards}</div>` : `<div class="aa-empty">${ICONS.inbox}<div>No repack rules yet.</div></div>`}
      ${showConversionForm ? `
        <div class="aa-inline-form" style="margin-top:16px;max-width:520px">
          <div class="aa-section-title">New repack rule</div>
          <div class="aa-field"><label>Source material (bulk)</label><select id="convSource"><option value="">Select…</option>${materialOptions}</select></div>
          <div class="aa-field"><label>Source quantity consumed per batch</label><input type="number" id="convSourceQty" min="0.0001" step="0.0001" /></div>
          <div class="aa-field"><label>Output material (retail)</label><select id="convOutput"><option value="">Select…</option>${materialOptions}</select></div>
          <div class="aa-field"><label>Output quantity produced per batch</label><input type="number" id="convOutputQty" min="0.0001" step="0.0001" /></div>
          <div class="aa-field"><label>Yield loss %</label><input type="number" id="convYieldLoss" min="0" max="99" step="0.1" value="0" /></div>
          <div class="aa-field"><label>Note</label><input type="text" id="convNote" placeholder="e.g. 1kg drum repacked into 500g bags" /></div>
          <button type="button" class="aa-btn aa-btn-primary" id="convSave" style="width:100%">Add repack rule</button>
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
