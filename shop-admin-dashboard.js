// shop-admin-dashboard.js - Dashboard functionality (consolidated)

(function() {
  'use strict';
  
  let currentView = 'overview';
  let refreshInterval = null;
  
  async function init() {
    try {
      await loadDashboardData();
      setupNavigation();
      refreshInterval = setInterval(loadDashboardData, 30000);
      console.log('Dashboard initialized');
    } catch (err) {
      console.error('Dashboard init failed:', err);
      if (window.shopAdminCore) {
        window.shopAdminCore.showToast('Failed to load dashboard', 'error');
      }
    }
  }
  
  async function loadDashboardData() {
    const client = window.shopAdminAuth.getSupabaseClient();
    
    try {
      const { data: orders, error: ordersError } = await client
        .from('orders')
        .select('status, total_amount, created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (ordersError) throw ordersError;
      
      const { data: products, error: productsError } = await client
        .from('products')
        .select('id, name, price, stock_quantity, active')
        .eq('active', true);
      
      if (productsError) throw productsError;
      
      updateOrderStats(orders);
      updateProductStats(products);
      updateRecentOrders(orders.slice(0, 10));
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    }
  }
  
  function updateOrderStats(orders) {
    const totalOrders = orders.length;
    const pendingOrders = orders.filter(o => o.status === 'pending').length;
    const completedOrders = orders.filter(o => o.status === 'completed').length;
    
    const totalOrdersEl = document.getElementById('total-orders');
    const pendingOrdersEl = document.getElementById('pending-orders');
    const completedOrdersEl = document.getElementById('completed-orders');
    
    if (totalOrdersEl) totalOrdersEl.textContent = totalOrders;
    if (pendingOrdersEl) pendingOrdersEl.textContent = pendingOrders;
    if (completedOrdersEl) completedOrdersEl.textContent = completedOrders;
  }
  
  function updateProductStats(products) {
    const totalProducts = products.length;
    const lowStock = products.filter(p => p.stock_quantity < 10).length;
    
    const totalProductsEl = document.getElementById('total-products');
    const lowStockEl = document.getElementById('low-stock-products');
    
    if (totalProductsEl) totalProductsEl.textContent = totalProducts;
    if (lowStockEl) lowStockEl.textContent = lowStock;
  }
  
  function updateRecentOrders(orders) {
    const container = document.getElementById('recent-orders-table');
    if (!container) return;
    
    const tbody = container.querySelector('tbody');
    if (!tbody) return;
    
    tbody.innerHTML = orders.map(order => `
      <tr>
        <td>${order.id}</td>
        <td>${window.shopAdminCore.formatCurrency(order.total_amount)}</td>
        <td><span class="status-badge status-${order.status}">${order.status}</span></td>
        <td>${window.shopAdminCore.formatDate(order.created_at)}</td>
        <td>
          <button class="btn btn-sm" onclick="window.shopAdminDashboard.viewOrder('${order.id}')">
            View
          </button>
        </td>
      </tr>
    `).join('');
  }
  
  function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const view = link.dataset.view;
        if (view) switchView(view);
      });
    });
  }
  
  function switchView(viewName) {
    currentView = viewName;
    
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.view === viewName);
    });
    
    document.querySelectorAll('.view-section').forEach(section => {
      section.style.display = 'none';
    });
    
    const activeView = document.getElementById(`${viewName}-view`);
    if (activeView) {
      activeView.style.display = 'block';
      
      if (viewName === 'orders' && window.shopAdminOrders) {
        window.shopAdminOrders.init();
      } else if (viewName === 'products' && window.shopAdminProducts) {
        window.shopAdminProducts.init();
      }
    }
  }
  
  function viewOrder(orderId) {
    if (window.shopAdminOrderDetail) {
      window.shopAdminOrderDetail.loadOrder(orderId);
      switchView('order-detail');
    }
  }
  
  function cleanup() {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }
  
  window.shopAdminDashboard = {
    init,
    loadDashboardData,
    switchView,
    viewOrder,
    cleanup
  };
})();
