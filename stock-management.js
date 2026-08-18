/*
 * Safe stock-management helpers.
 *
 * This module is intentionally side-effect free. It does not update Supabase,
 * change orders, send emails, or call external fulfilment APIs.
 */

export function getStockStatus(product) {
  if (product.stock_status === 'discontinued') return 'discontinued';
  if (product.active === false || product.availability === 'coming_soon') return 'not_ready_for_sale';

  const stock = Number(product.stock_on_hand ?? 0);
  const reorderLevel = Number(product.reorder_level ?? 0);
  const reorderQuantity = Number(product.reorder_quantity ?? 0);
  const stockNotConfigured = stock === 0 && reorderLevel === 0 && reorderQuantity === 0 && product.stock_status === 'in_stock';

  if (stockNotConfigured) return 'not_configured';
  if (stock <= 0) return 'out_of_stock';
  if (reorderLevel > 0 && stock <= reorderLevel) return 'low_stock';
  return 'in_stock';
}

export function getStockRecommendation(product) {
  const status = getStockStatus(product);
  const stock = Number(product.stock_on_hand ?? 0);
  const reorderLevel = Number(product.reorder_level ?? 0);
  const configuredQuantity = Number(product.reorder_quantity ?? 0);
  const costPrice = Number(product.cost_price ?? 0);

  if (status === 'discontinued' || status === 'not_ready_for_sale' || status === 'in_stock') return null;

  if (status === 'not_configured') {
    return {
      productId: product.id,
      productName: product.name,
      sku: product.sku ?? '',
      stockOnHand: stock,
      reorderLevel,
      reorderQuantity: 0,
      estimatedCost: 0,
      urgency: 'setup',
      status,
      reason: 'Enter opening stock and reorder settings.',
    };
  }

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
      const urgency = { urgent: 0, soon: 1, setup: 2 };
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
    setupCount: recommendations.filter(item => item.status === 'not_configured').length,
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
      body: JSON.stringify({ action: 'get_summary', password }),
    },
  };
}
