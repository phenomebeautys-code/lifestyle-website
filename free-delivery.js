/* Free delivery over the owner's set amount (admin → Settings).
   Reads the rule from the public shop-config function. The server applies the same rule when the
   order is created, so this only decides what shoppers see. If the rule cannot be loaded, the
   shop shows normal delivery prices and the server still gives free delivery to qualifying orders. */
(function () {
  'use strict';

  var URL_CONFIG = 'https://papdxjcfimeyjgzmatpl.supabase.co/functions/v1/shop-config';
  var KEY = 'pb_shop_config';
  var rule = null;
  var waiting = [];

  function money(n) {
    var v = Math.ceil(Number(n) * 100) / 100;
    return 'R' + (v % 1 ? v.toFixed(2) : String(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function ready(r) {
    rule = r && r.enabled ? r : { enabled: false, threshold: null, methods: [] };
    var cbs = waiting; waiting = [];
    cbs.forEach(function (cb) { try { cb(rule); } catch (e) { /* ignore */ } });
  }

  function load() {
    try {
      var cached = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (cached && Date.now() - cached.at < 5 * 60 * 1000) { ready(cached.rule); return; }
    } catch (e) { /* ignore */ }
    fetch(URL_CONFIG, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var r = data && data.free_delivery;
        try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), rule: r })); } catch (e) { /* ignore */ }
        ready(r);
      })
      .catch(function () { ready(null); });
  }

  function qualifies(subtotal, method) {
    return !!(rule && rule.enabled && rule.methods.indexOf(method) !== -1
      && Math.round(Number(subtotal) * 100) >= Math.round(rule.threshold * 100));
  }

  function methodWords() {
    if (!rule || rule.methods.length === 2) return 'delivery';
    return rule.methods[0] === 'locker' ? 'Pudo locker delivery' : 'door delivery';
  }

  /* Cart drawer line: "Add R120 more for free delivery" with a progress bar. */
  function renderNote(el, subtotal) {
    if (!el) return;
    if (!rule || !rule.enabled) { el.innerHTML = 'Delivery calculated at checkout'; el.classList.remove('has-free'); return; }
    var left = rule.threshold - Number(subtotal);
    var pct = Math.max(0, Math.min(100, (Number(subtotal) / rule.threshold) * 100));
    el.classList.add('has-free');
    el.innerHTML = (left > 0
      ? 'Add <strong>' + money(left) + '</strong> more for free ' + methodWords() + '.'
      : 'You qualify for free ' + methodWords() + '.')
      + '<span class="free-bar" aria-hidden="true"><span style="width:' + pct.toFixed(1) + '%"></span></span>';
  }

  window.PBFreeDelivery = {
    onReady: function (cb) { if (rule) cb(rule); else waiting.push(cb); },
    qualifies: qualifies,
    renderNote: renderNote,
    get rule() { return rule; },
  };
  load();
})();
