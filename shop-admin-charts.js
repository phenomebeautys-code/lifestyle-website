/* ─── Admin charts: donut, nested treemap, nested proportional circles, bars ───
   Plain SVG, no libraries. Every chart has a hover/tap tooltip, a legend where it has more than
   one series, and a "Show as table" view. Colours come from one validated palette (dark mode,
   checked against the panel surface #17171a): categorical slots in a fixed order, never cycled,
   and a colour follows its entity (a market keeps its colour whatever is shown).
──────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  /* Two validated sets of the same hues: dark for the admin panels, light for the printable report.
     Light: the three lighter slots sit under 3:1 on white, so every report chart has a labelled table. */
  const PALETTES = {
    dark: { slots: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'], other: '#6b6b72', rings: ['#184f95', '#2a78d6', '#9ec5f4'], surface: '#17171a' },
    light: { slots: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'], other: '#8c8c93', rings: ['#6da7ec', '#2a78d6', '#104281'], surface: '#ffffff' },
  };
  const SLOTS = PALETTES.dark.slots;
  const OTHER = PALETTES.dark.other;
  const palOf = opts => PALETTES[opts && opts.theme] || PALETTES.dark;

  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fmtN = n => Number(n || 0).toLocaleString('en-ZA');
  const fmtR = n => 'R' + Math.round(Number(n || 0)).toLocaleString('en-ZA');
  const pctOf = (a, b) => (b > 0 ? (a / b) * 100 : 0);
  const fmtPct = v => (v < 10 ? v.toFixed(1) : Math.round(v)) + '%';

  /* One tooltip per chart box, placed next to the pointer and kept inside the box. */
  function tooltip(box) {
    box.classList.add('ch-box');
    let tip = box.querySelector(':scope > .ch-tip');
    if (!tip) { tip = document.createElement('div'); tip.className = 'ch-tip'; tip.hidden = true; box.appendChild(tip); }
    return {
      show(html, evt) {
        tip.innerHTML = html; tip.hidden = false;
        const b = box.getBoundingClientRect();
        const x = (evt.touches ? evt.touches[0].clientX : evt.clientX) - b.left;
        const y = (evt.touches ? evt.touches[0].clientY : evt.clientY) - b.top;
        const w = tip.offsetWidth, h = tip.offsetHeight;
        tip.style.left = Math.min(Math.max(x + 14, 0), Math.max(b.width - w, 0)) + 'px';
        tip.style.top = Math.max(y - h - 12, 0) + 'px';
      },
      hide() { tip.hidden = true; },
    };
  }

  function tableHTML(head, rows) {
    return `<details class="an-table-toggle"><summary>Show as table</summary><div class="table-wrap ops-table"><table>
      <thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
  }

  function empty(el, text) { el.innerHTML = `<div class="ops-empty">${esc(text)}</div>`; }

  /* Keep the first `max` items; fold the rest into "Other" so no colour is ever generated. */
  function fold(items, max, other = OTHER) {
    const sorted = items.filter(i => i.value > 0).sort((a, b) => b.value - a.value);
    if (sorted.length <= max) return sorted;
    const keep = sorted.slice(0, max - 1);
    const rest = sorted.slice(max - 1).reduce((s, i) => s + i.value, 0);
    return keep.concat([{ key: '_other', label: 'Other', value: rest, color: other }]);
  }

  /* ── Donut ─────────────────────────────────────────────────────────
     items: [{ key, label, value, color? }]; colour by `colorOf(key)` or slot order. */
  function donut(el, items, opts = {}) {
    const format = opts.format || fmtN;
    const P = palOf(opts);
    const data = fold(items, opts.max || 6, P.other);
    const total = data.reduce((s, d) => s + d.value, 0);
    if (!total) return empty(el, opts.empty || 'No data yet.');
    data.forEach((d, i) => { d.color = d.color || (opts.colorOf ? opts.colorOf(d.key, i) : P.slots[i]); });
    const S = 200, R = 92, r = 62, cx = S / 2, cy = S / 2;
    let a0 = -Math.PI / 2;
    const arcs = data.map((d, i) => {
      const a1 = a0 + (d.value / total) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (rad, ang) => `${(cx + rad * Math.cos(ang)).toFixed(2)} ${(cy + rad * Math.sin(ang)).toFixed(2)}`;
      const path = data.length === 1
        ? `M ${cx} ${cy - R} A ${R} ${R} 0 1 1 ${cx - 0.01} ${cy - R} L ${cx - 0.01} ${cy - r} A ${r} ${r} 0 1 0 ${cx} ${cy - r} Z`
        : `M ${p(R, a0)} A ${R} ${R} 0 ${large} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${large} 0 ${p(r, a0)} Z`;
      a0 = a1;
      return `<path class="ch-seg" data-i="${i}" d="${path}" fill="${d.color}" stroke="${P.surface}" stroke-width="2" stroke-linejoin="round"/>`;
    }).join('');
    const center = opts.center || { value: format(total), label: 'total' };
    el.innerHTML = `<div class="ch-donut">
      <svg viewBox="0 0 ${S} ${S}" role="img" aria-label="${esc(opts.title || 'Donut chart')}">${arcs}
        <text class="ch-center-v" x="${cx}" y="${cy + 2}" text-anchor="middle">${esc(center.value)}</text>
        <text class="ch-center-l" x="${cx}" y="${cy + 22}" text-anchor="middle">${esc(center.label)}</text></svg>
      <ul class="ch-legend">${data.map((d, i) => `<li data-i="${i}"><span class="ch-key" style="background:${d.color}"></span>
        <span class="ch-lname">${esc(d.label)}</span><span class="ch-lval">${esc(format(d.value))} <span class="ch-muted">${fmtPct(pctOf(d.value, total))}</span></span></li>`).join('')}</ul>
    </div>${opts.table === false ? '' : tableHTML([opts.labelHead || 'Item', opts.valueHead || 'Value', 'Share'], data.map(d => [esc(d.label), esc(format(d.value)), fmtPct(pctOf(d.value, total))]))}`;
    const tip = tooltip(el);
    const focus = (i, evt) => {
      el.querySelectorAll('.ch-seg').forEach(s => s.classList.toggle('dim', Number(s.dataset.i) !== i));
      el.querySelectorAll('.ch-legend li').forEach(s => s.classList.toggle('on', Number(s.dataset.i) === i));
      const d = data[i];
      if (evt) tip.show(`<strong>${esc(d.label)}</strong><br>${esc(format(d.value))} · ${fmtPct(pctOf(d.value, total))}`, evt);
    };
    const blur = () => { el.querySelectorAll('.ch-seg.dim').forEach(s => s.classList.remove('dim')); el.querySelectorAll('.ch-legend li.on').forEach(s => s.classList.remove('on')); tip.hide(); };
    el.querySelectorAll('.ch-seg, .ch-legend li').forEach(n => {
      n.addEventListener('mousemove', e => focus(Number(n.dataset.i), e));
      n.addEventListener('click', e => focus(Number(n.dataset.i), e));
      n.addEventListener('mouseleave', blur);
    });
  }

  /* ── Squarified treemap layout ── */
  function squarify(items, x, y, w, h) {
    const total = items.reduce((s, i) => s + i.value, 0);
    if (!total || w <= 0 || h <= 0) return [];
    const scale = (w * h) / total;
    const nodes = items.map(i => ({ item: i, area: i.value * scale })).sort((a, b) => b.area - a.area);
    const out = [];
    let rx = x, ry = y, rw = w, rh = h;
    const worst = (row, side) => {
      const s = row.reduce((a, n) => a + n.area, 0);
      const max = Math.max(...row.map(n => n.area)), min = Math.min(...row.map(n => n.area));
      return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
    };
    let row = [];
    const place = () => {
      const s = row.reduce((a, n) => a + n.area, 0);
      if (rw >= rh) { const cw = s / rh; let cy = ry; row.forEach(n => { const ch = n.area / cw; out.push({ ...n, x: rx, y: cy, w: cw, h: ch }); cy += ch; }); rx += cw; rw -= cw; }
      else { const ch = s / rw; let cx = rx; row.forEach(n => { const cw = n.area / ch; out.push({ ...n, x: cx, y: ry, w: cw, h: ch }); cx += cw; }); ry += ch; rh -= ch; }
      row = [];
    };
    nodes.forEach(n => {
      const side = Math.min(rw, rh);
      if (!row.length || worst(row.concat(n), side) <= worst(row, side)) row.push(n);
      else { place(); row.push(n); }
    });
    if (row.length) place();
    return out;
  }

  /* ── Nested treemap (groups → items), area ∝ value ─────────────────
     groups: [{ key, label, color, children: [{ label, value, sub? }] }] */
  function treemap(el, groups, opts = {}) {
    const format = opts.format || fmtR;
    const P = palOf(opts);
    const gs = groups.map(g => ({ ...g, children: g.children.filter(c => c.value > 0) }))
      .map(g => ({ ...g, value: g.children.reduce((s, c) => s + c.value, 0) })).filter(g => g.value > 0);
    const total = gs.reduce((s, g) => s + g.value, 0);
    if (!total) return empty(el, opts.empty || 'No sales yet.');
    const W = Math.max(el.clientWidth || 600, 280), H = opts.height || (W < 520 ? 320 : 300), GAP = 2, HEAD = 22;
    const groupRects = squarify(gs, 0, 0, W, H);
    let leaves = '', heads = '', idx = 0;
    const flat = [];
    groupRects.forEach(gr => {
      const g = gr.item;
      const showHead = gr.h > HEAD + 28 && gr.w > 70;
      const inner = squarify(g.children, gr.x + GAP, gr.y + GAP + (showHead ? HEAD : 0), gr.w - GAP * 2, gr.h - GAP * 2 - (showHead ? HEAD : 0));
      heads += `<rect x="${gr.x.toFixed(1)}" y="${gr.y.toFixed(1)}" width="${gr.w.toFixed(1)}" height="${gr.h.toFixed(1)}" rx="6" fill="${g.color}" fill-opacity="0.22" stroke="${P.surface}" stroke-width="${GAP}"/>`;
      if (showHead) heads += `<text class="ch-tm-head" x="${(gr.x + 8).toFixed(1)}" y="${(gr.y + 16).toFixed(1)}">${esc(clip(`${g.label} · ${format(g.value)} (${fmtPct(pctOf(g.value, total))})`, gr.w - 16))}</text>`;
      inner.forEach(n => {
        const c = n.item, i = idx++;
        flat.push({ g, c });
        const big = n.w > 74 && n.h > 34;
        leaves += `<g class="ch-leaf" data-i="${i}"><rect x="${(n.x + GAP / 2).toFixed(1)}" y="${(n.y + GAP / 2).toFixed(1)}" width="${Math.max(n.w - GAP, 0).toFixed(1)}" height="${Math.max(n.h - GAP, 0).toFixed(1)}" rx="4" fill="${g.color}"/>
          ${big ? `<text class="ch-tm-label" x="${(n.x + 8).toFixed(1)}" y="${(n.y + 19).toFixed(1)}">${esc(clip(c.label, n.w - 16))}</text>
          <text class="ch-tm-value" x="${(n.x + 8).toFixed(1)}" y="${(n.y + 35).toFixed(1)}">${esc(format(c.value))}</text>` : ''}</g>`;
      });
    });
    el.innerHTML = `<svg class="ch-tm" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(opts.title || 'Treemap')}">${heads}${leaves}</svg>
      ${gs.length > 1 ? `<ul class="ch-legend ch-legend-row">${gs.map(g => `<li><span class="ch-key" style="background:${g.color}"></span><span class="ch-lname">${esc(g.label)}</span><span class="ch-lval">${esc(format(g.value))}</span></li>`).join('')}</ul>` : ''}
      ${opts.table === false ? '' : tableHTML([opts.groupHead || 'Group', opts.labelHead || 'Item', opts.valueHead || 'Value', 'Share'],
        flat.map(({ g, c }) => [esc(g.label), esc(c.label), esc(format(c.value)), fmtPct(pctOf(c.value, total))]))}`;
    const tip = tooltip(el);
    el.querySelectorAll('.ch-leaf').forEach(n => {
      const { g, c } = flat[Number(n.dataset.i)];
      const show = e => { el.querySelectorAll('.ch-leaf').forEach(o => o.classList.toggle('dim', o !== n)); tip.show(`<strong>${esc(c.label)}</strong><br>${esc(g.label)}<br>${esc(format(c.value))} · ${fmtPct(pctOf(c.value, total))} of all${c.sub ? `<br>${esc(c.sub)}` : ''}`, e); };
      n.addEventListener('mousemove', show); n.addEventListener('click', show);
      n.addEventListener('mouseleave', () => { el.querySelectorAll('.ch-leaf.dim').forEach(o => o.classList.remove('dim')); tip.hide(); });
    });
  }
  /* Rough character budget so labels never spill out of their box (Inter ≈ 0.56em per char at 12px). */
  function clip(text, px) { const max = Math.max(Math.floor(px / 6.8), 3); return text.length > max ? text.slice(0, max - 1) + '…' : text; }

  /* ── Nested proportional circles (one per item) ─────────────────────
     items: [{ label, values: [outer, middle, inner] }], names: ['Viewed', 'Added to cart', 'Sold'].
     Area ∝ value on one shared scale, so circles can be compared across items. */
  function circles(el, items, names, opts = {}) {
    const P = palOf(opts);
    const rows = items.filter(i => i.values.some(v => v > 0)).slice(0, opts.max || 8);
    if (!rows.length) return empty(el, opts.empty || 'No data yet.');
    const max = Math.max(...rows.flatMap(i => i.values), 1);
    const R = 54, D = R * 2 + 8;
    const cell = i => {
      const order = i.values.map((v, k) => ({ v, k })).sort((a, b) => b.v - a.v);
      const circ = order.map(({ v, k }) => v > 0
        ? `<circle cx="${R + 4}" cy="${D - 4 - R * Math.sqrt(v / max)}" r="${(R * Math.sqrt(v / max)).toFixed(2)}" fill="${P.rings[k]}" stroke="${P.surface}" stroke-width="2"/>` : '').join('');
      return `<figure class="ch-circ" data-i="${rows.indexOf(i)}"><svg viewBox="0 0 ${D} ${D}" role="img" aria-label="${esc(i.label)}">
        <line x1="0" x2="${D}" y1="${D - 4}" y2="${D - 4}" class="ch-baseline"/>${circ}</svg>
        <figcaption>${esc(i.label)}<span>${i.values.map(fmtN).join(' · ')}</span></figcaption></figure>`;
    };
    el.innerHTML = `<ul class="ch-legend ch-legend-row">${names.map((n, k) => `<li><span class="ch-key" style="background:${P.rings[k]}"></span><span class="ch-lname">${esc(n)}</span></li>`).join('')}</ul>
      <div class="ch-circles">${rows.map(cell).join('')}</div>
      ${opts.table === false ? '' : tableHTML([opts.labelHead || 'Item'].concat(names), rows.map(i => [esc(i.label)].concat(i.values.map(fmtN))))}`;
    const tip = tooltip(el);
    el.querySelectorAll('.ch-circ').forEach(n => {
      const i = rows[Number(n.dataset.i)];
      const show = e => tip.show(`<strong>${esc(i.label)}</strong><br>${names.map((nm, k) => `${esc(nm)}: ${fmtN(i.values[k])}`).join('<br>')}`, e);
      n.addEventListener('mousemove', show); n.addEventListener('click', show); n.addEventListener('mouseleave', tip.hide);
    });
  }

  /* ── Columns over time ─────────────────────────────────────────────
     data: [{ label, value, tip }] */
  function bars(el, data, opts = {}) {
    const format = opts.format || fmtR;
    if (!data.length || !data.some(d => d.value > 0)) return empty(el, opts.empty || 'Nothing in this period yet.');
    const W = Math.max(el.clientWidth || 600, 260), H = opts.height || 170, padL = 4, padR = 4, padT = 18, padB = 22;
    const max = Math.max(...data.map(d => d.value), 1);
    const step = (W - padL - padR) / data.length, bw = Math.max(Math.min(step - 2, 26), 1);
    const every = Math.ceil(data.length / (W < 480 ? 4 : 8));
    const peak = data.reduce((b, d, i) => (d.value > data[b].value ? i : b), 0);
    const cols = data.map((d, i) => {
      const x = padL + i * step + (step - bw) / 2;
      const h = d.value > 0 ? Math.max((H - padT - padB) * (d.value / max), 2) : 0;
      return `<rect class="an-col" x="${x.toFixed(1)}" y="${(H - padB - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(4, bw / 2)}"/>
        ${i === peak ? `<text class="ch-peak" x="${(x + bw / 2).toFixed(1)}" y="${(H - padB - h - 5).toFixed(1)}" text-anchor="middle">${esc(format(d.value))}</text>` : ''}
        <rect class="an-hit" data-i="${i}" x="${(padL + i * step).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${H}"/>
        ${i % every === 0 ? `<text class="an-axis" x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(d.label)}</text>` : ''}`;
    }).join('');
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(opts.title || 'Column chart')}">
      <line class="an-base" x1="${padL}" x2="${W - padR}" y1="${H - padB}" y2="${H - padB}"/>${cols}</svg>
      ${opts.table === false ? '' : tableHTML([opts.labelHead || 'Day', opts.valueHead || 'Value'], data.filter(d => d.value > 0).reverse().map(d => [esc(d.label), esc(format(d.value))]))}`;
    const tip = tooltip(el);
    el.querySelectorAll('.an-hit').forEach(r => {
      const d = data[Number(r.dataset.i)];
      const show = e => { el.querySelectorAll('.an-hit').forEach(o => o.classList.toggle('on', o === r)); tip.show(d.tip || `<strong>${esc(d.label)}</strong><br>${esc(format(d.value))}`, e); };
      r.addEventListener('mousemove', show); r.addEventListener('click', show);
    });
    el.querySelector('svg').addEventListener('mouseleave', () => { tip.hide(); el.querySelectorAll('.an-hit.on').forEach(o => o.classList.remove('on')); });
  }

  /* Market of each product, from the public catalogue (the admin product list has no market). */
  let marketsPromise = null;
  function productMarkets() {
    if (!marketsPromise) {
      const url = 'https://papdxjcfimeyjgzmatpl.supabase.co/functions/v1/get-products';
      marketsPromise = fetch(url, { cache: 'no-store' }).then(r => (r.ok ? r.json() : [])).then(list => {
        const map = {};
        (Array.isArray(list) ? list : []).forEach(p => { map[p.id] = p.market || null; map[String(p.name || '').toLowerCase()] = p.market || null; });
        return map;
      }).catch(() => ({}));
    }
    return marketsPromise;
  }
  /* Each market keeps its slot in both palettes. */
  const MARKETS = {
    self_care: { label: 'Self-care', slot: 0 },
    professional: { label: 'Professional', slot: 1 },
    gift_card: { label: 'Gift cards', slot: 2 },
    other: { label: 'Other', slot: -1 },
  };
  const marketColor = (m, theme) => { const P = PALETTES[theme] || PALETTES.dark; return MARKETS[m].slot < 0 ? P.other : P.slots[MARKETS[m].slot]; };
  function marketOf(map, id, name) {
    if (id === 'gift-card') return 'gift_card';
    return map[id] || map[String(name || '').toLowerCase()] || 'other';
  }
  /* Build treemap groups from lines of { id, name, value, sub }. */
  function byMarket(map, lines, theme) {
    const groups = {};
    lines.forEach(l => {
      const m = marketOf(map, l.id, l.name);
      (groups[m] ||= { key: m, label: MARKETS[m].label, color: marketColor(m, theme), children: [] }).children.push({ label: l.name, value: l.value, sub: l.sub });
    });
    return ['self_care', 'professional', 'gift_card', 'other'].filter(k => groups[k]).map(k => groups[k]);
  }

  /* Width-dependent charts redraw when their panel changes size (rotating a phone, opening the menu). */
  const observed = new WeakMap();
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => entries.forEach(e => {
    const rec = observed.get(e.target);
    const w = Math.round(e.contentRect.width);
    if (!rec || !w || Math.abs(w - rec.w) < 24) return;
    rec.w = w; clearTimeout(rec.t); rec.t = setTimeout(rec.draw, 120);
  })) : null;
  function keep(fn) {
    return function (el, ...args) {
      if (!el) return;
      fn(el, ...args);
      if (ro) { const rec = observed.get(el); if (rec) rec.draw = () => fn(el, ...args); else { observed.set(el, { w: Math.round(el.clientWidth), draw: () => fn(el, ...args) }); ro.observe(el); } }
    };
  }

  window.PBCharts = { donut: keep(donut), treemap: keep(treemap), circles: keep(circles), bars: keep(bars), productMarkets, byMarket, SLOTS, OTHER, PALETTES };
})();
