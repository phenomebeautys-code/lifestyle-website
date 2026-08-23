/* shop-admin-orders.js */
import {
  state,
  hooks,
  BADGE_MAP,
  STATUS_LABELS,
  SVG,
  callEdge,
  esc,
  showToast,
} from './shop-admin-core.js';
import {
  getDeliveryLabel,
  updateStats,
  renderRecent,
  updateReports,
  updateOrdersBadge,
} from './shop-admin-dashboard.js';

/* ─── ORDERS TABLE ────────────────────────────── */
export function applyFilter(filter, btn) {
  state.activeFilter = filter;

  document.querySelectorAll('.filter-btn').forEach(button => {
    button.classList.remove('active');
  });

  const target = btn || document.querySelector(`.filter-btn[data-filter="${filter}"]`);
  if (target) target.classList.add('active');

  renderTable();
  renderCards();
}

export function getFiltered() {
  const searchInput = document.getElementById('searchInput');
  const query = (searchInput?.value || '').toLowerCase();
  let orders = state.allOrders;

  if (state.activeFilter !== 'all') {
    orders = orders.filter(order => (
      order.payment_status === state.activeFilter
      || order.status === state.activeFilter
    ));
  }

  if (query) {
    orders = orders.filter(order => (
      order.customer_name?.toLowerCase().includes(query)
      || order.customer_email?.toLowerCase().includes(query)
      || String(order.id).slice(0, 8).toLowerCase().includes(query)
    ));
  }

  return orders;
}

export function renderTable() {
  const tbody = document.getElementById('ordersBody');
  if (!tbody) return;

  const orders = getFiltered();

  if (!orders.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">No orders found.</td></tr>';
    return;
  }

  tbody.innerHTML = '';

  orders.forEach(order => {
    const row = document.createElement('tr');
    row.style.cursor = 'pointer';

    const date = new Date(order.created_at).toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const items = Array.isArray(order.items) ? order.items : [];

    [
      mkTd(date, 'white-space:nowrap;color:var(--text-muted)'),
      mkCustomerTd(order),
      mkItemsTd(items),
      mkTd(
        `R${Number(order.total_amount).toLocaleString('en-ZA')}`,
        'font-weight:700;color:var(--accent);white-space:nowrap',
      ),
      mkBadgeTd(
        order.payment_status === 'paid' ? 'badge-paid' : 'badge-unpaid',
        order.payment_status === 'paid' ? 'Paid' : 'Unpaid',
      ),
      mkDeliveryTd(order),
      mkBadgeTd(
        BADGE_MAP[order.status] || 'badge-unpaid',
        STATUS_LABELS[order.status] || order.status || 'Payment Pending',
      ),
      mkSelectTd(order),
      mkMarkPaidTd(order),
    ].forEach(cell => row.appendChild(cell));

    row.addEventListener('click', event => {
      if (event.target.closest('select, button')) return;
      hooks.openOrderDetail?.(order.id);
    });

    tbody.appendChild(row);
  });
}

