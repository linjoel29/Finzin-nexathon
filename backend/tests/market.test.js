// market.test.js - Tests for Fixed Deposits, Gold/Silver bullion, and Bonds educational endpoints.
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { loadEnv } = require('../src/config/env');
const { createPool } = require('../src/config/db');

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

test('GET /api/market/fixed-deposits returns bank FD rates and educational disclaimers', { skip }, async () => {
  const res = await request(app).get('/api/market/fixed-deposits');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.items));
  assert.ok(res.body.items.length >= 4);

  const sbi = res.body.items.find((item) => item.id === 'fd-sbi-amrit-kalash');
  assert.ok(sbi);
  assert.equal(sbi.interestRate, 7.1);
  assert.ok(sbi.tenure);
  assert.ok(sbi.sourceUrl);
  assert.ok(res.body.disclaimer.includes('Educational rate comparison only'));
});

test('GET /api/market/fixed-deposits/calculate computes quarterly compounded maturity and interest', { skip }, async () => {
  const res = await request(app).get('/api/market/fixed-deposits/calculate?principal=10000&rate=7.10&tenureMonths=12');
  assert.equal(res.status, 200);
  assert.equal(res.body.principal, 10000);
  assert.ok(res.body.maturity > 10000);
  assert.ok(res.body.interestEarned > 700);
});

test('GET /api/market/gold-silver returns benchmark precious metals rates and spread disclaimers', { skip }, async () => {
  const res = await request(app).get('/api/market/gold-silver');
  assert.equal(res.status, 200);
  assert.ok(res.body.gold24k.ratePerGram > 5000);
  assert.ok(res.body.gold22k.ratePerGram > 4000);
  assert.ok(res.body.silver.ratePerGram > 50);
  assert.ok(res.body.source.includes('IBJA'));
  assert.ok(Array.isArray(res.body.disclaimers));
  assert.ok(res.body.disclaimer.includes('Indicative precious metals benchmark'));
});

test('GET /api/market/bonds returns sovereign/CPSE bonds with coupon vs YTM distinction', { skip }, async () => {
  const res = await request(app).get('/api/market/bonds');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.items));
  assert.ok(res.body.items.length >= 3);

  const goi = res.body.items.find((b) => b.id === 'bond-goi-718-2033');
  assert.ok(goi);
  assert.equal(goi.couponRate, 7.18);
  assert.equal(goi.yieldToMaturity, 7.22);
  assert.ok(goi.rateExplanation.includes('Coupon Rate is'));
  assert.ok(res.body.disclaimer.includes('Educational bond discovery only'));
});
