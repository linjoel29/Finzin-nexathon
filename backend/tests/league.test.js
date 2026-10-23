// league.test.js - Comprehensive test suite for Finzin League gamification,
// championships, private room codes, server-authoritative XP, streaks, and leaderboards.
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { loadEnv } = require('../src/config/env');
const { createPool } = require('../src/config/db');
const { insertTestUser } = require('./helpers');

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

test('Finzin League: Summary returns XP, tier, streaks, and today budget progress', { skip }, async () => {
  const user = await insertTestUser(pool, {
    email: 'league_summary_user@test.com',
    mobile: '9877777001',
    balancePaise: 50000,
    env,
  });

  const res = await request(app)
    .get('/api/league/summary')
    .set('Authorization', `Bearer ${user.token}`);

  assert.equal(res.status, 200);
  assert.equal(typeof res.body.lifetimeXp, 'number');
  assert.equal(typeof res.body.tier, 'string');
  assert.equal(typeof res.body.activeStreak, 'number');
  assert.ok(res.body.today);
  assert.equal(typeof res.body.today.isBudgetSafe, 'boolean');
});

test('Finzin League: Create public championship, join, enforce capacity and validations', { skip }, async () => {
  const host = await insertTestUser(pool, {
    email: 'league_host_1@test.com',
    mobile: '9877777002',
    env,
  });
  const member = await insertTestUser(pool, {
    email: 'league_member_1@test.com',
    mobile: '9877777003',
    env,
  });

  // Validation: short name rejected
  const badRes = await request(app)
    .post('/api/league/championships')
    .set('Authorization', `Bearer ${host.token}`)
    .send({
      name: 'ab', // < 3 chars
      visibility: 'public',
      durationDays: 7,
    });
  assert.equal(badRes.status, 400);

  // Validation: invalid duration rejected
  const badDurRes = await request(app)
    .post('/api/league/championships')
    .set('Authorization', `Bearer ${host.token}`)
    .send({
      name: 'Campus Saver Sprint',
      visibility: 'public',
      durationDays: 5, // must be 7, 14, 30
    });
  assert.equal(badDurRes.status, 400);

  // Create valid public championship
  const createRes = await request(app)
    .post('/api/league/championships')
    .set('Authorization', `Bearer ${host.token}`)
    .send({
      name: 'Hostel Saver Cup',
      description: '7-day hostel budgeting and saving competition',
      visibility: 'public',
      durationDays: 7,
      participantLimit: 2, // small limit to test capacity
    });

  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.championship.name, 'Hostel Saver Cup');
  assert.equal(createRes.body.championship.visibility, 'public');
  const champId = createRes.body.championship.id;

  // Member joins public championship
  const joinRes = await request(app)
    .post(`/api/league/championships/${champId}/join`)
    .set('Authorization', `Bearer ${member.token}`);
  assert.equal(joinRes.status, 200);

  // Third user tries to join when limit is 2
  const extraUser = await insertTestUser(pool, {
    email: 'league_extra_user@test.com',
    mobile: '9877777004',
    env,
  });
  const overCapRes = await request(app)
    .post(`/api/league/championships/${champId}/join`)
    .set('Authorization', `Bearer ${extraUser.token}`);
  assert.equal(overCapRes.status, 400);
  assert.match(overCapRes.body.error, /maximum participant limit/i);
});

