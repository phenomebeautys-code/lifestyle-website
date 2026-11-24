/* ─── Analytics report: one click, a full printable report ──────────────────
   Built from the analytics on screen (same period and comparison). Each section is its own block:
   a heading, one plain-language summary, a chart and a labelled table. Light, print-ready layout.
   "Save as PDF" uses the device's print screen; "Download file" saves a self-contained .html copy
   (charts included) that opens in any browser and can be printed later.
──────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fmtR = n => 'R' + Math.round(Number(n || 0)).toLocaleString('en-ZA');
  const fmtR2 = n => 'R' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtN = n => Number(n || 0).toLocaleString('en-ZA');
  const pct = (a, b) => (b > 0 ? (a / b) * 100 : null);
  const fmtPct = v => (v == null ? '—' : (v < 10 ? v.toFixed(1) : Math.round(v)) + '%');
  const dayFmt = d => d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
  const PERIOD = { 7: 'Last 7 days', 30: 'Last 30 days', 90: 'Last 90 days', 365: 'Last 12 months' };
  const LIGHT = () => window.PBCharts.PALETTES.light;

  /* All report styles, scoped to the paper. The same text goes into the downloaded file. */
  const CSS = `
.rp-paper { --text: #16161a; --text-muted: #5d5d66; --glass-border: #e4e2da; --accent-strong: #2a78d6; --rp-soft: #f6f5f0; --rp-line: #e4e2da;
  background: #fff; color: var(--text); font-family: Inter, 'Helvetica Neue', Arial, sans-serif; font-size: 14px; line-height: 1.55;
  max-width: 860px; margin: 0 auto; padding: 48px; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.rp-paper *, .rp-paper *::before, .rp-paper *::after { box-sizing: border-box; }
.rp-cover { display: grid; gap: 6px; padding-bottom: 28px; margin-bottom: 32px; border-bottom: 2px solid var(--text); }
.rp-mark { font-family: 'Abril Fatface', Georgia, serif; font-size: 30px; line-height: 1; margin: 0 0 18px; }
.rp-cover h1 { font-size: 34px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.1; margin: 0; }
.rp-meta { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-top: 18px; }
.rp-meta div { background: var(--rp-soft); border-radius: 10px; padding: 12px 14px; }
.rp-meta span { display: block; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
.rp-meta strong { font-size: 14px; font-weight: 600; }
.rp-section { margin: 0 0 36px; padding: 0 0 36px; border-bottom: 1px solid var(--rp-line); }
.rp-section:last-of-type { border-bottom: 0; }
.rp-head { display: flex; align-items: baseline; gap: 12px; margin: 0 0 6px; break-after: avoid; page-break-after: avoid; }
.rp-num { flex: none; width: 28px; height: 28px; border-radius: 50%; background: var(--text); color: #fff; display: inline-grid; place-items: center; font-size: 13px; font-weight: 700; }
.rp-head h2 { font-size: 21px; font-weight: 600; letter-spacing: -0.01em; margin: 0; }
.rp-lead { color: var(--text-muted); margin: 0 0 18px 40px; max-width: 62ch; }
.rp-body { display: grid; gap: 18px; }
.rp-keep { break-inside: avoid; page-break-inside: avoid; }
.rp-rest { margin-top: 18px; }
.rp-callout { background: var(--rp-soft); border-left: 4px solid var(--accent-strong); border-radius: 8px; padding: 12px 16px; margin: 0; break-inside: avoid; page-break-inside: avoid; }
.rp-callout strong { font-weight: 700; }
.rp-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.rp-kpi { border: 1px solid var(--rp-line); border-radius: 12px; padding: 14px 16px; break-inside: avoid; page-break-inside: avoid; }
.rp-kpi span { display: block; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); }
.rp-kpi strong { display: block; font-size: 24px; font-weight: 700; letter-spacing: -0.02em; margin: 6px 0 4px; }
.rp-kpi em { font-style: normal; font-size: 12px; color: var(--text-muted); }
.rp-kpi .up { color: #1a7f37; font-weight: 700; } .rp-kpi .down { color: #c2410c; font-weight: 700; }
.rp-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
.rp-list li { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 8px; }
.rp-list li::before { content: ''; width: 8px; height: 8px; margin: 7px 0 0 6px; border-radius: 50%; background: var(--accent-strong); }
.rp-chart { break-inside: avoid; page-break-inside: avoid; position: relative; }
.rp-chart .ch-tip, .rp-chart .an-table-toggle { display: none !important; }
.rp-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.rp-table th { text-align: left; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); padding: 8px 10px; border-bottom: 2px solid var(--rp-line); background: var(--rp-soft); }
.rp-table td { padding: 8px 10px; border-bottom: 1px solid var(--rp-line); vertical-align: top; }
.rp-table tr { break-inside: avoid; page-break-inside: avoid; }
.rp-table td.n, .rp-table th.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.rp-table .rp-key { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 8px; vertical-align: 0; }
.rp-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
.rp-two h3 { font-size: 14px; margin: 0 0 8px; }
.rp-empty { color: var(--text-muted); background: var(--rp-soft); border-radius: 10px; padding: 16px; margin: 0; }
.rp-funnel { display: grid; gap: 12px; break-inside: avoid; page-break-inside: avoid; }
.rp-step-head { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; margin-bottom: 4px; }
.rp-step-head b { font-weight: 700; }
.rp-track { height: 14px; border-radius: 7px; background: var(--rp-soft); overflow: hidden; }
.rp-fill { height: 100%; border-radius: 7px; background: var(--accent-strong); }
.rp-glossary { display: grid; grid-template-columns: 170px minmax(0, 1fr); gap: 8px 16px; margin: 0; }
.rp-glossary dt { font-weight: 700; } .rp-glossary dd { margin: 0; color: var(--text-muted); }
.rp-foot { margin-top: 12px; padding-top: 16px; border-top: 2px solid var(--text); display: flex; justify-content: space-between; gap: 12px; font-size: 12px; color: var(--text-muted); }
/* Charts (from shop-admin-charts.js), light */
.rp-paper .ch-donut { display: grid; grid-template-columns: 190px minmax(0, 1fr); gap: 28px; align-items: center; }
.rp-paper .ch-donut svg { width: 100%; height: auto; }
.rp-paper .ch-center-v { fill: var(--text); font-size: 22px; font-weight: 700; font-family: inherit; }
.rp-paper .ch-center-l { fill: var(--text-muted); font-size: 11px; font-family: inherit; letter-spacing: 0.06em; text-transform: uppercase; }
.rp-paper .ch-legend { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; font-size: 13px; }
.rp-paper .ch-legend li { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto; gap: 8px; align-items: center; }
.rp-paper .ch-key { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
.rp-paper .ch-lname { color: var(--text); } .rp-paper .ch-lval { font-weight: 600; white-space: nowrap; } .rp-paper .ch-muted { color: var(--text-muted); font-weight: 400; margin-left: 4px; }
.rp-paper .ch-legend-row { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 10px; }
.rp-paper .ch-legend-row li { display: inline-grid; grid-template-columns: 12px auto auto; }
.rp-paper .ch-tm { display: block; width: 100%; height: auto; }
.rp-paper .ch-tm-head { fill: var(--text); font-size: 11px; font-weight: 700; font-family: inherit; }
.rp-paper .ch-tm-label { fill: #0d0d0f; font-size: 12px; font-weight: 600; font-family: inherit; }
.rp-paper .ch-tm-value { fill: #0d0d0f; font-size: 11px; font-family: inherit; }
.rp-paper .ch-circles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px 12px; margin-top: 12px; }
.rp-paper .ch-circ { margin: 0; text-align: center; }
.rp-paper .ch-circ svg { width: 100%; max-width: 116px; height: auto; display: block; margin: 0 auto; }
.rp-paper .ch-circ figcaption { font-size: 12px; line-height: 1.3; margin-top: 4px; }
.rp-paper .ch-circ figcaption span { display: block; color: var(--text-muted); font-size: 11px; margin-top: 2px; }
.rp-paper .ch-baseline, .rp-paper .an-base { stroke: var(--rp-line); stroke-width: 1; }
.rp-paper .an-col { fill: var(--accent-strong); }
.rp-paper .an-hit { fill: transparent; }
.rp-paper .an-axis, .rp-paper .ch-peak { fill: var(--text-muted); font-size: 10px; font-family: inherit; }
@media (max-width: 640px) {
  .rp-paper { padding: 24px 18px; }
  .rp-meta, .rp-kpis, .rp-two { grid-template-columns: minmax(0, 1fr); }
  .rp-lead { margin-left: 0; }
  .rp-paper .ch-donut { grid-template-columns: minmax(0, 1fr); justify-items: center; }
  .rp-paper .ch-donut svg { max-width: 190px; }
  .rp-paper .ch-donut .ch-legend { width: 100%; }
  .rp-paper .ch-circles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .rp-glossary { grid-template-columns: minmax(0, 1fr); } .rp-glossary dd { margin-bottom: 8px; }
  .rp-table-wrap { overflow-x: auto; }
}
@page { size: A4; margin: 14mm; }
@media print {
  .rp-paper { max-width: none; padding: 0; font-size: 12px; }
  .rp-section { padding-bottom: 24px; margin-bottom: 24px; }
  .rp-meta, .rp-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
  .rp-two { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
}`;

  /* Change against the previous period, in words a reader can say out loud. */
  function change(cur, prev, { invert = false } = {}) {
    if (prev == null || cur == null) return '';
    if (!prev && !cur) return '<em>no change on the period before</em>';
    if (!prev) return '<em><span class="up">new</span> (nothing the period before)</em>';
    const c = ((cur - prev) / Math.abs(prev)) * 100;
    if (Math.abs(c) < 0.5) return '<em>no change on the period before</em>';
    const good = invert ? c < 0 : c > 0;
    return `<em><span class="${good ? 'up' : 'down'}">${c > 0 ? '▲ up' : '▼ down'} ${fmtPct(Math.abs(c))}</span> on the period before</em>`;
  }

  function table(head, rows, numeric = []) {
    if (!rows.length) return '<p class="rp-empty">Nothing recorded in this period.</p>';
    return `<div class="rp-table-wrap"><table class="rp-table"><thead><tr>${head.map((h, i) => `<th${numeric.includes(i) ? ' class="n"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${numeric.includes(i) ? ' class="n"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  /* The heading, its introduction and the first block are kept on one page, so a section never
     starts at the bottom of a page with its chart on the next. */
  function section(n, title, lead, first, rest = '') {
    return `<section class="rp-section"><div class="rp-keep"><div class="rp-head"><span class="rp-num">${n}</span><h2>${esc(title)}</h2></div>
      ${lead ? `<p class="rp-lead">${lead}</p>` : ''}<div class="rp-body">${first}</div></div>${rest ? `<div class="rp-body rp-rest">${rest}</div>` : ''}</section>`;
  }

  /* Days, weeks or months, so a 12-month report has 12 readable columns rather than 365. */
  function grouped(daily, days) {
    const rows = (daily || []).map(d => ({ date: new Date(d.day + 'T00:00:00'), revenue: Number(d.revenue) || 0, orders: Number(d.orders) || 0, sessions: Number(d.sessions) || 0 }));
    if (days <= 31) return { unit: 'Day', rows: rows.map(r => ({ ...r, label: r.date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) })) };
    const map = new Map();
    rows.forEach(r => {
      let key, label;
      if (days <= 120) { const s = new Date(r.date); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); key = s.toISOString().slice(0, 10); label = 'Week of ' + s.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }); }
      else { key = r.date.getFullYear() + '-' + r.date.getMonth(); label = r.date.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' }); }
      const g = map.get(key) || { label, revenue: 0, orders: 0, sessions: 0 };
      g.revenue += r.revenue; g.orders += r.orders; g.sessions += r.sessions; map.set(key, g);
    });
    return { unit: days <= 120 ? 'Week' : 'Month', rows: [...map.values()] };
  }

  /* Plain-language findings for the first page. */
  function findings(c, p, labels, marketMap) {
    const out = [];
    const t = c.totals, pt = p.totals;
    if (pt.revenue > 0) {
      const ch = ((t.revenue - pt.revenue) / pt.revenue) * 100;
      out.push(`Net sales were <strong>${fmtR(t.revenue)}</strong>, ${Math.abs(ch) < 0.5 ? 'about the same as' : `${ch > 0 ? 'up' : 'down'} ${fmtPct(Math.abs(ch))} on`} the period before (${fmtR(pt.revenue)}).`);
    } else out.push(`Net sales were <strong>${fmtR(t.revenue)}</strong> from <strong>${fmtN(t.orders)}</strong> paid order${t.orders === 1 ? '' : 's'}.`);
    const f = c.funnel;
    if (f.sessions) out.push(`<strong>${fmtPct(pct(f.purchased, f.sessions))}</strong> of visits ended in a paid order (${fmtN(f.purchased)} of ${fmtN(f.sessions)} visits).`);
    const steps = [['visiting', 'viewing a product', f.sessions, f.viewed_product], ['viewing a product', 'adding to cart', f.viewed_product, f.added_to_cart], ['adding to cart', 'starting checkout', f.added_to_cart, f.started_checkout], ['starting checkout', 'paying', f.started_checkout, f.purchased]]
      .filter(s => s[2] > 0).map(s => ({ from: s[0], to: s[1], kept: pct(s[3], s[2]) }));
    if (steps.length) { const worst = steps.reduce((a, b) => (b.kept < a.kept ? b : a)); out.push(`The biggest drop is between <strong>${worst.from}</strong> and <strong>${worst.to}</strong>: only ${fmtPct(worst.kept)} carry on. This is the step to improve first.`); }
    const ch = (c.channels || []).filter(r => r.channel !== 'untracked');
    if (ch.length) {
      const byVisits = ch.slice().sort((a, b) => b.sessions - a.sessions)[0];
      const bySales = ch.slice().sort((a, b) => b.revenue - a.revenue)[0];
      out.push(`Most visits came from <strong>${esc(labels[byVisits.channel] || byVisits.channel)}</strong> (${fmtPct(pct(byVisits.sessions, ch.reduce((s, r) => s + Number(r.sessions || 0), 0)))} of visits)${bySales.revenue > 0 && bySales.channel !== byVisits.channel ? `, but <strong>${esc(labels[bySales.channel] || bySales.channel)}</strong> brought in the most sales (${fmtR(bySales.revenue)})` : ''}.`);
    }
    const dv = c.devices || {}; const dvt = Object.values(dv).reduce((a, b) => a + b, 0);
    if (dvt && dv.mobile) out.push(`<strong>${fmtPct(pct(dv.mobile, dvt))}</strong> of visits were on a phone, so check the shop on a phone first when making changes.`);
    const prods = c.products || [];
    const best = prods.filter(r => Number(r.revenue) > 0).sort((a, b) => b.revenue - a.revenue)[0];
    if (best) out.push(`Best seller: <strong>${esc(best.name)}</strong>, ${fmtR(best.revenue)} from ${fmtN(best.units)} unit${Number(best.units) === 1 ? '' : 's'}.`);
    const viewed = prods.filter(r => Number(r.views) >= 20);
    if (viewed.length > 1) {
      const avg = viewed.reduce((s, r) => s + pct(r.carts, r.views), 0) / viewed.length;
      const weak = viewed.filter(r => pct(r.carts, r.views) < avg / 2).sort((a, b) => b.views - a.views)[0];
      if (weak) out.push(`<strong>${esc(weak.name)}</strong> is viewed often (${fmtN(weak.views)} visits) but rarely added to the cart (${fmtPct(pct(weak.carts, weak.views))}). Its photos, description or price may need a look.`);
    }
    if (c.unpaid_checkouts) out.push(`<strong>${fmtN(c.unpaid_checkouts)}</strong> checkout${c.unpaid_checkouts === 1 ? ' was' : 's were'} started but not paid. See Abandoned checkouts in the admin.`);
    return out;
  }

  async function build() {
    const data = window.ShopAdminAnalytics && ShopAdminAnalytics.current();
    if (!data) throw new Error('Analytics are still loading. Try again in a moment.');
    const { days, current: c, previous: p } = data;
    const labels = ShopAdminAnalytics.channelLabels || {};
    const L = LIGHT();
    const end = new Date(), start = new Date(end.getTime() - days * 864e5), prevStart = new Date(start.getTime() - days * 864e5);
    const map = await window.PBCharts.productMarkets();
    const t = c.totals, pt = p.totals, f = c.funnel, pf = p.funnel;
    const conv = pct(f.purchased, f.sessions), pconv = pct(pf.purchased, pf.sessions);
    const ret = pct(t.returning_orders, t.orders), pret = pct(pt.returning_orders, pt.orders);

    const kpi = (label, value, ch) => `<div class="rp-kpi"><span>${label}</span><strong>${value}</strong>${ch}</div>`;
    const s1 = section(1, 'At a glance', 'The headline numbers for this period, each compared with the same number of days just before it.', `
      <div class="rp-kpis">
        ${kpi('Net sales', fmtR(t.revenue), change(t.revenue, pt.revenue))}
        ${kpi('Paid orders', fmtN(t.orders), change(t.orders, pt.orders))}
        ${kpi('Average order', fmtR2(t.aov), change(t.aov, pt.aov))}
        ${kpi('Visits', fmtN(f.sessions), change(f.sessions, pf.sessions))}
        ${kpi('Conversion rate', fmtPct(conv), conv != null && pconv != null ? change(conv, pconv) : '<em>visits that bought</em>')}
        ${kpi('Returning customers', fmtPct(ret), ret != null && pret != null ? change(ret, pret) : `<em>${fmtN(t.returning_orders)} of ${fmtN(t.orders)} orders</em>`)}
      </div>`, `
      <div class="rp-callout"><strong>What stands out</strong><ul class="rp-list" style="margin-top:10px">${findings(c, p, labels, map).map(x => `<li><span>${x}</span></li>`).join('')}</ul></div>
      ${t.refunds > 0 ? `<p class="rp-lead" style="margin:0">Net sales are after ${fmtR(t.refunds)} in refunds.</p>` : ''}`);

    const g = grouped(c.daily, days);
    const busiest = g.rows.reduce((a, b) => (b.revenue > (a ? a.revenue : -1) ? b : a), null);
    const s2 = section(2, 'Sales over time', `Net sales per ${g.unit.toLowerCase()}. ${busiest && busiest.revenue > 0 ? `The best ${g.unit.toLowerCase()} was <strong>${esc(busiest.label)}</strong> with ${fmtR(busiest.revenue)}.` : 'No sales were recorded in this period.'}`, `
      <div class="rp-chart" id="rpBars"></div>`, `
      ${table([g.unit, 'Net sales', 'Orders', 'Visits'], g.rows.filter(r => r.revenue || r.orders || r.sessions).map(r => [esc(r.label), fmtR(r.revenue), fmtN(r.orders), fmtN(r.sessions)]), [1, 2, 3])}`);

    const steps = [['Visited the site', f.sessions], ['Viewed a product', f.viewed_product], ['Added to cart', f.added_to_cart], ['Started checkout', f.started_checkout], ['Paid', f.purchased]];
    const s3 = section(3, 'The shopper journey', 'How many visits reached each step on the way to paying. The longer the bar, the more visits got that far. The percentage shows how many carried on from the step before.', f.sessions ? `
      <div class="rp-funnel">${steps.map(([label, n], i) => `<div><div class="rp-step-head"><span>${label}</span><span><b>${fmtN(n)}</b>${i ? ` · ${fmtPct(pct(n, steps[i - 1][1]))} of the step before` : ''}</span></div>
        <div class="rp-track"><div class="rp-fill" style="width:${Math.max((n / Math.max(f.sessions, 1)) * 100, n ? 1.5 : 0)}%"></div></div></div>`).join('')}</div>`
      : '<p class="rp-empty">No visits were recorded in this period.</p>');

    const ORDER = ['direct', 'search', 'social', 'whatsapp', 'email', 'paid', 'referral'];
    const chColor = key => { const i = ORDER.indexOf(key); return i >= 0 ? L.slots[i] : L.other; };
    const chRows = (c.channels || []).slice().sort((a, b) => b.revenue - a.revenue || b.sessions - a.sessions);
    const s4 = section(4, 'Where visits come from', 'Each visit is counted under the place it came from: typing the address or a saved link (Direct), Google, social media, WhatsApp, email, ads or another website.', `
      <div class="rp-chart" id="rpChannels"></div>`, `
      ${table(['Channel', 'Visits', 'Orders', 'Net sales', 'Conversion'], chRows.map(r => [`<span class="rp-key" style="background:${r.channel === 'untracked' ? L.other : chColor(r.channel)}"></span>${esc(labels[r.channel] || r.channel)}`,
        r.channel === 'untracked' ? '—' : fmtN(r.sessions), fmtN(r.orders), fmtR(r.revenue), r.channel === 'untracked' ? '—' : fmtPct(pct(r.orders, r.sessions))]), [1, 2, 3, 4])}`);

    const dv = c.devices || {}; const DEV = { mobile: ['Phone', 0], desktop: ['Computer', 1], tablet: ['Tablet', 2] };
    const dvt = Object.values(dv).reduce((a, b) => a + b, 0);
    const s5 = section(5, 'Devices', 'What visitors used to browse the shop.', `
      <div class="rp-chart" id="rpDevices"></div>`, `
      ${table(['Device', 'Visits', 'Share'], Object.keys(dv).sort((a, b) => dv[b] - dv[a]).map(k => [`<span class="rp-key" style="background:${DEV[k] ? L.slots[DEV[k][1]] : L.other}"></span>${esc((DEV[k] || [k])[0])}`, fmtN(dv[k]), fmtPct(pct(dv[k], dvt))]), [1, 2])}`);

    const prods = c.products || [];
    const sales = prods.filter(r => Number(r.revenue) > 0);
    const totalSales = sales.reduce((s, r) => s + Number(r.revenue), 0);
    const marketName = { self_care: 'Self-care', professional: 'Professional', gift_card: 'Gift cards', other: 'Other' };
    const mOf = r => (r.product_id === 'gift-card' ? 'gift_card' : map[r.product_id] || map[String(r.name || '').toLowerCase()] || 'other');
    const s6 = section(6, 'Sales by market and product', 'Each box is a product, sized by its share of net sales and grouped by market. Bigger boxes earned more.', `
      <div class="rp-chart" id="rpTreemap"></div>`, `
      ${table(['Market', 'Product', 'Units sold', 'Net sales', 'Share'], sales.slice().sort((a, b) => b.revenue - a.revenue).map(r => [esc(marketName[mOf(r)]), esc(r.name), fmtN(r.units), fmtR(r.revenue), fmtPct(pct(Number(r.revenue), totalSales))]), [2, 3, 4])}`);

    const interest = prods.slice().sort((a, b) => (b.views || 0) - (a.views || 0));
    const s7 = section(7, 'Product interest', 'For each product, the outer circle is visits that viewed it, the middle circle is visits that added it to the cart, and the inner circle is units sold. All circles use the same scale, so they can be compared.', `
      <div class="rp-chart" id="rpCircles"></div>`, `
      ${table(['Product', 'Viewed', 'Added to cart', 'View → cart', 'Units sold'], interest.filter(r => r.views || r.carts || r.units).map(r => [esc(r.name), fmtN(r.views), fmtN(r.carts), r.views ? fmtPct(pct(r.carts, r.views)) : '—', fmtN(r.units)]), [1, 2, 3, 4])}`);

    const s8 = section(8, 'Sources, campaigns and landing pages', 'Which websites and tagged links sent visitors, and the first page they saw.', `
      <div class="rp-two">
        <div><h3>Top sources and campaigns</h3>${table(['Source', 'Campaign', 'Visits'], (c.sources || []).map(s => [esc(s.source), esc(s.campaign || '—'), fmtN(s.sessions)]), [2])}</div>
        <div><h3>Landing pages</h3>${table(['Page', 'Visits'], (c.landing_pages || []).map(s => [esc(s.path), fmtN(s.sessions)]), [1])}</div>
      </div>`);

    const s9 = section(9, 'How to read this report', '', `<dl class="rp-glossary">
      <dt>Net sales</dt><dd>Money from paid orders in the period, after refunds and discounts, including delivery.</dd>
      <dt>Paid orders</dt><dd>Orders paid in the period. Unpaid and cancelled orders are not counted.</dd>
      <dt>Average order</dt><dd>Net sales divided by paid orders.</dd>
      <dt>Visit</dt><dd>One person browsing the site in one sitting. Several pages in a row count as one visit.</dd>
      <dt>Conversion rate</dt><dd>The share of visits that ended in a paid order.</dd>
      <dt>Returning customers</dt><dd>The share of paid orders from customers who had ordered before.</dd>
      <dt>Before tracking</dt><dd>Orders from before visit tracking started, so their channel is not known.</dd>
      <dt>Compared with</dt><dd>Every change is measured against the same number of days just before this period.</dd></dl>`);

    return `<article class="rp-paper" id="rpPaper">
      <header class="rp-cover">
        <p class="rp-mark">Phenomebeauty</p>
        <h1>Analytics report</h1>
        <div class="rp-meta">
          <div><span>Period</span><strong>${PERIOD[days] || days + ' days'}<br>${dayFmt(start)} – ${dayFmt(end)}</strong></div>
          <div><span>Compared with</span><strong>${dayFmt(prevStart)} – ${dayFmt(start)}</strong></div>
          <div><span>Generated</span><strong>${end.toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong></div>
        </div>
      </header>
      ${s1}${s2}${s3}${s4}${s5}${s6}${s7}${s8}${s9}
      <footer class="rp-foot"><span>Phenomebeauty · Analytics report · ${PERIOD[days] || days + ' days'}</span><span>phenomebeauty.co.za</span></footer>
    </article>`;
  }

  /* Charts are drawn after the paper is on screen, so they take its real width. */
  async function drawCharts(paper) {
    const data = ShopAdminAnalytics.current(); const { days, current: c } = data;
    const labels = ShopAdminAnalytics.channelLabels || {};
    const L = LIGHT();
    const g = grouped(c.daily, days);
    PBCharts.bars(paper.querySelector('#rpBars'), g.rows.map(r => ({ label: r.label.replace('Week of ', ''), value: Math.round(r.revenue) })),
      { title: 'Net sales over time', table: false, height: 200, empty: 'No sales in this period.' });
    const ORDER = ['direct', 'search', 'social', 'whatsapp', 'email', 'paid', 'referral'];
    PBCharts.donut(paper.querySelector('#rpChannels'), (c.channels || []).filter(r => r.channel !== 'untracked').map(r => ({ key: r.channel, label: labels[r.channel] || r.channel, value: Number(r.sessions) || 0 })),
      { theme: 'light', table: false, title: 'Visits by channel', colorOf: k => { const i = ORDER.indexOf(k); return i >= 0 ? L.slots[i] : L.other; }, center: { value: fmtN(c.funnel.sessions), label: 'visits' }, empty: 'No visits in this period.' });
    const dv = c.devices || {}; const DEV = { mobile: ['Phone', 0], desktop: ['Computer', 1], tablet: ['Tablet', 2] };
    PBCharts.donut(paper.querySelector('#rpDevices'), Object.keys(dv).map(k => ({ key: k, label: (DEV[k] || [k])[0], value: Number(dv[k]) || 0 })),
      { theme: 'light', table: false, title: 'Visits by device', colorOf: k => (DEV[k] ? L.slots[DEV[k][1]] : L.other), center: { value: fmtN(Object.values(dv).reduce((a, b) => a + b, 0)), label: 'visits' }, empty: 'No visits in this period.' });
    const map = await PBCharts.productMarkets();
    const prods = c.products || [];
    PBCharts.treemap(paper.querySelector('#rpTreemap'), PBCharts.byMarket(map, prods.map(r => ({ id: r.product_id, name: r.name, value: Number(r.revenue) || 0 })), 'light'),
      { theme: 'light', table: false, height: 320, title: 'Net sales by market and product', empty: 'No product sales in this period.' });
    PBCharts.circles(paper.querySelector('#rpCircles'), prods.slice().sort((a, b) => (b.views || 0) - (a.views || 0)).map(r => ({ label: r.name, values: [Number(r.views) || 0, Number(r.carts) || 0, Number(r.units) || 0] })),
      ['Viewed', 'Added to cart', 'Units sold'], { theme: 'light', table: false, empty: 'No product views or sales in this period.' });
  }

  function overlay() {
    let ov = $('reportOverlay');
    if (ov) return ov;
    const style = document.createElement('style'); style.id = 'rpStyle';
    style.textContent = CSS + `
#reportOverlay { position: fixed; inset: 0; z-index: 2000; background: #e9e7e0; overflow-y: auto; -webkit-overflow-scrolling: touch; }
#reportOverlay[hidden] { display: none; }
.rp-bar { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px;
  padding: 12px 20px; background: #16161a; color: #f5f3ef; font-family: Inter, Arial, sans-serif; }
.rp-bar-title { font-weight: 700; font-size: 15px; }
.rp-bar-hint { font-size: 12px; color: rgba(245,243,239,0.7); flex-basis: 100%; order: 3; margin: 0; }
.rp-bar-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.rp-bar button { font: 600 13px Inter, Arial, sans-serif; border-radius: 999px; padding: 10px 16px; cursor: pointer; border: 1px solid rgba(245,243,239,0.35); background: transparent; color: #f5f3ef; }
.rp-bar button.primary { background: #f5f3ef; color: #16161a; border-color: #f5f3ef; }
.rp-sheet { padding: 24px 12px 48px; }
.rp-sheet .rp-paper { box-shadow: 0 20px 50px -30px rgba(0,0,0,0.45); border-radius: 6px; }
@media print {
  /* The admin's own print rule shows only shipping labels; while a report prints, show the report instead. */
  body.rp-printing > *:not(#reportOverlay) { display: none !important; }
  body.rp-printing > #reportOverlay { display: block !important; }
  body.rp-printing #printLabelArea { display: none !important; }
  html, body.rp-printing { background: #fff !important; overflow: visible !important; height: auto !important; }
  body.rp-printing::before { display: none !important; }
  #reportOverlay { position: static; overflow: visible; background: #fff; }
  .rp-bar { display: none !important; }
  .rp-sheet { padding: 0; }
  .rp-sheet .rp-paper { box-shadow: none; border-radius: 0; }
}`;
    document.head.appendChild(style);
    ov = document.createElement('div');
    ov.id = 'reportOverlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Analytics report'); ov.hidden = true;
    ov.innerHTML = `<div class="rp-bar">
        <span class="rp-bar-title">Analytics report</span>
        <div class="rp-bar-actions">
          <button type="button" class="primary" id="rpPdf">Save as PDF</button>
          <button type="button" id="rpDownload">Download file</button>
          <button type="button" id="rpClose">Close</button>
        </div>
        <p class="rp-bar-hint">Save as PDF opens your device's print screen: choose "Save as PDF" as the printer. Download file saves a copy that opens in any browser.</p>
      </div>
      <div class="rp-sheet" id="rpSheet"></div>`;
    document.body.appendChild(ov);
    $('rpClose').addEventListener('click', close);
    $('rpPdf').addEventListener('click', () => { document.body.classList.add('rp-printing'); window.print(); });
    window.addEventListener('afterprint', () => document.body.classList.remove('rp-printing'));
    $('rpDownload').addEventListener('click', download);
    ov.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    return ov;
  }

  function close() {
    const ov = $('reportOverlay'); if (!ov) return;
    ov.hidden = true; document.body.style.overflow = '';
    $('anReportBtn')?.focus();
  }

  function fileName() {
    const d = ShopAdminAnalytics.current();
    return `phenomebeauty-analytics-${(PERIOD[d.days] || d.days + ' days').toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.html`;
  }

  /* A standalone copy: the report's own styles, the fonts and the charts as they are on screen. */
  function download() {
    const paper = $('rpPaper'); if (!paper) return;
    const copy = paper.cloneNode(true);
    copy.querySelectorAll('.ch-tip, .an-table-toggle, .an-hit').forEach(n => n.remove());
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Phenomebeauty analytics report</title>
<link href="https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>body{margin:0;background:#e9e7e0;padding:24px 12px}@media print{body{background:#fff;padding:0}}${CSS}</style></head>
<body>${copy.outerHTML}</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const a = document.createElement('a'); a.href = url; a.download = fileName();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function open() {
    const btn = $('anReportBtn');
    const ov = overlay();
    btn.disabled = true; const label = btn.textContent; btn.textContent = 'Preparing report…';
    try {
      $('rpSheet').innerHTML = await build();
      ov.hidden = false; document.body.style.overflow = 'hidden'; ov.scrollTop = 0;
      await drawCharts($('rpPaper'));
      $('rpPdf').focus();
    } catch (err) {
      if (typeof showToast === 'function') showToast(err.message, true); else alert(err.message);
      close();
    } finally { btn.disabled = false; btn.textContent = label; }
  }

  document.addEventListener('DOMContentLoaded', () => { $('anReportBtn')?.addEventListener('click', open); });
  window.ShopAdminReport = { open, close };
})();
