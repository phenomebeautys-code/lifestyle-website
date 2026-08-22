/* shop-admin-auth.js */
import { state, callEdge } from './shop-admin-core.js';
import { hooks } from './shop-admin-core.js';

/* ─── AUTH ─────────────────────────────────────── */
export async function hashToken(pw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function login() {
  const pw  = document.getElementById('pwInput').value;
  const btn = document.getElementById('loginBtn');
  if (!pw) { showLoginError('Please enter your password.'); return; }
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Signing in\u2026';
  hideLoginError();
  try {
    const res = await callEdge({ action: 'get_orders', password: pw });
    if (res.status === 429) { showLoginError('Too many attempts. Wait 60 seconds.'); return; }
    if (res.status === 401) { showLoginError('Incorrect password.'); return; }
    if (!res.ok)            { showLoginError('Server error. Try again.'); return; }
    const data = await res.json();
    state.adminToken = pw;
    sessionStorage.setItem('_at_hash', await hashToken(pw));
    document.getElementById('loginWrap').style.display = 'none';
    const ui = document.getElementById('adminUI');
    ui.classList.add('visible');
    ui.removeAttribute('aria-hidden');
    state.allOrders = data.orders || [];
    updateStats(); renderRecent(); renderTable(); renderCards(); updateReports(); updateOrdersBadge();
    startPolling();
  } catch {
    showLoginError('Network error. Check your connection.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Sign In';
  }
}
export function showLoginError(msg) {
  const el = document.getElementById('loginError');
  el.textContent = msg; el.style.display = 'block';
}
export function hideLoginError() { document.getElementById('loginError').style.display = 'none'; }
export function logout() {
  stopPolling();
  sessionStorage.removeItem('_at_hash');
  state.adminToken = '';
  location.reload();
}

