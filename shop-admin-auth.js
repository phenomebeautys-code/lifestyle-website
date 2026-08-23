// shop-admin-auth.js - Authentication module for Shop Admin
// Handles Supabase authentication and admin access verification

const SUPABASE_URL = 'https://your-project-ref.supabase.co'; // Replace with your actual URL
const SUPABASE_ANON_KEY = 'your-anon-key'; // Replace with your actual key

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = '/shop-admin.html';
    return null;
  }
  return { session, supabase };
}

async function handleLogin(password) {
  // Simple password-based login (no email required)
  const { data: { session }, error } = await supabase.auth.signInWithPassword({
    email: 'admin@phenomebeauty.co.za',
    password: password
  });
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  return { success: true, session };
}

async function handleLogout() {
  await supabase.auth.signOut();
  window.location.href = '/shop-admin.html';
}

window.shopAdminAuth = {
  checkAuth,
  handleLogin,
  handleLogout,
  supabase
};
