// shop-admin.js - Main entry point for Shop Admin
// Handles initialization and navigation

(function() {
  'use strict';
  
  let currentSection = 'dashboard';
  
  async function init() {
    try {
      // Check if already logged in
      const auth = await window.shopAdminAuth.checkAuth();
      if (auth) {
        showDashboard();
      } else {
        showLogin();
      }
      
      setupNavigation();
    } catch (err) {
      console.error('Init failed:', err);
      showLogin();
    }
  }
  
  function showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('admin-dashboard').style.display = 'none';
  }
  
  function showDashboard() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-dashboard').style.display = 'block';
    
    // Load dashboard data
    if (window.shopAdminDashboard) {
      window.shopAdminDashboard.loadStats();
    }
  }
  
  function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const section = link.dataset.section;
        if (section) switchSection(section);
      });
    });
  }
  
  function switchSection(sectionName) {
    currentSection = sectionName;
    
    // Update nav active state
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.section === sectionName);
    });
    
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
      section.classList.remove('active');
    });
    
    // Show selected section
    const activeSection = document.getElementById(`${sectionName}-section`);
    if (activeSection) {
      activeSection.classList.add('active');
      
      // Load section data
      if (sectionName === 'orders' && window.shopAdminOrders) {
        window.shopAdminOrders.loadOrders();
      } else if (sectionName === 'products' && window.shopAdminProducts) {
        window.shopAdminProducts.loadProducts();
      } else if (sectionName === 'stock' && window.stockManagementPanel) {
        window.stockManagementPanel.init();
      }
    }
  }
  
  // Expose login handler globally
  window.handleLogin = async function() {
    const passwordInput = document.getElementById('admin-password');
    const errorEl = document.getElementById('login-error');
    const password = passwordInput.value;
    
    if (!password) {
      errorEl.textContent = 'Please enter password';
      errorEl.style.display = 'block';
      return;
    }
    
    const result = await window.shopAdminAuth.handleLogin(password);
    
    if (result.success) {
      errorEl.style.display = 'none';
      passwordInput.value = '';
      showDashboard();
    } else {
      errorEl.textContent = result.error || 'Login failed';
      errorEl.style.display = 'block';
    }
  };
  
  window.handleLogout = window.shopAdminAuth.handleLogout;
  
  // Initialize on load
  init();
})();
