// db.js - one shared Postgres connection pool for the whole app.
const { Pool, types } = require('pg');

// Postgres BIGINT (type id 20) comes back as a string by default.
// Our money values (paise) are far below 2^53, so a normal JS number is safe.
types.setTypeParser(20, (val) => parseInt(val, 10));

function createPool(databaseUrl) {
  const isLocal = /@(localhost|127\.0\.0\.1)/.test(databaseUrl);
  const pool = new Pool({
    connectionString: databaseUrl,
    // Supabase requires SSL. NOTE: rejectUnauthorized:false skips certificate
    // verification (common for hackathons); use Supabase's CA cert for production.
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 5,                         // max parallel connections (stays safe within Supabase session limit)
    idleTimeoutMillis: 30_000,      // close idle connections after 30 s
    connectionTimeoutMillis: 10_000 // fail fast if the DB is unreachable
  });
  // Without this handler, a dropped idle connection would crash the whole server
  pool.on('error', (err) => console.error('[db] idle client error:', err.message));
  return pool;
}

// Runs fn(client) inside ONE SQL transaction: all steps succeed or none do.
// Used for payments (Step 4). Any thrown error triggers ROLLBACK.
async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {}); // never mask the original error
    throw err;
  } finally {
    client.release(); // always hand the connection back to the pool
  }
}

module.exports = { createPool, withTransaction };
