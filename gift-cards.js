/* Gift cards, shown in the shop under the Gift cards pill.
   The pill is always shown. While gift cards are off (admin → Gift cards, via shop-config)
   it shows "Gift cards are coming soon" and nothing can be bought.
   buy-gift-card creates the order and the Yoco checkout; the card is emailed once paid. */
(function () {
  'use strict';

  var BASE = 'https://papdxjcfimeyjgzmatpl.supabase.co/functions/v1/';
  var $ = function (id) { return document.getElementById(id); };
  if (!$('giftCardsPane')) return;
  var amount = null;
  var amounts = [];

  /* One brand colour pairing per price point, lowest amount first.
     Same table as GIFT_THEMES in supabase/functions/_shared/gift-cards.mjs (used for the email). */
  var THEMES = [
    { bg: '#F2C6C2', type: '#000000', mark: '#000000' },
    { bg: '#000000', type: '#F2C6C2', mark: '#F2C6C2' },
    { bg: '#F3F1E8', type: '#F2C6C2', mark: '#000000' },
    { bg: '#000000', type: '#F3F1E8', mark: '#F3F1E8' },
    { bg: '#F2C6C2', type: '#F3F1E8', mark: '#000000' },
    { bg: '#F3F1E8', type: '#000000', mark: '#000000' }
  ];
  function themeFor(value) {
    var i = 0;
    amounts.forEach(function (a, n) { if (a <= value) i = n; });
    return THEMES[i % THEMES.length];
  }

  function rand(n) { return 'R' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

  function choose(value) {
    amount = value;
    document.querySelectorAll('#gcAmounts button').forEach(function (b) {
      var on = Number(b.dataset.amount) === value;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    $('gcPreviewAmount').textContent = rand(value);
    $('gcPayAmount').textContent = rand(value);
    var t = themeFor(value), card = $('gcCard');
    card.style.setProperty('--gc-bg', t.bg);
    card.style.setProperty('--gc-type', t.type);
    card.style.setProperty('--gc-mark', t.mark);
    card.style.setProperty('--gc-edge', t.bg === '#F3F1E8' ? 'rgba(0,0,0,0.14)' : 'transparent');
  }

  function showError(text) {
    $('gcError').textContent = text;
    $('gcError').hidden = !text;
  }

  function setup(settings) {
    var on = !!(settings && settings.enabled);
    if (!on) { $('gcOff').hidden = false; $('gcForm').hidden = true; return; }
    $('gcOff').hidden = true;
    $('gcForm').hidden = false;
    amounts = settings.amounts.slice().sort(function (a, b) { return a - b; });
    $('gcAmounts').innerHTML = amounts.map(function (a) {
      var t = themeFor(a);
      return '<button type="button" role="radio" aria-checked="false" data-amount="' + a + '">' +
        '<span class="gc-swatch" aria-hidden="true" style="background:linear-gradient(135deg,' + t.bg + ' 50%,' + t.type + ' 50%)"></span>' + rand(a) + '</button>';
    }).join('');
    choose(amounts[Math.min(1, amounts.length - 1)]);
  }

  $('gcAmounts').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-amount]');
    if (b) choose(Number(b.dataset.amount));
  });

  $('gcForm').addEventListener('input', function () { if (!$('gcError').hidden) showError(''); });

  $('gcForm').addEventListener('submit', function (e) {
    e.preventDefault();
    showError('');
    var data = {
      amount: amount,
      recipient_name: $('gcRecipientName').value.trim(),
      recipient_email: $('gcRecipientEmail').value.trim(),
      message: $('gcMessage').value.trim(),
      buyer_name: $('gcBuyerName').value.trim(),
      buyer_email: $('gcBuyerEmail').value.trim(),
      buyer_phone: $('gcBuyerPhone').value.trim(),
      sender_name: $('gcBuyerName').value.trim(),
    };
    var email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!data.recipient_name || !email.test(data.recipient_email)) { showError("Add the recipient's name and email address."); return; }
    if (!data.buyer_name || !email.test(data.buyer_email) || !data.buyer_phone) { showError('Add your name, email and phone number.'); return; }
    data.success_url = location.origin + '/shop-success.html';
    data.cancel_url = location.origin + '/shop.html?segment=gift_cards';
    var btn = $('gcPay');
    btn.disabled = true;
    btn.textContent = 'Taking you to Yoco…';
    fetch(BASE + 'buy-gift-card', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (res) {
        if (res && res.redirectUrl) {
          if (window.PBTrack) PBTrack.event('checkout_start', { order_id: res.order_id });
          location.href = res.redirectUrl;
          return;
        }
        throw new Error((res && res.error) || 'Something went wrong. Please try again.');
      })
      .catch(function (err) {
        showError(err.message);
        btn.disabled = false;
        btn.innerHTML = 'Pay <span id="gcPayAmount">' + rand(amount) + '</span>';
      });
  });

  fetch(BASE + 'shop-config', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (cfg) { setup(cfg && cfg.gift_cards); })
    .catch(function () { setup(null); });
})();
