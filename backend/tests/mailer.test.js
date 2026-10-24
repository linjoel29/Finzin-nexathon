// mailer.test.js - unit tests for mailer configuration, timeout classification, failure rollback, and credential sanitization.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createMailer,
  classifySmtpError,
  sanitizeErrorMessage,
  formatSafeLog,
  inspectEnvironmentVariables,
} = require('../src/services/mailer');
const { sendOtp } = require('../src/services/otp');

test('classifySmtpError: correctly categorizes all standard SMTP failure types', () => {
  // 1. Authentication failure
  assert.equal(classifySmtpError({ code: 'EAUTH', responseCode: 535, message: 'Invalid login: 535-5.7.8 Username and Password not accepted' }), 'AUTH_FAILURE');
  assert.equal(classifySmtpError({ message: 'BadCredentials error' }), 'AUTH_FAILURE');

  // 2. Connection timeout (TCP handshake dropped)
  assert.equal(classifySmtpError({ code: 'ETIMEDOUT', syscall: 'connect', message: 'connect ETIMEDOUT 192.178.211.109:587' }), 'CONNECTION_TIMEOUT');
  assert.equal(classifySmtpError({ message: 'Connection timeout' }), 'CONNECTION_TIMEOUT');

  // 3. Greeting timeout (TCP connected, but banner delayed/blocked)
  assert.equal(classifySmtpError({ message: 'Greeting never received' }), 'GREETING_TIMEOUT');
  assert.equal(classifySmtpError({ message: 'Greeting timeout exceeded' }), 'GREETING_TIMEOUT');

  // 4. Socket timeout (DATA or TLS transmission stalled)
  assert.equal(classifySmtpError({ code: 'ESOCKETTIMEDOUT', message: 'Socket timeout' }), 'SOCKET_TIMEOUT');

  // 5. Connection refused (Port closed)
  assert.equal(classifySmtpError({ code: 'ECONNREFUSED', syscall: 'connect' }), 'CONNECTION_REFUSED');

  // 6. Network unreachable
  assert.equal(classifySmtpError({ code: 'ENETUNREACH' }), 'NETWORK_UNREACHABLE');
  assert.equal(classifySmtpError({ code: 'EHOSTUNREACH' }), 'NETWORK_UNREACHABLE');

  // 7. DNS resolution failure
  assert.equal(classifySmtpError({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND smtp.gmail.com' }), 'DNS_RESOLUTION_FAILURE');

  // 8. Rate limited / temporary rejection
  assert.equal(classifySmtpError({ responseCode: 421, message: '421 4.7.0 Try again later' }), 'RATE_LIMITED');

  // 9. Unknown/fallback
  assert.equal(classifySmtpError(null), 'UNKNOWN_FAILURE');
});

test('sanitizeErrorMessage: redacts recipient emails from error strings', () => {
  const raw = 'Failed to connect to recipient john.doe123@college.edu on command RCPT TO';
  const clean = sanitizeErrorMessage(raw);
  assert.equal(clean.includes('john.doe123@college.edu'), false);
  assert.ok(clean.includes('[REDACTED_EMAIL]'));
});

test('formatSafeLog: creates safe structured log with error code, command, and classification without leaking secrets', () => {
  const err = {
    code: 'ETIMEDOUT',
    command: 'CONN',
    syscall: 'connect',
    responseCode: null,
    message: 'connect ETIMEDOUT to user student@college.edu',
  };
  const log = formatSafeLog(err, { port: 587 });

  assert.equal(log.port, 587);
  assert.equal(log.timeoutClassification, 'CONNECTION_TIMEOUT');
  assert.equal(log.code, 'ETIMEDOUT');
  assert.equal(log.command, 'CONN');
  assert.equal(log.syscall, 'connect');
  assert.equal(log.responseCode, null);
  assert.equal(log.message.includes('student@college.edu'), false);
  assert.ok(log.message.includes('[REDACTED_EMAIL]'));
});

test('inspectEnvironmentVariables: detects GMAIL_USER, GMAIL_APP_PASSWORD, and handles quotes and whitespace', () => {
  const env = {
    GMAIL_USER: ' "test@gmail.com" ',
    GMAIL_APP_PASSWORD: " 'zskf qzcv ifel apsz' ",
  };
  const audit = inspectEnvironmentVariables(env);
  assert.equal(audit.isConfigured, true);
  assert.equal(audit.cleanUser, 'test@gmail.com');
  assert.equal(audit.cleanPass, 'zskfqzcvifelapsz');
  assert.equal(audit.passLength, 16);
  assert.equal(audit.domain, '@gmail.com');
});

test('inspectEnvironmentVariables: detects fallback aliases (EMAIL_USER / EMAIL_PASS)', () => {
  const env = {
    EMAIL_USER: 'aliased@gmail.com',
    EMAIL_PASS: 'abcdefghijklmnop',
  };
  const audit = inspectEnvironmentVariables(env);
  assert.equal(audit.isConfigured, true);
  assert.equal(audit.cleanUser, 'aliased@gmail.com');
  assert.equal(audit.cleanPass, 'abcdefghijklmnop');
  assert.equal(audit.userKey, 'EMAIL_USER');
  assert.equal(audit.passKey, 'EMAIL_PASS');
});

test('inspectEnvironmentVariables: reports unconfigured when variables missing', () => {
  const audit = inspectEnvironmentVariables({});
  assert.equal(audit.isConfigured, false);
  assert.equal(audit.cleanUser, null);
  assert.equal(audit.cleanPass, null);
});

test('createMailer: unconfigured environment skips email without throwing in dev mode', async () => {
  const mailer = createMailer({ GMAIL_USER: undefined, GMAIL_APP_PASSWORD: undefined });
  assert.equal(mailer.isConfigured(), false);

  await assert.doesNotReject(async () => {
    await mailer.sendOtpEmail({ to: 'student@example.com', code: '123456' });
  });
});

test('intermittent failure: transient failure returns 503 and rolls back OTP row, immediate retry succeeds', async () => {
  let attemptCount = 0;
  const mockMailer = {
    async sendOtpEmail() {
      attemptCount++;
      if (attemptCount === 1) {
        const { AppError } = require('../src/utils/AppError');
        throw new AppError(503, 'Email delivery service is temporarily unavailable. Please try again shortly.');
      }
      return { messageId: '<mock-success@gmail.com>' };
    },
  };

  // Mock database pool
  const storedOtps = new Map();
  const mockPool = {
    async query(sql, params) {
      if (sql.includes('SELECT last_sent_at FROM otps WHERE email = $1')) {
        const email = params[0];
        const row = storedOtps.get(email);
        return { rows: row ? [row] : [] };
      }
      if (sql.includes('INSERT INTO otps')) {
        const [email, codeHash] = params;
        storedOtps.set(email, { email, code_hash: codeHash, last_sent_at: new Date() });
        return { rowCount: 1 };
      }
      if (sql.includes('DELETE FROM otps WHERE email = $1')) {
        const email = params[0];
        storedOtps.delete(email);
        return { rowCount: 1 };
      }
      if (sql.includes('DELETE FROM otps WHERE expires_at < now()')) {
        return { rowCount: 0 };
      }
      return { rows: [] };
    },
  };

  const testEnv = {
    JWT_SECRET: 'test-secret-at-least-32-chars-long-1234567890',
  };

  const testEmail = 'intermittent_student@college.edu';

  // Attempt 1: Fails with 503 (transient SMTP failure)
  await assert.rejects(
    async () => sendOtp({ email: testEmail, pool: mockPool, env: testEnv, mailer: mockMailer }),
    (err) => {
      assert.equal(err.status, 503);
      assert.equal(err.message, 'Email delivery service is temporarily unavailable. Please try again shortly.');
      return true;
    }
  );

  // Verify OTP row was rolled back in the database!
  assert.equal(storedOtps.has(testEmail), false);

  // Attempt 2: Immediately retried (cooldown not active because record was rolled back) -> succeeds
  const res2 = await sendOtp({ email: testEmail, pool: mockPool, env: testEnv, mailer: mockMailer });
  assert.equal(res2.message, 'If this email is valid, a verification code has been sent');
  assert.equal(storedOtps.has(testEmail), true);
});
