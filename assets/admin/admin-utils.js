// assets/admin/admin-utils.js

/**
 * Escape HTML to prevent XSS
 */
export function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Set text content of an element by ID
 */
export function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/**
 * Show a toast notification
 */
export function showToast(msg, isError) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = isError ? 'error' : 'success';
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}

/**
 * Format a number as currency (ZAR)
 */
export function formatCurrency(amount) {
  if (amount == null || amount === '') return 'R0';
  const num = typeof amount === 'number' ? amount : parseFloat(amount);
  if (Number.isNaN(num)) return 'R0';
  return 'R' + num.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/**
 * Format a date string to a readable format
 */
export function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return dateString;
  return d.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default { esc, setText, showToast, formatCurrency, formatDate };
