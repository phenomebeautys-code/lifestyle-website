/**
 * Shared admin sign-in check for shop-admin, stock-management and materials-management.
 *
 * The admin page sends its credential in the request body as `password` (the field the
 * pages already use). It is accepted when it is either:
 *   1. a Supabase Auth access token for a user listed in public.admin_users, or
 *   2. the old shared SHOP_ADMIN_PASSWORD, but only until an owner account exists.
 * Once the owner account is set up, the shared password stops working everywhere.
 *
 * Plain JavaScript on purpose (no type annotations): the tests load this file as source text.
 */

const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function samePassword(given, expected) {
  if (typeof given !== 'string' || !expected || given.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}

export async function ownerExists(supabase) {
  const { count, error } = await supabase.from('admin_users').select('user_id', { count: 'exact', head: true });
  if (error) throw new Error('Admin accounts unavailable');
  return (count || 0) > 0;
}

/**
 * Returns { ok: true, actor, role, via } or { ok: false, status, error, code }.
 * `via` is 'account' for a signed-in owner, 'password' for the shared password.
 */
export async function resolveAdmin(supabase, credential, sharedPassword) {
  if (typeof credential !== 'string' || !credential) {
    return { ok: false, status: 401, error: 'Unauthorized', code: 'missing' };
  }

  if (JWT_SHAPE.test(credential)) {
    const { data, error } = await supabase.auth.getUser(credential);
    const user = data && data.user;
    if (error || !user) return { ok: false, status: 401, error: 'Your session has expired. Sign in again.', code: 'session_expired' };
    const { data: admin, error: adminError } = await supabase
      .from('admin_users').select('email, role').eq('user_id', user.id).maybeSingle();
    if (adminError) return { ok: false, status: 503, error: 'Admin accounts unavailable', code: 'unavailable' };
    if (!admin) return { ok: false, status: 403, error: 'This account does not have admin access.', code: 'not_admin' };
    return { ok: true, actor: admin.email, role: admin.role, via: 'account' };
  }

  if (!samePassword(credential, sharedPassword)) {
    return { ok: false, status: 401, error: 'Unauthorized', code: 'bad_password' };
  }
  let exists;
  try { exists = await ownerExists(supabase); } catch { return { ok: false, status: 503, error: 'Admin accounts unavailable', code: 'unavailable' }; }
  if (exists) {
    return { ok: false, status: 401, error: 'Sign in with the owner account. The shared password is no longer used.', code: 'account_required' };
  }
  return { ok: true, actor: 'shared password', role: 'owner', via: 'password' };
}

/** Records an admin change. Never throws: a logging failure must not undo the change itself. */
export async function logActivity(supabase, actor, action, targetType, targetId, details) {
  try {
    await supabase.from('admin_activity').insert({
      actor, action, target_type: targetType || null, target_id: targetId == null ? null : String(targetId), details: details || null,
    });
  } catch { /* best effort */ }
}
