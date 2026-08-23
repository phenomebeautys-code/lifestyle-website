/* ─── ORDER DETAIL MODAL ─────────────────────── */
(function () {
  'use strict';

  function openOrderDetail(orderId) {
    const o = allOrders.find(x => x.id === orderId);
    if (!o) return;

    const items      = Array.isArray(o.items) ? o.items : [];
    const date       = new Date(o.created_at).toLocaleString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const orderNo    = String(o.id).slice(0, 8).toUpperCase();
    const delivInfo  = getDeliveryLabel(o);
    const isPaid     = o.payment_status === 'paid';
    const paidAt     = o.paid_at ? new Date(o.paid_at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

    const itemsHTML = items.map(item => `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--glass-border);gap:12px">
        <div>
          <div style="font-weight:600;color:var(--accent-strong)">${esc(item.name)}</div>
          ${item.variant ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">${esc(item.variant)}</div>` : ''}
          ${item.size    ? `<div style="font-size:0.75rem;color:var(--text-muted)">Size: ${esc(item.size)}</div>` : ''}
        </div>
        <div style="white-space:nowrap;text-align:right">
          <div style="font-weight:700;color:var(--accent)">R${Number(item.price * item.qty).toLocaleString('en-ZA')}</div>
          <div style="font-size:0.74rem;color:var(--text-muted)">&times;${item.qty} @ R${item.price}</div>
        </div>
      </div>`).join('');

    const giftSVG    = SVG.gift;
    const checkSVG   = SVG.check;
    const doorSVG    = SVG.door;
    const lockerSVG  = SVG.locker;
    const delivIcon  = o.delivery_method === 'locker' ? lockerSVG : doorSVG;

    const markPaidRow = !isPaid ? `
      <div style="margin-top:10px">
        <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="markAsPaid('${o.id}')">Mark as Paid</button>
      </div>` : '';

    document.getElementById('odTitle').textContent = `Order #${orderNo}`;
    document.getElementById('orderDetailBody').innerHTML = `

      <div style="background:rgba(255,255,255,0.04);border:1px solid var(--glass-border);border-radius:10px;padding:16px;margin-bottom:14px">
        <div style="font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px">Customer</div>
        <div style="font-size:1rem;font-weight:700;color:var(--accent-strong);margin-bottom:4px">${esc(o.customer_name)}</div>
        ${o.customer_email ? `<div style="font-size:0.82rem;color:var(--text-muted)">${esc(o.customer_email)}</div>` : ''}
        ${o.customer_phone ? `<div style="font-size:0.82rem;color:var(--text-muted)">${esc(o.customer_phone)}</div>` : ''}
        <div style="font-size:0.76rem;color:var(--text-muted);margin-top:6px">Placed: ${date}</div>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center">
        <span class="badge ${isPaid ? 'badge-paid' : 'badge-unpaid'}">${isPaid ? 'Paid' : 'Unpaid'}</span>
        <span class="badge ${BADGE_MAP[o.status] || 'badge-unpaid'}">${STATUS_LABELS[o.status] || o.status || 'Payment Pending'}</span>
        <span class="badge ${o.delivery_method === 'locker' ? 'badge-processing' : 'badge-dispatched'}" style="font-size:0.74rem;display:inline-flex;align-items:center;gap:4px">${delivIcon} ${esc(delivInfo.label)}</span>
        ${o.is_gift ? `<span class="badge" style="background:rgba(255,200,80,0.15);color:#fbbf24;border:1px solid rgba(255,200,80,0.3);display:inline-flex;align-items:center;gap:4px">${giftSVG} Gift</span>` : ''}
      </div>

      ${paidAt ? `<div style="font-size:0.76rem;color:#34d399;margin-bottom:14px;display:flex;align-items:center;gap:5px">${checkSVG} Payment confirmed ${paidAt}</div>` : ''}

      <div style="background:rgba(255,255,255,0.04);border:1px solid var(--glass-border);border-radius:10px;padding:16px;margin-bottom:14px">
        <div style="font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px">Delivery</div>
        <div style="font-size:0.88rem;font-weight:600;color:var(--text);margin-bottom:4px;display:flex;align-items:center;gap:6px">${delivIcon} ${esc(delivInfo.label)}</div>
        ${delivInfo.sub ? `<div style="font-size:0.8rem;color:var(--text-muted);line-height:1.5">${esc(delivInfo.sub)}</div>` : ''}
      </div>

      <div style="background:rgba(255,255,255,0.04);border:1px solid var(--glass-border);border-radius:10px;padding:16px;margin-bottom:14px">
        <div style="font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px">Items</div>
        ${itemsHTML || '<div style="color:var(--text-muted);font-size:0.85rem;padding:8px 0">No items</div>'}
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:6px">
          ${o.subtotal != null ? `<div style="display:flex;justify-content:space-between;font-size:0.84rem;color:var(--text-muted)"><span>Subtotal</span><span>R${Number(o.subtotal).toLocaleString('en-ZA')}</span></div>` : ''}
          ${o.delivery_fee != null ? `<div style="display:flex;justify-content:space-between;font-size:0.84rem;color:var(--text-muted)"><span>Delivery fee</span><span>R${Number(o.delivery_fee).toLocaleString('en-ZA')}</span></div>` : ''}
          <div style="display:flex;justify-content:space-between;font-size:1rem;font-weight:700;border-top:1px solid var(--glass-border);padding-top:8px;margin-top:2px"><span>Total</span><span style="color:var(--accent)">R${Number(o.total_amount).toLocaleString('en-ZA')}</span></div>
        </div>
      </div>

      ${o.is_gift && o.gift_message ? `
      <div style="background:rgba(255,200,80,0.06);border:1px solid rgba(255,200,80,0.25);border-radius:10px;padding:16px;margin-bottom:14px">
        <div style="font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#fbbf24;margin-bottom:8px;display:flex;align-items:center;gap:5px">${giftSVG} Gift Message</div>
        <div style="font-size:0.88rem;font-style:italic;color:var(--text-soft);line-height:1.6">&ldquo;${esc(o.gift_message)}&rdquo;</div>
      </div>` : (o.is_gift ? `<div style="font-size:0.8rem;color:#fbbf24;margin-bottom:14px;display:flex;align-items:center;gap:5px">${giftSVG} Gift order &mdash; no message added</div>` : '')}

      ${o.notes ? `
      <div style="background:rgba(255,255,255,0.03);border:1px solid var(--glass-border);border-radius:10px;padding:14px;margin-bottom:14px">
        <div style="font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px">Order Notes</div>
        <div style="font-size:0.84rem;color:var(--text-soft);line-height:1.5">${esc(o.notes)}</div>
      </div>` : ''}

      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:4px">
        <select id="odStatusSelect" class="status-select" style="flex:1;min-width:140px">
          ${['pending','processing','dispatched','delivered'].map(v =>
            `<option value="${v}"${o.status === v ? ' selected' : ''}>${STATUS_LABELS[v] || (v.charAt(0).toUpperCase()+v.slice(1))}</option>`
          ).join('')}
        </select>
        <button class="btn btn-primary" style="flex:1;min-width:120px;justify-content:center" onclick="updateFromDetail('${o.id}')">Update Status</button>
        <button class="btn btn-secondary" style="flex:1;min-width:120px;justify-content:center" onclick="printLabel(allOrders.find(x=>x.id==='${o.id}'))">Print Label</button>
      </div>

      ${markPaidRow}`;

    const modal = document.getElementById('orderDetailModal');
    modal.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
  }

  async function updateFromDetail(orderId) {
    const status = document.getElementById('odStatusSelect').value;
    await updateOrderStatus(orderId, status, null);
    openOrderDetail(orderId);
    renderTable(); renderCards();
  }

  function closeOrderDetail() {
    document.getElementById('orderDetailModal').setAttribute('hidden', '');
    document.body.style.overflow = '';
  }

  window.ShopAdminOrderDetail = {
    openOrderDetail,
    updateFromDetail,
    closeOrderDetail,
  };
})();
