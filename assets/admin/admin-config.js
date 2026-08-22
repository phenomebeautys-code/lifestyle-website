// assets/admin/admin-config.js
export const ADMIN_CONFIG = {
  supabaseUrl: 'https://papdxjcfimeyjgzmatpl.supabase.co',
  supabaseAnonKey: 'sb_publishable_XXgqS4qa4-CJJQ7MYxt4Lw_sPbcmGPL',
  endpoints: {
    shopAdmin: 'https://papdxjcfimeyjgzmatpl.supabase.co/functions/v1/shop-admin',
    stockManagement: 'https://papdxjcfimeyjgzmatpl.supabase.co/functions/v1/stock-management',
  },
  features: {
    stockManagement: true,
    reports: true,
  },
};

export default ADMIN_CONFIG;
