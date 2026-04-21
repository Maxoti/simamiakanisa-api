require('dotenv').config();

const required = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'REDIS_URL',
  'MOBIWAVE_API_KEY',
  'MOBIWAVE_SENDER_ID',
  'MOBIWAVE_BASE_URL',   // ← now required, no silent fallback
  'PORT'
];

const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`[ENV] Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

module.exports = {
  // Server
  PORT:     parseInt(process.env.PORT, 10) || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Supabase
  SUPABASE_URL:              process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY:         process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

  // Redis
  REDIS_URL: process.env.REDIS_URL,

  // Mobiwave — no fallback, must be explicitly set in environment
  MOBIWAVE_BASE_URL:  process.env.MOBIWAVE_BASE_URL,
  MOBIWAVE_API_KEY:   process.env.MOBIWAVE_API_KEY,
  MOBIWAVE_SENDER_ID: process.env.MOBIWAVE_SENDER_ID,

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60_000,
  RATE_LIMIT_MAX:       parseInt(process.env.RATE_LIMIT_MAX, 10)        || 20,
};