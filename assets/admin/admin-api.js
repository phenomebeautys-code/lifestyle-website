// assets/admin/admin-api.js
import { ADMIN_CONFIG } from './admin-config.js';

/**
 * Call the shop-admin Edge Function
 */
export async function callShopAdmin(body) {
  const response = await fetch(ADMIN_CONFIG.endpoints.shopAdmin, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'API call failed' }));
    throw new Error(error.error || 'API call failed');
  }
  return response.json();
}

/**
 * Call the stock-management Edge Function
 */
export async function callStockManagement(action, payload = {}) {
  const response = await fetch(ADMIN_CONFIG.endpoints.stockManagement, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action,
      password: window.ShopAdmin?.getToken?.() || '',
      ...payload,
    }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'API call failed' }));
    throw new Error(error.error || 'API call failed');
  }
  return response.json();
}

export default { callShopAdmin, callStockManagement };
