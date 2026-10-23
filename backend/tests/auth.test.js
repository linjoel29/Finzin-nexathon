// auth.test.js - integration tests for OTP flow, registration, PIN lockouts, and PIN reset.
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

const { cleanUsers, insertTestUser } = require('./helpers');

let pool, app, sentEmails = [];

const fakeMailer = {
  sendOtpEmail: async ({ to, code }) => {
    sentEmails.push({ to, code });
  },
};

test.before(async () => {
  if (!dbUrl) return;
  pool = createPool(dbUrl);
  app = createApp({ env, pool, mailer: fakeMailer });
});

test.after(async () => {
  if (pool) await pool.end();
});

const cleanUser = (email, mobile) => cleanUsers(pool, [email], [mobile]);

test('send-otp returns generic message and enforces 60s resend cooldown', { skip }, async () => {
  const testEmail = 'otptest_cooldown@student.edu';
  await cleanUser(testEmail, '9888888881');
  sentEmails = [];

  // 1. Send OTP
  const res1 = await request(app).post('/api/auth/send-otp').send({ email: testEmail });
  assert.equal(res1.status, 200);
  assert.deepEqual(res1.body, { message: 'If this email is valid, a verification code has been sent' });
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, testEmail);

  // 2. Immediate resend triggers 429 cooldown
  const res2 = await request(app).post('/api/auth/send-otp').send({ email: testEmail });
  assert.equal(res2.status, 429);
  assert.ok(res2.body.error.includes('Please wait'));

  await cleanUser(testEmail, '9888888881');
});

test('verify-otp: 5 wrong attempts kills the OTP', { skip }, async () => {
  const testEmail = 'otptest_wrong@student.edu';
  await cleanUser(testEmail, '9888888882');
  sentEmails = [];

  // Send OTP
  await request(app).post('/api/auth/send-otp').send({ email: testEmail });
  assert.equal(sentEmails.length, 1);
  const realCode = sentEmails[0].code;
  const wrongCode = realCode === '111111' ? '222222' : '111111';

  // 4 wrong attempts
  for (let i = 0; i < 4; i++) {
    const res = await request(app).post('/api/auth/verify-otp').send({ email: testEmail, code: wrongCode });
    assert.equal(res.status, 400);
  }

  // 5th wrong attempt kills the OTP
  const res5 = await request(app).post('/api/auth/verify-otp').send({ email: testEmail, code: wrongCode });
  assert.equal(res5.status, 400);
  assert.ok(res5.body.error.includes('failed attempts'));

  // Now even the correct code is rejected
  const resDead = await request(app).post('/api/auth/verify-otp').send({ email: testEmail, code: realCode });
  assert.equal(resDead.status, 400);
  assert.ok(resDead.body.error.includes('Invalid or expired OTP'));

  await cleanUser(testEmail, '9888888882');
});

test('verify-otp: expired OTP is rejected', { skip }, async () => {
  const testEmail = 'otptest_expired@student.edu';
  await cleanUser(testEmail, '9888888883');
  sentEmails = [];

  await request(app).post('/api/auth/send-otp').send({ email: testEmail });
  // Manually expire the OTP in the database
  await pool.query("UPDATE otps SET expires_at = now() - interval '1 second' WHERE email = $1", [testEmail]);

  const res = await request(app).post('/api/auth/verify-otp').send({ email: testEmail, code: sentEmails[0].code });
  assert.equal(res.status, 400);
  assert.ok(res.body.error.includes('expired'));

  await cleanUser(testEmail, '9888888883');
});

