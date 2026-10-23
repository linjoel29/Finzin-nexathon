// schema.test.js - proves the DATABASE itself refuses bad data (negative money, bad ledger rows, double charges).
// Every test runs inside BEGIN ... ROLLBACK so no test data is ever kept.
// Needs TEST_DATABASE_URL with the schema already applied (npm run db:setup), else skipped.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createPool } = require('../src/config/db');

const dbUrl = process.env.TEST_DATABASE_URL;
const skip = dbUrl ? false : 'TEST_DATABASE_URL not set';
let pool;

test.before(async () => {
  if (!dbUrl) return;
  pool = createPool(dbUrl);
  // Apply the schema (also proves it is safe to run twice)
  const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
  await pool.query(sql);
  await pool.query(sql);
});
test.after(async () => { if (pool) await pool.end(); });

// Helper: run fn inside a transaction that is always rolled back
async function sandbox(fn) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); return await fn(c); }
  finally { await c.query('ROLLBACK'); c.release(); }
}

// Helper: insert a valid user, returns its id. "n" makes email/mobile unique.
async function makeUser(c, n) {
  const { rows } = await c.query(
    `INSERT INTO users (email, full_name, dob, mobile, address_line, city, state, pincode,
       college_name, student_id, nominee_name, nominee_relation, upi_id, account_number, consent_at)
     VALUES ($1,'Test User','2005-01-01',$2,'12 Main Rd','Mangalore','Karnataka','575001',
       'Yenepoya','STU1','Parent','Father',$3,$4, now()) RETURNING id`,
    [`u${n}@test.com`, `9${String(n).padStart(9, '0')}`, `9${String(n).padStart(9, '0')}@finzin`, String(n).padStart(12, '0')]
  );
  await c.query('INSERT INTO accounts (user_id, balance) VALUES ($1, 100000)', [rows[0].id]);
  return rows[0].id;
}

// Helper: expect a SQL statement to fail with a constraint error (23xxx)
async function mustFail(c, sql, params, label) {
  await c.query('SAVEPOINT s'); // lets the transaction continue after the expected failure
  await assert.rejects(() => c.query(sql, params), (e) => /^23/.test(e.code), label);
  await c.query('ROLLBACK TO SAVEPOINT s');
}

test('all 5 tables exist with RLS ON', { skip }, async () => {
  const { rows } = await pool.query("SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public'");
  for (const t of ['users', 'accounts', 'transactions', 'goals', 'otps']) {
    const row = rows.find((r) => r.tablename === t);
    assert.ok(row, `${t} missing`);
    assert.equal(row.rowsecurity, true, `${t} RLS off`);
  }
});

test('wallet and vault can never go negative', { skip }, () => sandbox(async (c) => {
  const id = await makeUser(c, 1);
  await mustFail(c, 'UPDATE accounts SET balance = -1 WHERE user_id=$1', [id], 'negative balance');
  await mustFail(c, 'UPDATE accounts SET vault_principal = -1 WHERE user_id=$1', [id], 'negative vault');
}));

test('user data rules: bad mobile, bad UPI id, duplicate email rejected', { skip }, () => sandbox(async (c) => {
  await makeUser(c, 2);
  await mustFail(c, "UPDATE users SET mobile='12345' WHERE email='u2@test.com'", [], 'short mobile');
  await mustFail(c, "UPDATE users SET upi_id='BAD ID@finzin' WHERE email='u2@test.com'", [], 'bad upi');
  await mustFail(c, "UPDATE users SET email='U2@TEST.COM' WHERE email='u2@test.com'", [], 'uppercase email');
  await assert.rejects(() => makeUser(c, 2), (e) => e.code === '23505'); // duplicate
}));

test('ledger shape: transfer needs 2 different users, amount > 0', { skip }, () => sandbox(async (c) => {
  const a = await makeUser(c, 3);
  const b = await makeUser(c, 4);
  const ins = "INSERT INTO transactions (type, from_user, to_user, amount) VALUES ($1,$2,$3,$4)";
  await c.query(ins, ['transfer', a, b, 500]);                 // valid
  await mustFail(c, ins, ['transfer', a, a, 500], 'pay self');
  await mustFail(c, ins, ['transfer', a, b, 0], 'zero amount');
  await mustFail(c, ins, ['transfer', a, b, -5], 'negative amount');
  await mustFail(c, ins, ['transfer', a, null, 500], 'missing receiver');
  await mustFail(c, ins, ['vault_deposit', a, b, 500], 'vault to someone else');
  await mustFail(c, ins, ['welcome_credit', a, b, 500], 'welcome credit with sender');
  await c.query(ins, ['welcome_credit', null, a, 500000]);     // valid
  await mustFail(c, ins, ['bogus', a, b, 500], 'unknown type');
}));

test('idempotency: same sender + same key cannot charge twice', { skip }, () => sandbox(async (c) => {
  const a = await makeUser(c, 5);
  const b = await makeUser(c, 6);
  const ins = "INSERT INTO transactions (type, from_user, to_user, amount, idempotency_key) VALUES ('transfer',$1,$2,100,$3)";
  await c.query(ins, [a, b, 'key-12345678']);
  await mustFail(c, ins, [a, b, 'key-12345678'], 'duplicate key');
  await c.query(ins, [b, a, 'key-12345678']);                  // different sender may reuse the text
}));

test('category limited to the 5 known values', { skip }, () => sandbox(async (c) => {
  const a = await makeUser(c, 7);
  const b = await makeUser(c, 8);
  await mustFail(c, "INSERT INTO transactions (type,from_user,to_user,amount,category) VALUES ('transfer',$1,$2,100,'gambling')", [a, b], 'bad category');
}));

test('withTransaction helper rolls back on error', { skip }, async () => {
  const { withTransaction } = require('../src/config/db');
  await pool.query("DELETE FROM otps WHERE email='rollback@test.com'");
  await assert.rejects(() => withTransaction(pool, async (c) => {
    await c.query("INSERT INTO otps (email, code_hash, expires_at) VALUES ('rollback@test.com','h', now())");
    throw new Error('boom');
  }), /boom/);
  const { rowCount } = await pool.query("SELECT 1 FROM otps WHERE email='rollback@test.com'");
  assert.equal(rowCount, 0); // the insert was undone
});

test('BIGINT comes back as a JS number', { skip }, async () => {
  const { rows } = await pool.query('SELECT 500000::bigint AS v');
  assert.equal(typeof rows[0].v, 'number');
});
