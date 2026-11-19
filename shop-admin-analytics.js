/* ─── ANALYTICS: sales, drop-off funnel, channels, products ─────────────
   Data comes from shop-admin `get_analytics`, worked out in the database
   (admin_sales_report). Visit data comes from track.js on the public site.
   Each figure is compared with the same-length period just before it.
──────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const fmtR = n => 'R' + Math.round(Number(n || 0)).toLocaleString('en-ZA');
  const fmtR2 = n => 'R' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtN = n => Number(n || 0).toLocaleString('en-ZA');
  const pct = (a, b) => (b > 0 ? (a / b) * 100 : null);
  const fmtPct = v => (v == null ? '—' : (v < 10 ? v.toFixed(1) : Math.round(v)) + '%');

  const CHANNEL_LABELS = {
    direct: 'Direct', search: 'Google & search', social: 'Social media', email: 'Email',
    paid: 'Paid ads', referral: 'Other websites', whatsapp: 'WhatsApp', untracked: 'Before tracking / not tracked',
  };

  let days = 30;
  let loading = false;

  function delta(cur, prev, { invert = false, money = false } = {}) {
    if (prev == null || cur == null) return '';
    if (!prev && !cur) return '<span class="an-delta">no change</span>';
    if (!prev) return '<span class="an-delta an-up">new</span>';
    const change = ((cur - prev) / Math.abs(prev)) * 100;
    if (Math.abs(change) < 0.5) return '<span class="an-delta">no change</span>';
    const good = invert ? change < 0 : change > 0;
    const arrow = change > 0 ? '▲' : '▼';
    return `<span class="an-delta ${good ? 'an-up' : 'an-down'}">${arrow} ${Math.abs(change) < 10 ? Math.abs(change).toFixed(1) : Math.round(Math.abs(change))}%</span>`;
  }

  function tile(label, value, deltaHTML, hint) {
    return `<div class="stat-card an-tile">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
      <div class="an-tile-foot">${deltaHTML || ''}${hint ? `<span class="an-hint">${hint}</span>` : ''}</div>
    </div>`;
  }

  function renderTiles(c, p) {
    const t = c.totals, pt = p.totals;
    const conv = pct(c.funnel.purchased, c.funnel.sessions);
    const pconv = pct(p.funnel.purchased, p.funnel.sessions);
    const ret = pct(t.returning_orders, t.orders);
    const pret = pct(pt.returning_orders, pt.orders);
    $('anTiles').innerHTML = [
      tile('Net sales', fmtR(t.revenue), delta(t.revenue, pt.revenue), t.refunds > 0 ? `after ${fmtR(t.refunds)} refunds` : ''),
      tile('Paid orders', fmtN(t.orders), delta(t.orders, pt.orders)),
      tile('Average order', fmtR2(t.aov), delta(t.aov, pt.aov)),
      tile('Visits', fmtN(c.funnel.sessions), delta(c.funnel.sessions, p.funnel.sessions)),
      tile('Conversion rate', fmtPct(conv), conv != null && pconv != null ? delta(conv, pconv) : '', 'visits that bought'),
      tile('Returning customers', fmtPct(ret), ret != null && pret != null ? delta(ret, pret) : '', `${fmtN(t.returning_orders)} of ${fmtN(t.orders)} orders`),
    ].join('');
  }

  function renderFunnel(c) {
    const f = c.funnel;
    const steps = [
      ['Visited the site', f.sessions],
      ['Viewed a product', f.viewed_product],
      ['Added to cart', f.added_to_cart],
      ['Started checkout', f.started_checkout],
      ['Paid', f.purchased],
    ];
    const top = Math.max(f.sessions, 1);
    if (!f.sessions) {
      $('anFunnel').innerHTML = '<div class="ops-empty">No visits recorded in this period yet. Visit tracking started on the day this page went live, so the funnel fills in from there.</div>';
      return;
    }
    $('anFunnel').innerHTML = steps.map(([label, n], i) => {
      const prev = i ? steps[i - 1][1] : null;
      const kept = prev ? pct(n, prev) : null;
      const width = Math.max((n / top) * 100, n ? 1.5 : 0);
      return `<div class="an-step">
        <div class="an-step-head"><span>${label}</span><span><strong>${fmtN(n)}</strong>${i ? ` <span class="an-muted">· ${fmtPct(kept)} of previous step</span>` : ''}</span></div>
        <div class="an-bar-track"><div class="an-bar" style="width:${width}%"></div></div>
      </div>`;
    }).join('') + `<div class="ops-hint" style="margin-top:10px">The biggest drop between two steps is where to focus. ${f.started_checkout > f.purchased
      ? `${fmtN(f.started_checkout - f.purchased)} visit${f.started_checkout - f.purchased === 1 ? '' : 's'} started checkout without paying; see Abandoned checkouts.` : ''}</div>`;
  }

  function renderDaily(c) {
    const box = $('anDaily');
    const data = c.daily || [];
    if (!data.length) { box.innerHTML = ''; return; }
    const W = Math.max(box.clientWidth || 640, 280), H = 180, padL = 8, padR = 8, padT = 10, padB = 22;
    const max = Math.max(...data.map(d => Number(d.revenue)), 1);
    const step = (W - padL - padR) / data.length;
    const bw = Math.max(Math.min(step - 2, 28), 1);
    const y = v => padT + (H - padT - padB) * (1 - v / max);
    const labelEvery = Math.ceil(data.length / 8);
    const dayLabel = d => new Date(d + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
    const bars = data.map((d, i) => {
      const x = padL + i * step + (step - bw) / 2;
      const v = Number(d.revenue);
      const h = Math.max(H - padB - y(v), v > 0 ? 2 : 0);
      return `<rect class="an-col" x="${x.toFixed(1)}" y="${(H - padB - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(4, bw / 2)}"/>
        <rect class="an-hit" data-i="${i}" x="${(padL + i * step).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${H}"/>
        ${i % labelEvery === 0 ? `<text class="an-axis" x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${dayLabel(d.day)}</text>` : ''}`;
    }).join('');
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Net sales per day">
      <line class="an-base" x1="${padL}" x2="${W - padR}" y1="${H - padB}" y2="${H - padB}"/>${bars}</svg>
      <div class="an-tip" id="anTip" hidden></div>`;
    const tip = $('anTip');
    box.querySelectorAll('.an-hit').forEach(r => {
      const show = () => {
        const d = data[Number(r.dataset.i)];
        tip.innerHTML = `<strong>${new Date(d.day + 'T00:00:00').toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}</strong><br>${fmtR(d.revenue)} · ${fmtN(d.orders)} order${d.orders === 1 ? '' : 's'}<br>${fmtN(d.sessions)} visit${d.sessions === 1 ? '' : 's'}`;
        tip.hidden = false;
        const rx = Number(r.getAttribute('x')) / W * box.clientWidth;
        tip.style.left = Math.min(Math.max(rx - 60, 0), box.clientWidth - 140) + 'px';
        box.querySelectorAll('.an-hit').forEach(o => o.classList.toggle('on', o === r));
      };
      r.addEventListener('mouseenter', show);
      r.addEventListener('click', show);
    });
    box.querySelector('svg').addEventListener('mouseleave', () => { tip.hidden = true; box.querySelectorAll('.an-hit.on').forEach(o => o.classList.remove('on')); });
    $('anDailyTable').innerHTML = data.slice().reverse().filter(d => d.orders || d.sessions).map(d =>
      `<tr><td>${dayLabel(d.day)}</td><td>${fmtR(d.revenue)}</td><td>${fmtN(d.orders)}</td><td>${fmtN(d.sessions)}</td></tr>`).join('') || '<tr class="empty-row"><td colspan="4">No sales or visits.</td></tr>';
  }

  function renderChannels(c) {
    const rows = (c.channels || []).slice().sort((a, b) => b.revenue - a.revenue || b.sessions - a.sessions);
    $('anChannels').innerHTML = rows.length ? rows.map(r => `<tr>
      <td>${CHANNEL_LABELS[r.channel] || r.channel}</td>
      <td>${r.channel === 'untracked' ? '—' : fmtN(r.sessions)}</td>
      <td>${fmtN(r.orders)}</td>
      <td style="font-weight:700;color:var(--accent)">${fmtR(r.revenue)}</td>
      <td>${r.channel === 'untracked' ? '—' : fmtPct(pct(r.orders, r.sessions))}</td></tr>`).join('')
      : '<tr class="empty-row"><td colspan="5">No data yet.</td></tr>';
    const src = c.sources || [];
    $('anSources').innerHTML = src.length ? src.map(s => `<tr><td>${esc(s.source)}</td><td>${esc(s.campaign || '')}</td><td>${fmtN(s.sessions)}</td></tr>`).join('')
      : '<tr class="empty-row"><td colspan="3">No visits from other sites or campaigns yet.</td></tr>';
    const lp = c.landing_pages || [];
    $('anLanding').innerHTML = lp.length ? lp.map(s => `<tr><td>${esc(s.path)}</td><td>${fmtN(s.sessions)}</td></tr>`).join('')
      : '<tr class="empty-row"><td colspan="2">No visits yet.</td></tr>';
    const dv = c.devices || {};
    const total = Object.values(dv).reduce((a, b) => a + b, 0);
    $('anDevices').textContent = total
      ? ['mobile', 'desktop', 'tablet'].filter(k => dv[k]).map(k => `${k[0].toUpperCase() + k.slice(1)} ${fmtPct(pct(dv[k], total))}`).join(' · ')
      : '';
  }

  function renderProducts(c) {
    const rows = c.products || [];
    $('anProducts').innerHTML = rows.length ? rows.map(r => `<tr>
      <td style="color:var(--accent-strong);font-weight:600">${esc(r.name)}</td>
      <td>${fmtN(r.units)}</td>
      <td style="font-weight:700;color:var(--accent)">${fmtR(r.revenue)}</td>
      <td>${fmtN(r.views)}</td>
      <td>${fmtN(r.carts)}</td>
      <td>${r.views ? fmtPct(pct(r.carts, r.views)) : '—'}</td></tr>`).join('')
      : '<tr class="empty-row"><td colspan="6">No product sales or views yet.</td></tr>';
  }

  async function load() {
    if (loading) return;
    loading = true;
    $('anStatus').textContent = 'Loading…';
    try {
      const res = await callEdge({ action: 'get_analytics', password: window.ShopAdmin.adminToken, days });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load analytics.');
      const { current: c, previous: p } = data;
      renderTiles(c, p);
      renderFunnel(c);
      renderDaily(c);
      renderChannels(c);
      renderProducts(c);
      $('anStatus').textContent = `Compared with the ${days} days before. Unpaid checkouts in this period: ${fmtN(c.unpaid_checkouts)}.`;
    } catch (err) {
      $('anStatus').textContent = err.message;
    } finally {
      loading = false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-an-days]').forEach(btn => btn.addEventListener('click', () => {
      days = Number(btn.dataset.anDays);
      document.querySelectorAll('[data-an-days]').forEach(b => b.classList.toggle('active', b === btn));
      load();
    }));
  });

  window.ShopAdminAnalytics = { load };
})();
