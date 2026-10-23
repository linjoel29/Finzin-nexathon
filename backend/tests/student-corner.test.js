// student-corner.test.js - Tests for Student Corner APIs, filtering, eligibility, and bookmarks.
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { loadEnv } = require('../src/config/env');
const { createPool } = require('../src/config/db');
const { insertTestUser, cleanUsers } = require('./helpers');

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

test('GET /api/student-corner/internships returns genuine verified listings and supports filters', { skip }, async () => {
  const res = await request(app).get('/api/student-corner/internships');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.items));
  assert.ok(res.body.items.length > 0);
  assert.equal(res.body.sourceType, 'curated_verified');
  assert.ok(res.body.lastVerifiedAt);

  // Validate item structure
  const first = res.body.items[0];
  assert.ok(first.id);
  assert.ok(first.title);
  assert.ok(first.company);
  assert.ok(first.workMode);
  assert.ok(first.sourceUrl);
  assert.ok(first.lastVerifiedAt);
  assert.equal(first.isVerified, true);

  // Test filter by workMode=remote
  const remoteRes = await request(app).get('/api/student-corner/internships?workMode=remote');
  assert.equal(remoteRes.status, 200);
  assert.ok(remoteRes.body.items.every((i) => i.workMode === 'remote'));

  // Test search
  const searchRes = await request(app).get('/api/student-corner/internships?search=Google');
  assert.equal(searchRes.status, 200);
  assert.ok(searchRes.body.items.some((i) => i.company.includes('Google')));
});

test('GET /api/student-corner/scholarships returns official opportunities and supports filters', { skip }, async () => {
  const res = await request(app).get('/api/student-corner/scholarships');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.items));
  assert.ok(res.body.items.length > 0);

  const nsp = res.body.items.find((s) => s.id === 'sch-nsp-central-sector');
  assert.ok(nsp, 'NSP scholarship must be listed');
  assert.ok(nsp.provider);
  assert.ok(nsp.awardAmount);
  assert.ok(nsp.applicationUrl);
  assert.ok(Array.isArray(nsp.requiredDocuments));
  assert.ok(nsp.familyIncomeLimit > 0);

  // Filter by course
  const engRes = await request(app).get('/api/student-corner/scholarships?course=engineering');
  assert.equal(engRes.status, 200);
  assert.ok(engRes.body.items.length > 0);
});

test('POST /api/student-corner/scholarships/eligibility evaluates eligibility without guarantees', { skip }, async () => {
  // Case 1: Likely eligible (female engineering student under income limit)
  const okRes = await request(app)
    .post('/api/student-corner/scholarships/eligibility')
    .send({
      scholarshipId: 'sch-aicte-pragati',
      course: 'B.Tech',
      studyYear: 1,
      gender: 'female',
      annualFamilyIncome: 400000,
      academicScore: 85,
    });

  assert.equal(okRes.status, 200);
  assert.equal(okRes.body.status, 'Likely eligible');
  assert.ok(okRes.body.disclaimer.includes('never guarantees'));

  // Case 2: Not eligible based on provided details (male for female-only scheme)
  const disqualifiedRes = await request(app)
    .post('/api/student-corner/scholarships/eligibility')
    .send({
      scholarshipId: 'sch-aicte-pragati',
      course: 'B.Tech',
      studyYear: 1,
      gender: 'male',
      annualFamilyIncome: 400000,
      academicScore: 85,
    });

  assert.equal(disqualifiedRes.status, 200);
  assert.equal(disqualifiedRes.body.status, 'Not eligible based on provided details');
  assert.ok(disqualifiedRes.body.reasons.some((r) => r.includes('exclusively for female')));

  // Case 3: Check requirements when required info is missing
  const missingRes = await request(app)
    .post('/api/student-corner/scholarships/eligibility')
    .send({
      scholarshipId: 'sch-aicte-pragati',
      course: 'B.Tech',
      // income and gender missing
    });

  assert.equal(missingRes.status, 200);
  assert.equal(missingRes.body.status, 'Check requirements');
  assert.ok(missingRes.body.missingDetails.length > 0);

  // Case 4: Non-existent scholarship returns 404
  const notFoundRes = await request(app)
    .post('/api/student-corner/scholarships/eligibility')
    .send({
      scholarshipId: 'non-existent-id',
      course: 'B.Tech',
    });
  assert.equal(notFoundRes.status, 404);
});

test('GET /api/student-corner/offers returns genuine verified student discounts', { skip }, async () => {
  const res = await request(app).get('/api/student-corner/offers');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.items));
  assert.ok(res.body.items.length > 0);

  const spotify = res.body.items.find((o) => o.id === 'off-spotify-student');
  assert.ok(spotify);
  assert.equal(spotify.discountedPrice, '₹59 / month');
  assert.ok(spotify.redemptionUrl);
  assert.ok(spotify.verificationRequirements);

  // Category filter
  const softwareRes = await request(app).get('/api/student-corner/offers?category=software');
  assert.equal(softwareRes.status, 200);
  assert.ok(softwareRes.body.items.every((o) => o.category === 'software'));
});

test('Student Corner bookmarks enforce authentication and user isolation', { skip }, async () => {
  const userA = await insertTestUser(pool, {
    email: 'bookmark_user_a@test.com',
    mobile: '9777777701',
    env,
  });
  const userB = await insertTestUser(pool, {
    email: 'bookmark_user_b@test.com',
    mobile: '9777777702',
    env,
  });

  // 1. Unauthenticated request to /bookmarks rejected with 401
  const unauthRes = await request(app).get('/api/student-corner/bookmarks');
  assert.equal(unauthRes.status, 401);

  // 2. User A toggles bookmark for Spotify offer
  const toggleRes = await request(app)
    .post('/api/student-corner/bookmarks/toggle')
    .set('Authorization', `Bearer ${userA.token}`)
    .send({ itemType: 'offer', itemId: 'off-spotify-student' });

  assert.equal(toggleRes.status, 200);
  assert.equal(toggleRes.body.bookmarked, true);

  // 3. User A views their bookmarks
  const listA = await request(app)
    .get('/api/student-corner/bookmarks')
    .set('Authorization', `Bearer ${userA.token}`);

  assert.equal(listA.status, 200);
  assert.equal(listA.body.total, 1);
  assert.equal(listA.body.bookmarks.offers[0].id, 'off-spotify-student');

  // 4. User B's bookmarks are completely isolated (total = 0)
  const listB = await request(app)
    .get('/api/student-corner/bookmarks')
    .set('Authorization', `Bearer ${userB.token}`);

  assert.equal(listB.status, 200);
  assert.equal(listB.body.total, 0);

  // 5. User A toggles again to remove
  const untoggleRes = await request(app)
    .post('/api/student-corner/bookmarks/toggle')
    .set('Authorization', `Bearer ${userA.token}`)
    .send({ itemType: 'offer', itemId: 'off-spotify-student' });

  assert.equal(untoggleRes.status, 200);
  assert.equal(untoggleRes.body.bookmarked, false);

  await cleanUsers(pool, ['bookmark_user_a@test.com', 'bookmark_user_b@test.com']);
});
