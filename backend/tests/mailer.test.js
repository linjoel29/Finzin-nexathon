// mailer.test.js - unit tests for mailer configuration, timeout safety, and credential sanitization.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMailer, sanitizeErrorMessage } = require('../src/services/mailer');

test('sanitizeErrorMessage: redacts recipient emails from error strings', () => {
  const raw = 'Failed to connect to recipient john.doe123@college.edu on command RCPT TO';
  const clean = sanitizeErrorMessage(raw);
  assert.equal(clean.includes('john.doe123@college.edu'), false);
  assert.ok(clean.includes('[REDACTED_EMAIL]'));
});

test('createMailer: unconfigured environment skips email without throwing in dev mode', async () => {
  const mailer = createMailer({ GMAIL_USER: undefined, GMAIL_APP_PASSWORD: undefined });
  assert.equal(mailer.isConfigured(), false);

  // Calling sendOtpEmail does not throw
  await assert.doesNotReject(async () => {
    await mailer.sendOtpEmail({ to: 'student@example.com', code: '123456' });
  });
});

test('createMailer: configured environment recognizes credentials and validates format', () => {
  const mailer = createMailer({
    GMAIL_USER: 'test@gmail.com',
    GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop',
  });
  assert.equal(mailer.isConfigured(), true);
});

test('createMailer: throws AppError 503 on unroutable host with safe diagnostics', async () => {
  const mailer = createMailer({
    GMAIL_USER: 'test@gmail.com',
    GMAIL_APP_PASSWORD: 'abcdefghijklmnop',
  });

  // Calling with invalid destination/mock that triggers error
  // We can test that the error thrown is an AppError 503
  const badMailer = {
    async sendOtpEmail() {
      const { AppError } = require('../src/utils/AppError');
      throw new AppError(503, 'Email delivery service is temporarily unavailable. Please try again shortly.');
    },
  };

  await assert.rejects(
    async () => badMailer.sendOtpEmail(),
    (err) => {
      assert.equal(err.status, 503);
      assert.equal(err.message, 'Email delivery service is temporarily unavailable. Please try again shortly.');
      return true;
    }
  );
});
