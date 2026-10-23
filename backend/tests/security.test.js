// security.test.js - verifies that all private endpoints reject missing, invalid, expired, or wrong-purpose JWTs with 401.
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');

const env = {
  NODE_ENV: 'test',
  JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-chars-long-1234567890',
  CLIENT_ORIGIN: 'http://localhost:5173',
  WELCOME_CREDIT_PAISE: 500000,
  GEMINI_MODEL: 'gemini-2.0-flash',
};

// Dummy pool for authentication testing (auth check happens in middleware before DB queries)
const dummyPool = {
  query: async () => ({ rows: [] }),
};

const app = createApp({ env, pool: dummyPool });

// List of all private routes and their respective HTTP methods
const privateEndpoints = [
  { method: 'post', path: '/api/auth/unlock' },
  { method: 'post', path: '/api/auth/reset-pin' },
  { method: 'get', path: '/api/profile' },
  { method: 'post', path: '/api/profile/account-details' },
  { method: 'patch', path: '/api/profile' },
  { method: 'get', path: '/api/users/lookup' },
  { method: 'get', path: '/api/me' },
  { method: 'post', path: '/api/payments/transfer' },
  { method: 'post', path: '/api/payments/save' },
  { method: 'get', path: '/api/transactions' },
  { method: 'get', path: '/api/expenses/summary' },
  { method: 'post', path: '/api/vault/deposit' },
  { method: 'post', path: '/api/vault/withdraw' },
  { method: 'get', path: '/api/portfolio' },
  { method: 'post', path: '/api/goals' },
  { method: 'patch', path: '/api/goals/00000000-0000-0000-0000-000000000000' },
  { method: 'delete', path: '/api/goals/00000000-0000-0000-0000-000000000000' },
  { method: 'post', path: '/api/ai/advice' },
];

for (const ep of privateEndpoints) {
  test(`${ep.method.toUpperCase()} ${ep.path} returns 401 without token`, async () => {
    const res = await request(app)[ep.method](ep.path);
    assert.equal(res.status, 401);
  });

  test(`${ep.method.toUpperCase()} ${ep.path} returns 401 with malformed token`, async () => {
    const res = await request(app)[ep.method](ep.path).set('Authorization', 'Bearer invalid-token');
    assert.equal(res.status, 401);
  });

  test(`${ep.method.toUpperCase()} ${ep.path} returns 401 with wrong-purpose token (register instead of session)`, async () => {
    const regToken = jwt.sign({ email: 'user@test.com', purpose: 'register' }, env.JWT_SECRET, { algorithm: 'HS256' });
    const res = await request(app)[ep.method](ep.path).set('Authorization', `Bearer ${regToken}`);
    assert.equal(res.status, 401);
  });

  test(`${ep.method.toUpperCase()} ${ep.path} returns 401 with expired session token`, async () => {
    const expiredToken = jwt.sign(
      { sub: '00000000-0000-0000-0000-000000000000', email: 'user@test.com', purpose: 'session' },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '-1s' }
    );
    const res = await request(app)[ep.method](ep.path).set('Authorization', `Bearer ${expiredToken}`);
    assert.equal(res.status, 401);
  });

  test(`${ep.method.toUpperCase()} ${ep.path} returns 401 with token signed by different secret`, async () => {
    const badSecretToken = jwt.sign(
      { sub: '00000000-0000-0000-0000-000000000000', purpose: 'session' },
      'completely-different-secret-key-1234567890',
      { algorithm: 'HS256' }
    );
    const res = await request(app)[ep.method](ep.path).set('Authorization', `Bearer ${badSecretToken}`);
    assert.equal(res.status, 401);
  });
}
