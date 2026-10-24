// cors.test.js - verifies CORS origin validation and preflight handling.
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { isAllowedOrigin } = require('../src/config/cors');

const env = {
  NODE_ENV: 'test',
  JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-chars-long-1234567890',
  CLIENT_ORIGIN: 'http://localhost:5173',
  WELCOME_CREDIT_PAISE: 500000,
  DEMO_OTP: undefined,
};

const dummyPool = {
  query: async () => ({ rows: [] }),
};

const app = createApp({ env, pool: dummyPool });

test('isAllowedOrigin: accepts exact production and git branch frontend origins', () => {
  // Main production frontend
  assert.equal(isAllowedOrigin('https://finzinnexathon.vercel.app', env.CLIENT_ORIGIN), true);
  assert.equal(isAllowedOrigin('https://finzinnexathon.vercel.app/', env.CLIENT_ORIGIN), true);

  // Git branch deployment frontend (reported failing in prompt)
  assert.equal(isAllowedOrigin('https://finzinnexathon-git-main-linjoel29s-projects.vercel.app', env.CLIENT_ORIGIN), true);
  assert.equal(isAllowedOrigin('https://finzinnexathon-git-main-linjoel29s-projects.vercel.app/', env.CLIENT_ORIGIN), true);
});

test('isAllowedOrigin: accepts valid Vercel preview deployments for this project', () => {
  assert.equal(isAllowedOrigin('https://finzinnexathon-git-feature-new-linjoel29s-projects.vercel.app', env.CLIENT_ORIGIN), true);
  assert.equal(isAllowedOrigin('https://finzinnexathon-preview-123.vercel.app', env.CLIENT_ORIGIN), true);
  assert.equal(isAllowedOrigin('https://finzinnexathon-pr-42-linjoel29s-projects.vercel.app', env.CLIENT_ORIGIN), true);
});

test('isAllowedOrigin: accepts configured CLIENT_ORIGIN from env (single or comma-separated)', () => {
  assert.equal(isAllowedOrigin('http://localhost:5173', 'http://localhost:5173'), true);
  assert.equal(isAllowedOrigin('http://localhost:5173/', 'http://localhost:5173'), true);

  const multiple = 'http://localhost:5173,https://custom-preview.internal';
  assert.equal(isAllowedOrigin('http://localhost:5173', multiple), true);
  assert.equal(isAllowedOrigin('https://custom-preview.internal', multiple), true);
});

test('isAllowedOrigin: rejects arbitrary or malicious origins', () => {
  // Arbitrary external domain
  assert.equal(isAllowedOrigin('https://evil.example.com', env.CLIENT_ORIGIN), false);

  // Impersonator prefix
  assert.equal(isAllowedOrigin('https://evil-finzinnexathon.vercel.app', env.CLIENT_ORIGIN), false);

  // Impersonator suffix
  assert.equal(isAllowedOrigin('https://finzinnexathon.evil.com', env.CLIENT_ORIGIN), false);
  assert.equal(isAllowedOrigin('https://finzinnexathon.vercel.app.attacker.com', env.CLIENT_ORIGIN), false);

  // Insecure HTTP for cloud domain
  assert.equal(isAllowedOrigin('http://finzinnexathon.vercel.app', env.CLIENT_ORIGIN), false);

  // Spoofed non-standard port
  assert.equal(isAllowedOrigin('https://finzinnexathon.vercel.app:8443', env.CLIENT_ORIGIN), false);

  // Different project on user's Vercel account
  assert.equal(isAllowedOrigin('https://otherproject-linjoel29s-projects.vercel.app', env.CLIENT_ORIGIN), false);

  // Empty or invalid types
  assert.equal(isAllowedOrigin('', env.CLIENT_ORIGIN), false);
  assert.equal(isAllowedOrigin(null, env.CLIENT_ORIGIN), false);
  assert.equal(isAllowedOrigin(undefined, env.CLIENT_ORIGIN), false);
});

test('HTTP preflight OPTIONS /api/auth/send-otp: allowed origin returns 204 with CORS headers', async () => {
  const origin = 'https://finzinnexathon-git-main-linjoel29s-projects.vercel.app';
  const res = await request(app)
    .options('/api/auth/send-otp')
    .set('Origin', origin)
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'Content-Type,Authorization');

  assert.equal(res.status, 204);
  assert.equal(res.headers['access-control-allow-origin'], origin);
  assert.ok(res.headers['access-control-allow-methods'].includes('POST'));
  assert.ok(res.headers['access-control-allow-headers'].includes('Content-Type'));
  assert.ok(res.headers['access-control-allow-headers'].includes('Authorization'));
});

test('HTTP preflight OPTIONS /api/auth/send-otp: main production origin returns 204 with CORS headers', async () => {
  const origin = 'https://finzinnexathon.vercel.app';
  const res = await request(app)
    .options('/api/auth/send-otp')
    .set('Origin', origin)
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'Content-Type');

  assert.equal(res.status, 204);
  assert.equal(res.headers['access-control-allow-origin'], origin);
});

test('HTTP POST /api/auth/send-otp: allowed origin sets matching Access-Control-Allow-Origin', async () => {
  const origin = 'https://finzinnexathon-git-main-linjoel29s-projects.vercel.app';
  const res = await request(app)
    .post('/api/auth/send-otp')
    .set('Origin', origin)
    .set('Content-Type', 'application/json')
    .send({ email: 'test@student.edu' });

  // Regardless of route validation/rate limiting, CORS header must match origin
  assert.equal(res.headers['access-control-allow-origin'], origin);
});

test('HTTP preflight OPTIONS /api/auth/send-otp: untrusted origin does NOT receive Access-Control-Allow-Origin', async () => {
  const res = await request(app)
    .options('/api/auth/send-otp')
    .set('Origin', 'https://untrusted-attacker.com')
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'Content-Type');

  assert.equal(res.headers['access-control-allow-origin'], undefined);
});

test('HTTP POST /api/auth/send-otp: untrusted origin does NOT receive Access-Control-Allow-Origin', async () => {
  const res = await request(app)
    .post('/api/auth/send-otp')
    .set('Origin', 'https://untrusted-attacker.com')
    .set('Content-Type', 'application/json')
    .send({ email: 'test@student.edu' });

  assert.equal(res.headers['access-control-allow-origin'], undefined);
});
