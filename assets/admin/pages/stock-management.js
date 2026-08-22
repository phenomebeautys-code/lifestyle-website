// assets/admin/pages/stock-management.js
import { ADMIN_CONFIG } from '../admin-config.js';
import { formatCurrency, formatDate, showToast, esc } from '../admin-utils.js';
import { callStockManagement } from '../admin-api.js';

/**
 * Render the Stock Management page into the given container
 */
export async function renderStockManagement(container) {
  if (!container) {
    console.warn('[renderStockManagement] No container provided');
    return;
  }

  container.innerHTML = `
    <div class="stock-dashboard">
      <h2>Stock Management</h2>
      <div id="stock-summary" class="summary-grid"></div>
      <div id="stock-content" class="content-area"></div>
    </div>
  `;

  try {
    const summary = await callStockManagement('get_summary');
    renderSummary(summary);
    renderStockContent();
  } catch (err) {
    console.error('[renderStockManagement] Failed to load stock summary:', err);
    showToast('Failed to load stock summary: ' + err.message, true);
  }

  function renderSummary(summary) {
    const summaryContainer = document.getElementById('stock-summary');
    if (!summaryContainer) return;

    summaryContainer.innerHTML = `
      <div class="stat-card">
        <h3>Total Products</h3>
        <p class="stat-value">${summary.total_products ?? 0}</p>
      </div>
      <div class="stat-card">
        <h3>Low Stock Items</h3>
        <p class="stat-value">${summary.low_stock_count ?? 0}</p>
      </div>
      <div class="stat-card">
        <h3>Out of Stock</h3>
        <p class="stat-value">${summary.out_of_stock_count ?? 0}</p>
      </div>
      <div class="stat-card">
        <h3>Total Inventory Value</h3>
        <p class="stat-value">${formatCurrency(summary.total_inventory_value ?? 0)}</p>
      </div>
    `;
  }

  function renderStockContent() {
    const contentContainer = document.getElementById('stock-content');
    if (!contentContainer) return;

    contentContainer.innerHTML = `
      <p class="muted">Stock panels will be rendered here using the stock-management Edge Function.</p>
    `;
  }
}

export default { renderStockManagement };
