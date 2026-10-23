// money.test.js - unit tests for money conversion and strict parsing.
const test = require('node:test');
const assert = require('node:assert/strict');
const { rupeesToPaise, paiseToRupees } = require('../src/utils/money');

test('money parsing: valid amounts converted to exact paise', () => {
  assert.equal(rupeesToPaise('10'), 1000);
  assert.equal(rupeesToPaise('10.50'), 1050);
  assert.equal(rupeesToPaise('10.5'), 1050);
  assert.equal(rupeesToPaise('0.50'), 50);
  assert.equal(rupeesToPaise(50000), 5000000);
  assert.equal(rupeesToPaise('50000'), 5000000);
  assert.equal(rupeesToPaise('50000.00'), 5000000);
});

test('money parsing: invalid formats and bounds rejected', () => {
  // More than 2 decimal places
  assert.throws(() => rupeesToPaise('10.555'), /at most 2 decimal places/);
  // Negative numbers
  assert.throws(() => rupeesToPaise('-1'), /Invalid amount format|positive/);
  // Non-numeric strings
  assert.throws(() => rupeesToPaise('abc'), /Invalid amount format/);
  // Exponent / scientific notation
  assert.throws(() => rupeesToPaise('1e3'), /Scientific notation/);
  assert.throws(() => rupeesToPaise('1E3'), /Scientific notation/);
  assert.throws(() => rupeesToPaise(1e25), /Scientific notation|exceeds limit/);
  // Just above max Rs 50,000
  assert.throws(() => rupeesToPaise(50000.01), /exceeds limit/);
  assert.throws(() => rupeesToPaise('50000.01'), /exceeds limit/);
  // Zero and empty
  assert.throws(() => rupeesToPaise('0'), /greater than zero|positive number/);
  assert.throws(() => rupeesToPaise(0), /greater than zero|positive number/);
  assert.throws(() => rupeesToPaise(''), /Invalid amount format/);
  assert.throws(() => rupeesToPaise(null), /Amount is required/);
  assert.throws(() => rupeesToPaise(NaN), /positive number/);
  assert.throws(() => rupeesToPaise(Infinity), /positive number/);
});

test('paiseToRupees correctly formats paise to rupees', () => {
  assert.equal(paiseToRupees(1000), 10);
  assert.equal(paiseToRupees(1050), 10.5);
  assert.equal(paiseToRupees(5000000), 50000);
  assert.equal(paiseToRupees(0), 0);
  assert.equal(paiseToRupees('500'), 5);
});
