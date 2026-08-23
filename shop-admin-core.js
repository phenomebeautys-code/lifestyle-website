// shop-admin-core.js - Core utilities for Shop Admin

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR'
  }).format(amount);
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 24px;
    border-radius: 4px;
    background: ${type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#007bff'};
    color: white;
    z-index: 9999;
  `;
  
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

window.shopAdminCore = {
  formatCurrency,
  formatDate,
  debounce,
  showToast
};
