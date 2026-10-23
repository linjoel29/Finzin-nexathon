// env.test.js - checks that bad configuration is rejected BEFORE the server starts.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEnv } = require('../src/config/env');

// A valid baseline; each test breaks one thing
const good = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(40),
};

test('valid config loads with defaults', () => {
  const env = loadEnv(good);
  assert.equal(env.PORT, 5000);
  assert.equal(env.CLIENT_ORIGIN, 'http://localhost:5173');
  assert.equal(env.WELCOME_CREDIT_PAISE, 500000);
  assert.equal(env.DEMO_OTP, undefined); // off by default
});

test('missing JWT_SECRET is rejected', () => {
  assert.throws(() => loadEnv({ DATABASE_URL: good.DATABASE_URL }), /JWT_SECRET/);
});

test('short JWT_SECRET is rejected', () => {
  assert.throws(() => loadEnv({ ...good, JWT_SECRET: 'short' }), /at least 32/);
});

test('missing DATABASE_URL is rejected', () => {
  assert.throws(() => loadEnv({ JWT_SECRET: good.JWT_SECRET }), /DATABASE_URL/);
});

test('empty DEMO_OTP counts as off', () => {
  assert.equal(loadEnv({ ...good, DEMO_OTP: '' }).DEMO_OTP, undefined);
});

test('DEMO_OTP must be 6 digits', () => {
  assert.throws(() => loadEnv({ ...good, DEMO_OTP: '12ab' }), /DEMO_OTP/);
});

test('DEMO_OTP is refused in production', () => {
  assert.throws(() => loadEnv({ ...good, NODE_ENV: 'production', DEMO_OTP: '123456' }), /production/);
});

test('error message never contains secret values', () => {
  try { loadEnv({ ...good, JWT_SECRET: 'tooshort-secret-value' }); } catch (e) {
    assert.ok(!e.message.includes('tooshort-secret-value'));
  }
});
