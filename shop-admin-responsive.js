/* ─── Admin tables on small screens ──────────────────────────────────────
   On phones, each row of an admin table is shown as a card with the column name beside every value,
   so nothing hides off the side of the screen. This gives every cell its column name (data-label);
   the layout itself is CSS (shop-admin.css, "Tables as cards"). Tables are re-labelled whenever a
   page re-renders them.
──────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  function label(table) {
    const heads = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
    if (!heads.length) return;
    table.querySelectorAll('tbody tr').forEach(tr => {
      let col = 0;
      [...tr.children].forEach(td => {
        if (!td.hasAttribute('data-label') && heads[col]) td.setAttribute('data-label', heads[col]);
        col += Number(td.getAttribute('colspan')) || 1;
      });
    });
  }
  let pending = false;
  function run() {
    pending = false;
    document.querySelectorAll('.ops-table table').forEach(label);
  }
  function schedule() { if (!pending) { pending = true; requestAnimationFrame(run); } }
  document.addEventListener('DOMContentLoaded', () => {
    run();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  });
})();