test('Finzin League: Private championship, Room ID joining, and isolation', { skip }, async () => {
  const host = await insertTestUser(pool, {
    email: 'league_priv_host@test.com',
    mobile: '9877777005',
    env,
  });
  const friend = await insertTestUser(pool, {
    email: 'league_priv_friend@test.com',
    mobile: '9877777006',
    env,
  });
  const outsider = await insertTestUser(pool, {
    email: 'league_priv_outsider@test.com',
    mobile: '9877777007',
    env,
  });

  // Host creates private championship
  const privRes = await request(app)
    .post('/api/league/championships')
    .set('Authorization', `Bearer ${host.token}`)
    .send({
      name: 'Secret Study Room Saver',
      visibility: 'private',
      durationDays: 14,
      participantLimit: 10,
    });

  assert.equal(privRes.status, 201);
  const roomId = privRes.body.championship.room_id;
  const champId = privRes.body.championship.id;
  assert.ok(roomId, 'Private championship must have a room_id');
  assert.match(roomId, /^[A-Z0-9]{8}$/);

  // Private championship must NOT appear in public discovery list
  const pubListRes = await request(app)
    .get('/api/league/championships/public')
    .set('Authorization', `Bearer ${outsider.token}`);
  const foundInPublic = pubListRes.body.championships.some((c) => c.id === champId);
  assert.equal(foundInPublic, false, 'Private championship must not appear in public listings');

  // Outsider cannot access private championship leaderboard without joining
  const denyRes = await request(app)
    .get(`/api/league/championships/${champId}/leaderboard`)
    .set('Authorization', `Bearer ${outsider.token}`);
  assert.equal(denyRes.status, 403);

  // Friend joins using Room ID
  const joinCodeRes = await request(app)
    .post('/api/league/championships/join-by-code')
    .set('Authorization', `Bearer ${friend.token}`)
    .send({ roomId });
  assert.equal(joinCodeRes.status, 200);

  // Now Friend can access leaderboard
  const friendBoardRes = await request(app)
    .get(`/api/league/championships/${champId}/leaderboard`)
    .set('Authorization', `Bearer ${friend.token}`);
  assert.equal(friendBoardRes.status, 200);
  assert.equal(friendBoardRes.body.leaderboard.length, 2);

  // Leaderboard must NOT expose sensitive personal data (email, phone, account number)
  const firstEntry = friendBoardRes.body.leaderboard[0];
  assert.equal(firstEntry.email, undefined);
  assert.equal(firstEntry.mobile, undefined);
  assert.equal(firstEntry.account_number, undefined);
  assert.ok(firstEntry.displayName);
});

test('Finzin League: Daily quiz, server-authoritative grading, and idempotent XP award', { skip }, async () => {
  const user = await insertTestUser(pool, {
    email: 'league_quiz_tester@test.com',
    mobile: '9877777008',
    env,
  });

  // 1. Fetch today's quiz
  const qRes = await request(app)
    .get('/api/league/quiz/today')
    .set('Authorization', `Bearer ${user.token}`);

  assert.equal(qRes.status, 200);
  assert.ok(qRes.body.question);
  assert.equal(qRes.body.question.correctIndex, undefined, 'Server must never expose correctIndex before submission');

  const questionId = qRes.body.question.id;

  // 2. Submit wrong answer
  const wrongRes = await request(app)
    .post('/api/league/quiz/submit')
    .set('Authorization', `Bearer ${user.token}`)
    .send({
      questionId,
      selectedIndex: 0,
    });
  assert.equal(wrongRes.status, 200);
  assert.equal(typeof wrongRes.body.passed, 'boolean');
  assert.ok(wrongRes.body.explanation);

  // 3. Second submission on the same day is marked as already completed
  const dupRes = await request(app)
    .post('/api/league/quiz/submit')
    .set('Authorization', `Bearer ${user.token}`)
    .send({
      questionId,
      selectedIndex: 2,
    });
  assert.equal(dupRes.status, 200);
  assert.equal(dupRes.body.alreadyCompleted, true);
});

test('Finzin League: Daily budget reward evaluation with 5% buffer and idempotency', { skip }, async () => {
  const user = await insertTestUser(pool, {
    email: 'league_budget_user@test.com',
    mobile: '9877777009',
    balancePaise: 500000,
    env,
  });

  // User has 0 spending today, default limit Rs 200 (20,000 paise).
  // 0 <= 21,000 paise -> eligible!
  const claimRes = await request(app)
    .post('/api/league/challenges/daily_budget/complete')
    .set('Authorization', `Bearer ${user.token}`);

  assert.equal(claimRes.status, 200);
  assert.equal(claimRes.body.result.awarded, true);
  assert.equal(claimRes.body.result.xpAwarded, 10);
  assert.equal(claimRes.body.result.streak, 1);

  // Duplicate claim for the same day is rejected / marked already claimed
  const dupClaimRes = await request(app)
    .post('/api/league/challenges/daily_budget/complete')
    .set('Authorization', `Bearer ${user.token}`);
  assert.equal(dupClaimRes.status, 200);
  assert.equal(dupClaimRes.body.result.alreadyClaimed, true);
});
