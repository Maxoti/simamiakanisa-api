const { createClient } = require('@supabase/supabase-js');

// ── Lazy Supabase client ──────────────────────────────────────────────────────
// Initialized on first request, not at module load time.
// This prevents Jest (and any other tooling) from throwing during require()
// before env vars are available.
let _supabase = null;

function getSupabase() {
  if (_supabase) return _supabase;

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    throw new Error('Supabase environment variables are missing');
  }

  _supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  return _supabase;
}

// ── Auth Middleware ───────────────────────────────────────────────────────────
async function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing token' });
  }

  const token = header.split(' ')[1];

  try {
    const supabase = getSupabase();
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    req.user = user;
    next();

  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

module.exports = auth;