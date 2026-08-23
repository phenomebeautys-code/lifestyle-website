/* ─── ORDERS TABLE ────────────────────────────── */
(function () {
  'use strict';

  function applyFilter(filter, btn) {
    activeFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    const target = btn || document.querySelector(`.filter-btn[data-filter="${filter}"]`);
    if (target) target.classList.add('active');
    renderTable();
    renderCards();
  }

  function getFiltered() {
    const q = (document.getElementById('searchInput').value || '').toLowerCase();
    let orders = allOrders;
    if (activeFilter !== 'all') {
      orders = orders.filter(o => o.payment_status === activeFilter || o.status === activeFilter);
    }
    if (q) {
      orders = orders.filter(o =>
        o.customer_name?.toLowerCase().includes(q) ||
        o.customer_email?.toLowerCase().includes(q) ||
        String(o.id).slice(0, 8).toLowerCase().includes(q)
      );
    }
    return orders;
  }

  function renderTable() {
    const orders = getFiltered();
    const tbody = document.getElementById('ordersBody');
    if (!orders.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="9">No orders found.</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    orders.forEach(o => {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      const date = new Date(o.created_at).toLocaleDateString('en-ZA', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
      const items = Array.isArray(o.items) ? o.items : [];
      [
        mkTd(date, 'white-space:nowrap;color:var(--text-muted)'),
        mkCustomerTd(o),
        mkItemsTd(items),
        mkTd('R' + Number(o.total_amount).toLocaleString('en-ZA'), 'font-weight:700;color:var(--accent);white-space:nowrap'),
        mkBadgeTd(o.payment_status === 'paid' ? 'badge-paid' : 'badge-unpaid', o.payment_status === 'paid' ? 'Paid' : 'Unpaid'),
        mkDeliveryTd(o),
        mkBadgeTd(BADGE_MAP[o.status] || 'badge-unpaid', STATUS_LABELS[o.status] || o.status || 'Payment Pending'),
        mkSelectTd(o),
        mkMarkPaidTd(o),
      ].forEach(c => tr.appendChild(c));
      tr.addEventListener('click', e => {
        if (e.target.closest('select, button')) return;
        openOrderDetail(o.id);
      });
      tbody.appendChild(tr);
    });
  }

  function renderCards() {
    const orders = getFiltered();
    const el = document.getElementById('orderCards');
    if (!orders.length) {
      el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-muted)">No orders found.</div>';
      return;
    }
    el.innerHTML = '';
    orders.forEach(o => {
      const items = Array.isArray(o.items) ? o.items : [];
      const date = new Date(o.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
      const card = document.createElement('div');
      card.className = 'order-card';
      const payBadge = makeBadge(o.payment_status === 'paid' ? 'badge-paid' : 'badge-unpaid', o.payment_status === 'paid' ? 'Paid' : 'Unpaid');
      const statusBadge = makeBadge(BADGE_MAP[o.status] || 'badge-unpaid', STATUS_LABELS[o.status] || o.status || 'Payment Pending');
      const sel = makeStatusSelect(o, statusBadge);
      const delivInfo = getDeliveryLabel(o);

      card.innerHTML = `
        <div class="oc-top">
          <div>
            <div class="oc-name">${esc(o.customer_name)}</div>
            <div class="oc-meta">${esc(o.customer_email || '')} &middot; ${esc(o.customer_phone || '')}</div>
          </div>
          <div class="oc-amount">R${Number(o.total_amount).toLocaleString('en-ZA')}</div>
        </div>`;

      const badges = document.createElement('div');
      badges.className = 'oc-badges';
      badges.appendChild(payBadge);
      badges.appendChild(statusBadge);
      const delivBadge = document.createElement('span');
      delivBadge.className = 'badge ' + (o.delivery_method === 'locker' ? 'badge-processing' : 'badge-dispatched');
      delivBadge.style.cssText = 'font-size:0.68rem;display:inline-flex;align-items:center;gap:4px';
      delivBadge.innerHTML = delivInfo.icon;
      delivBadge.appendChild(document.createTextNode(' ' + delivInfo.label));
      badges.appendChild(delivBadge);
      if (o.is_gift) {
        const g = document.createElement('span');
        g.className = 'badge';
        g.style.cssText = 'background:rgba(255,200,80,0.15);color:#fbbf24;border:1px solid rgba(255,200,80,0.3);font-size:0.68rem;display:inline-flex;align-items:center;gap:4px';
        g.innerHTML = SVG.gift;
        g.appendChild(document.createTextNode(' Gift'));
        badges.appendChild(g);
      }

      const itemsEl = document.createElement('div');
      itemsEl.className = 'oc-items';
      items.forEach((item, i) => {
        if (i > 0) itemsEl.appendChild(document.createElement('br'));
        itemsEl.appendChild(document.createTextNode(`${item.qty}× ${item.name}${item.variant ? ' (' + item.variant + ')' : ''}${item.size ? ' [' + item.size + ']' : ''}`));
      });
      if (!items.length) itemsEl.textContent = 'No items';

      const delivEl = document.createElement('div');
      delivEl.style.cssText = 'font-size:0.74rem;color:var(--text-muted);margin-top:6px;line-height:1.4;';
      delivEl.textContent = delivInfo.sub;

      let giftEl = null;
      if (o.is_gift && o.gift_message) {
        giftEl = document.createElement('div');
        giftEl.style.cssText = 'font-size:0.74rem;color:#fbbf24;margin-top:6px;font-style:italic;border-left:2px solid rgba(255,200,80,0.4);padding-left:8px;line-height:1.4;';
        giftEl.textContent = '“' + o.gift_message + '”';
      }

      const footer = document.createElement('div');
      footer.className = 'oc-footer';
      const dateEl = document.createElement('div');
      dateEl.className = 'oc-date';
      dateEl.textContent = date;
      const actions = document.createElement('div');
      actions.className = 'oc-actions';
      const printBtn = document.createElement('button');
      printBtn.className = 'btn-print-label';
      printBtn.textContent = 'Print Label';
      printBtn.addEventListener('click', e => {
        e.stopPropagation();
        printLabel(o);
      });
      actions.appendChild(sel);
      if (o.payment_status !== 'paid') {
        const mpBtn = document.createElement('button');
        mpBtn.className = 'btn btn-primary';
        mpBtn.style.cssText = 'font-size:0.72rem;padding:5px 10px;white-space:nowrap';
        mpBtn.textContent = 'Mark as Paid';
        mpBtn.addEventListener('click', e => {
          e.stopPropagation();
          markAsPaid(o.id);
        });
        actions.appendChild(mpBtn);
      }
      actions.appendChild(printBtn);
      footer.appendChild(dateEl);
      footer.appendChild(actions);

      card.appendChild(badges);
      card.appendChild(itemsEl);
      card.appendChild(delivEl);
      if (giftEl) card.appendChild(giftEl);
      card.appendChild(footer);

      card.addEventListener('click', e => {
        if (e.target.closest('select, button')) return;
        openOrderDetail(o.id);
      });

      el.appendChild(card);
    });
  }

  function makeBadge(cls, label) {
    const span = document.createElement('span');
    span.className = 'badge ' + cls;
    span.textContent = label;
    return span;
  }

  function makeStatusSelect(o, statusBadge) {
    const sel = document.createElement('select');
    sel.className = 'status-select';
    ['pending', 'processing', 'dispatched', 'delivered'].forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = STATUS_LABELS[v] || (v.charAt(0).toUpperCase() + v.slice(1));
      if (o.status === v) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', () => updateOrderStatus(o.id, sel.value, statusBadge));
    return sel;
  }

  function mkTd(text, style = '') {
    const td = document.createElement('td');
    if (style) td.style.cssText = style;
    td.textContent = text;
    return td;
  }

  function mkCustomerTd(o) {
    const td = document.createElement('td');
    [
      ['font-weight:600;color:var(--accent-strong)', o.customer_name],
      ['color:var(--text-muted);font-size:0.74rem', o.customer_email],
      ['color:var(--text-muted);font-size:0.74rem', o.customer_phone],
    ].forEach(([style, val]) => {
      const d = document.createElement('div');
      d.style.cssText = style;
      d.textContent = val || '';
      td.appendChild(d);
    });
    return td;
  }

  function mkItemsTd(items) {
    const td = document.createElement('td');
    const wrap = document.createElement('div');
    wrap.className = 'items-mini';
    items.forEach((item, i) => {
      if (i > 0) wrap.appendChild(document.createElement('br'));
      wrap.appendChild(document.createTextNode(`${item.qty}× ${item.name}${item.variant ? ' (' + item.variant + ')' : ''}${item.size ? ' [' + item.size + ']' : ''}`));
    });
    td.appendChild(wrap);
    return td;
  }

  function mkBadgeTd(cls, label) {
    const td = document.createElement('td');
    td.appendChild(makeBadge(cls, label));
    return td;
  }

  function mkDeliveryTd(o) {
    const td = document.createElement('td');
    const { icon, label, sub } = getDeliveryLabel(o);
    const nameDiv = document.createElement('div');
    nameDiv.style.cssText = 'font-size:0.8rem;font-weight:600;color:var(--text);display:flex;align-items:center;gap:5px';
    nameDiv.innerHTML = icon;
    nameDiv.appendChild(document.createTextNode(' ' + label));
    const subDiv = document.createElement('div');
    subDiv.style.cssText = 'font-size:0.7rem;color:var(--text-muted);margin-top:2px;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    subDiv.textContent = sub;
    td.appendChild(nameDiv);
    td.appendChild(subDiv);
    if (o.is_gift) {
      const g = document.createElement('div');
      g.style.cssText = 'font-size:0.68rem;color:#fbbf24;margin-top:3px;display:flex;align-items:center;gap:4px';
      g.innerHTML = SVG.gift;
      g.appendChild(document.createTextNode(' Gift order'));
      td.appendChild(g);
    }
    return td;
  }

  function mkSelectTd(o) {
    const td = document.createElement('td');
    td.appendChild(makeStatusSelect(o));
    return td;
  }

  function mkMarkPaidTd(o) {
    const td = document.createElement('td');
    if (o.payment_status !== 'paid') {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.style.cssText = 'font-size:0.72rem;padding:5px 10px;white-space:nowrap';
      btn.textContent = 'Mark as Paid';
      btn.addEventListener('click', e => {
        e.stopPropagation();
        markAsPaid(o.id);
      });
      td.appendChild(btn);
    }
    return td;
  }

  async function updateOrderStatus(id, status, badgeEl) {
    try {
      const res = await callEdge({ action: 'update_status', password: adminToken, order_id: id, status });
      if (res.status === 429) {
        showToast('Rate limited.', true);
        return;
      }
      if (!res.ok) {
        showToast('Failed to update.', true);
        return;
      }
      const o = allOrders.find(x => x.id === id);
      if (o) o.status = status;
      if (badgeEl) {
        badgeEl.className = 'badge ' + (BADGE_MAP[status] || 'badge-unpaid');
        badgeEl.textContent = STATUS_LABELS[status] || status;
      }
      updateStats();
      renderRecent();
      updateReports();
      showToast('Status updated to ' + (STATUS_LABELS[status] || status));
    } catch {
      showToast('Network error.', true);
    }
  }

  window.ShopAdminOrdersTable = {
    applyFilter,
    getFiltered,
    renderTable,
    renderCards,
    updateOrderStatus,
  };
})();
