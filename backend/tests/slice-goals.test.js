// slice-goals.test.js - Comprehensive test suite for Slice Savings (money movement, PIN, concurrency, idempotency, ledger, reconciliation).
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { loadEnv } = require('../src/config/env');
const { createPool } = require('../src/config/db');
const { insertTestUser, cleanUsers } = require('./helpers');

const env = loadEnv();
const dbUrl = process.env.TEST_DATABASE_URL || env.DATABASE_URL;
const skip = dbUrl ? false : 'Database URL not set';

let pool;
let app;

test.before(async () => {
  if (!dbUrl) return;
  pool = createPool(dbUrl);
  app = createApp({ env, pool });
});

test.after(async () => {
  if (pool) await pool.end();
});

test('Slice: create goal with optional target and targetDate, deposit, withdraw, idempotency, and reconciliation', { skip }, async () => {
  // Provision user with Rs 5,000 (500,000 paise) wallet balance
  const user = await insertTestUser(pool, {
    email: 'slice_user_1@test.com',
    mobile: '9888888801',
    pin: '4321',
    balancePaise: 500000,
    env,
  });

  // 1. Create a Slice goal: "Bike Fund", target Rs 20,000, targetDate 2026-12-31
  const createRes = await request(app)
    .post('/api/goals')
    .set('Authorization', `Bearer ${user.token}`)
    .send({
      name: 'Bike Fund',
      target: 20000,
      targetDate: '2026-12-31',
    });

  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.name, 'Bike Fund');
  assert.equal(createRes.body.target, 20000);
  assert.equal(createRes.body.targetDate, '2026-12-31');
  assert.equal(createRes.body.allocated, 0);
  const goalId = createRes.body.id;

  // 2. Deposit into Slice goal: wrong PIN rejected with 400
  const wrongPinRes = await request(app)
    .post(`/api/goals/${goalId}/deposit`)
    .set('Authorization', `Bearer ${user.token}`)
    .send({
      amount: 1500,
      pin: '9999',
      idempotencyKey: 'slice-dep-pin-fail',
    });
  assert.equal(wrongPinRes.status, 400);

  // 3. Deposit into Slice goal: insufficient balance rejected with 400 (attempting Rs 10,000 when wallet is Rs 5,000)
  const overdrawRes = await request(app)
    .post(`/api/goals/${goalId}/deposit`)
    .set('Authorization', `Bearer ${user.token}`)
    .send({
      amount: 10000,
      pin: '4321',
      idempotencyKey: 'slice-dep-overdraw',
    });
  assert.equal(overdrawRes.status, 400);
  assert.ok(overdrawRes.body.error.includes('Insufficient wallet balance'));

  // 4. Successful deposit of Rs 1,500 into Slice goal
  const depRes = await request(app)
    .post(`/api/goals/${goalId}/deposit`)
    .set('Authorization', `Bearer ${user.token}`)
    .send({
      amount: 1500,
      pin: '4321',
      idempotencyKey: 'slice-dep-valid-1',
    });

  assert.equal(depRes.status, 200);
  assert.equal(depRes.body.walletBalance, 3500); // 5000 - 1500 = 3500
  assert.equal(depRes.body.goal.allocated, 1500);
  assert.equal(depRes.body.transaction.kind, 'slice_deposit');

  // 5. Duplicate idempotency key on deposit: returns recorded result without double debiting
  const dupDepRes = await request(app)
    .post(`/api/goals/${goalId}/deposit`)
    .set('Authorization', `Bearer ${user.token}`)
    .send({
      amount: 1500,
      pin: '4321',
      idempotencyKey: 'slice-dep-valid-1',
    });

  assert.equal(dupDepRes.status, 200);
  assert.equal(dupDepRes.body.walletBalance, 3500); // balance MUST remain 3500!
  assert.equal(dupDepRes.body.goal.allocated, 1500);

  // 6. Check ledger entry in transactions table
  const txRes = await pool.query(
    'SELECT type, amount, note, idempotency_key FROM transactions WHERE idempotency_key = $1',
    ['slice-dep-valid-1']
  );
  assert.equal(txRes.rows.length, 1);
  assert.equal(txRes.rows[0].type, 'save');
  assert.equal(Number(txRes.rows[0].amount), 150000); // 150,000 paise
  assert.ok(txRes.rows[0].note.includes('Slice deposit'));

  // 7. Withdraw from Slice goal: attempting to withdraw more than allocated (Rs 2,000 when allocated is Rs 1,500) -> 400
  const overWithdrawRes = await request(app)
    .post(`/api/goals/${goalId}/withdraw`)
    .set('Authorization', `Bearer ${user.token}`)
    .send({
      amount: 2000,
      pin: '4321',
      idempotencyKey: 'slice-with-overdraw',
    });
  assert.equal(overWithdrawRes.status, 400);
  assert.ok(overWithdrawRes.body.error.includes('Cannot withdraw more'));

  // 8. Successful withdrawal of Rs 500 from Slice goal back to wallet
  const withRes = await request(app)
    .post(`/api/goals/${goalId}/withdraw`)
    .set('Authorization', `Bearer ${user.token}`)
    .send({
      amount: 500,
      pin: '4321',
      idempotencyKey: 'slice-with-valid-1',
    });

  assert.equal(withRes.status, 200);
  assert.equal(withRes.body.walletBalance, 4000); // 3500 + 500 = 4000
  assert.equal(withRes.body.goal.allocated, 1000); // 1500 - 500 = 1000
  assert.equal(withRes.body.transaction.kind, 'slice_withdraw');

  // 9. Portfolio reconciliation: check that wallet (Rs 4000) + slice (Rs 1000) = Rs 5000 exactly
  const portRes = await request(app)
    .get('/api/portfolio')
    .set('Authorization', `Bearer ${user.token}`);

  assert.equal(portRes.status, 200);
  assert.equal(portRes.body.wallet, 4000);
  assert.equal(portRes.body.slice.total, 1000);
  assert.equal(portRes.body.total, 5000);

  // 10. Goal deletion safe balance handling: deleting a goal with Rs 1,000 allocated sweeps funds back to wallet
  const delRes = await request(app)
    .delete(`/api/goals/${goalId}`)
    .set('Authorization', `Bearer ${user.token}`);

  assert.equal(delRes.status, 200);
  assert.equal(delRes.body.ok, true);

  // Check account balance after sweep: must be back to original Rs 5,000!
  const accCheck = await pool.query('SELECT balance FROM accounts WHERE user_id = $1', [user.id]);
  assert.equal(String(accCheck.rows[0].balance), '500000'); // exactly 500,000 paise = Rs 5,000

  await cleanUsers(pool, ['slice_user_1@test.com']);
});

