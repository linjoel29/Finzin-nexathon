// masks.test.js - unit tests for PII masking.
const test = require('node:test');
const assert = require('node:assert/strict');
const { maskMobile, maskAccountNumber } = require('../src/utils/masks');

test('maskMobile masks 10-digit mobile showing only last 4 digits', () => {
  assert.equal(maskMobile('9876543210'), '******3210');
  assert.equal(maskMobile('9123456789'), '******6789');
  assert.equal(maskMobile(''), '******');
});

test('maskAccountNumber masks 12-digit account number showing only last 4 digits', () => {
  assert.equal(maskAccountNumber('123456789012'), '********9012');
  assert.equal(maskAccountNumber('999988881234'), '********1234');
  assert.equal(maskAccountNumber(''), '********');
});
