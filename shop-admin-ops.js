/* ─── OPERATIONS: order tools, customers, abandoned checkouts, activity ──
   Order tools sit at the bottom of the order detail modal: tags, Pudo
   tracking reference, recorded refunds, cancel, archive, notes and the
   order timeline. Refunds are recorded after the money is returned in the
   Yoco portal; nothing here moves money or emails the customer.
──────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const money = n => 'R' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const when = iso => iso ? new Date(iso).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const day = iso => iso ? new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const $ = id => document.getElementById(id);

  async function call(action, payload) {
    const res = await callEdge({ action, password: window.ShopAdmin.adminToken, ...(payload || {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
    return data;
  }

  function patchOrder(id, fields) {
    const o = allOrders.find(x => x.id === id);
    if (o) Object.assign(o, fields);
    renderTable(); renderCards(); updateStats(); renderRecent(); updateReports(); updateOrdersBadge();
  }

  function tagChips(tags) {
    return (tags || []).map(t => `<span class="ops-tag">${esc(t)}</span>`).join('');
  }

  /* ── Order tools (inside the order detail modal) ────────────────── */

  function renderOrderTools(o) {
    const host = $('odTools');
    if (!host) return;
    const isPaid = o.payment_status === 'paid';
    const cancelled = !!o.cancelled_at || o.status === 'cancelled';
    const refunded = Number(o.refunded_amount || 0);
    const remaining = Math.max(Number(o.total_amount || 0) - refunded, 0);
    const canCancel = !cancelled && !['dispatched', 'delivered'].includes(o.status);
    const items = (Array.isArray(o.items) ? o.items : []).filter(i => i && i.productId);

    host.innerHTML = `
      ${cancelled ? `<div class="ops-alert">Cancelled ${when(o.cancelled_at)}${o.cancel_reason ? ': ' + esc(o.cancel_reason) : ''}</div>` : ''}
      ${refunded > 0 ? `<div class="ops-alert ops-alert--soft">Refunded ${money(refunded)} of ${money(o.total_amount)}${remaining <= 0 ? ' (fully refunded)' : ''}</div>` : ''}
      ${o.archived_at ? `<div class="ops-alert ops-alert--soft">Archived ${when(o.archived_at)}</div>` : ''}

      <div class="ops-block">
        <div class="ops-label">Tags</div>
        <div class="ops-row">
          <input class="field-input" id="odTags" value="${esc((o.tags || []).join(', '))}" placeholder="e.g. VIP, gift, wholesale" />
          <button class="btn btn-secondary" id="odTagsSave">Save</button>
        </div>
      </div>

      <div class="ops-block">
        <div class="ops-label">Pudo tracking reference</div>
        <div class="ops-row">
          <input class="field-input" id="odTracking" value="${esc(o.pudo_tracking_ref || '')}" placeholder="Tracking reference" />
          <button class="btn btn-secondary" id="odTrackingSave">Save</button>
        </div>
        <div class="ops-hint">Saved on the order only. Pudo sends the customer their tracking updates.</div>
      </div>

      ${isPaid && remaining > 0 ? `
      <details class="ops-block ops-details">
        <summary class="ops-label">Record a refund</summary>
        <div class="ops-hint">First refund the customer in the Yoco portal, then record it here. Up to ${money(remaining)} can still be refunded.</div>
        <div class="ops-form">
          <label class="field-label" for="odRefundAmt">Amount refunded (R)</label>
          <input class="field-input" id="odRefundAmt" type="number" min="0.01" step="0.01" max="${remaining.toFixed(2)}" value="${remaining.toFixed(2)}" />
          <label class="field-label" for="odRefundReason">Reason</label>
          <input class="field-input" id="odRefundReason" maxlength="500" placeholder="e.g. Damaged on arrival" />
          ${items.length ? `<div class="field-label">Put items back into stock (optional)</div>
          ${items.map((i, n) => `<label class="ops-check"><span>${esc(i.name || i.productId)}${i.variant ? ' · ' + esc(i.variant) : ''}</span>
            <input type="number" class="field-input ops-qty" data-restock="${n}" data-product="${esc(i.productId)}" min="0" max="${(Number(i.qty) || 0) * (Number(i.units_per_pack) || 1)}" value="0" /></label>`).join('')}` : ''}
          <button class="btn btn-primary" id="odRefundBtn">Record refund</button>
        </div>
      </details>` : ''}

      <div class="ops-row ops-actions">
        ${canCancel ? '<button class="btn btn-secondary ops-danger" id="odCancelBtn">Cancel order</button>' : ''}
        <button class="btn btn-secondary" id="odArchiveBtn">${o.archived_at ? 'Move back to open orders' : 'Archive'}</button>
      </div>

      <div class="ops-block">
        <div class="ops-label">Timeline</div>
        <div class="ops-row">
          <input class="field-input" id="odNote" maxlength="2000" placeholder="Add a note for the team" />
          <button class="btn btn-secondary" id="odNoteBtn">Add note</button>
        </div>
        <ol class="ops-timeline" id="odTimeline"><li class="ops-empty"><span class="spinner"></span>Loading…</li></ol>
      </div>`;

    if (cancelled) {
      const select = $('odStatusSelect');
      if (select) select.closest('div').style.display = 'none';
    }

    $('odTagsSave').onclick = () => run('set_order_tags', { order_id: o.id, tags: $('odTags').value.split(',').map(s => s.trim()).filter(Boolean) },
      d => patchOrder(o.id, { tags: d.tags }), 'Tags saved.');
    $('odTrackingSave').onclick = () => {
      const ref = $('odTracking').value.trim();
      if (!ref) { showToast('Enter the tracking reference.', true); return; }
      run('set_tracking', { order_id: o.id, tracking_ref: ref }, () => patchOrder(o.id, { pudo_tracking_ref: ref }), 'Tracking reference saved.');
    };
    $('odNoteBtn').onclick = () => {
      const note = $('odNote').value.trim();
      if (!note) { showToast('Write a note first.', true); return; }
      run('add_order_note', { order_id: o.id, note }, () => { $('odNote').value = ''; }, 'Note added.');
    };
    $('odArchiveBtn').onclick = () => run(o.archived_at ? 'unarchive_order' : 'archive_order', { order_id: o.id },
      d => patchOrder(o.id, { archived_at: d.archived_at }), o.archived_at ? 'Moved back to open orders.' : 'Order archived.');
    if ($('odCancelBtn')) $('odCancelBtn').onclick = () => {
      const reason = prompt('Why is this order being cancelled? This is saved on the order. No email is sent.');
      if (reason === null) return;
      if (!reason.trim()) { showToast('Give a reason for cancelling.', true); return; }
      run('cancel_order', { order_id: o.id, reason: reason.trim() },
        d => patchOrder(o.id, { status: 'cancelled', cancelled_at: d.cancelled_at, cancel_reason: reason.trim() }), 'Order cancelled.');
    };
    if ($('odRefundBtn')) $('odRefundBtn').onclick = () => {
      const amount = Number($('odRefundAmt').value);
      const reason = $('odRefundReason').value.trim();
      if (!(amount > 0)) { showToast('Enter the amount refunded.', true); return; }
      if (amount > remaining + 0.001) { showToast('That is more than can still be refunded.', true); return; }
      if (!reason) { showToast('Give a reason for the refund.', true); return; }
      const restock = [...document.querySelectorAll('[data-restock]')]
        .map(inp => ({ productId: inp.dataset.product, qty: Number(inp.value) }))
        .filter(r => r.qty > 0);
      if (!confirm(`Record a refund of ${money(amount)}? Make sure it has already been refunded in Yoco.`)) return;
      run('record_refund', { order_id: o.id, amount, reason, restock }, d => {
        patchOrder(o.id, { refunded_amount: d.refunded_amount });
        if (d.restock_errors && d.restock_errors.length) showToast('Refund saved, but some stock was not updated: ' + d.restock_errors.join('; '), true);
      }, 'Refund recorded.');
    };

    loadTimeline(o.id);

    async function run(action, payload, onDone, message) {
      const buttons = host.querySelectorAll('button');
      buttons.forEach(b => { b.disabled = true; });
      try {
        const data = await call(action, payload);
        if (onDone) onDone(data);
        showToast(message);
        window.ShopAdminOrderDetail.openOrderDetail(o.id);
      } catch (err) {
        showToast(err.message, true);
        buttons.forEach(b => { b.disabled = false; });
      }
    }
  }

  async function loadTimeline(orderId) {
    const list = $('odTimeline');
    try {
      const { events } = await call('get_order_events', { order_id: orderId });
      if (!$('odTimeline') || list !== $('odTimeline')) return;
      const o = allOrders.find(x => x.id === orderId) || {};
      const base = [{ at: o.created_at, actor: 'Customer', kind: 'placed', message: 'Order placed.' }];
      if (o.paid_at && !events.some(e => e.kind === 'payment')) base.push({ at: o.paid_at, actor: 'Yoco', kind: 'payment', message: 'Payment received.' });
      const all = [...events, ...base].filter(e => e.at).sort((a, b) => (a.at < b.at ? 1 : -1));
      list.innerHTML = all.map(e => `
        <li class="ops-event ops-event--${esc(e.kind)}">
          <div class="ops-event-msg">${esc(e.message || e.kind)}</div>
          <div class="ops-event-meta">${when(e.at)} · ${esc(e.actor)}</div>
        </li>`).join('');
    } catch (err) {
      list.innerHTML = `<li class="ops-empty">${esc(err.message)}</li>`;
    }
  }

  /* ── Customers ──────────────────────────────────────────────────── */

  let customers = [];

  async function loadCustomers() {
    const body = $('customersBody');
    body.innerHTML = '<tr class="empty-row"><td colspan="6"><span class="spinner"></span>Loading…</td></tr>';
    try {
      customers = (await call('get_customers')).customers || [];
      renderCustomers();
    } catch (err) {
      body.innerHTML = `<tr class="empty-row"><td colspan="6">${esc(err.message)}</td></tr>`;
    }
  }

  function renderCustomers() {
    const q = ($('customerSearch').value || '').toLowerCase();
    const list = customers.filter(c => !q || [c.name, c.email, c.phone, (c.tags || []).join(' ')].some(v => String(v || '').toLowerCase().includes(q)));
    $('customerCount').textContent = `${list.length} customer${list.length === 1 ? '' : 's'}`;
    const body = $('customersBody');
    if (!list.length) { body.innerHTML = '<tr class="empty-row"><td colspan="6">No customers found.</td></tr>'; return; }
    body.innerHTML = list.map(c => `
      <tr class="ops-click" data-email="${esc(c.email)}">
        <td><div style="font-weight:600;color:var(--accent-strong)">${esc(c.name || '—')}</div><div style="font-size:0.76rem;color:var(--text-muted)">${esc(c.email)}</div></td>
        <td>${esc(c.phone || '')}</td>
        <td>${c.paid_orders} paid${c.orders > c.paid_orders ? ` <span style="color:var(--text-muted)">/ ${c.orders}</span>` : ''}</td>
        <td style="font-weight:700;color:var(--accent);white-space:nowrap">${money(c.total_spent)}</td>
        <td style="white-space:nowrap;color:var(--text-muted)">${day(c.last_order_at)}</td>
        <td>${tagChips(c.tags)}</td>
      </tr>`).join('');
    body.querySelectorAll('tr[data-email]').forEach(tr => tr.addEventListener('click', () => openCustomer(tr.dataset.email)));
  }

  async function openCustomer(email) {
    openOpsModal('Customer', '<div class="ops-empty"><span class="spinner"></span>Loading…</div>');
    try {
      const { customer: c } = await call('get_customer', { email });
      $('opsModalTitle').textContent = c.name || c.email;
      $('opsModalBody').innerHTML = `
        <div class="ops-block">
          <div>${esc(c.email)}${c.phone ? ' · ' + esc(c.phone) : ''}</div>
          <div class="ops-hint">Customer since ${day(c.first_order_at)} · ${c.paid_orders} paid order${c.paid_orders === 1 ? '' : 's'} · ${money(c.total_spent)} spent (after refunds)</div>
        </div>
        <div class="ops-block">
          <div class="ops-label">Tags</div>
          <input class="field-input" id="custTags" value="${esc((c.tags || []).join(', '))}" placeholder="e.g. regular, salon, wholesale" />
          <div class="ops-label" style="margin-top:12px">Notes</div>
          <textarea class="field-input" id="custNotes" rows="4" maxlength="2000" placeholder="Preferences, skin notes, delivery notes">${esc(c.notes || '')}</textarea>
          <button class="btn btn-primary" id="custSave" style="margin-top:10px">Save</button>
        </div>
        <div class="ops-block">
          <div class="ops-label">Orders</div>
          ${c.order_list.map(o => `
            <button class="ops-order-line" data-order="${esc(o.id)}">
              <span>#${esc(String(o.id).slice(0, 8).toUpperCase())} · ${day(o.created_at)}</span>
              <span>${esc(STATUS_LABELS[o.status] || o.status)} · ${o.payment_status === 'paid' ? 'Paid' : 'Unpaid'}</span>
              <span style="font-weight:700;color:var(--accent)">${money(o.total_amount)}</span>
            </button>`).join('')}
        </div>`;
      $('custSave').onclick = async () => {
        $('custSave').disabled = true;
        try {
          const tags = $('custTags').value.split(',').map(s => s.trim()).filter(Boolean);
          await call('save_customer', { email: c.email, notes: $('custNotes').value, tags });
          const row = customers.find(x => x.email === c.email);
          if (row) { row.tags = tags; row.notes = $('custNotes').value; }
          renderCustomers();
          showToast('Customer saved.');
        } catch (err) { showToast(err.message, true); }
        $('custSave').disabled = false;
      };
      $('opsModalBody').querySelectorAll('[data-order]').forEach(b => b.addEventListener('click', () => {
        if (!allOrders.some(o => o.id === b.dataset.order)) { showToast('Refresh to load this order.', true); return; }
        closeOpsModal();
        window.ShopAdminOrderDetail.openOrderDetail(b.dataset.order);
      }));
    } catch (err) {
      $('opsModalBody').innerHTML = `<div class="ops-empty">${esc(err.message)}</div>`;
    }
  }

  /* ── Abandoned checkouts ────────────────────────────────────────── */

  async function loadAbandoned() {
    const body = $('abandonedBody');
    body.innerHTML = '<tr class="empty-row"><td colspan="6"><span class="spinner"></span>Loading…</td></tr>';
    try {
      const { abandoned } = await call('get_abandoned');
      const total = abandoned.reduce((s, o) => s + Number(o.total_amount || 0), 0);
      $('abandonedSummary').textContent = `${abandoned.length} unpaid checkout${abandoned.length === 1 ? '' : 's'} · ${money(total)} not collected`;
      if (!abandoned.length) { body.innerHTML = '<tr class="empty-row"><td colspan="6">No abandoned checkouts.</td></tr>'; return; }
      body.innerHTML = abandoned.map(o => {
        const items = Array.isArray(o.items) ? o.items : [];
        return `
        <tr class="ops-click" data-order="${esc(o.id)}">
          <td style="white-space:nowrap;color:var(--text-muted)">${when(o.created_at)}</td>
          <td><div style="font-weight:600;color:var(--accent-strong)">${esc(o.customer_name || '—')}</div><div style="font-size:0.76rem;color:var(--text-muted)">${esc(o.customer_email || '')}</div></td>
          <td>${esc(o.customer_phone || '')}</td>
          <td style="font-size:0.8rem">${items.map(i => `${esc(i.name)} ×${Number(i.qty) || 1}`).join('<br>')}</td>
          <td style="font-weight:700;color:var(--accent);white-space:nowrap">${money(o.total_amount)}</td>
          <td>${o.reminder_sent ? '<span class="badge badge-processing">Reminder sent</span>' : '<span class="badge badge-unpaid">No reminder yet</span>'}</td>
        </tr>`;
      }).join('');
      body.querySelectorAll('tr[data-order]').forEach(tr => tr.addEventListener('click', () => {
        if (!allOrders.some(o => o.id === tr.dataset.order)) { showToast('Refresh to load this order.', true); return; }
        window.ShopAdminOrderDetail.openOrderDetail(tr.dataset.order);
      }));
    } catch (err) {
      body.innerHTML = `<tr class="empty-row"><td colspan="6">${esc(err.message)}</td></tr>`;
    }
  }

  /* ── Activity ───────────────────────────────────────────────────── */

  const ACTION_LABELS = {
    create_owner: 'Created the owner account', update_status: 'Changed order status', mark_paid: 'Marked order paid',
    add_order_note: 'Added an order note', set_order_tags: 'Changed order tags', cancel_order: 'Cancelled an order',
    archive_order: 'Archived an order', unarchive_order: 'Unarchived an order', record_refund: 'Recorded a refund',
    set_tracking: 'Saved a tracking reference', save_customer: 'Updated a customer', add_product: 'Added a product',
    update_product: 'Edited a product', delete_product: 'Deleted a product', reorder_products: 'Reordered products',
    update_settings: 'Changed reorder settings', initial_stock: 'Set opening stock', receive_stock: 'Received stock',
    adjust_stock: 'Adjusted stock', upsert_material: 'Saved a material', delete_material: 'Deleted a material',
    save_conversion: 'Saved a conversion', delete_conversion: 'Deleted a conversion', run_conversion: 'Ran a conversion',
    save_recipe: 'Saved a recipe', save_free_delivery: 'Changed free delivery',
    create_discount: 'Created a discount code', update_discount: 'Edited a discount code', delete_discount: 'Deleted a discount code',
    save_campaign: 'Changed an email campaign', campaign_test: 'Sent a test campaign email', campaign_run: 'Sent due campaign emails',
    retry_failed_sends: 'Retried failed campaign emails',
    issue_gift_card: 'Issued a gift card', resend_gift_card: 'Resent a gift card email', adjust_gift_card: 'Changed a gift card balance',
    set_gift_card_status: 'Switched a gift card on or off', save_gift_card_settings: 'Changed gift card sales',
  };

  function describe(a) {
    const d = a.details || {};
    if (a.action === 'update_status' && d.to) return `${d.from} → ${d.to}`;
    if (a.action === 'record_refund' && d.amount != null) return `${money(d.amount)}${d.reason ? ' · ' + d.reason : ''}`;
    if (a.action === 'cancel_order' && d.reason) return d.reason;
    if (a.action === 'save_campaign') return `${a.target_id === 'replenishment' ? 'Running low reminder' : 'Review request'}: ${d.enabled ? 'on, ' + d.delay_days + ' days' : 'off'}`;
    if (a.action === 'create_discount' || a.action === 'update_discount' || a.action === 'delete_discount') return a.target_id + (d.kind ? ` · ${d.kind === 'percent' ? d.value + '%' : d.kind === 'fixed' ? 'R' + d.value : 'free delivery'}` : '');
    if (a.action === 'save_free_delivery') return d.enabled ? `On from ${money(d.threshold)} (${(d.methods || []).join(' and ')})` : 'Off';
    if (d.name) return d.name;
    if (d.tags) return d.tags.join(', ') || 'cleared';
    if (d.tracking_ref) return d.tracking_ref;
    return '';
  }

  function targetLabel(a) {
    if (!a.target_id) return '';
    if (a.target_type === 'order') return '#' + String(a.target_id).slice(0, 8).toUpperCase();
    if (a.target_type === 'product' || a.target_type === 'product_stock') {
      const p = (allProducts || []).find(x => x.id === a.target_id);
      return p ? p.name : String(a.target_id).slice(0, 8);
    }
    return a.target_id;
  }

  async function loadActivity() {
    const body = $('activityBody');
    body.innerHTML = '<tr class="empty-row"><td colspan="4"><span class="spinner"></span>Loading…</td></tr>';
    try {
      const { activity } = await call('get_activity', { limit: 300 });
      if (!activity.length) { body.innerHTML = '<tr class="empty-row"><td colspan="4">No activity yet.</td></tr>'; return; }
      body.innerHTML = activity.map(a => `
        <tr${a.target_type === 'order' ? ` class="ops-click" data-order="${esc(a.target_id)}"` : ''}>
          <td style="white-space:nowrap;color:var(--text-muted)">${when(a.at)}</td>
          <td>${esc(a.actor)}</td>
          <td>${esc(ACTION_LABELS[a.action] || a.action)}</td>
          <td><span style="color:var(--accent-strong)">${esc(targetLabel(a))}</span> <span style="color:var(--text-muted)">${esc(describe(a))}</span></td>
        </tr>`).join('');
      body.querySelectorAll('tr[data-order]').forEach(tr => tr.addEventListener('click', () => {
        if (allOrders.some(o => o.id === tr.dataset.order)) window.ShopAdminOrderDetail.openOrderDetail(tr.dataset.order);
      }));
    } catch (err) {
      body.innerHTML = `<tr class="empty-row"><td colspan="4">${esc(err.message)}</td></tr>`;
    }
  }

  /* ── Shared modal ───────────────────────────────────────────────── */

  function openOpsModal(title, html) {
    $('opsModalTitle').textContent = title;
    $('opsModalBody').innerHTML = html;
    $('opsModal').removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeOpsModal() {
    $('opsModal').setAttribute('hidden', '');
    document.body.style.overflow = '';
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('customerSearch').addEventListener('input', renderCustomers);
    $('opsModalClose').addEventListener('click', closeOpsModal);
    $('opsModal').addEventListener('click', e => { if (e.target === $('opsModal')) closeOpsModal(); });
  });

  window.ShopAdminOps = { renderOrderTools, loadCustomers, loadAbandoned, loadActivity, closeOpsModal };
})();