test('Slice: parallel concurrent deposits exceeding balance never overdraw', { skip }, async () => {
  // Provision user with Rs 2,000 (200,000 paise)
  const user = await insertTestUser(pool, {
    email: 'slice_concur_user@test.com',
    mobile: '9888888802',
    pin: '1234',
    balancePaise: 200000,
    env,
  });

  const createRes = await request(app)
    .post('/api/goals')
    .set('Authorization', `Bearer ${user.token}`)
    .send({ name: 'Emergency Fund' });
  const goalId = createRes.body.id;

  // Fire 5 concurrent deposit requests of Rs 800 each (total attempted = Rs 4,000; available = Rs 2,000)
  const promises = [1, 2, 3, 4, 5].map((i) =>
    request(app)
      .post(`/api/goals/${goalId}/deposit`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        amount: 800,
        pin: '1234',
        idempotencyKey: `concur-slice-dep-${i}`,
      })
  );

  const results = await Promise.all(promises);
  const successes = results.filter((r) => r.status === 200);
  const failures = results.filter((r) => r.status === 400);

  // Only 2 requests of Rs 800 (Rs 1,600) can succeed from Rs 2,000; remaining 3 MUST fail
  assert.equal(successes.length, 2);
  assert.equal(failures.length, 3);

  // Verify wallet balance in DB: 200,000 - 160,000 = 40,000 paise (Rs 400)
  const accRes = await pool.query('SELECT balance FROM accounts WHERE user_id = $1', [user.id]);
  assert.equal(String(accRes.rows[0].balance), '40000');

  // Verify goal allocated: 160,000 paise (Rs 1,600)
  const goalRes = await pool.query('SELECT allocated FROM goals WHERE id = $1', [goalId]);
  assert.equal(String(goalRes.rows[0].allocated), '160000');

  await cleanUsers(pool, ['slice_concur_user@test.com']);
});

test('Slice: user isolation prevents unauthorized access to other users goals', { skip }, async () => {
  const userA = await insertTestUser(pool, {
    email: 'slice_iso_a@test.com',
    mobile: '9888888803',
    pin: '1111',
    balancePaise: 200000,
    env,
  });
  const userB = await insertTestUser(pool, {
    email: 'slice_iso_b@test.com',
    mobile: '9888888804',
    pin: '2222',
    balancePaise: 200000,
    env,
  });

  // User A creates a goal
  const gA = await request(app)
    .post('/api/goals')
    .set('Authorization', `Bearer ${userA.token}`)
    .send({ name: 'User A Pot' });
  const goalAId = gA.body.id;

  // User B tries to deposit into User A's goal -> 404 (Goal not found / not owned)
  const bDepRes = await request(app)
    .post(`/api/goals/${goalAId}/deposit`)
    .set('Authorization', `Bearer ${userB.token}`)
    .send({
      amount: 100,
      pin: '2222',
      idempotencyKey: 'cross-user-dep-1',
    });
  assert.equal(bDepRes.status, 404);

  // User B tries to delete User A's goal -> 404
  const bDelRes = await request(app)
    .delete(`/api/goals/${goalAId}`)
    .set('Authorization', `Bearer ${userB.token}`);
  assert.equal(bDelRes.status, 404);

  await cleanUsers(pool, ['slice_iso_a@test.com', 'slice_iso_b@test.com']);
});
