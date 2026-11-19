/* Anonymous visit tracking for the admin Analytics page.
   No cookies, no names or emails, no query strings. A visit is a random id kept in this tab's
   sessionStorage, forgotten when the tab closes. Browsers that send Do Not Track or Global
   Privacy Control are not tracked. Usage: PBTrack.event('add_to_cart', { product_id }). */
(function () {
  'use strict';

  var ENDPOINT = 'https://papdxjcfimeyjgzmatpl.supabase.co/functions/v1/track';
  var KEY = 'pb_visit';

  var noop = { event: function () {} };
  try {
    if (navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1') {
      window.PBTrack = noop;
      return;
    }
  } catch (e) { /* ignore */ }

  function randomId() {
    var bytes = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  function host(url) {
    try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; }
  }

  // Works out where this visit came from, once, on its first page.
  function classify() {
    var q = new URLSearchParams(location.search);
    var utmSource = (q.get('utm_source') || '').toLowerCase().slice(0, 80);
    var utmMedium = (q.get('utm_medium') || '').toLowerCase();
    var campaign = (q.get('utm_campaign') || '').slice(0, 80) || null;
    var ref = host(document.referrer);
    var self = host(location.href);
    if (ref === self) ref = '';
    var source = utmSource || ref || null;
    var channel = 'direct';

    if (/^(cpc|ppc|paid|paidsocial|paid_social|paid-social|ads?|display|cpm)$/.test(utmMedium) || q.get('gclid')) channel = 'paid';
    else if (/whatsapp|^wa\.me$|^l\.wl\.co$/.test(source || '')) channel = 'whatsapp';
    else if (/^(email|e-mail|newsletter)$/.test(utmMedium) || /mail/.test(utmSource)) channel = 'email';
    else if (/(^|\.)(google|bing|yahoo|duckduckgo|ecosia|yandex|baidu)\./.test(ref) || /^(google|bing)$/.test(utmSource)) channel = 'search';
    else if (/(instagram|facebook|fb\.|^t\.co$|twitter|^x\.com$|tiktok|pinterest|linkedin|lnkd|youtube|threads)/.test(source || '') || q.get('fbclid')) channel = 'social';
    else if (source) channel = 'referral';

    if (!source && q.get('gclid')) source = 'google';
    if (!source && q.get('fbclid')) source = 'facebook';

    var ua = navigator.userAgent || '';
    var device = /iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) ? 'tablet'
      : /Mobi|iPhone|iPod|Android/i.test(ua) ? 'mobile' : 'desktop';

    return { channel: channel, source: source, campaign: campaign, landing_path: location.pathname.slice(0, 200), device: device };
  }

  var visit;
  try {
    visit = JSON.parse(sessionStorage.getItem(KEY) || 'null');
  } catch (e) { visit = null; }
  if (!visit || !visit.id) {
    visit = { id: randomId(), info: classify() };
    try { sessionStorage.setItem(KEY, JSON.stringify(visit)); } catch (e) { /* private mode: one-page visit */ }
  }

  function send(events) {
    var payload = JSON.stringify({ session_id: visit.id, visit: visit.info, events: events });
    try {
      // text/plain keeps this a simple request (no preflight) and lets it finish during navigation.
      var blob = new Blob([payload], { type: 'text/plain' });
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, blob)) return;
    } catch (e) { /* fall through */ }
    try {
      fetch(ENDPOINT, { method: 'POST', body: payload, keepalive: true, mode: 'cors', headers: { 'Content-Type': 'text/plain' } }).catch(function () {});
    } catch (e) { /* tracking must never break the page */ }
  }

  function event(name, data) {
    var e = { event: name, path: location.pathname.slice(0, 200) };
    if (data && data.product_id) e.product_id = String(data.product_id).slice(0, 64);
    if (data && data.order_id) e.order_id = String(data.order_id);
    send([e]);
  }

  window.PBTrack = { event: event };
  event('page_view');
})();
