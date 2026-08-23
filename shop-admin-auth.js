// shop-admin-auth.js - Consolidated authentication module
// Fix: Ensure proper Supabase client initialization and auth state management

const SUPABASE_URL = 'https://your-project-ref.supabase.co'; // TODO: Replace with actual
const SUPABASE_ANON_KEY = 'your-anon-key'; // TODO: Replace with actual

let supabase = null;

function getSupabaseClient() {
  if (!supabase) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabase;
}

async function checkAuth() {
  try {
    const client = getSupabaseClient();
    const { data: { session }, error } = await client.auth.getSession();
    
    if (error || !session) {
      console.warn('No active session, redirecting to login');
      window.location.href = '/shop-admin.html';
      return null;
    }
    
    // Verify user has admin role
    const { data: userProfile, error: profileError } = await client
      .from('user_profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();
    
    if (profileError || !userProfile || userProfile.role !== 'admin') {
      console.error('User does not have admin access');
      await client.auth.signOut();
      window.location.href = '/shop-admin.html';
      return null;
    }
    
    return { session, user: session.user };
  } catch (err) {
    console.error('Auth check failed:', err);
    window.location.href = '/shop-admin.html';
    return null;
  }
}

async function handleLogin(email, password) {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) throw error;
    
    // Verify admin role
    const { data: userProfile } = await client
      .from('user_profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();
    
    if (!userProfile || userProfile.role !== 'admin') {
      await client.auth.signOut();
      throw new Error('Access denied: Admin role required');
    }
    
    return { success: true, user: data.user };
  } catch (err) {
    console.error('Login failed:', err);
    return { success: false, error: err.message };
  }
}

async function handleLogout() {
  try {
    const client = getSupabaseClient();
    await client.auth.signOut();
    window.location.href = '/shop-admin.html';
  } catch (err) {
    console.error('Logout failed:', err);
  }
}

// Export for use in other modules
window.shopAdminAuth = {
  getSupabaseClient,
  checkAuth,
  handleLogin,
  handleLogout
};
