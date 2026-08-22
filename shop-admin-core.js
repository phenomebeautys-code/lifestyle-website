/* shop-admin-core.js */
export const EDGE_URL       = 'https://papdxjcfimeyjgzmatpl.supabase.co/functions/v1/shop-admin';
export const SUPA_URL       = 'https://papdxjcfimeyjgzmatpl.supabase.co';
export const SUPA_ANON      = 'sb_publishable_XXgqS4qa4-CJJQ7MYxt4Lw_sPbcmGPL';
export const PRODUCTS_TABLE = 'products';

export const state = {
  allOrders: [],
  allProducts: [],
  activeFilter: 'all',
  adminToken: '',
  pollTimer: null,
  editingVariants: [],
  editingSizes: [],
  isReorderMode: false,
};

export const hooks = {};

export const BADGE_MAP = {
  pending: 'badge-unpaid',
  processing: 'badge-processing',
  dispatched: 'badge-dispatched',
  delivered: 'badge-delivered',
};

export const STATUS_LABELS = {
  pending: 'Payment Pending',
  processing: 'Processing',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
};

export const PAGE_TITLES = {
  hub: 'Hub',
  orders: 'Orders',
  products: 'Products',
  'stock-management': 'Stock Management',
  reports: 'Reports',
};

export const SVG = {
  locker: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;flex-shrink:0" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/><line x1="12" y1="12" x2="12" y2="16"/><circle cx="12" cy="12" r="1"/></svg>`,
  door: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;flex-shrink:0" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  gift: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;flex-shrink:0" aria-hidden="true"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>`,
  check: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;flex-shrink:0" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`,
  star: `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="display:inline-block;vertical-align:-2px;flex-shrink:0" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
};

export function callEdge(body) {
  return fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

export function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

export function showToast(msg, isError = false) {
  const t = document.getElementById('adminToast');
  t.textContent = msg;
  t.className = 'admin-toast show' + (isError ? ' error' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2800);
}

export function normaliseSizes(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(s => ({ name: (s.name || '').trim(), price: Number(s.price) || 0 })).filter(s => s.name);
}
