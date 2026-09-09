/* ─── PACKAGING / BOX-SIZE CALCULATOR ──────────
   Mirrors supabase/functions/_shared/packaging-engine.ts and the
   get-shipping-quote edge function: same bin-packing algorithm, same
   Pudo tiers, so the admin sees exactly what the storefront would quote.
   Products ship in their real, as-measured packaging (shipper/candle
   boxes etc) — a flush, zero-clearance fit is fine, no padding added. */
(function () {
  'use strict';

  const BOX_ORDER = ['XS', 'S', 'M', 'L', 'XL'];

  // Fallback tiers if the live pudo_rates fetch fails — kept in sync with the DB.
  let pudoRates = [
    { box_size: 'XS', max_weight_kg: 2,  max_length_cm: 60, max_width_cm: 17, max_height_cm: 8,  locker_fee: 49.00,  door_fee: 74.38 },
    { box_size: 'S',  max_weight_kg: 5,  max_length_cm: 60, max_width_cm: 41, max_height_cm: 8,  locker_fee: 59.00,  door_fee: 85.16 },
    { box_size: 'M',  max_weight_kg: 10, max_length_cm: 60, max_width_cm: 41, max_height_cm: 19, locker_fee: 69.00,  door_fee: 117.50 },
    { box_size: 'L',  max_weight_kg: 15, max_length_cm: 60, max_width_cm: 41, max_height_cm: 41, locker_fee: 89.00,  door_fee: 168.17 },
    { box_size: 'XL', max_weight_kg: 20, max_length_cm: 60, max_width_cm: 41, max_height_cm: 69, locker_fee: 119.00, door_fee: 225.30 },
  ];
  let ratesLoaded = false;

  async function loadPudoRates() {
    try {
      const res = await fetch(
        `${window.ShopAdmin.SUPA_URL}/rest/v1/pudo_rates?select=box_size,max_weight_kg,max_length_cm,max_width_cm,max_height_cm,locker_fee,door_fee`,
        { headers: { apikey: window.ShopAdmin.SUPA_ANON, Authorization: `Bearer ${window.ShopAdmin.SUPA_ANON}` } }
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length) {
          pudoRates = data.sort((a, b) => Number(a.max_weight_kg) - Number(b.max_weight_kg));
        }
      }
    } catch {
      /* keep fallback tiers */
    } finally {
      ratesLoaded = true;
    }
  }

  function getPackedDimensions(p) {
    const dims = [Number(p.length_cm), Number(p.width_cm), Number(p.height_cm)].sort((a, b) => b - a);
    if (p.pack_flat) return { l: dims[0], w: dims[1], h: dims[2] };
    return { l: Number(p.length_cm), w: Number(p.width_cm), h: Number(p.height_cm) };
  }

  function fitsInBox(units, box) {
    const remaining = [...units].sort((a, b) => b.h - a.h);
    let usedHeight = 0;

    while (remaining.length > 0) {
      const layerHeight = remaining[0].h;
      usedHeight += layerHeight;
      if (usedHeight > box.max_height_cm) return false;

      let usedL = 0, usedW = 0, rowH = 0;
      const packedIdx = [];

      for (let i = 0; i < remaining.length; i++) {
        const u = remaining[i];
        if (u.h > layerHeight) continue;

        if (usedL + u.l <= box.max_length_cm && u.w <= box.max_width_cm) {
          if (usedW + u.w <= box.max_width_cm) {
            usedL += u.l;
            rowH = Math.max(rowH, u.w);
            packedIdx.push(i);
          } else if (u.l <= box.max_length_cm && u.w <= box.max_width_cm) {
            usedW += rowH;
            usedL = u.l;
            rowH = u.w;
            if (usedW + rowH <= box.max_width_cm) packedIdx.push(i);
          }
        } else if (u.w <= box.max_length_cm && u.l <= box.max_width_cm) {
          if (usedL + u.w <= box.max_length_cm) {
            usedL += u.w;
            rowH = Math.max(rowH, u.l);
            packedIdx.push(i);
          }
        }
      }

      if (packedIdx.length === 0) return false;
      for (let i = packedIdx.length - 1; i >= 0; i--) remaining.splice(packedIdx[i], 1);
    }

    return true;
  }

  /* Returns { box, totalWeightKg, maxHeightCm, missingDims, oversized } */
  function computeOrderBox(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    const productMap = {};
    (window.ShopAdmin.allProducts || []).forEach(p => { productMap[p.id] = p; });

    const units = [];
    const missingDims = [];
    let totalWeightKg = 0;

    items.forEach(item => {
      const qty = Math.max(1, Number(item.qty) || 1);
      const p = productMap[item.productId];
      const hasDims = p && Number(p.length_cm) > 0 && Number(p.width_cm) > 0 && Number(p.height_cm) > 0 && Number(p.weight_kg) > 0;

      if (!hasDims) {
        missingDims.push(item.name || item.productId || 'Unknown item');
        return;
      }

      const packed = getPackedDimensions(p);
      for (let i = 0; i < qty; i++) units.push(packed);
      totalWeightKg += Number(p.weight_kg) * qty;
    });

    totalWeightKg = Math.round(totalWeightKg * 1000) / 1000;
    const maxHeightCm = units.reduce((m, u) => Math.max(m, u.h), 0);

    if (missingDims.length === items.length && items.length > 0) {
      return { box: null, totalWeightKg: null, maxHeightCm: null, missingDims, oversized: false, unresolved: true };
    }

    for (const rate of pudoRates) {
      if (totalWeightKg > Number(rate.max_weight_kg)) continue;
      if (fitsInBox(units, rate)) {
        return { box: rate.box_size, totalWeightKg, maxHeightCm, missingDims, oversized: false, unresolved: false };
      }
    }

    return { box: null, totalWeightKg, maxHeightCm, missingDims, oversized: true, unresolved: false };
  }

  function expectedFeeForBox(boxSize, deliveryMethod) {
    const rate = pudoRates.find(r => r.box_size === boxSize);
    if (!rate) return null;
    return deliveryMethod === 'locker' ? Number(rate.locker_fee) : Number(rate.door_fee);
  }

  /* Returns { label, cls, title } for rendering as a small badge */
  function getBoxIndicator(order) {
    const result = computeOrderBox(order);

    if (result.unresolved) {
      return { label: 'Box: ?', cls: 'badge-box badge-box-unknown', title: `Missing dimensions for: ${result.missingDims.join(', ')}` };
    }

    if (result.oversized) {
      return { label: 'Oversized', cls: 'badge-box badge-box-mismatch', title: `Doesn't fit any Pudo box (max weight ${result.totalWeightKg}kg / height ${result.maxHeightCm}cm)` };
    }

    const expectedFee = expectedFeeForBox(result.box, order.delivery_method || 'door');
    const chargedFee = order.delivery_fee != null ? Number(order.delivery_fee) : null;
    const feeMismatch = expectedFee != null && chargedFee != null && Math.abs(expectedFee - chargedFee) > 0.5;

    let title = `Recommended: ${result.box} box — ${result.totalWeightKg}kg, tallest item ${result.maxHeightCm}cm`;
    if (expectedFee != null) title += ` — expected fee R${expectedFee.toFixed(2)}`;
    if (feeMismatch) title += ` (charged R${chargedFee.toFixed(2)} — MISMATCH)`;
    if (result.missingDims.length) title += ` — missing dims for: ${result.missingDims.join(', ')} (partial estimate)`;

    return {
      label: `Box: ${result.box}${feeMismatch ? ' ⚠' : ''}`,
      cls: `badge-box ${feeMismatch ? 'badge-box-mismatch' : 'badge-box-' + result.box.toLowerCase()}`,
      title,
      box: result.box,
      expectedFee,
      chargedFee,
      feeMismatch,
      totalWeightKg: result.totalWeightKg,
      maxHeightCm: result.maxHeightCm,
    };
  }

  function renderBoxBadge(order) {
    const ind = getBoxIndicator(order);
    const span = document.createElement('span');
    span.className = 'badge ' + ind.cls;
    span.title = ind.title;
    const dot = document.createElement('span');
    dot.className = 'box-dot';
    span.appendChild(dot);
    span.appendChild(document.createTextNode(' ' + ind.label));
    return span;
  }

  window.ShopAdminPackaging = {
    loadPudoRates,
    computeOrderBox,
    expectedFeeForBox,
    getBoxIndicator,
    renderBoxBadge,
    BOX_ORDER,
  };
})();