export function renderCards() {
  const container = document.getElementById('orderCards');
  if (!container) return;

  const orders = getFiltered();

  if (!orders.length) {
    container.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-muted)">No orders found.</div>';
    return;
  }

  container.innerHTML = '';

  orders.forEach(order => {
    const items = Array.isArray(order.items) ? order.items : [];
    const date = new Date(order.created_at).toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    const card = document.createElement('div');
    card.className = 'order-card';

    const paymentBadge = makeBadge(
      order.payment_status === 'paid' ? 'badge-paid' : 'badge-unpaid',
      order.payment_status === 'paid' ? 'Paid' : 'Unpaid',
    );

    const statusBadge = makeBadge(
      BADGE_MAP[order.status] || 'badge-unpaid',
      STATUS_LABELS[order.status] || order.status || 'Payment Pending',
    );

    const statusSelect = makeStatusSelect(order, statusBadge);
    const deliveryInfo = getDeliveryLabel(order);

    card.innerHTML = `
      <div class="oc-top">
        <div>
          <div class="oc-name">${esc(order.customer_name)}</div>
          <div class="oc-meta">${esc(order.customer_email || '')} &middot; ${esc(order.customer_phone || '')}</div>
        </div>
        <div class="oc-amount">R${Number(order.total_amount).toLocaleString('en-ZA')}</div>
      </div>`;

    const badges = document.createElement('div');
    badges.className = 'oc-badges';
    badges.appendChild(paymentBadge);
    badges.appendChild(statusBadge);

    const deliveryBadge = document.createElement('span');
    deliveryBadge.className = `badge ${order.delivery_method === 'locker' ? 'badge-processing' : 'badge-dispatched'}`;
    deliveryBadge.style.cssText = 'font-size:0.68rem;display:inline-flex;align-items:center;gap:4px';
    deliveryBadge.innerHTML = deliveryInfo.icon;
    deliveryBadge.appendChild(document.createTextNode(` ${deliveryInfo.label}`));
    badges.appendChild(deliveryBadge);

    if (order.is_gift) {
      const giftBadge = document.createElement('span');
      giftBadge.className = 'badge';
      giftBadge.style.cssText = 'background:rgba(255,200,80,0.15);color:#fbbf24;border:1px solid rgba(255,200,80,0.3);font-size:0.68rem;display:inline-flex;align-items:center;gap:4px';
      giftBadge.innerHTML = SVG.gift;
      giftBadge.appendChild(document.createTextNode(' Gift'));
      badges.appendChild(giftBadge);
    }

    const itemsElement = document.createElement('div');
    itemsElement.className = 'oc-items';

    items.forEach((item, index) => {
      if (index > 0) itemsElement.appendChild(document.createElement('br'));

      itemsElement.appendChild(document.createTextNode(
        `${item.qty}× ${item.name}${item.variant ? ` (${item.variant})` : ''}${item.size ? ` [${item.size}]` : ''}`,
      ));
    });

    if (!items.length) itemsElement.textContent = 'No items';

    const deliveryElement = document.createElement('div');
    deliveryElement.style.cssText = 'font-size:0.74rem;color:var(--text-muted);margin-top:6px;line-height:1.4;';
    deliveryElement.textContent = deliveryInfo.sub;

    let giftElement = null;
    if (order.is_gift && order.gift_message) {
      giftElement = document.createElement('div');
      giftElement.style.cssText = 'font-size:0.74rem;color:#fbbf24;margin-top:6px;font-style:italic;border-left:2px solid rgba(255,200,80,0.4);padding-left:8px;line-height:1.4;';
      giftElement.textContent = `“${order.gift_message}”`;
    }

    const footer = document.createElement('div');
    footer.className = 'oc-footer';

    const dateElement = document.createElement('div');
    dateElement.className = 'oc-date';
    dateElement.textContent = date;

    const actions = document.createElement('div');
    actions.className = 'oc-actions';

    const printButton = document.createElement('button');
    printButton.className = 'btn-print-label';
    printButton.textContent = 'Print Label';
    printButton.addEventListener('click', event => {
      event.stopPropagation();
      hooks.printLabel?.(order);
    });

    actions.appendChild(statusSelect);

    if (order.payment_status !== 'paid') {
      const markPaidButton = document.createElement('button');
      markPaidButton.className = 'btn btn-primary';
      markPaidButton.style.cssText = 'font-size:0.72rem;padding:5px 10px;white-space:nowrap';
      markPaidButton.dataset.markPaid = order.id;
      markPaidButton.textContent = 'Mark as Paid';
      markPaidButton.addEventListener('click', event => {
        event.stopPropagation();
        markAsPaid(order.id);
      });
      actions.appendChild(markPaidButton);
    }

    actions.appendChild(printButton);
    footer.appendChild(dateElement);
    footer.appendChild(actions);

    card.appendChild(badges);
    card.appendChild(itemsElement);
    card.appendChild(deliveryElement);
    if (giftElement) card.appendChild(giftElement);
    card.appendChild(footer);

    card.addEventListener('click', event => {
      if (event.target.closest('select, button')) return;
      hooks.openOrderDetail?.(order.id);
    });

    container.appendChild(card);
  });
}

export function makeBadge(className, label) {
  const badge = document.createElement('span');
  badge.className = `badge ${className}`;
  badge.textContent = label;
  return badge;
}

