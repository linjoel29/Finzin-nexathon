// app.test.js - checks the HTTP layer: health, security headers, CORS, body limits, error format.
// Needs a database: set TEST_DATABASE_URL (a local/test Postgres), otherwise these tests are skipped.
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createPool } = require('../src/config/db');
const { createApp } = require('../src/app');

const dbUrl = process.env.TEST_DATABASE_URL;
const skip = dbUrl ? false : 'TEST_DATABASE_URL not set';

const env = { NODE_ENV: 'test', CLIENT_ORIGIN: 'http://localhost:5173' };
let pool, app;

test.before(() => {
  if (!dbUrl) return;
  pool = createPool(dbUrl);
  app = createApp({ env, pool });
});
test.after(async () => { if (pool) await pool.end(); });

test('GET /health returns 200 ok for uptime pings without database', async () => {
  const testApp = createApp({ env: { NODE_ENV: 'test', CLIENT_ORIGIN: 'http://localhost:5173' }, pool: {} });
  const res = await request(testApp).get('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok' });
});

test('GET /api/health returns ok and db connected', { skip }, async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok', db: 'connected' });
});

test('security headers present, X-Powered-By hidden', { skip }, async () => {
  const res = await request(app).get('/api/health');
  assert.ok(res.headers['x-content-type-options']);
  assert.equal(res.headers['x-powered-by'], undefined);
});

test('unknown route gives JSON 404', { skip }, async () => {
  const res = await request(app).get('/api/nope');
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: 'Not found' });
});

test('CORS allows the frontend origin only', { skip }, async () => {
  const ok = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
  assert.equal(ok.headers['access-control-allow-origin'], 'http://localhost:5173');
  const bad = await request(app).get('/api/health').set('Origin', 'http://evil.example');
  assert.notEqual(bad.headers['access-control-allow-origin'], 'http://evil.example');
});

test('body over 10kb is rejected with 413', { skip }, async () => {
  const res = await request(app).post('/api/anything').send({ big: 'x'.repeat(20000) });
  assert.equal(res.status, 413);
});

test('invalid JSON gives 400, not a stack trace', { skip }, async () => {
  const res = await request(app).post('/api/anything').set('Content-Type', 'application/json').send('{bad json');
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: 'Invalid JSON' });
});

test('DB failure gives generic 500 with no details', { skip }, async () => {
  // A pool whose query always fails, to prove nothing leaks
  const brokenPool = { query: async () => { throw new Error('secret db detail: password=hunter2'); } };
  const res = await request(createApp({ env, pool: brokenPool })).get('/api/health');
  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { error: 'Something went wrong' });
  assert.ok(!JSON.stringify(res.body).includes('hunter2'));
});
