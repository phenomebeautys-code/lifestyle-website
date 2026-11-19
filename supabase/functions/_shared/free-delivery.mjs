/**
 * Free delivery over a set order amount. The owner sets it in the admin (shop_settings, key 'free_delivery').
 *
 * The rule compares the product subtotal (before delivery) with the threshold, for the delivery
 * methods the owner chose. create-order applies it and records `free_delivery` on the order;
 * yoco-shop-checkout then honours what the order recorded, so changing the setting while a
 * customer is paying does not break their checkout.
 *
 * Plain JavaScript on purpose: the handler tests load this file as source text.
 */

export const FREE_DELIVERY_DEFAULT = { enabled: false, threshold: null, methods: ['locker', 'door'] };

/** Cleans a stored or submitted setting. Anything malformed means "off". */
export function normaliseFreeDelivery(value) {
  const v = value && typeof value === 'object' ? value : {};
  const threshold = Number(v.threshold);
  const methods = Array.isArray(v.methods) ? v.methods.filter(m => m === 'locker' || m === 'door') : [];
  const valid = Number.isFinite(threshold) && threshold > 0 && threshold <= 100000 && methods.length > 0;
  return {
    enabled: v.enabled === true && valid,
    threshold: Number.isFinite(threshold) && threshold > 0 ? Math.round(threshold * 100) / 100 : null,
    methods: methods.length ? [...new Set(methods)] : [...FREE_DELIVERY_DEFAULT.methods],
  };
}

export async function loadFreeDelivery(supabase) {
  try {
    const { data, error } = await supabase.from('shop_settings').select('value').eq('key', 'free_delivery').maybeSingle();
    if (error || !data) return { ...FREE_DELIVERY_DEFAULT };
    return normaliseFreeDelivery(data.value);
  } catch {
    // If the setting cannot be read, charge normal delivery rather than fail the checkout.
    return { ...FREE_DELIVERY_DEFAULT };
  }
}

/** True when this subtotal and delivery method qualify. Amounts in cents. */
export function qualifiesForFreeDelivery(subtotalCents, method, rule) {
  return !!(rule && rule.enabled && rule.threshold && rule.methods.includes(method)
    && subtotalCents >= Math.round(rule.threshold * 100));
}
