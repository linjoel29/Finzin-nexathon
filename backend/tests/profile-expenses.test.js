// profile-expenses.test.js - integration tests for profile masking, strict updates, and expense aggregation.
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

async function createProfileTestUser(email, mobile) {
  return insertTestUser(pool, { email, mobile, env });
}

test('profile: GET /api/profile masks mobile and account number, never leaks pin_hash', { skip }, async () => {
  const user = await createProfileTestUser('profile_mask@test.com', '9555555551');

  const res = await request(app).get('/api/profile').set('Authorization', `Bearer ${user.token}`);
  assert.equal(res.status, 200);

  // Check masking
  assert.equal(res.body.mobile, '******5551');
  assert.equal(res.body.accountNumber, `********${user.accountNumber.slice(-4)}`);
  assert.equal(res.body.pin_hash, undefined);
  assert.equal(res.body.pinHash, undefined);
  assert.equal(res.body.college, 'Engineering Institute');

  await cleanUsers(pool,['profile_mask@test.com']);
});

test('profile: POST /api/profile/account-details with PIN returns unmasked account and IFSC', { skip }, async () => {
  const user = await createProfileTestUser('profile_details@test.com', '9555555552');

  const res = await request(app)
    .post('/api/profile/account-details')
    .set('Authorization', `Bearer ${user.token}`)
    .send({ pin: '1234' });

  assert.equal(res.status, 200);
  assert.equal(res.body.accountNumber, user.accountNumber);
  assert.equal(res.body.ifsc, 'FNZN0000001');

  await cleanUsers(pool,['profile_details@test.com']);
});

test('profile: PATCH /api/profile rejects unknown fields (strict zod)', { skip }, async () => {
  const user = await createProfileTestUser('profile_patch@test.com', '9555555553');

  // Attempting to modify mobile or balance must be rejected by strict Zod schema
  const badPatch1 = await request(app)
    .patch('/api/profile')
    .set('Authorization', `Bearer ${user.token}`)
    .send({ mobile: '9999999999' });
  assert.equal(badPatch1.status, 400);

  const badPatch2 = await request(app)
    .patch('/api/profile')
    .set('Authorization', `Bearer ${user.token}`)
    .send({ balance: 999999 });
  assert.equal(badPatch2.status, 400);

  const badPatch3 = await request(app)
    .patch('/api/profile')
    .set('Authorization', `Bearer ${user.token}`)
    .send({ pin: '0000' });
  assert.equal(badPatch3.status, 400);

  // Valid PATCH: updating college and address
  const okPatch = await request(app)
    .patch('/api/profile')
    .set('Authorization', `Bearer ${user.token}`)
    .send({
      college: 'Updated Tech Institute',
      address: { line: '99 Tech Park', city: 'Bangalore', state: 'Karnataka', pincode: '560001' },
    });

  assert.equal(okPatch.status, 200);
  assert.equal(okPatch.body.college, 'Updated Tech Institute');
  assert.equal(okPatch.body.address.city, 'Bangalore');

  await cleanUsers(pool,['profile_patch@test.com']);
});

test('expenses summary: counts ONLY transfer debits within month', { skip }, async () => {
  const alice = await createProfileTestUser('alice_exp@test.com', '9555555554');
  const bob = await createProfileTestUser('bob_exp@test.com', '9555555555');

  // Alice makes two transfers to Bob: food (Rs 150) and recharge (Rs 100)
  await request(app)
    .post('/api/payments/transfer')
    .set('Authorization', `Bearer ${alice.token}`)
    .send({ payee: { mode: 'upi', value: `9555555555@finzin` }, amount: 150, pin: '1234', category: 'food', idempotencyKey: 'exp-food-150' });

  await request(app)
    .post('/api/payments/transfer')
    .set('Authorization', `Bearer ${alice.token}`)
    .send({ payee: { mode: 'upi', value: `9555555555@finzin` }, amount: 100, pin: '1234', category: 'recharge', idempotencyKey: 'exp-recharge-100' });

  // Alice also deposits Rs 500 to Vault (should NOT be counted in expense summary as it is not a 'transfer')
  await request(app)
    .post('/api/vault/deposit')
    .set('Authorization', `Bearer ${alice.token}`)
    .send({ amount: 500, pin: '1234', idempotencyKey: 'exp-vault-500' });

  const summaryRes = await request(app)
    .get('/api/expenses/summary')
    .set('Authorization', `Bearer ${alice.token}`);

  assert.equal(summaryRes.status, 200);
  assert.equal(summaryRes.body.budget, 8000);
  assert.equal(summaryRes.body.byCategory.food, 150);
  assert.equal(summaryRes.body.byCategory.recharge, 100);
  assert.equal(summaryRes.body.byCategory.travel, 0);
  assert.equal(summaryRes.body.spent, 250); // 150 + 100
  assert.equal(summaryRes.body.remaining, 7750); // 8000 - 250
  assert.ok(Array.isArray(summaryRes.body.days));

  await cleanUsers(pool,['alice_exp@test.com', 'bob_exp@test.com']);
});
