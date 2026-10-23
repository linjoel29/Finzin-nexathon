// server.js - entry point: load config, connect DB, start listening.
const { loadEnv } = require('./config/env');
const { createPool } = require('./config/db');
const { createApp } = require('./app');

async function main() {
  const env = loadEnv();                  // crashes with a clear message if .env is wrong
  const pool = createPool(env.DATABASE_URL);

  // Check the database BEFORE accepting traffic so problems show up immediately
  await pool.query('SELECT 1');
  console.log('[db] connected');

  if (env.DEMO_OTP) console.warn('[WARNING] DEMO_OTP is ON - anyone can log in with it. Demo use only!');

  const app = createApp({ env, pool });
  const server = app.listen(env.PORT, () => console.log(`[server] Finzin API on http://localhost:${env.PORT}`));

  // Clean shutdown (Ctrl+C or host restart): stop requests, then close DB connections
  const shutdown = () => server.close(() => pool.end().then(() => process.exit(0)));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[startup failed]', err.message);
  process.exit(1);
});
