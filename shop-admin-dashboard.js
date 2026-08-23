// shop-admin-dashboard.js - Dashboard functionality

(function() {
  'use strict';
  
  async function loadStats() {
    const client = window.shopAdminAuth.supabase;
    
    try {
      // Load orders
      const { data: orders } = await client
        .from('orders')
        .select('status, total_amount')
        .limit(1000);
      
      // Load products
      const { data: products } = await client
        .from('products')
        .select('stock_quantity, active')
        .eq('active', true);
      
      if (orders) {
        const totalOrders = orders.length;
        const pendingOrders = orders.filter(o => o.status === 'pending').length;
        
        document.getElementById('total-orders').textContent = totalOrders;
        document.getElementById('pending-orders').textContent = pendingOrders;
      }
      
      if (products) {
        const totalProducts = products.length;
        const lowStock = products.filter(p => p.stock_quantity < 10).length;
        
        document.getElementById('total-products').textContent = totalProducts;
        document.getElementById('low-stock').textContent = lowStock;
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }
  
  window.shopAdminDashboard = {
    loadStats
  };
})();
