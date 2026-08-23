// shop-admin-auth.js - Authentication module for Shop Admin
// Handles Supabase authentication and admin access verification

const SUPABASE_URL = 'https://papdxjcfimeyjgzmatpl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcGR4amNmaW1leWpnem1hdHBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMDk4NjcsImV4cCI6MjA5MjY4NTg2N30.mn_JsORuYUBtHTqIF2RjY8YUJzY9zJQV0uGFXBvrJRc';

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
