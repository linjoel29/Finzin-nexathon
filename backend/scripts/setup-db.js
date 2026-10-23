// setup-db.js - runs sql/schema.sql against DATABASE_URL (same as pasting it in the Supabase SQL editor).
// Usage: npm run db:setup
const fs = require('fs');
const path = require('path');
const { loadEnv } = require('../src/config/env');
const { createPool } = require('../src/config/db');

(async () => {
  const env = loadEnv();
  const pool = createPool(env.DATABASE_URL);
  try {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
    await pool.query(sql); // multi-statement script, runs in order
    const { rows } = await pool.query("SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
    console.log('Schema applied. Tables (RLS on?):');
    rows.forEach((r) => console.log(`  ${r.tablename}: RLS ${r.rowsecurity ? 'ON' : 'OFF  <-- problem'}`));
  } catch (err) {
    console.error('Schema failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
