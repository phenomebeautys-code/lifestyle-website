/* ─── MARKETING: discount codes and email campaigns ─────────────────────
   Everything here runs from the admin: create and switch off codes, share
   code links, set up review and running-low emails, preview them, send a
   test to yourself, see who is due, send now, and read the send log.
   The hourly schedule sends due campaign emails on its own once a
   campaign is switched on.
──────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const money = n => 'R' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const day = iso => iso ? new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const when = iso => iso ? new Date(iso).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const SHOP_LINK = 'https://www.phenomebeauty.co.za/shop?code=';

  async function call(action, payload) {
    const res = await callEdge({ action, password: window.ShopAdmin.adminToken, ...(payload || {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
    return data;
  }

  function openModal(title, html) {
    $('opsModalTitle').textContent = title;
    $('opsModalBody').innerHTML = html;
    $('opsModal').removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
  }

  /* ── Discount codes ─────────────────────────────────────────────── */

  let discounts = [];

  function offer(d) {
    if (d.kind === 'percent') return `${Number(d.value)}% off`;
    if (d.kind === 'fixed') return `${money(d.value)} off`;
    return 'Free delivery';
  }

  function conditions(d) {
    const parts = [];
    if (Number(d.min_subtotal) > 0) parts.push(`orders from ${money(d.min_subtotal)}`);
    if (d.starts_at) parts.push(`from ${day(d.starts_at)}`);
    if (d.ends_at) parts.push(`until ${day(d.ends_at)}`);
    if (d.max_uses) parts.push(`${d.max_uses} uses`);
    if (d.once_per_customer) parts.push('once per customer');
    return parts.join(' · ') || 'No conditions';
  }

  function status(d) {
    const now = Date.now();
    if (!d.active) return ['Off', 'badge-unpaid'];
    if (d.ends_at && now >= new Date(d.ends_at).getTime()) return ['Expired', 'badge-cancelled'];
    if (d.starts_at && now < new Date(d.starts_at).getTime()) return ['Scheduled', 'badge-processing'];
    if (d.max_uses && d.stats.orders >= d.max_uses) return ['Used up', 'badge-cancelled'];
    return ['Live', 'badge-paid'];
  }

  async function loadDiscounts() {
    const body = $('discountsBody');
    body.innerHTML = '<tr class="empty-row"><td colspan="7"><span class="spinner"></span>Loading…</td></tr>';
    try {
      discounts = (await call('get_discounts')).discounts || [];
      renderDiscounts();
    } catch (err) {
      body.innerHTML = `<tr class="empty-row"><td colspan="7">${esc(err.message)}</td></tr>`;
    }
  }

  function renderDiscounts() {
    const body = $('discountsBody');
    if (!discounts.length) {
      body.innerHTML = '<tr class="empty-row"><td colspan="7">No discount codes yet. Create one to share on Instagram, WhatsApp or in your emails.</td></tr>';
      return;
    }
    body.innerHTML = discounts.map(d => {
      const [label, cls] = status(d);
      return `<tr>
        <td><div class="mk-code">${esc(d.code)}</div>${d.campaign ? `<div class="ops-hint">${esc(d.campaign)}</div>` : ''}</td>
        <td>${offer(d)}</td>
        <td class="ops-hint" style="max-width:220px">${esc(conditions(d))}</td>
        <td>${d.stats.orders}${d.max_uses ? ` / ${d.max_uses}` : ''}</td>
        <td style="white-space:nowrap"><strong style="color:var(--accent)">${money(d.stats.sales)}</strong><div class="ops-hint">${money(d.stats.discount_given)} given</div></td>
        <td><span class="badge ${cls}">${label}</span></td>
        <td style="white-space:nowrap">
          <button class="btn btn-secondary mk-sm" data-edit="${esc(d.id)}">Edit</button>
          <button class="btn btn-secondary mk-sm" data-copy="${esc(d.code)}">Copy link</button>
        </td>
      </tr>`;
    }).join('');
    body.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openDiscount(discounts.find(d => String(d.id) === b.dataset.edit))));
    body.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => copy(SHOP_LINK + b.dataset.copy)));
  }

  function copy(text) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
      .then(() => showToast('Link copied: ' + text))
      .catch(() => { prompt('Copy this link:', text); });
  }

  // Dates are shown as South African calendar days.
  const toDateInput = iso => iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' }) : '';

  function openDiscount(d) {
    const editing = !!d;
    d = d || { kind: 'percent', value: 10, min_subtotal: 0, active: true, once_per_customer: false };
    openModal(editing ? `Edit ${d.code}` : 'New discount code', `
      <div class="ops-form mk-form">
        <label class="field-label" for="dcCode">Code</label>
        <input class="field-input mk-upper" id="dcCode" maxlength="30" value="${esc(d.code || '')}" placeholder="e.g. WELCOME10" ${editing ? 'readonly' : ''} />
        ${editing ? '<div class="ops-hint">Codes cannot be renamed once created. Create a new one instead.</div>' : ''}
        <label class="field-label" for="dcKind">Discount</label>
        <select class="field-input" id="dcKind">
          <option value="percent"${d.kind === 'percent' ? ' selected' : ''}>Percentage off products</option>
          <option value="fixed"${d.kind === 'fixed' ? ' selected' : ''}>Rand amount off products</option>
          <option value="free_delivery"${d.kind === 'free_delivery' ? ' selected' : ''}>Free delivery</option>
        </select>
        <div id="dcValueWrap">
          <label class="field-label" for="dcValue" id="dcValueLabel">Percentage off (1 to 90)</label>
          <input class="field-input" id="dcValue" type="number" min="1" step="1" value="${d.kind === 'free_delivery' ? '' : esc(d.value)}" />
        </div>
        <label class="field-label" for="dcMin">Minimum order, before delivery (R, optional)</label>
        <input class="field-input" id="dcMin" type="number" min="0" step="1" value="${Number(d.min_subtotal) > 0 ? esc(d.min_subtotal) : ''}" />
        <div class="mk-two">
          <div><label class="field-label" for="dcStart">Starts (optional)</label><input class="field-input" id="dcStart" type="date" value="${toDateInput(d.starts_at)}" /></div>
          <div><label class="field-label" for="dcEnd">Ends after (optional)</label><input class="field-input" id="dcEnd" type="date" value="${d.ends_at ? toDateInput(new Date(new Date(d.ends_at).getTime() - 1).toISOString()) : ''}" /></div>
        </div>
        <label class="field-label" for="dcMax">Total uses (optional)</label>
        <input class="field-input" id="dcMax" type="number" min="1" step="1" value="${d.max_uses || ''}" placeholder="No limit" />
        <label class="ops-switch"><input type="checkbox" id="dcOnce" ${d.once_per_customer ? 'checked' : ''}/> <span>One use per customer (by email)</span></label>
        <label class="ops-switch"><input type="checkbox" id="dcActive" ${d.active !== false ? 'checked' : ''}/> <span>Live (shoppers can use it)</span></label>
        <label class="field-label" for="dcCampaign">Campaign label (optional, for your records)</label>
        <input class="field-input" id="dcCampaign" maxlength="80" value="${esc(d.campaign || '')}" placeholder="e.g. Instagram November" />
        <label class="field-label" for="dcNote">Note (optional)</label>
        <input class="field-input" id="dcNote" maxlength="500" value="${esc(d.note || '')}" />
        <div class="ops-hint">Discounts apply to products only, never to delivery, and always leave at least R10 to pay.</div>
        <div class="ops-row" style="margin-top:8px">
          <button class="btn btn-primary" id="dcSave">${editing ? 'Save' : 'Create code'}</button>
          ${editing && d.stats.orders === 0 && d.stats.unpaid === 0 ? '<button class="btn btn-secondary ops-danger" id="dcDelete">Delete</button>' : ''}
        </div>
      </div>`);
    const syncKind = () => {
      const k = $('dcKind').value;
      $('dcValueWrap').hidden = k === 'free_delivery';
      $('dcValueLabel').textContent = k === 'percent' ? 'Percentage off (1 to 90)' : 'Rand amount off';
    };
    $('dcKind').addEventListener('change', syncKind);
    syncKind();
    $('dcSave').addEventListener('click', async () => {
      const endDate = $('dcEnd').value;
      const payload = {
        id: editing ? d.id : undefined,
        code: $('dcCode').value,
        kind: $('dcKind').value,
        value: $('dcValue').value,
        min_subtotal: $('dcMin').value,
        // Dates are whole days in South African time: from the start of the start day to the end of the end day.
        starts_at: $('dcStart').value ? `${$('dcStart').value}T00:00:00+02:00` : null,
        ends_at: endDate ? new Date(new Date(`${endDate}T00:00:00+02:00`).getTime() + 86_400_000).toISOString() : null,
        max_uses: $('dcMax').value,
        once_per_customer: $('dcOnce').checked,
        active: $('dcActive').checked,
        campaign: $('dcCampaign').value,
        note: $('dcNote').value,
      };
      $('dcSave').disabled = true;
      try {
        await call('save_discount', { discount: payload });
        window.ShopAdminOps.closeOpsModal();
        showToast(editing ? 'Code saved.' : `Code ${payload.code.toUpperCase()} created.`);
        loadDiscounts();
      } catch (err) {
        showToast(err.message, true);
        $('dcSave').disabled = false;
      }
    });
    if ($('dcDelete')) $('dcDelete').addEventListener('click', async () => {
      if (!confirm(`Delete ${d.code}? This cannot be undone.`)) return;
      try { await call('delete_discount', { id: d.id }); window.ShopAdminOps.closeOpsModal(); showToast('Code deleted.'); loadDiscounts(); }
      catch (err) { showToast(err.message, true); }
    });
  }

  /* ── Email campaigns ────────────────────────────────────────────── */

  const INFO = {
    review_request: {
      title: 'Review request',
      what: 'Asks customers for a Google review a set number of days after they paid. Skips fully refunded orders.',
      delayLabel: 'Days after payment',
    },
    replenishment: {
      title: 'Running low reminder',
      what: 'Reminds customers to restock a set number of days after they paid. Skips customers who have already ordered again. You can add a discount code.',
      delayLabel: 'Days after payment',
    },
  };
  let campaignData = null;

  async function loadCampaigns() {
    $('campaignCards').innerHTML = '<div class="ops-empty"><span class="spinner"></span>Loading…</div>';
    try {
      const [data, disc] = await Promise.all([call('get_campaigns'), call('get_discounts').catch(() => ({ discounts: [] }))]);
      campaignData = data;
      discounts = disc.discounts || discounts;
      renderCampaigns();
    } catch (err) {
      $('campaignCards').innerHTML = `<div class="ops-empty">${esc(err.message)}</div>`;
    }
  }

  function settingsFrom(key) {
    const s = {
      delay_days: $(`cg-${key}-delay`).value,
      subject: $(`cg-${key}-subject`).value,
      heading: $(`cg-${key}-heading`).value,
      body: $(`cg-${key}-body`).value,
      button_label: $(`cg-${key}-button`).value,
      link: $(`cg-${key}-link`).value,
    };
    if (key === 'replenishment') s.discount_code = $(`cg-${key}-code`).value || null;
    return s;
  }

  function renderCampaigns() {
    const { campaigns, sends, optouts } = campaignData;
    const byKey = Object.fromEntries(campaigns.map(c => [c.key, c]));
    $('campaignOptouts').textContent = `${optouts} customer${optouts === 1 ? ' has' : 's have'} unsubscribed from campaign emails. Order emails still reach them.`;
    $('campaignCards').innerHTML = ['review_request', 'replenishment'].map(key => {
      const c = byKey[key] || { key, enabled: false, settings: {} };
      const s = c.settings || {};
      const counts = sends.filter(x => x.campaign === key).reduce((a, x) => { a[x.status] = (a[x.status] || 0) + 1; return a; }, {});
      const codeOptions = key === 'replenishment' ? `
        <label class="field-label" for="cg-${key}-code">Discount code to include (optional)</label>
        <select class="field-input" id="cg-${key}-code">
          <option value="">No code</option>
          ${discounts.map(d => `<option value="${esc(d.code)}"${s.discount_code === d.code ? ' selected' : ''}>${esc(d.code)} · ${esc(offer(d))}${d.active ? '' : ' (off)'}</option>`).join('')}
        </select>` : '';
      return `<div class="panel ops-panel mk-campaign" data-key="${key}">
        <div class="mk-campaign-head">
          <div>
            <div class="panel-title">${INFO[key].title}</div>
            <p class="ops-hint" style="margin-top:6px">${INFO[key].what}</p>
          </div>
          <span class="badge ${c.enabled ? 'badge-paid' : 'badge-unpaid'}">${c.enabled ? 'On since ' + day(c.enabled_at) : 'Off'}</span>
        </div>
        <div class="ops-form mk-form">
          <label class="ops-switch"><input type="checkbox" id="cg-${key}-on" ${c.enabled ? 'checked' : ''}/> <span>Send automatically (checked every hour)</span></label>
          <label class="field-label" for="cg-${key}-delay">${INFO[key].delayLabel}</label>
          <input class="field-input" id="cg-${key}-delay" type="number" min="1" max="365" value="${esc(s.delay_days ?? '')}" />
          <label class="field-label" for="cg-${key}-subject">Email subject</label>
          <input class="field-input" id="cg-${key}-subject" maxlength="150" value="${esc(s.subject || '')}" />
          <label class="field-label" for="cg-${key}-heading">Heading</label>
          <input class="field-input" id="cg-${key}-heading" maxlength="120" value="${esc(s.heading || '')}" />
          <label class="field-label" for="cg-${key}-body">Message</label>
          <textarea class="field-input" id="cg-${key}-body" rows="7" maxlength="3000">${esc(s.body || '')}</textarea>
          <div class="ops-hint">You can use {first_name}, {products}, {first_product}${key === 'replenishment' ? ', {code} and {offer}' : ''}. Leave a blank line between paragraphs.</div>
          <div class="mk-two">
            <div><label class="field-label" for="cg-${key}-button">Button text</label><input class="field-input" id="cg-${key}-button" maxlength="40" value="${esc(s.button_label || '')}" /></div>
            <div><label class="field-label" for="cg-${key}-link">Button link</label><input class="field-input" id="cg-${key}-link" value="${esc(s.link || '')}" /></div>
          </div>
          ${codeOptions}
          <div class="ops-row mk-actions">
            <button class="btn btn-primary" data-act="save">Save</button>
            <button class="btn btn-secondary" data-act="preview">Preview</button>
            <button class="btn btn-secondary" data-act="test">Send test to me</button>
            <button class="btn btn-secondary" data-act="due">Who is due?</button>
          </div>
          <div class="ops-hint" id="cg-${key}-status">Sent: ${counts.sent || 0} · Failed: ${counts.failed || 0} · Tests: ${counts.test || 0}${counts.failed ? ' · <button class="mk-link" data-act="retry">Retry failed</button>' : ''}</div>
        </div>
      </div>`;
    }).join('');

    $('campaignCards').querySelectorAll('.mk-campaign').forEach(card => {
      const key = card.dataset.key;
      card.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', () => campaignAction(key, btn.dataset.act, btn)));
    });

    $('campaignLog').innerHTML = sends.length ? sends.map(x => `<tr>
      <td style="white-space:nowrap;color:var(--text-muted)">${when(x.sent_at)}</td>
      <td>${INFO[x.campaign] ? INFO[x.campaign].title : esc(x.campaign)}</td>
      <td>${esc(x.email)}</td>
      <td><span class="badge ${x.status === 'sent' ? 'badge-paid' : x.status === 'failed' ? 'badge-cancelled' : 'badge-processing'}">${x.status === 'test' ? 'Test' : x.status === 'sent' ? 'Sent' : 'Failed'}</span></td>
      <td class="ops-hint">${esc(x.detail || '')}</td></tr>`).join('')
      : '<tr class="empty-row"><td colspan="5">Nothing sent yet.</td></tr>';
  }

  async function campaignAction(key, act, btn) {
    btn.disabled = true;
    try {
      if (act === 'save') {
        const enabled = $(`cg-${key}-on`).checked;
        const was = campaignData.campaigns.find(c => c.key === key);
        if (enabled && !(was && was.enabled) && !confirm(`Switch on the ${INFO[key].title.toLowerCase()}? It emails customers whose orders are paid from now on, ${$(`cg-${key}-delay`).value} days after payment. Earlier customers are not emailed.`)) { $(`cg-${key}-on`).checked = false; return; }
        await call('save_campaign', { key, enabled, settings: settingsFrom(key) });
        showToast(enabled ? `${INFO[key].title} saved and on.` : `${INFO[key].title} saved. It is off.`);
        await loadCampaigns();
      } else if (act === 'preview') {
        const data = await call('campaign_tool', { mode: 'preview', key, settings: settingsFrom(key) });
        openModal(`Preview: ${data.subject}`, `<div class="ops-hint" style="margin-bottom:10px">Shown with a sample customer.${key === 'replenishment' && settingsFrom(key).discount_code && !data.discount_applied ? ' The chosen code is off or expired, so it is left out.' : ''}</div><iframe class="mk-preview" title="Email preview" sandbox=""></iframe>`);
        document.querySelector('.mk-preview').srcdoc = data.html;
      } else if (act === 'test') {
        const data = await call('campaign_tool', { mode: 'test', key, settings: settingsFrom(key) });
        showToast(`Test sent to ${data.sent_to}.`);
        await loadCampaigns();
      } else if (act === 'due') {
        const data = await call('campaign_tool', { mode: 'dry_run', key });
        const r = (data.results || {})[key] || {};
        if (r.skipped === 'off') { showToast('This campaign is off. Switch it on and save first.', true); return; }
        const list = (r.orders || []).map(o => `<li>${esc(o.email)}</li>`).join('');
        openModal(`${INFO[key].title}: due now`, `
          <p class="ops-help">${r.due || 0} email${r.due === 1 ? '' : 's'} due now${r.skipped ? `, ${r.skipped} skipped (unsubscribed, refunded or already reordered)` : ''}. The hourly run sends these automatically.</p>
          ${list ? `<ul class="mk-due">${list}</ul><button class="btn btn-primary" id="cgSendNow">Send these now</button>` : ''}`);
        if ($('cgSendNow')) $('cgSendNow').addEventListener('click', async () => {
          if (!confirm(`Send ${r.due} email${r.due === 1 ? '' : 's'} now?`)) return;
          $('cgSendNow').disabled = true;
          try {
            const out = await call('campaign_tool', { mode: 'run', key });
            const res = (out.results || {})[key] || {};
            window.ShopAdminOps.closeOpsModal();
            showToast(`Sent ${res.sent || 0}${res.failed && res.failed.length ? `, ${res.failed.length} failed` : ''}.`, !!(res.failed && res.failed.length));
            loadCampaigns();
          } catch (err) { showToast(err.message, true); $('cgSendNow').disabled = false; }
        });
      } else if (act === 'retry') {
        await call('retry_failed_sends', { key });
        showToast('Failed emails will be tried again on the next hourly run.');
        await loadCampaigns();
      }
    } catch (err) {
      showToast(err.message, true);
    } finally {
      btn.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('newDiscountBtn').addEventListener('click', () => openDiscount(null));
  });

  window.ShopAdminMarketing = { loadDiscounts, loadCampaigns };
})();
