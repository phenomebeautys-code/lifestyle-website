/* shop-admin-dashboard.js */
import {
  state,
  hooks,
  PAGE_TITLES,
  callEdge,
  setText,
  SVG,
  showToast,
  esc,
} from './shop-admin-core.js';

/* ─── AUTO-REFRESH POLLING ────────────────────── */
export function startPolling() {
  stopPolling();

  state.pollTimer = setInterval(async () => {
    try {
      const res = await callEdge({
        action: 'get_orders',
        password: state.adminToken,
      });

      if (!res.ok) return;

      const data = await res.json();
      const newOrders = data.orders || [];

      const newlyPaid = newOrders.filter(order => {
        const previous = state.allOrders.find(item => item.id === order.id);
        return order.payment_status === 'paid'
          && previous
          && previous.payment_status !== 'paid';
      });

      state.allOrders = newOrders;
      updateStats();
      renderRecent();
      hooks.renderTable?.();
      hooks.renderCards?.();
      updateReports();
      updateOrdersBadge();

      if (newlyPaid.length) {
        showToast(
          `${newlyPaid.length} new payment${newlyPaid.length > 1 ? 's' : ''} received`,
        );
      }
    } catch {
      // Keep polling failures silent; the next cycle will retry.
    }
  }, 30000);
}

export function stopPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

/* ─── NAVIGATION ──────────────────────────────── */
export function navTo(page, btn) {
  document.querySelectorAll('.page').forEach(element => {
    element.classList.remove('active');
  });

  document.querySelectorAll('.nav-item').forEach(element => {
    element.classList.remove('active');
  });

  const pageElement = document.getElementById(`page-${page}`);
  if (pageElement) pageElement.classList.add('active');

  if (btn) btn.classList.add('active');

  const title = document.getElementById('topbarTitle');
  if (title) title.textContent = PAGE_TITLES[page] || page;

  if (page === 'products') hooks.loadProducts?.();
  if (page === 'stock-management') hooks.loadStockManagement?.();
}

/* ─── REFRESH ──────────────────────────────────── */
export async function refreshData() {
  const btn = document.getElementById('refreshBtn');
  if (btn) btn.disabled = true;

  try {
    const res = await callEdge({
      action: 'get_orders',
      password: state.adminToken,
    });

    if (res.status === 429) {
      showToast('Rate limited. Wait 60 seconds.', true);
      return;
    }

    if (!res.ok) {
      showToast('Failed to refresh.', true);
      return;
    }

    const data = await res.json();
    state.allOrders = data.orders || [];

    updateStats();
    renderRecent();
    hooks.renderTable?.();
    hooks.renderCards?.();
    updateReports();
    updateOrdersBadge();
    showToast('Refreshed');
  } catch {
    showToast('Network error.', true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ─── STATS ────────────────────────────────────── */
export function updateStats() {
  const paid = state.allOrders.filter(order => order.payment_status === 'paid');
  const unpaid = state.allOrders.filter(order => order.payment_status !== 'paid');
  const dispatched = state.allOrders.filter(order => order.status === 'dispatched');
  const delivered = state.allOrders.filter(order => order.status === 'delivered');

  const revenue = paid.reduce((sum, order) => sum + Number(order.total_amount), 0);
  const average = paid.length ? Math.round(revenue / paid.length) : 0;
  const conversion = state.allOrders.length
    ? Math.round((paid.length / state.allOrders.length) * 100)
    : 0;

  setText('statTotal', state.allOrders.length);
  setText('statPaid', paid.length);
  setText('statPaidPct', state.allOrders.length ? `${conversion}% conversion` : '\u00a0');
  setText('statRevenue', `R${revenue.toLocaleString('en-ZA')}`);
  setText('statPending', unpaid.length);
  setText('payoutRevenue', `R${revenue.toLocaleString('en-ZA')}`);
  setText('payoutPaidCount', paid.length);
  setText('payoutAvg', `R${average.toLocaleString('en-ZA')}`);
  setText('payoutDispatched', dispatched.length);
  setText('payoutDelivered', delivered.length);
  setText('payoutUnpaid', unpaid.length);
}

export function updateOrdersBadge() {
  const badge = document.getElementById('navOrdersBadge');
  if (!badge) return;

  const unpaid = state.allOrders.filter(order => order.payment_status !== 'paid').length;
  badge.textContent = unpaid;
  badge.hidden = unpaid === 0;
}

export function updateReports() {
  const paid = state.allOrders.filter(order => order.payment_status === 'paid');
  const now = Date.now();

  const week = paid.filter(order => now - new Date(order.created_at) < 7 * 864e5);
  const month = paid.filter(order => now - new Date(order.created_at) < 30 * 864e5);

  const weeklyRevenue = week.reduce((sum, order) => sum + Number(order.total_amount), 0);
  const monthlyRevenue = month.reduce((sum, order) => sum + Number(order.total_amount), 0);

  setText('repWeekRev', `R${weeklyRevenue.toLocaleString('en-ZA')}`);
  setText('repWeekCount', `${week.length} orders`);
  setText('repMonthRev', `R${monthlyRevenue.toLocaleString('en-ZA')}`);
  setText('repMonthCount', `${month.length} orders`);

  const frequency = {};
  paid.forEach(order => {
    (order.items || []).forEach(item => {
      frequency[item.name] = (frequency[item.name] || 0) + item.qty;
    });
  });

  const top = Object.entries(frequency).sort((a, b) => b[1] - a[1])[0];
  setText('repTopProduct', top ? top[0] : '\u2014');

  const delivered = paid.filter(order => order.status === 'delivered').length;
  const deliveryRate = paid.length ? Math.round((delivered / paid.length) * 100) : 0;
  setText('repDeliveryRate', paid.length ? `${deliveryRate}%` : '\u2014');
}

/* ─── RECENT SALES ────────────────────────────── */
export function renderRecent() {
  const el = document.getElementById('recentList');
  if (!el) return;

  const list = [...state.allOrders]
    .filter(order => order.payment_status === 'paid')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 6);

  if (!list.length) {
    el.innerHTML = '<div class="recent-empty">No paid orders yet.</div>';
    return;
  }

  el.innerHTML = list.map(order => {
    const date = new Date(order.created_at).toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'short',
    });

    const items = Array.isArray(order.items) ? order.items : [];
    const itemText = items.map(item => `${item.qty}\u00d7 ${item.name}`).join(', ');
    const initials = (order.customer_name || '?')
      .split(' ')
      .map(word => word[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    return `
      <div class="recent-item" onclick="openOrderDetail('${order.id}')" style="cursor:pointer">
        <div class="ri-avatar">${initials}</div>
        <div class="ri-info">
          <div class="ri-name">${esc(order.customer_name)}</div>
          <div class="ri-meta">${esc(itemText || 'No items')}</div>
        </div>
        <div class="ri-right">
          <div class="ri-amount">R${Number(order.total_amount).toLocaleString('en-ZA')}</div>
          <div class="ri-date">${date}</div>
        </div>
      </div>`;
  }).join('');
}

/* ─── DELIVERY HELPERS ────────────────────────── */
export function getDeliveryLabel(order) {
  const method = order.delivery_method || 'door';
  const meta = order.delivery_meta || {};

  if (method === 'locker') {
    return {
      icon: SVG.locker,
      label: meta.locker_name || 'Pudo Locker',
      sub: meta.locker_address || '',
    };
  }

  return {
    icon: SVG.door,
    label: 'Door Delivery',
    sub: order.delivery_address || '',
  };
}
