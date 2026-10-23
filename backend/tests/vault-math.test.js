// vault-math.test.js - unit tests for 4% p.a. lazy interest math on known inputs.
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateAccruedInterest } = require('../src/services/vault');

test('vault interest math: 0 elapsed time yields 0 accrued', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const accrued = calculateAccruedInterest(1000000, now, now);
  assert.equal(accrued, 0n);
});

test('vault interest math: 0 principal yields 0 accrued', () => {
  const t0 = new Date('2026-01-01T00:00:00Z');
  const t1 = new Date('2027-01-01T00:00:00Z');
  const accrued = calculateAccruedInterest(0, t0, t1);
  assert.equal(accrued, 0n);
});

test('vault interest math: exactly 1 year (31,536,000 s) at 4% on Rs 10,000 (1,000,000 paise)', () => {
  const t0 = new Date('2026-01-01T00:00:00Z');
  // Add exactly 31,536,000 seconds
  const t1 = new Date(t0.getTime() + 31536000 * 1000);
  const accrued = calculateAccruedInterest(1000000, t0, t1);
  // 4% of 1,000,000 paise = 40,000 paise (Rs 400)
  assert.equal(accrued, 40000n);
});

test('vault interest math: exactly 6 months (15,768,000 s) on Rs 10,000 yields half interest', () => {
  const t0 = new Date('2026-01-01T00:00:00Z');
  const t1 = new Date(t0.getTime() + 15768000 * 1000);
  const accrued = calculateAccruedInterest(1000000, t0, t1);
  assert.equal(accrued, 20000n);
});

test('vault interest math: floor behavior for fractional paise', () => {
  const t0 = new Date('2026-01-01T00:00:00Z');
  // 1 second elapsed on 100 paise: interest is tiny fraction of a paise, floors to 0
  const t1 = new Date(t0.getTime() + 1000);
  const accrued = calculateAccruedInterest(100, t0, t1);
  assert.equal(accrued, 0n);
});
