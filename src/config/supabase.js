const { createClient } = require('@supabase/supabase-js');
const env = require('./env');

// Service role client — full DB access, used server-side only
const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Anon client — used for auth token validation
const supabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY
);

module.exports = { supabaseAdmin, supabaseClient };