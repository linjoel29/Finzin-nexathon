// vault-flow.test.js - integration tests for vault deposits, withdrawals, portfolio, and goals.
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

async function createVaultTestUser(email, mobile) {
  return insertTestUser(pool, { email, mobile, env });
}

test('vault deposit and withdrawal: atomic, cannot withdraw more than vault total', { skip }, async () => {
  const user = await createVaultTestUser('vault_user@test.com', '9666666661');

  // Initial wallet balance: Rs 5,000 (from welcome credit)
  // 1. Deposit Rs 1,000 into Vault
  const depRes = await request(app)
    .post('/api/vault/deposit')
    .set('Authorization', `Bearer ${user.token}`)
    .send({
      amount: 1000,
      pin: '1234',
      idempotencyKey: 'vault-dep-1000-rupees',
    });

  assert.equal(depRes.status, 200);
  assert.equal(depRes.body.walletBalance, 4000);
  assert.equal(depRes.body.vaultTotal, 1000);

  // 2. Save endpoint: save Rs 500 to Vault
  const saveRes = await request(app)
    .post('/api/payments/save')
    .set('Authorization', `Bearer ${user.token}`)
    .send({
      amount: 500,
      pin: '1234',
      idempotencyKey: 'vault-save-500-rupees',
    });

  assert.equal(saveRes.status, 200);
  assert.equal(saveRes.body.walletBalance, 3500);
  assert.equal(saveRes.body.vaultTotal, 1500);

  // 3. Attempt to withdraw Rs 2,000 (exceeds Rs 1,500 available) -> 400
  const overWithdraw = await request(app)
    .post('/api/vault/withdraw')
    .set('Authorization', `Bearer ${user.token}`)
    .send({
      amount: 2000,
      pin: '1234',
      idempotencyKey: 'vault-wdr-fail-rupees',
    });

  assert.equal(overWithdraw.status, 400);
  assert.ok(overWithdraw.body.error.includes('Cannot withdraw more'));

  // 4. Valid withdraw Rs 500 -> wallet becomes 4000, vault becomes 1000
  const wdrRes = await request(app)
    .post('/api/vault/withdraw')
    .set('Authorization', `Bearer ${user.token}`)
    .send({
      amount: 500,
      pin: '1234',
      idempotencyKey: 'vault-wdr-success-rupees',
    });

  assert.equal(wdrRes.status, 200);
  assert.equal(wdrRes.body.walletBalance, 4000);
  assert.equal(wdrRes.body.vaultTotal, 1000);

  // 5. Portfolio check: portfolio breakdown, goals, and monthly projection
  const portfolioRes = await request(app)
    .get('/api/portfolio')
    .set('Authorization', `Bearer ${user.token}`);

  assert.equal(portfolioRes.status, 200);
  assert.equal(portfolioRes.body.wallet, 4000);
  assert.equal(portfolioRes.body.vault.principal, 1000);
  assert.equal(portfolioRes.body.total, 5000);
  assert.equal(portfolioRes.body.projection.length, 4); // 1, 3, 6, 12 months

  await cleanUsers(pool,['vault_user@test.com']);
});

test('goals management: create goal, update allocation, delete goal', { skip }, async () => {
  const user = await createVaultTestUser('goals_user@test.com', '9666666662');

  // Deposit Rs 2,000 to Vault first so user has savings
  await request(app)
    .post('/api/vault/deposit')
    .set('Authorization', `Bearer ${user.token}`)
    .send({ amount: 2000, pin: '1234', idempotencyKey: 'goals-dep-2000' });

  // 1. Create a goal: "New Laptop", target Rs 50,000
  const createRes = await request(app)
    .post('/api/goals')
    .set('Authorization', `Bearer ${user.token}`)
    .send({ name: 'New Laptop', target: 50000 });

  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.name, 'New Laptop');
  assert.equal(createRes.body.target, 50000);
  assert.equal(createRes.body.allocated, 0);
  const goalId = createRes.body.id;

  // 2. Allocate Rs 1,500 (within vault total Rs 2,000)
  const allocRes = await request(app)
    .patch(`/api/goals/${goalId}`)
    .set('Authorization', `Bearer ${user.token}`)
    .send({ allocated: 1500 });

  assert.equal(allocRes.status, 200);
  assert.equal(allocRes.body.allocated, 1500);

  // 3. Allocate Rs 3,000 (exceeds vault total Rs 2,000) -> 400
  const overAlloc = await request(app)
    .patch(`/api/goals/${goalId}`)
    .set('Authorization', `Bearer ${user.token}`)
    .send({ allocated: 3000 });

  assert.equal(overAlloc.status, 400);
  assert.ok(overAlloc.body.error.includes('exceed total vault savings'));

  // 4. Delete goal
  const delRes = await request(app)
    .delete(`/api/goals/${goalId}`)
    .set('Authorization', `Bearer ${user.token}`);

  assert.equal(delRes.status, 200);
  assert.deepEqual(delRes.body, { ok: true });

  await cleanUsers(pool,['goals_user@test.com']);
});
