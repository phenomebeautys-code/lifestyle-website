/* ============================================================
   Phenomebeauty — home.js
   Fills "Shop the collection" on the homepage with up to four live
   products (skeletons hold the space while they load). If the request
   fails, the row is removed and the band still offers the Self-care /
   Professional entry points and the shop button.
   ============================================================ */
(function () {
  "use strict";

  var SUPABASE_URL = 'https://papdxjcfimeyjgzmatpl.supabase.co';
  // Same public (publishable) anon key the shop uses in shop.js.
  var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcGR4amNmaW1leWpnem1hdHBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMDk4NjcsImV4cCI6MjA5MjY4NTg2N30.mn_JsORuYUBtHTqIF2RjY8YUJzY9zJQV0uGFXBvrJRc';

  var row = document.getElementById('featuredProducts');
  if (!row) return;

  var ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15"/><path d="M13 6l6 6-6 6"/></svg>';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function img(url) {
    if (!url) return '';
    if (url.indexOf('supabase.co/storage') === -1) return url;
    return url + '?width=600&quality=75&format=webp';
  }
  function isAvailable(p) {
    return p.active === true &&
      p.availability !== 'coming_soon' &&
      p.availability !== 'out_of_stock' &&
      p.availability !== 'unavailable';
  }
  function minPrice(p) {
    var c = [Number(p.price) || 0];
    (p.variants || []).forEach(function (v) { if (v.price != null) c.push(Number(v.price)); });
    (p.sizes || []).forEach(function (s) { if (s.price != null) c.push(Number(s.price)); });
    c = c.filter(function (n) { return n > 0; });
    return c.length ? Math.min.apply(null, c) : 0;
  }
  function firstImage(p) {
    if (Array.isArray(p.image_urls)) {
      var u = p.image_urls.filter(Boolean);
      if (u.length) return u[0];
    }
    return p.image_url || '';
  }
  function giveUp() { row.parentNode && row.parentNode.removeChild(row); }

  fetch(SUPABASE_URL + '/functions/v1/get-products', {
    headers: { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + SUPABASE_ANON },
    cache: 'no-store'
  })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (data) {
      var list = (Array.isArray(data) ? data : [])
        .filter(function (p) { return isAvailable(p) && minPrice(p) > 0 && firstImage(p); });
      // Hero products first, then the shop's own order.
      list.sort(function (a, b) { return (b.hero_segment ? 1 : 0) - (a.hero_segment ? 1 : 0); });
      list = list.slice(0, 4);
      if (!list.length) return giveUp();

      row.innerHTML = list.map(function (p, i) {
        return '<a class="pcard" data-reveal style="--i:' + i + '" href="shop.html?product=' + encodeURIComponent(p.id) + '">' +
          '<div class="pcard-media"><img src="' + esc(img(firstImage(p))) + '" alt="" loading="lazy" width="600" height="750" />' +
          '</div>' +
          '<div><p class="pcard-name">' + esc(p.name || 'Product') + '</p>' +
          '<p class="pcard-price">R' + minPrice(p).toFixed(2) + '</p>' +
          '<span class="btn btn-primary btn-sm pcard-cta">View product</span></div>' +
        '</a>';
      }).join('');

      Array.prototype.forEach.call(row.children, function (card) {
        if (window.PB && window.PB.reveal) window.PB.reveal(card);
        else card.classList.add('is-in');
      });
    })
    .catch(function (err) {
      console.warn('Featured products unavailable:', err);
      giveUp();
    });
})();
