/* ─── SETTINGS: free delivery over a set amount ─────────────────────────
   Saved through shop-admin `save_free_delivery`. The cart and checkout read
   it from the public shop-config function; create-order enforces it.
──────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const money = n => 'R' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function summary(rule) {
    if (!rule.enabled) return 'Off. Every order pays the Pudo delivery rate.';
    const where = rule.methods.length === 2 ? 'locker and door delivery' : rule.methods[0] === 'locker' ? 'locker delivery only' : 'door delivery only';
    return `On. Orders of ${money(rule.threshold)} or more (products, before delivery) get free ${where}.`;
  }

  function fill(rule) {
    $('fdEnabled').checked = rule.enabled;
    $('fdThreshold').value = rule.threshold != null ? rule.threshold : '';
    $('fdLocker').checked = rule.methods.includes('locker');
    $('fdDoor').checked = rule.methods.includes('door');
    $('fdSummary').textContent = summary(rule);
    toggle();
  }

  function toggle() {
    $('fdFields').classList.toggle('is-off', !$('fdEnabled').checked);
  }

  async function load() {
    $('fdSummary').textContent = 'Loading…';
    try {
      const res = await callEdge({ action: 'get_settings', password: window.ShopAdmin.adminToken });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load settings.');
      fill(data.free_delivery);
    } catch (err) {
      $('fdSummary').textContent = err.message;
    }
  }

  async function save() {
    const enabled = $('fdEnabled').checked;
    const threshold = Number($('fdThreshold').value);
    const methods = [$('fdLocker').checked && 'locker', $('fdDoor').checked && 'door'].filter(Boolean);
    if (enabled && !(threshold >= 1 && threshold <= 100000)) { showToast('Enter an amount between R1 and R100 000.', true); return; }
    if (enabled && !methods.length) { showToast('Choose locker, door or both.', true); return; }
    $('fdSave').disabled = true;
    try {
      const res = await callEdge({ action: 'save_free_delivery', password: window.ShopAdmin.adminToken,
        free_delivery: { enabled, threshold: $('fdThreshold').value === '' ? null : threshold, methods } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save.');
      fill(data.free_delivery);
      showToast(data.free_delivery.enabled ? 'Free delivery is on. Shoppers see it within a few minutes.' : 'Free delivery is off.');
    } catch (err) {
      showToast(err.message, true);
    } finally {
      $('fdSave').disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('fdEnabled').addEventListener('change', toggle);
    $('fdSave').addEventListener('click', save);
  });

  window.ShopAdminSettings = { load };
})();
