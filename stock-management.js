/*
 * Safe stock-management helpers.
 *
 * This module is intentionally side-effect free. It does not update Supabase,
 * change orders, send emails, or call external fulfilment APIs.
 */

export function getStockStatus(product) {
  if (product.stock_status === 'discontinued') return 'discontinued';
  const stock = Number(product.stock_on_hand ?? 0);
  const reorderLevel = Number(product.reorder_level ?? 0);

  if (stock <= 0) return 'out_of_stock';
  if (reorderLevel > 0 && stock <= reorderLevel) return 'low_stock';
  return 'in_stock';
}

export function getStockRecommendation(product) {
  const stock = Number(product.stock_on_hand ?? 0);
  const reorderLevel = Number(product.reorder_level ?? 0);
  const configuredQuantity = Number(product.reorder_quantity ?? 0);
  const costPrice = Number(product.cost_price ?? 0);
  const status = getStockStatus(product);

  if (status === 'discontinued') return null;
  if (status === 'in_stock') return null;

  const reorderQuantity = configuredQuantity > 0
    ? configuredQuantity
    : Math.max(reorderLevel * 2 - stock, 1);

  return {
    productId: product.id,
    productName: product.name,
    sku: product.sku ?? '',
    stockOnHand: stock,
    reorderLevel,
    reorderQuantity,
    estimatedCost: reorderQuantity * costPrice,
    urgency: stock <= 0 ? 'urgent' : 'soon',
    status,
    reason: stock <= 0
      ? 'Product is out of stock.'
      : 'Stock is at or below the reorder level.',
  };
}

export function getStockRecommendations(products) {
  return products
    .map(getStockRecommendation)
    .filter(Boolean)
    .sort((a, b) => {
      const urgency = { urgent: 0, soon: 1 };
      return urgency[a.urgency] - urgency[b.urgency]
        || a.productName.localeCompare(b.productName);
    });
}

export function getStockSummary(products) {
  const recommendations = getStockRecommendations(products);
  return {
    totalProducts: products.length,
    urgentCount: recommendations.filter(item => item.urgency === 'urgent').length,
    lowStockCount: recommendations.filter(item => item.status === 'low_stock').length,
    estimatedReorderCost: recommendations.reduce((sum, item) => sum + item.estimatedCost, 0),
    recommendations,
  };
}

export function buildStockReadRequest({ endpoint, password }) {
  return {
    url: endpoint,
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_products', password }),
    },
  };
}
