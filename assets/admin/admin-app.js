// assets/admin/admin-app.js
import { renderStockManagement } from './pages/stock-management.js';

/**
 * Initialize the PhenomeBeauty Admin modular app
 */
export function initAdminApp() {
  console.log('PhenomeBeauty Admin App initialized');

  // Expose modules for legacy integration
  window.PhenomeAdmin = {
    renderStockManagement,
  };
}

// Auto-initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdminApp);
} else {
  initAdminApp();
}

export default { initAdminApp };