export function makeStatusSelect(order, statusBadge) {
  const select = document.createElement('select');
  select.className = 'status-select';

  ['pending', 'processing', 'dispatched', 'delivered'].forEach(status => {
    const option = document.createElement('option');
    option.value = status;
    option.textContent = STATUS_LABELS[status] || `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
    if (order.status === status) option.selected = true;
    select.appendChild(option);
  });

  select.addEventListener('change', () => {
    updateOrderStatus(order.id, select.value, statusBadge);
  });

  return select;
}

export function mkTd(text, style = '') {
  const td = document.createElement('td');
  if (style) td.style.cssText = style;
  td.textContent = text;
  return td;
}

export function mkCustomerTd(order) {
  const td = document.createElement('td');

  [
    ['font-weight:600;color:var(--accent-strong)', order.customer_name],
    ['color:var(--text-muted);font-size:0.74rem', order.customer_email],
    ['color:var(--text-muted);font-size:0.74rem', order.customer_phone],
  ].forEach(([style, value]) => {
    const div = document.createElement('div');
    div.style.cssText = style;
    div.textContent = value || '';
    td.appendChild(div);
  });

  return td;
}

export function mkItemsTd(items) {
  const td = document.createElement('td');
  const wrap = document.createElement('div');
  wrap.className = 'items-mini';

  items.forEach((item, index) => {
    if (index > 0) wrap.appendChild(document.createElement('br'));

    wrap.appendChild(document.createTextNode(
      `${item.qty}× ${item.name}${item.variant ? ` (${item.variant})` : ''}${item.size ? ` [${item.size}]` : ''}`,
    ));
  });

  td.appendChild(wrap);
  return td;
}

export function mkBadgeTd(className, label) {
  const td = document.createElement('td');
  td.appendChild(makeBadge(className, label));
  return td;
}

export function mkDeliveryTd(order) {
  const td = document.createElement('td');
  const { icon, label, sub } = getDeliveryLabel(order);

  const nameDiv = document.createElement('div');
  nameDiv.style.cssText = 'font-size:0.8rem;font-weight:600;color:var(--text);display:flex;align-items:center;gap:5px';
  nameDiv.innerHTML = icon;
  nameDiv.appendChild(document.createTextNode(` ${label}`));

  const subDiv = document.createElement('div');
  subDiv.style.cssText = 'font-size:0.7rem;color:var(--text-muted);margin-top:2px;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
  subDiv.textContent = sub;

  td.appendChild(nameDiv);
  td.appendChild(subDiv);

  if (order.is_gift) {
    const gift = document.createElement('div');
    gift.style.cssText = 'font-size:0.68rem;color:#fbbf24;margin-top:3px;display:flex;align-items:center;gap:4px';
    gift.innerHTML = SVG.gift;
    gift.appendChild(document.createTextNode(' Gift order'));
    td.appendChild(gift);
  }

  return td;
}

export function mkSelectTd(order) {
  const td = document.createElement('td');
  td.appendChild(makeStatusSelect(order));
  return td;
}

export function mkMarkPaidTd(order) {
  const td = document.createElement('td');

  if (order.payment_status !== 'paid') {
    const button = document.createElement('button');
    button.className = 'btn btn-primary';
    button.style.cssText = 'font-size:0.72rem;padding:5px 10px;white-space:nowrap';
    button.dataset.markPaid = order.id;
    button.textContent = 'Mark as Paid';
    button.addEventListener('click', event => {
      event.stopPropagation();
      markAsPaid(order.id);
    });
    td.appendChild(button);
  }

  return td;
}

export async function updateOrderStatus(id, status, badgeElement) {
  try {
    const res = await callEdge({
      action: 'update_status',
      password: state.adminToken,
      order_id: id,
      status,
    });

    if (res.status === 429) {
      showToast('Rate limited.', true);
      return;
    }

    if (!res.ok) {
      showToast('Failed to update.', true);
      return;
    }

    const order = state.allOrders.find(item => item.id === id);
    if (order) order.status = status;

    if (badgeElement) {
      badgeElement.className = `badge ${BADGE_MAP[status] || 'badge-unpaid'}`;
      badgeElement.textContent = STATUS_LABELS[status] || status;
    }

    updateStats();
    renderRecent();
    updateReports();
    renderTable();
    renderCards();

    showToast(`Status updated to ${STATUS_LABELS[status] || status}`);
  } catch {
    showToast('Network error.', true);
  }
}

/* ─── MARK AS PAID ────────────────────────────── */
export async function markAsPaid(orderId) {
  const button = document.querySelector(`[data-mark-paid="${orderId}"]`);
  const originalLabel = button?.textContent || 'Mark as Paid';

  if (button) {
    button.disabled = true;
    button.textContent = 'Saving…';
  }

  try {
    const res = await callEdge({
      action: 'mark_paid',
      password: state.adminToken,
      order_id: orderId,
    });

    if (res.status === 429) {
      showToast('Rate limited.', true);
      return;
    }

    if (!res.ok) {
      showToast('Failed to mark as paid.', true);
      return;
    }

    const order = state.allOrders.find(item => item.id === orderId);
    if (order) {
      order.payment_status = 'paid';
      order.paid_at = order.paid_at || new Date().toISOString();
    }

    updateStats();
    renderRecent();
    renderTable();
    renderCards();
    updateReports();
    updateOrdersBadge();

    const modal = document.getElementById('orderDetailModal');
    if (modal && !modal.hasAttribute('hidden')) {
      hooks.openOrderDetail?.(orderId);
    }

    showToast('Payment marked as paid');
  } catch {
    showToast('Network error.', true);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }
}
