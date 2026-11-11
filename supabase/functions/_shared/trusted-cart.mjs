export class CartError extends Error {}
const label = option => option?.name || option?.label || option?.value || '';
export function moneyCents(value) {
  if (!['number', 'string'].includes(typeof value) || !/^\d+(?:\.\d{1,2})?$/.test(String(value))) {
    throw new CartError('Invalid configured price');
  }
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new CartError('Invalid configured price');
  return cents;
}
function selectOption(options, selected, kind) {
  if (selected != null && typeof selected !== 'string') throw new CartError(`Invalid ${kind}`);
  const list = Array.isArray(options) ? options : [];
  if (!list.length) {
    if (selected) throw new CartError(`Unknown ${kind}`);
    return null;
  }
  const match = selected ? list.filter(option => label(option) === selected)
    : list.length === 1 ? list : [];
  if (match.length !== 1) throw new CartError(`Select a valid ${kind}`);
  if (match[0].in_stock === false) throw new CartError(`Selected ${kind} is unavailable`);
  return match[0];
}
export function trustedCart(cart, products) {
  if (!Array.isArray(cart) || !cart.length || cart.length > 100) throw new CartError('Invalid cart');
  const catalogue = new Map(products.map(product => [product.id, product]));
  const quantities = new Map();
  let subtotalCents = 0;
  const items = cart.map(line => {
    if (!line || typeof line !== 'object') throw new CartError('Invalid cart line');
    const id = line.productId || line.id;
    const qty = Number(line.qty);
    if (typeof id !== 'string' || !id || !['number', 'string'].includes(typeof line.qty)
      || !Number.isSafeInteger(qty) || qty < 1 || qty > 50) throw new CartError('Invalid quantity or product');
    const product = catalogue.get(id);
    if (!product || product.active !== true || product.availability !== 'available') {
      throw new CartError('Product is unavailable');
    }
    const variant = selectOption(product.variants, line.variant, 'variant');
    const size = selectOption(product.sizes, line.size, 'size');
    const cents = moneyCents(size?.price ?? variant?.price ?? product.price);
    const unitsPerPack = id === 'film-wax-collection' && label(size) === '500g x 2' ? 2 : 1;
    const physicalQty = qty * unitsPerPack;
    quantities.set(id, (quantities.get(id) || 0) + physicalQty);
    if (quantities.get(id) > 100) throw new CartError('Product quantity exceeds checkout limit');
    subtotalCents += cents * qty;
    if (!Number.isSafeInteger(subtotalCents)) throw new CartError('Cart total exceeds checkout limit');
    return {
      productId: id, name: product.name, price: cents / 100, qty,
      image: variant?.image || product.image_url || '',
      ...(variant ? {variant: label(variant)} : {}),
      ...(size ? {size: label(size)} : {}),
      units_per_pack: unitsPerPack,
    };
  });
  return {
    items, subtotalCents,
    shippingItems: items.map(item => ({productId: item.productId, qty: item.qty * item.units_per_pack})),
  };
}
