/* shop-admin-dashboard.js */
import { state, hooks, PAGE_TITLES, callEdge, setText, SVG, showToast } from './shop-admin-core.js';

/* ─── AUTO-REFRESH POLLING ────────────────────── */
export function startPolling() {
  stopPolling();
  state.pollTimer = setInterval(async () => {
    try {
      const res = await callEdge({ action: 'get_orders', password: state.adminToken });
      if (!res.ok) return;
      const data = await res.json();
      const newOrders = data.orders || [];
      const newlyPaid = newOrders.filter(o => {
        const prev = state.allOrders.find(x => x.id === o.id);
        return o.payment_status === 'paid' && prev && prev.payment_status !== 'paid';
      });
      state.allOrders = newOrders;
      updateStats(); renderRecent(); hooks.renderTable?.(); hooks.renderCards?.(); updateReports(); updateOrdersBadge();
      if (newlyPaid.length) {
        showToast(`${newlyPaid.length} new payment${newlyPaid.length > 1 ? 's' : ''} received`);
      }
    } catch { /* silent fail */ }
  }, 30000);
}
export function stopPolling() {
  if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
}

/* ─── NAVIGATION ──────────────────────────────── */
export function navTo(page, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  if (btn) btn.classList.add('active');
  document.getElementById('topbarTitle').textContent = PAGE_TITLES[page] || page;

  if (page === 'products') {
    hooks.loadProducts?.();
  }

  if (page === 'stock-management') {
    hooks.loadStockManagement?.();
  }
}

/* ─── REFRESH ──────────────────────────────────── */
async export async function refreshData() {
  const btn = document.getElementById('refreshBtn');
  btn.disabled = true;
  try {
    const res = await callEdge({ action: 'get_orders', password: state.adminToken });
    if (res.status === 429) { showToast('Rate limited. Wait 60 seconds.', true); return; }
    if (!res.ok)            { showToast('Failed to refresh.', true); return; }
    const data = await res.json();
    state.allOrders = data.orders || [];
    updateStats(); renderRecent(); hooks.renderTable?.(); hooks.renderCards?.(); updateReports(); updateOrdersBadge();
    showToast('Refreshed');
  } catch { showToast('Network error.', true); }
  finally { btn.disabled = false; }
}

/* ─── STATS ────────────────────────────────────── */
export function updateStats() {
  const paid       = state.allOrders.filter(o => o.payment_status === 'paid');
  const unpaid     = state.allOrders.filter(o => o.payment_status !== 'paid');
  const dispatched = state.allOrders.filter(o => o.status === 'dispatched');
  const delivered  = state.allOrders.filter(o => o.status === 'delivered');
  const rev = paid.reduce((s, o) => s + Number(o.total_amount), 0);
  const avg = paid.length ? Math.round(rev / paid.length) : 0;
  const pct = state.allOrders.length ? Math.round((paid.length / state.allOrders.length) * 100) : 0;
  setText('statTotal',        state.allOrders.length);
  setText('statPaid',         paid.length);
  setText('statPaidPct',      state.allOrders.length ? pct + '% conversion' : '\u00a0');
  setText('statRevenue',      'R' + rev.toLocaleString('en-ZA'));
  setText('statPending',      unpaid.length);
  setText('payoutRevenue',    'R' + rev.toLocaleString('en-ZA'));
  setText('payoutPaidCount',  paid.length);
  setText('payoutAvg',        'R' + avg.toLocaleString('en-ZA'));
  setText('payoutDispatched', dispatched.length);
  setText('payoutDelivered',  delivered.length);
  setText('payoutUnpaid',     unpaid.length);
}
export function updateOrdersBadge() {
  const unpaid = state.allOrders.filter(o => o.payment_status !== 'paid').length;
  const badge  = document.getElementById('navOrdersBadge');
  badge.textContent = unpaid;
  badge.hidden = unpaid === 0;
}
export function updateReports() {
  const paid  = state.allOrders.filter(o => o.payment_status === 'paid');
  const now   = Date.now();
  const week  = paid.filter(o => now - new Date(o.created_at) < 7  * 864e5);
  const month = paid.filter(o => now - new Date(o.created_at) < 30 * 864e5);
  const wRev  = week.reduce((s, o) => s + Number(o.total_amount), 0);
  const mRev  = month.reduce((s, o) => s + Number(o.total_amount), 0);
  setText('repWeekRev',    'R' + wRev.toLocaleString('en-ZA'));
  setText('repWeekCount',  week.length + ' orders');
  setText('repMonthRev',   'R' + mRev.toLocaleString('en-ZA'));
  setText('repMonthCount', month.length + ' orders');
  const freq = {};
  paid.forEach(o => (o.items || []).forEach(i => { freq[i.name] = (freq[i.name] || 0) + i.qty; }));
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
  setText('repTopProduct', top ? top[0] : '\u2014');
  const delivered = paid.filter(o => o.status === 'delivered').length;
  const rate = paid.length ? Math.round((delivered / paid.length) * 100) : 0;
  setText('repDeliveryRate', paid.length ? rate + '%' : '\u2014');
}

/* ─── RECENT SALES ────────────────────────────── */
export function renderRecent() {
  const el   = document.getElementById('recentList');
  const list = [...state.allOrders]
    .filter(o => o.payment_status === 'paid')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 6);
  if (!list.length) { el.innerHTML = '<div class="recent-empty">No paid orders yet.</div>'; return; }
  el.innerHTML = list.map(o => {
    const date     = new Date(o.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
    const items    = Array.isArray(o.items) ? o.items : [];
    const itemStr  = items.map(i => i.qty + '\u00d7 ' + i.name).join(', ');
    const initials = (o.customer_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    return `
      <div class="recent-item" onclick="openOrderDetail('${o.id}')" style="cursor:pointer">
        <div class="ri-avatar">${initials}</div>
        <div class="ri-info">
          <div class="ri-name">${esc(o.customer_name)}</div>
          <div class="ri-meta">${esc(itemStr || 'No items')}</div>
        </div>
        <div class="ri-right">
          <div class="ri-amount">R${Number(o.total_amount).toLocaleString('en-ZA')}</div>
          <div class="ri-date">${date}</div>
        </div>
      </div>`;
  }).join('');
}

/* ─── DELIVERY HELPERS ────────────────────────── */
export function getDeliveryLabel(o) {
  const method = o.delivery_method || 'door';
  const meta   = o.delivery_meta || {};
  if (method === 'locker') {
    return { icon: SVG.locker, label: meta.locker_name || 'Pudo Locker', sub: meta.locker_address || '' };
  }
  return { icon: SVG.door, label: 'Door Delivery', sub: o.delivery_address || '' };
}

