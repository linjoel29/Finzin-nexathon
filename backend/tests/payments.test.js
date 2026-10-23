// payments.test.js - integration tests for recipient lookup, payments transfer, concurrency safety, and transaction history.
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createPool } = require('../src/config/db');
const { createApp } = require('../src/app');

const dbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const skip = dbUrl ? false : 'TEST_DATABASE_URL not set';

const env = {
  NODE_ENV: 'test',
  JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-chars-long-1234567890',
  CLIENT_ORIGIN: 'http://localhost:5173',
  WELCOME_CREDIT_PAISE: 500000,
  DEMO_OTP: undefined,
  GEMINI_MODEL: 'gemini-2.0-flash',
};

let pool, app;

test.before(async () => {
  if (!dbUrl) return;
  pool = createPool(dbUrl);
  app = createApp({ env, pool });
});

test.after(async () => {
  if (pool) await pool.end();
});

const { cleanUsers, insertTestUser } = require('./helpers');

// Helper to register a test user directly via helper
async function createTestUser(email, mobile, pin = '1234') {
  return insertTestUser(pool, { email, mobile, pin, env });
}

test('recipient lookup returns ONLY name and upiId (no mobile, email, or account number)', { skip }, async () => {
  const alice = await createTestUser('alice_lookup@test.com', '9777777771');
  const bob = await createTestUser('bob_lookup@test.com', '9777777772');

  // Lookup by UPI ID
  const upiRes = await request(app)
    .get('/api/users/lookup')
    .set('Authorization', `Bearer ${alice.token}`)
    .query({ mode: 'upi', value: bob.upiId });

  assert.equal(upiRes.status, 200);
  assert.equal(upiRes.body.name, 'User 7772');
  assert.equal(upiRes.body.upiId, bob.upiId);
  assert.equal(upiRes.body.mobile, undefined);
  assert.equal(upiRes.body.email, undefined);
  assert.equal(upiRes.body.accountNumber, undefined);

  // Lookup by Mobile
  const mobileRes = await request(app)
    .get('/api/users/lookup')
    .set('Authorization', `Bearer ${alice.token}`)
    .query({ mode: 'mobile', value: bob.mobile });

  assert.equal(mobileRes.status, 200);
  assert.equal(mobileRes.body.name, 'User 7772');
  assert.equal(mobileRes.body.upiId, bob.upiId);

  // Lookup by Bank mode with demo IFSC
  const bankRes = await request(app)
    .get('/api/users/lookup')
    .set('Authorization', `Bearer ${alice.token}`)
    .query({ mode: 'bank', value: bob.accountNumber, ifsc: 'FNZN0000001' });

  assert.equal(bankRes.status, 200);
  assert.equal(bankRes.body.name, 'User 7772');

  // Lookup miss returns 404 generic error
  const missRes = await request(app)
    .get('/api/users/lookup')
    .set('Authorization', `Bearer ${alice.token}`)
    .query({ mode: 'upi', value: 'nonexistent@finzin' });

  assert.equal(missRes.status, 404);
  assert.equal(missRes.body.error, 'Recipient not found');

  await cleanUsers(pool,['alice_lookup@test.com', 'bob_lookup@test.com']);
});

test('payments transfer: balance exact, self-pay blocked, > Rs 50k blocked, idempotency duplicate charges once', { skip }, async () => {
  const alice = await createTestUser('alice_tx@test.com', '9777777773');
  const bob = await createTestUser('bob_tx@test.com', '9777777774');

  // 1. Self-pay blocked
  const selfRes = await request(app)
    .post('/api/payments/transfer')
    .set('Authorization', `Bearer ${alice.token}`)
    .send({
      payee: { mode: 'upi', value: alice.upiId },
      amount: 100,
      pin: '1234',
      category: 'food',
      idempotencyKey: 'key-self-pay-12345',
    });
  assert.equal(selfRes.status, 400);
  assert.ok(selfRes.body.error.includes('yourself'));

  // 2. > Rs 50,000 blocked
  const overMaxRes = await request(app)
    .post('/api/payments/transfer')
    .set('Authorization', `Bearer ${alice.token}`)
    .send({
      payee: { mode: 'upi', value: bob.upiId },
      amount: 50000.01,
      pin: '1234',
      category: 'others',
      idempotencyKey: 'key-overmax-12345',
    });
  assert.equal(overMaxRes.status, 400);

  // 3. Valid transfer: Alice pays Bob Rs 200 (both started with welcome credit Rs 5,000)
  const txRes = await request(app)
    .post('/api/payments/transfer')
    .set('Authorization', `Bearer ${alice.token}`)
    .send({
      payee: { mode: 'upi', value: bob.upiId },
      amount: 200,
      pin: '1234',
      category: 'food',
      note: 'Lunch share',
      idempotencyKey: 'key-idem-200-rupees',
    });

  assert.equal(txRes.status, 200);
  assert.equal(txRes.body.transaction.amount, 200);
  assert.equal(txRes.body.transaction.title, 'User 7774'); // Payee name decided by server
  assert.equal(txRes.body.transaction.category, 'food');
  assert.equal(txRes.body.balance, 4800); // 5000 - 200 = 4800

  // Verify Bob's balance increased by Rs 200
  const bobAcc = await pool.query('SELECT balance FROM accounts WHERE user_id = $1', [bob.id]);
  assert.equal(bobAcc.rows[0].balance, 520000); // 5200 rupees in paise

  // 4. Duplicate idempotency key charges nothing extra and returns original transaction
  const dupRes = await request(app)
    .post('/api/payments/transfer')
    .set('Authorization', `Bearer ${alice.token}`)
    .send({
      payee: { mode: 'upi', value: bob.upiId },
      amount: 200,
      pin: '1234',
      category: 'food',
      note: 'Lunch share',
      idempotencyKey: 'key-idem-200-rupees',
    });

  assert.equal(dupRes.status, 200);
  assert.equal(dupRes.body.transaction.id, txRes.body.transaction.id);
  assert.equal(dupRes.body.balance, 4800);

  // Alice balance still 4800
  const aliceAcc = await pool.query('SELECT balance FROM accounts WHERE user_id = $1', [alice.id]);
  assert.equal(aliceAcc.rows[0].balance, 480000);

  await cleanUsers(pool,['alice_tx@test.com', 'bob_tx@test.com']);
});

