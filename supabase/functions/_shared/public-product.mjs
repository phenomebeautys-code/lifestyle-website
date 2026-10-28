export const PUBLIC_PRODUCT_FIELDS = Object.freeze([
  'id', 'name', 'price', 'sku', 'brand', 'category', 'description',
  'image_url', 'image_urls', 'variants', 'sizes', 'active', 'availability',
  'sort_order', 'market', 'includes', 'available_in', 'hero_segment',
]);
export const PUBLIC_PRODUCT_COLUMNS = PUBLIC_PRODUCT_FIELDS.join(',');
const OPTION_FIELDS = ['name', 'label', 'value', 'price', 'image', 'in_stock'];
function pick(source, fields) {
  const result = {};
  for (const field of fields) {
    if (Object.hasOwn(source, field)) result[field] = source[field];
  }
  return result;
}
export function toPublicProduct(product) {
  const result = pick(product, PUBLIC_PRODUCT_FIELDS);
  for (const field of ['variants', 'sizes']) {
    result[field] = Array.isArray(product[field])
      ? product[field].filter(option => option && typeof option === 'object' && !Array.isArray(option))
        .map(option => pick(option, OPTION_FIELDS))
      : [];
  }
  return result;
}
