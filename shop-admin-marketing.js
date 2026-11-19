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
    const personal = discounts.filter(d => d.customer_email);
    const toggle = $('showPersonalCodes');
    if (toggle) toggle.closest('label').hidden = !personal.length;
    if ($('personalCount')) $('personalCount').textContent = personal.length;
    const list = toggle && toggle.checked ? discounts : discounts.filter(d => !d.customer_email);
    if (!list.length) {
      body.innerHTML = '<tr class="empty-row"><td colspan="7">No discount codes yet. Create one to share on Instagram, WhatsApp or in your emails.</td></tr>';
      return;
    }
    body.innerHTML = list.map(d => {
      const [label, cls] = status(d);
      return `<tr>
        <td><div class="mk-code">${esc(d.code)}</div>${d.campaign ? `<div class="ops-hint">${esc(d.campaign)}</div>` : ''}${d.customer_email ? `<div class="ops-hint">Only for ${esc(d.customer_email)}</div>` : ''}</td>
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
    loyalty_reward: {
      title: 'Loyalty reward',
      what: 'Thanks regular customers with a personal, single-use code that only works with their email. Earned every few orders, or each time their total spend passes an amount you choose.',
      delayLabel: 'Days after the order that earns it',
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
    if (key === 'loyalty_reward') Object.assign(s, {
      trigger: $('cg-loyalty_reward-trigger').value,
      every: $('cg-loyalty_reward-every').value,
      reward_kind: $('cg-loyalty_reward-kind').value,
      reward_value: $('cg-loyalty_reward-value').value,
      valid_days: $('cg-loyalty_reward-valid').value,
    });
    return s;
  }

  function renderCampaigns() {
    const { campaigns, sends, optouts } = campaignData;
    const byKey = Object.fromEntries(campaigns.map(c => [c.key, c]));
    $('campaignOptouts').textContent = `${optouts} customer${optouts === 1 ? ' has' : 's have'} unsubscribed from campaign emails. Order emails still reach them.`;
    $('campaignCards').innerHTML = ['review_request', 'replenishment', 'loyalty_reward'].map(key => {
      const c = byKey[key] || { key, enabled: false, settings: {} };
      const s = c.settings || {};
      const counts = sends.filter(x => x.campaign === key).reduce((a, x) => { a[x.status] = (a[x.status] || 0) + 1; return a; }, {});
      const codeOptions = key === 'replenishment' ? `
        <label class="field-label" for="cg-${key}-code">Discount code to include (optional)</label>
        <select class="field-input" id="cg-${key}-code">
          <option value="">No code</option>
          ${discounts.map(d => `<option value="${esc(d.code)}"${s.discount_code === d.code ? ' selected' : ''}>${esc(d.code)} · ${esc(offer(d))}${d.active ? '' : ' (off)'}</option>`).join('')}
        </select>` : '';
      const rewardFields = key === 'loyalty_reward' ? `
        <div class="mk-two">
          <div><label class="field-label" for="cg-${key}-trigger">Earned</label>
            <select class="field-input" id="cg-${key}-trigger">
              <option value="orders"${s.trigger !== 'spend' ? ' selected' : ''}>Every few orders</option>
              <option value="spend"${s.trigger === 'spend' ? ' selected' : ''}>Each time total spend passes an amount</option>
            </select></div>
          <div><label class="field-label" for="cg-${key}-every" id="cg-${key}-every-label">${s.trigger === 'spend' ? 'Spend amount (R)' : 'Every how many orders'}</label>
            <input class="field-input" id="cg-${key}-every" type="number" min="2" value="${esc(s.every ?? '')}" /></div>
        </div>
        <div class="mk-two">
          <div><label class="field-label" for="cg-${key}-kind">Reward</label>
            <select class="field-input" id="cg-${key}-kind">
              <option value="percent"${s.reward_kind === 'percent' ? ' selected' : ''}>Percentage off</option>
              <option value="fixed"${s.reward_kind === 'fixed' ? ' selected' : ''}>Rand amount off</option>
              <option value="free_delivery"${s.reward_kind === 'free_delivery' ? ' selected' : ''}>Free delivery</option>
            </select></div>
          <div><label class="field-label" for="cg-${key}-value">Value (% or R)</label>
            <input class="field-input" id="cg-${key}-value" type="number" min="1" value="${esc(s.reward_kind === 'free_delivery' ? '' : (s.reward_value ?? ''))}" /></div>
        </div>
        <label class="field-label" for="cg-${key}-valid">Code valid for (days)</label>
        <input class="field-input" id="cg-${key}-valid" type="number" min="7" max="365" value="${esc(s.valid_days ?? '')}" />` : '';
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
          ${rewardFields}
          <label class="field-label" for="cg-${key}-delay">${INFO[key].delayLabel}</label>
          <input class="field-input" id="cg-${key}-delay" type="number" min="1" max="365" value="${esc(s.delay_days ?? '')}" />
          <label class="field-label" for="cg-${key}-subject">Email subject</label>
          <input class="field-input" id="cg-${key}-subject" maxlength="150" value="${esc(s.subject || '')}" />
          <label class="field-label" for="cg-${key}-heading">Heading</label>
          <input class="field-input" id="cg-${key}-heading" maxlength="120" value="${esc(s.heading || '')}" />
          <label class="field-label" for="cg-${key}-body">Message</label>
          <textarea class="field-input" id="cg-${key}-body" rows="7" maxlength="3000">${esc(s.body || '')}</textarea>
          <div class="ops-hint">You can use {first_name}, {products}, {first_product}${key !== 'review_request' ? ', {code} and {offer}' : ''}. Leave a blank line between paragraphs.</div>
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
          <div class="ops-hint" id="cg-${key}-status">Sent: ${counts.sent || 0} · Failed: ${counts.failed || 0} · Tests: ${counts.test || 0}${counts.skipped ? ' · Not emailed: ' + counts.skipped : ''}${counts.failed ? ' · <button class="mk-link" data-act="retry">Retry failed</button>' : ''}</div>
        </div>
      </div>`;
    }).join('');

    $('campaignCards').querySelectorAll('.mk-campaign').forEach(card => {
      const key = card.dataset.key;
      card.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', () => campaignAction(key, btn.dataset.act, btn)));
      if (key === 'loyalty_reward') {
        const sync = () => {
          $('cg-loyalty_reward-every-label').textContent = $('cg-loyalty_reward-trigger').value === 'spend' ? 'Spend amount (R)' : 'Every how many orders';
          $('cg-loyalty_reward-value').disabled = $('cg-loyalty_reward-kind').value === 'free_delivery';
        };
        $('cg-loyalty_reward-trigger').addEventListener('change', sync);
        $('cg-loyalty_reward-kind').addEventListener('change', sync);
        sync();
      }
    });

    const logged = sends.filter(x => x.status !== 'skipped');
    $('campaignLog').innerHTML = logged.length ? logged.map(x => `<tr>
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

  /* ── Product feeds ─────────────────────────────────────────────── */

  const FEED_URL = 'https://papdxjcfimeyjgzmatpl.supabase.co/functions/v1/product-feed';

  async function loadFeeds() {
    $('feedUrl').value = FEED_URL;
    const body = $('feedBody');
    body.innerHTML = '<tr class="empty-row"><td colspan="4"><span class="spinner"></span>Loading…</td></tr>';
    try {
      const res = await fetch(FEED_URL + '?format=json', { cache: 'no-store' });
      if (!res.ok) throw new Error('The feed could not be loaded.');
      const { items, skipped } = await res.json();
      const inStock = items.filter(i => i.availability === 'in_stock').length;
      $('feedSummary').textContent = `${items.length} listing${items.length === 1 ? '' : 's'} · ${inStock} in stock · ${items.length - inStock} out of stock`;
      body.innerHTML = items.length ? items.map(i => `<tr>
        <td><img class="feed-thumb" src="${esc(i.image_link)}" alt="" loading="lazy" /></td>
        <td><div style="font-weight:600;color:var(--accent-strong)">${esc(i.title)}</div><div class="ops-hint">${esc(i.product_type)} · ${esc(i.id)}</div></td>
        <td style="white-space:nowrap">${esc(i.price.replace(' ZAR', '').replace(/^/, 'R'))}</td>
        <td><span class="badge ${i.availability === 'in_stock' ? 'badge-paid' : 'badge-unpaid'}">${i.availability === 'in_stock' ? 'In stock' : 'Out of stock'}</span></td>
      </tr>`).join('') : '<tr class="empty-row"><td colspan="4">No products can be listed yet.</td></tr>';
      $('feedSkipped').innerHTML = skipped.length
        ? '<strong>Not listed:</strong> ' + skipped.map(x => `${esc(x.name)} (${esc(x.reason.toLowerCase())})`).join(', ') + '. They are added automatically once they are available with a price.'
        : '';
    } catch (err) {
      body.innerHTML = `<tr class="empty-row"><td colspan="4">${esc(err.message)}</td></tr>`;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('newDiscountBtn').addEventListener('click', () => openDiscount(null));
    $('feedCopy').addEventListener('click', () => copy(FEED_URL));
    $('showPersonalCodes').addEventListener('change', renderDiscounts);
  });

  window.ShopAdminMarketing = { loadDiscounts, loadCampaigns, loadFeeds };
})();

/* ─── GIFT CARDS ─────────────────────────────────────────────────────────
   Online sales on/off and amounts, issue cards, top up or correct balances,
   switch cards off, resend the email, and see each card's history.
──────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const money = n => 'R' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const day = iso => iso ? new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const when = iso => iso ? new Date(iso).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const KIND = { issue: 'Issued', hold: 'Used at checkout', release: 'Given back', adjust: 'Correction', topup: 'Top-up' };

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

  let cards = [];

  async function load() {
    $('gcBody').innerHTML = '<tr class="empty-row"><td colspan="6"><span class="spinner"></span>Loading…</td></tr>';
    try {
      const data = await call('get_gift_cards');
      cards = data.cards || [];
      $('gcSummary').textContent = `${data.live} live card${data.live === 1 ? '' : 's'} · ${money(data.outstanding)} still to be spent`;
      $('gcOnline').checked = data.settings.enabled;
      showSaleState(data.settings.enabled);
      $('gcAmountsInput').value = data.settings.amounts.join(', ');
      render();
    } catch (err) {
      $('gcBody').innerHTML = `<tr class="empty-row"><td colspan="6">${esc(err.message)}</td></tr>`;
    }
  }

  function status(c) {
    if (c.status !== 'active') return ['Off', 'badge-cancelled'];
    if (new Date(c.expires_at) <= new Date()) return ['Expired', 'badge-cancelled'];
    if (Number(c.balance) <= 0) return ['Spent', 'badge-unpaid'];
    return ['Live', 'badge-paid'];
  }

  function render() {
    $('gcBody').innerHTML = cards.length ? cards.map(c => {
      const [label, cls] = status(c);
      return `<tr class="ops-click" data-card="${esc(c.id)}">
        <td><div class="mk-code">•••• ${esc(c.last4)}</div><div class="ops-hint">${c.source === 'online' ? 'Bought online' : 'Issued by ' + esc(c.created_by || 'admin')} · ${day(c.created_at)}</div></td>
        <td>${esc(c.recipient_name || '—')}<div class="ops-hint">${esc(c.recipient_email || '')}</div></td>
        <td style="white-space:nowrap"><strong style="color:var(--accent)">${money(c.balance)}</strong><div class="ops-hint">of ${money(c.initial_amount)}</div></td>
        <td style="white-space:nowrap">${day(c.expires_at)}</td>
        <td>${c.emailed_at ? '<span class="ops-hint">Emailed ' + day(c.emailed_at) + '</span>' : '<span class="ops-hint">Not emailed</span>'}</td>
        <td><span class="badge ${cls}">${label}</span></td>
      </tr>`;
    }).join('') : '<tr class="empty-row"><td colspan="6">No gift cards yet.</td></tr>';
    $('gcBody').querySelectorAll('tr[data-card]').forEach(tr => tr.addEventListener('click', () => openCard(tr.dataset.card)));
  }

  function showSaleState(on) {
    $('gcSaleState').textContent = on ? 'On sale' : 'Off';
    $('gcSaleState').className = 'badge ' + (on ? 'badge-delivered' : 'badge-cancelled');
    $('gcSaleHint').textContent = on
      ? 'On: anyone can buy a gift card at phenomebeauty.co.za/gift-cards.'
      : 'Off: nobody can buy a gift card; the gift card page says they are coming soon. Cards already bought or issued can still be spent.';
  }

  // The switch saves straight away; the amounts are saved with their own button.
  async function saveSettings(fromSwitch) {
    const amounts = $('gcAmountsInput').value.split(/[,\s]+/).map(Number).filter(Boolean);
    const wanted = $('gcOnline').checked;
    $('gcSaveSettings').disabled = true;
    $('gcOnline').disabled = true;
    try {
      const data = await call('save_gift_card_settings', { settings: { enabled: wanted, amounts } });
      $('gcOnline').checked = data.settings.enabled;
      $('gcAmountsInput').value = data.settings.amounts.join(', ');
      showSaleState(data.settings.enabled);
      showToast(fromSwitch === true
        ? (data.settings.enabled ? 'Gift cards are on sale at phenomebeauty.co.za/gift-cards.' : 'Gift cards are off. Nobody can buy one now.')
        : 'Amounts saved.');
    } catch (err) {
      if (fromSwitch === true) $('gcOnline').checked = !wanted;
      showToast(err.message, true);
    }
    $('gcSaveSettings').disabled = false;
    $('gcOnline').disabled = false;
  }

  function openIssue() {
    openModal('Issue a gift card', `
      <div class="ops-form mk-form">
        <label class="field-label" for="giAmount">Amount (R)</label>
        <input class="field-input" id="giAmount" type="number" min="10" step="1" placeholder="e.g. 500" />
        <label class="field-label" for="giName">Recipient name</label>
        <input class="field-input" id="giName" maxlength="120" />
        <label class="field-label" for="giEmail">Recipient email (optional if you hand it over yourself)</label>
        <input class="field-input" id="giEmail" type="email" maxlength="254" />
        <label class="field-label" for="giFrom">From (optional)</label>
        <input class="field-input" id="giFrom" maxlength="120" placeholder="e.g. Phenomebeauty" />
        <label class="field-label" for="giMessage">Message (optional)</label>
        <textarea class="field-input" id="giMessage" rows="3" maxlength="500"></textarea>
        <label class="ops-switch"><input type="checkbox" id="giSend" checked /> <span>Email the card to the recipient now</span></label>
        <div class="ops-hint">Valid for 3 years from today. Use this for cards sold in person, prizes or goodwill.</div>
        <button class="btn btn-primary" id="giIssue">Issue card</button>
      </div>`);
    $('giIssue').addEventListener('click', async () => {
      $('giIssue').disabled = true;
      try {
        const data = await call('issue_gift_card', {
          amount: $('giAmount').value, recipient_name: $('giName').value, recipient_email: $('giEmail').value,
          sender_name: $('giFrom').value, message: $('giMessage').value, send_email: $('giSend').checked,
        });
        const emailed = data.emailed ? (data.emailed.ok ? ' and emailed' : ', but the email failed: ' + data.emailed.error) : '';
        openModal('Gift card issued', `
          <p class="ops-help">Card for ${money(data.card.initial_amount)} created${esc(emailed)}.</p>
          <div class="gc-admin-code">${esc(data.card.code)}</div>
          <p class="ops-hint">Valid until ${day(data.card.expires_at)}. You can see this code again by opening the card.</p>`);
        load();
      } catch (err) {
        showToast(err.message, true);
        $('giIssue').disabled = false;
      }
    });
  }

  async function openCard(id) {
    openModal('Gift card', '<div class="ops-empty"><span class="spinner"></span>Loading…</div>');
    try {
      const { card, ledger } = await call('get_gift_card', { card_id: id });
      const [label, cls] = status(card);
      $('opsModalTitle').textContent = `Gift card •••• ${card.code.slice(-4)}`;
      $('opsModalBody').innerHTML = `
        <div class="gc-admin-code">${esc(card.code)}</div>
        <div class="ops-row" style="justify-content:space-between;margin-bottom:12px">
          <div><strong style="font-size:1.3rem;color:var(--accent)">${money(card.balance)}</strong> <span class="ops-hint">of ${money(card.initial_amount)}</span></div>
          <span class="badge ${cls}">${label}</span>
        </div>
        <p class="ops-hint">For ${esc(card.recipient_name || 'no name')}${card.recipient_email ? ' · ' + esc(card.recipient_email) : ''}${card.sender_name ? ' · from ' + esc(card.sender_name) : ''}. Valid until ${day(card.expires_at)}.</p>
        ${card.message ? `<p class="ops-help">“${esc(card.message)}”</p>` : ''}
        <div class="ops-block" style="margin-top:18px">
          <div class="ops-label">Change the balance</div>
          <div class="mk-two">
            <div><label class="field-label" for="gaKind">Type</label><select class="field-input" id="gaKind"><option value="topup">Top-up (add)</option><option value="adjust">Correction (add or take off)</option></select></div>
            <div><label class="field-label" for="gaAmount">Amount (R, use minus to take off)</label><input class="field-input" id="gaAmount" type="number" step="0.01" /></div>
          </div>
          <label class="field-label" for="gaNote">Note</label>
          <input class="field-input" id="gaNote" maxlength="300" placeholder="e.g. Topped up for birthday" />
          <button class="btn btn-secondary" id="gaSave" style="margin-top:8px">Save change</button>
        </div>
        <div class="ops-row ops-actions" style="margin:14px 0 18px">
          <button class="btn btn-secondary" id="gcResend" ${card.recipient_email ? '' : 'disabled'}>Resend email</button>
          <button class="btn btn-secondary ${card.status === 'active' ? 'ops-danger' : ''}" id="gcToggle">${card.status === 'active' ? 'Switch off' : 'Switch back on'}</button>
        </div>
        <div class="ops-block">
          <div class="ops-label">History</div>
          <ol class="ops-timeline">${ledger.map(l => `<li class="ops-event"><div class="ops-event-msg">${KIND[l.kind] || l.kind}: ${Number(l.change) >= 0 ? '+' : '−'}${money(Math.abs(l.change))}${l.kind === 'hold' && l.hold_state ? ` (${l.hold_state === 'held' ? 'awaiting payment' : l.hold_state === 'redeemed' ? 'spent' : 'given back'})` : ''}${l.note ? ' · ' + esc(l.note) : ''}</div>
            <div class="ops-event-meta">${when(l.at)} · ${esc(l.actor || 'system')}${l.order_id ? ' · order #' + esc(String(l.order_id).slice(0, 8).toUpperCase()) : ''}</div></li>`).join('')}</ol>
        </div>`;
      $('gaSave').addEventListener('click', async () => {
        try {
          const out = await call('adjust_gift_card', { card_id: card.id, kind: $('gaKind').value, change: $('gaAmount').value, note: $('gaNote').value });
          showToast(`Balance is now ${money(out.balance)}.`);
          openCard(card.id); load();
        } catch (err) { showToast(err.message, true); }
      });
      $('gcResend').addEventListener('click', async () => {
        try { await call('resend_gift_card', { card_id: card.id }); showToast('Gift card email sent again.'); openCard(card.id); load(); }
        catch (err) { showToast(err.message, true); }
      });
      $('gcToggle').addEventListener('click', async () => {
        const off = card.status === 'active';
        if (off && !confirm('Switch this card off? It cannot be used until you switch it back on.')) return;
        try { await call('set_gift_card_status', { card_id: card.id, status: off ? 'disabled' : 'active' }); showToast(off ? 'Card switched off.' : 'Card switched back on.'); openCard(card.id); load(); }
        catch (err) { showToast(err.message, true); }
      });
    } catch (err) {
      $('opsModalBody').innerHTML = `<div class="ops-empty">${esc(err.message)}</div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('gcIssueBtn').addEventListener('click', openIssue);
    $('gcSaveSettings').addEventListener('click', () => saveSettings(false));
    $('gcOnline').addEventListener('change', () => saveSettings(true));
  });

  window.ShopAdminGiftCards = { load };
})();
