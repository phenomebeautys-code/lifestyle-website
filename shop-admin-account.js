/* ─── ACCOUNT: owner sign-in, session refresh, password reset ───────────
   The admin functions accept either a Supabase Auth access token for an
   admin user, or the old shared password until the owner account exists.
   This module turns an email + password into that credential, keeps the
   token fresh, and runs the Account page.
   The refresh token is kept in sessionStorage, so a session ends when the tab closes.
──────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const AUTH_URL = 'https://papdxjcfimeyjgzmatpl.supabase.co/auth/v1';
  const API_KEY = 'sb_publishable_XXgqS4qa4-CJJQ7MYxt4Lw_sPbcmGPL';
  const OWNER_EMAIL = 'phenomebeautys@gmail.com';
  const REFRESH_KEY = 'pb_admin_refresh';

  let session = null;       // { access_token, refresh_token, expires_at, email }
  let refreshTimer = null;
  let refreshing = null;
  let me = null;            // whoami result

  function authFetch(path, options) {
    return fetch(AUTH_URL + path, {
      ...options,
      headers: { apikey: API_KEY, 'Content-Type': 'application/json', ...(options && options.headers) },
    });
  }

  async function authError(res) {
    const data = await res.json().catch(() => ({}));
    const msg = data.error_description || data.msg || data.message || data.error || '';
    if (/invalid login credentials/i.test(msg)) return 'Incorrect email or password.';
    if (/email not confirmed/i.test(msg)) return 'This email has not been confirmed yet.';
    if (res.status === 429) return 'Too many attempts. Wait a minute and try again.';
    return msg || 'Sign-in failed. Try again.';
  }

  function useSession(data) {
    session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000,
      email: (data.user && data.user.email) || (session && session.email) || '',
    };
    try { sessionStorage.setItem(REFRESH_KEY, session.refresh_token); } catch { /* private mode */ }
    window.ShopAdmin.adminToken = session.access_token;
    scheduleRefresh();
    return session.access_token;
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    if (!session) return;
    // Refresh five minutes before the access token expires.
    const wait = Math.max(session.expires_at - Date.now() - 5 * 60 * 1000, 30 * 1000);
    refreshTimer = setTimeout(() => { refresh(); }, wait);
  }

  async function signIn(email, password) {
    const res = await authFetch('/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (!res.ok) throw new Error(await authError(res));
    return useSession(await res.json());
  }

  async function refreshWith(token) {
    const res = await authFetch('/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: token }) });
    if (!res.ok) return null;
    return useSession(await res.json());
  }

  /** Gets a new access token. Returns it, or null if the session has ended. */
  function refresh() {
    if (!session) return Promise.resolve(null);
    if (!refreshing) {
      refreshing = refreshWith(session.refresh_token)
        .catch(() => null)
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  }

  /** Restores a session from this tab after a reload. Returns the access token or null. */
  async function restore() {
    let saved = null;
    try { saved = sessionStorage.getItem(REFRESH_KEY); } catch { /* ignore */ }
    if (!saved) return null;
    const token = await refreshWith(saved).catch(() => null);
    if (!token) { try { sessionStorage.removeItem(REFRESH_KEY); } catch { /* ignore */ } }
    return token;
  }

  async function signOut() {
    clearTimeout(refreshTimer);
    const token = session && session.access_token;
    session = null;
    me = null;
    try { sessionStorage.removeItem(REFRESH_KEY); } catch { /* ignore */ }
    if (token) {
      try { await authFetch('/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }); } catch { /* best effort */ }
    }
  }

  function isAccountSession() { return !!session; }

  async function requestReset(email) {
    const redirect = location.origin + location.pathname;
    const res = await authFetch('/recover?redirect_to=' + encodeURIComponent(redirect), { method: 'POST', body: JSON.stringify({ email }) });
    if (!res.ok) throw new Error(await authError(res));
  }

  async function setPassword(accessToken, password) {
    const res = await authFetch('/user', { method: 'PUT', headers: { Authorization: 'Bearer ' + accessToken }, body: JSON.stringify({ password }) });
    if (!res.ok) throw new Error(await authError(res));
  }

  /** A password-recovery link lands here with the tokens in the URL hash. */
  function recoveryFromUrl() {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (hash.get('error_description')) return { error: hash.get('error_description') };
    if (hash.get('type') !== 'recovery' || !hash.get('access_token')) return null;
    return { access_token: hash.get('access_token'), refresh_token: hash.get('refresh_token'), expires_in: hash.get('expires_in') };
  }

  /* ── Login card ─────────────────────────────────────────────────── */

  function el(id) { return document.getElementById(id); }

  function showLoginMessage(message, isError) {
    const box = el('loginError');
    box.textContent = message;
    box.style.display = 'block';
    box.classList.toggle('login-note', !isError);
  }

  function setupLoginCard() {
    el('forgotBtn').addEventListener('click', async () => {
      const email = el('emailInput').value.trim().toLowerCase();
      if (!email) { showLoginMessage('Enter your email first, then choose Forgot password.', true); return; }
      el('forgotBtn').disabled = true;
      try {
        await requestReset(email);
        showLoginMessage('If that email has an admin account, a reset link is on its way. Open it on this device.', false);
      } catch (err) {
        showLoginMessage(err.message, true);
      } finally {
        el('forgotBtn').disabled = false;
      }
    });

    const recovery = recoveryFromUrl();
    if (!recovery) return;
    history.replaceState(null, '', location.pathname);
    if (recovery.error) { showLoginMessage(recovery.error.replace(/\+/g, ' '), true); return; }

    el('loginForm').hidden = true;
    el('resetForm').hidden = false;
    el('resetBtn').addEventListener('click', async () => {
      const pw = el('newPw').value;
      if (pw.length < 12) { showLoginMessage('Choose a password of at least 12 characters.', true); return; }
      if (pw !== el('newPw2').value) { showLoginMessage('The two passwords do not match.', true); return; }
      el('resetBtn').disabled = true;
      try {
        await setPassword(recovery.access_token, pw);
        useSession(recovery);
        el('resetForm').hidden = true;
        el('loginForm').hidden = false;
        showLoginMessage('Password updated. Signing you in…', false);
        window.ShopAdmin.resumeSession();
      } catch (err) {
        showLoginMessage(err.message, true);
      } finally {
        el('resetBtn').disabled = false;
      }
    });
  }

  /* ── Account page ───────────────────────────────────────────────── */

  async function whoami() {
    const res = await callEdge({ action: 'whoami', password: window.ShopAdmin.adminToken });
    if (!res.ok) throw new Error('Could not load your account.');
    me = await res.json();
    return me;
  }

  function signedInLabel() {
    if (!me) return '';
    return me.via === 'account' ? me.actor : 'Shared password';
  }

  async function renderAccountPage() {
    const box = el('accountBody');
    box.innerHTML = '<div class="ops-empty"><span class="spinner"></span>Loading…</div>';
    try { await whoami(); } catch (err) { box.innerHTML = `<div class="ops-empty">${esc(err.message)}</div>`; return; }
    el('accountBadge').hidden = me.via === 'account';
    el('sidebarUser').textContent = signedInLabel();

    if (me.via === 'password') {
      box.innerHTML = `
        <div class="panel ops-panel">
          <div class="panel-title">Set up the owner account</div>
          <p class="ops-help">You are signed in with the shared password. Create the owner account for <strong>${esc(me.owner_email)}</strong> to replace it.
          Once it is created, the shared password stops working everywhere and you sign in with this email and the new password.</p>
          <div class="ops-form">
            <label class="field-label" for="ownerEmail">Owner email</label>
            <input class="field-input" id="ownerEmail" type="email" value="${esc(me.owner_email)}" readonly />
            <label class="field-label" for="ownerPw">New password (at least 12 characters)</label>
            <input class="field-input" id="ownerPw" type="password" autocomplete="new-password" />
            <label class="field-label" for="ownerPw2">Confirm password</label>
            <input class="field-input" id="ownerPw2" type="password" autocomplete="new-password" />
            <button class="btn btn-primary" id="createOwnerBtn">Create owner account</button>
          </div>
        </div>`;
      el('createOwnerBtn').addEventListener('click', createOwner);
      return;
    }

    box.innerHTML = `
      <div class="panel ops-panel">
        <div class="panel-title">Signed in</div>
        <p class="ops-help"><strong>${esc(me.actor)}</strong> · ${esc(me.role)} · full access</p>
      </div>
      <div class="panel ops-panel">
        <div class="panel-title">Change password</div>
        <div class="ops-form">
          <label class="field-label" for="chPw">New password (at least 12 characters)</label>
          <input class="field-input" id="chPw" type="password" autocomplete="new-password" />
          <label class="field-label" for="chPw2">Confirm password</label>
          <input class="field-input" id="chPw2" type="password" autocomplete="new-password" />
          <button class="btn btn-primary" id="changePwBtn">Change password</button>
        </div>
      </div>`;
    el('changePwBtn').addEventListener('click', async () => {
      const pw = el('chPw').value;
      if (pw.length < 12) { showToast('Choose a password of at least 12 characters.', true); return; }
      if (pw !== el('chPw2').value) { showToast('The two passwords do not match.', true); return; }
      el('changePwBtn').disabled = true;
      try {
        await setPassword(session.access_token, pw);
        el('chPw').value = ''; el('chPw2').value = '';
        showToast('Password changed.');
      } catch (err) {
        showToast(err.message, true);
      } finally {
        el('changePwBtn').disabled = false;
      }
    });
  }

  async function createOwner() {
    const pw = el('ownerPw').value;
    if (pw.length < 12) { showToast('Choose a password of at least 12 characters.', true); return; }
    if (pw !== el('ownerPw2').value) { showToast('The two passwords do not match.', true); return; }
    if (!confirm(`Create the owner account for ${OWNER_EMAIL}? The shared password will stop working.`)) return;
    const btn = el('createOwnerBtn');
    btn.disabled = true;
    try {
      const res = await callEdge({ action: 'create_owner', password: window.ShopAdmin.adminToken, email: OWNER_EMAIL, new_password: pw });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not create the owner account.');
      await signIn(OWNER_EMAIL, pw);
      showToast('Owner account created. You are now signed in as ' + OWNER_EMAIL + '.');
      renderAccountPage();
    } catch (err) {
      showToast(err.message, true);
    } finally {
      btn.disabled = false;
    }
  }

  window.ShopAdminAccount = {
    OWNER_EMAIL,
    signIn,
    refresh,
    restore,
    signOut,
    isAccountSession,
    whoami,
    signedInLabel,
    setupLoginCard,
    renderAccountPage,
  };
})();