test('payments transfer: 10 PARALLEL transfers exceeding balance never overdraw', { skip }, async () => {
  const alice = await createTestUser('alice_parallel@test.com', '9777777775');
  const bob = await createTestUser('bob_parallel@test.com', '9777777776');

  // Set Alice balance to exactly Rs 1,000 (100,000 paise)
  await pool.query('UPDATE accounts SET balance = 100000 WHERE user_id = $1', [alice.id]);

  // Attempt 10 parallel transfers of Rs 200 each (total Rs 2,000, which exceeds Rs 1,000)
  const transferPromises = Array.from({ length: 10 }, (_, i) =>
    request(app)
      .post('/api/payments/transfer')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({
        payee: { mode: 'upi', value: bob.upiId },
        amount: 200,
        pin: '1234',
        category: 'shopping',
        idempotencyKey: `parallel-key-attempt-${i}-${Date.now()}`,
      })
  );

  const results = await Promise.all(transferPromises);
  const successes = results.filter((r) => r.status === 200);
  const failures = results.filter((r) => r.status === 400);

  // Exactly 5 should succeed (5 * 200 = 1,000), 5 should fail with insufficient balance
  assert.equal(successes.length, 5);
  assert.equal(failures.length, 5);

  // Check Alice balance is exactly 0 and NEVER negative
  const finalAliceAcc = await pool.query('SELECT balance FROM accounts WHERE user_id = $1', [alice.id]);
  assert.equal(finalAliceAcc.rows[0].balance, 0);

  await cleanUsers(pool,['alice_parallel@test.com', 'bob_parallel@test.com']);
});

test('payments transfer & history: atomic transfer, row locks, insufficient funds rollback, and unified history', { skip }, async () => {
  const sender = await createTestUser('sender_hist@test.com', '9777777788');
  const receiver = await createTestUser('receiver_hist@test.com', '9777777789');

  // 1. Recipient not found returns 404
  const notFoundRes = await request(app)
    .post('/api/payments/transfer')
    .set('Authorization', `Bearer ${sender.token}`)
    .send({
      payee: { mode: 'upi', value: 'nonexistent_user@finzin' },
      amount_paise: 50000,
    });
  assert.equal(notFoundRes.status, 404);
  assert.equal(notFoundRes.body.error, 'Recipient not found');

  // 2. Insufficient funds returns 400 Insufficient funds
  const overdrawRes = await request(app)
    .post('/api/payments/transfer')
    .set('Authorization', `Bearer ${sender.token}`)
    .send({
      payee: { mode: 'upi', value: receiver.upiId },
      amount_paise: 999999999, // Exceeds balance
    });
  assert.equal(overdrawRes.status, 400);

  // 3. Successful atomic transfer with amount_paise and idempotency_key
  const txRes = await request(app)
    .post('/api/payments/transfer')
    .set('Authorization', `Bearer ${sender.token}`)
    .send({
      payee: { mode: 'upi', value: receiver.upiId },
      amount_paise: 25000, // Rs 250.00
      category: 'travel',
      description: 'Campus shuttle',
      idempotency_key: '550e8400-e29b-41d4-a716-446655440000',
    });

  assert.equal(txRes.status, 200);
  assert.equal(txRes.body.success, true);
  assert.equal(txRes.body.amount_paise, 25000);
  assert.equal(txRes.body.amount, 250);
  assert.equal(txRes.body.type, 'DEBIT');
  assert.equal(txRes.body.category, 'travel');
  assert.equal(txRes.body.counterparty_name, 'User 7789');
  assert.ok(txRes.body.transaction_id);

  // 4. Verify sender's GET /api/payments/history returns DEBIT record at top
  const senderHistRes = await request(app)
    .get('/api/payments/history')
    .set('Authorization', `Bearer ${sender.token}`);

  assert.equal(senderHistRes.status, 200);
  assert.ok(Array.isArray(senderHistRes.body));
  assert.ok(senderHistRes.body.length >= 2); // transfer + welcome credit

  const latestDebit = senderHistRes.body[0];
  assert.equal(latestDebit.type, 'DEBIT');
  assert.equal(latestDebit.amount_paise, 25000);
  assert.equal(latestDebit.amount, 250);
  assert.equal(latestDebit.category, 'travel');
  assert.equal(latestDebit.counterparty_name, 'User 7789');
  assert.ok(latestDebit.transaction_id);
  assert.ok(latestDebit.created_at);

  // 5. Verify receiver's GET /api/payments/history returns CREDIT record at top
  const receiverHistRes = await request(app)
    .get('/api/payments/history')
    .set('Authorization', `Bearer ${receiver.token}`);

  assert.equal(receiverHistRes.status, 200);
  assert.ok(Array.isArray(receiverHistRes.body));
  const latestCredit = receiverHistRes.body[0];
  assert.equal(latestCredit.type, 'CREDIT');
  assert.equal(latestCredit.amount_paise, 25000);
  assert.equal(latestCredit.amount, 250);
  assert.equal(latestCredit.category, 'travel');
  assert.equal(latestCredit.counterparty_name, 'User 7788');

  await cleanUsers(pool, ['sender_hist@test.com', 'receiver_hist@test.com']);
});

