// mailer.test.js - unit tests for mailer configuration, Brevo HTTPS provider, timeout classification, failure rollback, and credential sanitization.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createMailer,
  sendBrevoEmail,
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

// ---------------------------------------------------------------------
// BREVO HTTPS PROVIDER TESTS (MOCKED)
// ---------------------------------------------------------------------

test('Brevo email provider: success sends request with api-key header and payload', async () => {
  let capturedUrl = null;
  let capturedOptions = null;

  const mockFetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return {
      ok: true,
      status: 201,
      json: async () => ({ messageId: '<brevo-12345@smtp-relay.brevo.com>' }),
    };
  };

  const env = {
    EMAIL_PROVIDER: 'brevo',
    BREVO_API_KEY: 'xkeysib-test-mock-api-key-12345',
    MAIL_FROM_EMAIL: 'sender@finzin.com',
    MAIL_FROM_NAME: 'Finzin Banking',
  };

  const mailer = createMailer(env, { fetchFn: mockFetch });
  assert.equal(mailer.provider, 'brevo');
  assert.equal(mailer.isConfigured(), true);

  const res = await mailer.sendOtpEmail({ to: 'student@college.edu', code: '654321' });
  assert.equal(res.messageId, '<brevo-12345@smtp-relay.brevo.com>');
  assert.equal(capturedUrl, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(capturedOptions.headers['api-key'], 'xkeysib-test-mock-api-key-12345');

  const parsedBody = JSON.parse(capturedOptions.body);
  assert.equal(parsedBody.sender.email, 'sender@finzin.com');
  assert.equal(parsedBody.to[0].email, 'student@college.edu');
  assert.ok(parsedBody.htmlContent.includes('654321'));
});

test('Brevo email provider: timeout triggers ONE retry and throws friendly 503', async () => {
  let callCount = 0;

  const mockFetch = async () => {
    callCount++;
    const err = new Error('The operation was aborted due to timeout');
    err.name = 'TimeoutError';
    throw err;
  };

  const env = {
    EMAIL_PROVIDER: 'brevo',
    BREVO_API_KEY: 'mock-key',
    MAIL_FROM_EMAIL: 'sender@finzin.com',
  };

  const mailer = createMailer(env, { fetchFn: mockFetch });

  await assert.rejects(
    async () => mailer.sendOtpEmail({ to: 'student@college.edu', code: '112233' }),
    (err) => {
      assert.equal(err.status, 503);
      assert.equal(err.message, 'Could not send the code, please try again');
      return true;
    }
  );

  // Verifies that initial attempt + ONE retry occurred (total 2 calls)
  assert.equal(callCount, 2);
});

test('Brevo email provider: 401 bad API key retries once and returns friendly 503 without leaking key', async () => {
  let callCount = 0;

  const mockFetch = async () => {
    callCount++;
    return {
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ code: 'unauthorized', message: 'Key not found' }),
    };
  };

  const env = {
    EMAIL_PROVIDER: 'brevo',
    BREVO_API_KEY: 'invalid-secret-key-that-must-not-be-logged',
    MAIL_FROM_EMAIL: 'sender@finzin.com',
  };

  const mailer = createMailer(env, { fetchFn: mockFetch });

  await assert.rejects(
    async () => mailer.sendOtpEmail({ to: 'student@college.edu', code: '445566' }),
    (err) => {
      assert.equal(err.status, 503);
      assert.equal(err.message, 'Could not send the code, please try again');
      return true;
    }
  );

  assert.equal(callCount, 2);
});

test('Brevo email provider: 5xx provider error retries once and returns friendly 503', async () => {
  let callCount = 0;

  const mockFetch = async () => {
    callCount++;
    return {
      ok: false,
      status: 502,
      text: async () => 'Bad Gateway from upstream MTA',
    };
  };

  const env = {
    EMAIL_PROVIDER: 'brevo',
    BREVO_API_KEY: 'test-key',
    MAIL_FROM_EMAIL: 'sender@finzin.com',
  };

  const mailer = createMailer(env, { fetchFn: mockFetch });

  await assert.rejects(
    async () => mailer.sendOtpEmail({ to: 'student@college.edu', code: '998877' }),
    (err) => {
      assert.equal(err.status, 503);
      assert.equal(err.message, 'Could not send the code, please try again');
      return true;
    }
  );

  assert.equal(callCount, 2);
});

// ---------------------------------------------------------------------
// COOLDOWN ROLLBACK INTEGRATION TESTS
// ---------------------------------------------------------------------

test('cooldown rollback: failed send does NOT activate 60s cooldown; immediate retry succeeds', async () => {
  let attemptCount = 0;
  const mockMailer = {
    async sendOtpEmail() {
      attemptCount++;
      if (attemptCount === 1) {
        const { AppError } = require('../src/utils/AppError');
        throw new AppError(503, 'Could not send the code, please try again');
      }
      return { messageId: '<mock-success@brevo.com>' };
    },
  };

  // Mock in-memory database pool tracking otps table
  const storedOtps = new Map();
  const mockPool = {
    async query(sql, params) {
      if (sql.includes('SELECT last_sent_at FROM otps WHERE email = $1')) {
        const email = params[0];
        const row = storedOtps.get(email);
        return { rows: row ? [row] : [] };
      }
      if (sql.includes('INSERT INTO otps')) {
        const [email, codeHash, lastSentAt] = params;
        storedOtps.set(email, {
          email,
          code_hash: codeHash,
          last_sent_at: lastSentAt || new Date(0).toISOString(),
        });
        return { rowCount: 1 };
      }
      if (sql.includes('UPDATE otps SET last_sent_at = now() WHERE email = $1')) {
        const email = params[0];
        const row = storedOtps.get(email);
        if (row) {
          row.last_sent_at = new Date().toISOString();
        }
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

  const testEmail = 'rollback_student@college.edu';

  // 1. Attempt 1 fails: throws 503
  await assert.rejects(
    async () => sendOtp({ email: testEmail, pool: mockPool, env: testEnv, mailer: mockMailer }),
    (err) => {
      assert.equal(err.status, 503);
      assert.equal(err.message, 'Could not send the code, please try again');
      return true;
    }
  );

  // 2. Cooldown check: OTP row was rolled back / last_sent_at was NOT set to now()
  assert.equal(storedOtps.has(testEmail), false);

  // 3. Immediate retry succeeds without 429 rate limit
  const res2 = await sendOtp({ email: testEmail, pool: mockPool, env: testEnv, mailer: mockMailer });
  assert.equal(res2.message, 'If this email is valid, a verification code has been sent');
  assert.equal(storedOtps.has(testEmail), true);

  // 4. Now that send succeeded, calling sendOtp a third time immediately triggers 429
  await assert.rejects(
    async () => sendOtp({ email: testEmail, pool: mockPool, env: testEnv, mailer: mockMailer }),
    (err) => {
      assert.equal(err.status, 429);
      assert.ok(err.message.includes('Please wait'));
      return true;
    }
  );
});
