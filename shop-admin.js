// shop-admin.js - Main entry point (consolidated)
// Fix: Proper module loading order and initialization

(function() {
  'use strict';
  
  async function init() {
    try {
      if (!window.supabase) {
        console.error('Supabase client not loaded');
        return;
      }
      
      if (!window.shopAdminAuth) {
        console.error('Auth module not initialized');
        return;
      }
      
      const isLoginPage = window.location.pathname.includes('shop-admin.html') && 
                          !window.location.pathname.includes('dashboard');
      
      if (isLoginPage) {
        initLoginPage();
      } else {
        await initDashboard();
      }
    } catch (err) {
      console.error('Initialization failed:', err);
    }
  }
  
  function initLoginPage() {
    const loginForm = document.getElementById('login-form');
    const loginEmail = document.getElementById('login-email');
    const loginPassword = document.getElementById('login-password');
    const loginError = document.getElementById('login-error');
    
    if (!loginForm) return;
    
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (loginError) loginError.style.display = 'none';
      
      const email = loginEmail.value.trim();
      const password = loginPassword.value;
      
      if (!email || !password) {
        if (loginError) {
          loginError.textContent = 'Please enter both email and password';
          loginError.style.display = 'block';
        }
        return;
      }
      
      const result = await window.shopAdminAuth.handleLogin(email, password);
      
      if (result.success) {
        window.location.href = '/shop-admin-dashboard.html';
      } else {
        if (loginError) {
          loginError.textContent = result.error || 'Login failed';
          loginError.style.display = 'block';
        }
      }
    });
  }
  
  async function initDashboard() {
    const auth = await window.shopAdminAuth.checkAuth();
    if (!auth) return;
    
    console.log('Dashboard initialized for user:', auth.user.email);
    
    if (window.shopAdminDashboard) {
      await window.shopAdminDashboard.init();
    }
    
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => window.shopAdminAuth.handleLogout());
    }
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
