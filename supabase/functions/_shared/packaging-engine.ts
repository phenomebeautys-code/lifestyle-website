/**
 * packaging-engine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Determines the minimum Pudo box size required for a given set of cart items.
 *
 * Strategy:
 *   1. For each product, determine its effective packed dimensions:
 *      - pack_flat = true  → rotate so smallest dimension is the height
 *      - pack_flat = false → use dimensions as-is (upright)
 *   2. Lay items flat across the box floor (60 cm long axis first),
 *      placing items side-by-side before stacking vertically.
 *   3. Test each Pudo box tier (XS → XL) until everything fits.
 *   4. Return the minimum fitting box + total weight.
 *
 * Pudo box tiers (confirmed May 2026):
 *   XS  60 × 17 × 8 cm   max 2 kg   box cost R7  (absorbed by PhenomeBeauty)
 *   S   60 × 41 × 8 cm   max 5 kg   box cost R15
 *   M   60 × 41 × 19 cm  max 10 kg  box cost R18
 *   L   60 × 41 × 41 cm  max 15 kg  box cost R35
 *   XL  60 × 41 × 69 cm  max 20 kg  box cost R45
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ProductDimensions {
  id:         string;
  weight_kg:  number;
  length_cm:  number;
  width_cm:   number;
  height_cm:  number;
  pack_flat:  boolean;
}

export interface CartItem {
  productId: string;
  qty:       number;
}

export interface PackedItem {
  id:     string;
  qty:    number;
  // effective dimensions after orientation applied
  l: number; // along box length axis (60 cm)
  w: number; // along box width axis
  h: number; // height used in box
}

export interface PudoBox {
  code:       string;   // "XS" | "S" | "M" | "L" | "XL"
  serviceL2L: string;   // TCG service level code for Locker-to-Locker
  serviceL2D: string;   // TCG service level code for Locker-to-Door
  boxL:       number;   // internal length cm
  boxW:       number;   // internal width cm
  boxH:       number;   // internal height cm
  maxKg:      number;
  boxCostR:   number;   // PhenomeBeauty absorbs this — not charged to customer
}

export interface PackagingResult {
  box:          PudoBox;
  totalWeightKg: number;
  packed:       PackedItem[];
  fits:         boolean;
}

// ── Pudo box definitions ──────────────────────────────────────────────────────
export const PUDO_BOXES: PudoBox[] = [
  { code: 'XS', serviceL2L: 'L2LXS - ECO', serviceL2D: 'L2DXS - ECO', boxL: 60, boxW: 17, boxH: 8,  maxKg: 2,  boxCostR: 7  },
  { code: 'S',  serviceL2L: 'L2LS - ECO',  serviceL2D: 'L2DS - ECO',  boxL: 60, boxW: 41, boxH: 8,  maxKg: 5,  boxCostR: 15 },
  { code: 'M',  serviceL2L: 'L2LM - ECO',  serviceL2D: 'L2DM - ECO',  boxL: 60, boxW: 41, boxH: 19, maxKg: 10, boxCostR: 18 },
  { code: 'L',  serviceL2L: 'L2LL - ECO',  serviceL2D: 'L2DL - ECO',  boxL: 60, boxW: 41, boxH: 41, maxKg: 15, boxCostR: 35 },
  { code: 'XL', serviceL2L: 'L2LXL - ECO', serviceL2D: 'L2DXL - ECO', boxL: 60, boxW: 41, boxH: 69, maxKg: 20, boxCostR: 45 },
];

// ── Get effective packed dimensions for a single product unit ─────────────────
function getPackedDimensions(p: ProductDimensions): { l: number; w: number; h: number } {
  const dims = [p.length_cm, p.width_cm, p.height_cm].sort((a, b) => b - a); // desc: [largest, mid, smallest]

  if (p.pack_flat) {
    // Lay flat: smallest dimension becomes height
    // dims[0] = longest, dims[1] = mid, dims[2] = smallest (height)
    return { l: dims[0], w: dims[1], h: dims[2] };
  }

  // Upright: use as confirmed (length × width × height)
  return { l: p.length_cm, w: p.width_cm, h: p.height_cm };
}

// ── 2D strip packing — fits items into a box floor, stacks layers if needed ───
// Returns true if all items fit within the box dimensions
function fitsInBox(items: PackedItem[], box: PudoBox): boolean {
  // Flatten to individual units (qty expanded)
  const units: { l: number; w: number; h: number }[] = [];
  for (const item of items) {
    for (let i = 0; i < item.qty; i++) {
      units.push({ l: item.l, w: item.w, h: item.h });
    }
  }

  // Sort units: tallest first (greedy — place tallest items to minimise wasted height)
  units.sort((a, b) => b.h - a.h);

  let usedHeight = 0;       // total height consumed so far
  let remainingUnits = [...units];

  // Pack in layers — each layer fills the box floor as much as possible
  while (remainingUnits.length > 0) {
    const layerHeight = remainingUnits[0].h; // tallest remaining unit sets layer height
    usedHeight += layerHeight;

    if (usedHeight > box.boxH) return false; // exceeds box height

    // Fill this layer: strip-pack along the length axis
    let usedL = 0;
    let usedW = 0;
    let rowH   = 0;
    const packed: number[] = []; // indices of units placed in this layer

    for (let i = 0; i < remainingUnits.length; i++) {
      const u = remainingUnits[i];
      if (u.h > layerHeight) continue; // won't fit in this layer height

      // Try placing in current row
      if (usedL + u.l <= box.boxL && u.w <= box.boxW) {
        // Fits in current row along length
        if (usedW + u.w <= box.boxW) {
          usedL += u.l;
          rowH   = Math.max(rowH, u.w);
          packed.push(i);
        } else if (u.l <= box.boxL && u.w <= box.boxW) {
          // Start new row in this layer
          usedW += rowH;
          usedL  = u.l;
          rowH   = u.w;
          if (usedW + rowH <= box.boxW) {
            packed.push(i);
          }
        }
      } else if (u.w <= box.boxL && u.l <= box.boxW) {
        // Try rotated 90° on the floor (swap l and w)
        if (usedL + u.w <= box.boxL) {
          usedL += u.w;
          rowH   = Math.max(rowH, u.l);
          packed.push(i);
        }
      }
    }

    if (packed.length === 0) {
      // Nothing could be packed — remaining item is too large even alone
      return false;
    }

    // Remove packed items from remaining (reverse order to preserve indices)
    for (let i = packed.length - 1; i >= 0; i--) {
      remainingUnits.splice(packed[i], 1);
    }
  }

  return true;
}

// ── Main export: determine minimum box for cart ───────────────────────────────
export function determineBox(
  cartItems: CartItem[],
  productDimensions: ProductDimensions[]
): PackagingResult {
  const dimMap = new Map(productDimensions.map(p => [p.id, p]));

  // Build packed items list
  const packedItems: PackedItem[] = [];
  let totalWeightKg = 0;

  for (const item of cartItems) {
    const dim = dimMap.get(item.productId);
    if (!dim) continue;
    const { l, w, h } = getPackedDimensions(dim);
    packedItems.push({ id: item.productId, qty: item.qty, l, w, h });
    totalWeightKg += dim.weight_kg * item.qty;
  }

  // Round weight to 3 decimal places
  totalWeightKg = Math.round(totalWeightKg * 1000) / 1000;

  // Find the minimum box that fits
  for (const box of PUDO_BOXES) {
    // Weight check first (fast fail)
    if (totalWeightKg > box.maxKg) continue;

    // Spatial fit check
    if (fitsInBox(packedItems, box)) {
      return { box, totalWeightKg, packed: packedItems, fits: true };
    }
  }

  // Exceeds all box sizes — return XL with fits: false as a signal
  return {
    box:           PUDO_BOXES[PUDO_BOXES.length - 1],
    totalWeightKg,
    packed:        packedItems,
    fits:          false,
  };
}