test('registration: user + account + welcome ledger created in ONE transaction', { skip }, async () => {
  const email = 'regtest_success@student.edu';
  const mobile = '9888888884';
  await cleanUser(email, mobile);
  sentEmails = [];

  // Step 1: Send & verify OTP to get registration token
  await request(app).post('/api/auth/send-otp').send({ email });
  const verifyRes = await request(app).post('/api/auth/verify-otp').send({ email, code: sentEmails[0].code });
  assert.equal(verifyRes.status, 200);
  assert.equal(verifyRes.body.isNewUser, true);
  const registrationToken = verifyRes.body.registrationToken;

  // Step 2: Register user
  const regRes = await request(app).post('/api/auth/register').send({
    registrationToken,
    fullName: 'Lin Student',
    dob: '2004-05-15',
    gender: 'female',
    mobile,
    address: { line: '12 Campus Rd', city: 'Mangalore', state: 'Karnataka', pincode: '575001' },
    college: 'Yenepoya University',
    studentId: 'STU202401',
    nominee: { name: 'Parent Lin', relation: 'Mother' },
    pin: '1234',
    consent: true,
  });

  assert.equal(regRes.status, 201);
  assert.ok(regRes.body.token);
  assert.equal(regRes.body.user.email, email);
  assert.equal(regRes.body.user.upiId, `${mobile}@finzin`);

  // Verify DB state: accounts row has WELCOME_CREDIT_PAISE (Rs 5,000 = 500000 paise)
  const accRes = await pool.query('SELECT balance FROM accounts WHERE user_id = $1', [regRes.body.user.id]);
  assert.equal(accRes.rows[0].balance, 500000);

  // Verify DB state: transactions ledger has welcome_credit
  const txRes = await pool.query('SELECT type, amount FROM transactions WHERE to_user = $1', [regRes.body.user.id]);
  assert.equal(txRes.rows.length, 1);
  assert.equal(txRes.rows[0].type, 'welcome_credit');
  assert.equal(txRes.rows[0].amount, 500000);

  // Duplicate mobile registration rejected
  const dupRes = await request(app).post('/api/auth/register').send({
    registrationToken,
    fullName: 'Duplicate Lin',
    dob: '2004-05-15',
    mobile,
    address: { line: '12 Campus Rd', city: 'Mangalore', state: 'Karnataka', pincode: '575001' },
    college: 'Yenepoya University',
    studentId: 'STU202402',
    nominee: { name: 'Parent', relation: 'Father' },
    pin: '1234',
    consent: true,
  });
  assert.equal(dupRes.status, 400);

  await cleanUser(email, mobile);
});

test('PIN lockout: 3 wrong tries lock for 15 min; correct PIN resets counter', { skip }, async () => {
  const email = 'pintest@student.edu';
  const mobile = '9888888885';

  // Provision user directly to avoid consuming send-otp IP rate limit quota
  const testUser = await insertTestUser(pool, { email, mobile, pin: '1234', env });
  const sessionToken = testUser.token;

  // 1. Wrong PIN attempt 1
  const w1 = await request(app).post('/api/auth/unlock').set('Authorization', `Bearer ${sessionToken}`).send({ pin: '0000' });
  assert.equal(w1.status, 400);

  // 2. Wrong PIN attempt 2
  const w2 = await request(app).post('/api/auth/unlock').set('Authorization', `Bearer ${sessionToken}`).send({ pin: '0000' });
  assert.equal(w2.status, 400);

  // 3. Wrong PIN attempt 3 triggers lockout (423)
  const w3 = await request(app).post('/api/auth/unlock').set('Authorization', `Bearer ${sessionToken}`).send({ pin: '0000' });
  assert.equal(w3.status, 423);
  assert.ok(w3.body.error.includes('PIN locked'));

  // 4. Subsequent attempts remain locked with 423
  const locked = await request(app).post('/api/auth/unlock').set('Authorization', `Bearer ${sessionToken}`).send({ pin: '1234' });
  assert.equal(locked.status, 423);

  // Clear lock in DB to test counter reset on correct PIN
  await pool.query('UPDATE users SET pin_locked_until = NULL, pin_attempts = 1 WHERE email = $1', [email]);
  const correct = await request(app).post('/api/auth/unlock').set('Authorization', `Bearer ${sessionToken}`).send({ pin: '1234' });
  assert.equal(correct.status, 200);
  assert.deepEqual(correct.body, { ok: true });

  // Verify counter was reset to 0 in DB
  const userCheck = await pool.query('SELECT pin_attempts FROM users WHERE email = $1', [email]);
  assert.equal(userCheck.rows[0].pin_attempts, 0);

  await cleanUser(email, mobile);
});
