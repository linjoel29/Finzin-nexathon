// mailer.js - Dual email delivery service for OTPs.
// Supports:
// 1. Brevo HTTPS Transactional API (POST https://api.brevo.com/v3/smtp/email) for Render/cloud deployments (port 443).
// 2. Nodemailer Gmail SMTP (ports 587/465) for local development.
//
// SECURITY & PRIVACY RULES:
// 1. NEVER log plaintext OTP codes, API keys, email credentials, or full recipient email addresses.
// 2. 8-second timeout per attempt and ONE retry on failure.
// 3. Log only HTTP status code and sanitized error body.
// 4. Return friendly 503 on failure: "Could not send the code, please try again".
const nodemailer = require('nodemailer');
const { AppError } = require('../utils/AppError');

/**
 * Classifies an SMTP failure into a standard diagnostic category:
 * - 'AUTH_FAILURE': 535 credentials rejected
 * - 'CONNECTION_TIMEOUT': TCP handshake failed to establish within connectionTimeout
 * - 'GREETING_TIMEOUT': Server did not respond with 220 banner within greetingTimeout
 * - 'SOCKET_TIMEOUT': Data transfer stalled within socketTimeout
 * - 'CONNECTION_REFUSED': Port closed / ECONNREFUSED
 * - 'NETWORK_UNREACHABLE': ENETUNREACH / EHOSTUNREACH
 * - 'DNS_RESOLUTION_FAILURE': ENOTFOUND / EAI_AGAIN
 * - 'RATE_LIMITED': 421 / 450 server temporarily full / throttled
 * - 'REJECTED': 5xx server rejection
 * - 'GENERIC_SMTP_ERROR': other unexpected SMTP errors
 *
 * @param {object|Error|null} err
 * @returns {string} Failure classification tag
 */
function classifySmtpError(err) {
  if (!err) return 'UNKNOWN_FAILURE';
  const msg = (err.message || '').toLowerCase();
  const code = (err.code || '').toUpperCase();

  if (
    code === 'EAUTH' ||
    err.responseCode === 535 ||
    msg.includes('username and password not accepted') ||
    msg.includes('badcredentials') ||
    msg.includes('invalid login')
  ) {
    return 'AUTH_FAILURE';
  }
  if (msg.includes('greeting never received') || msg.includes('greeting timeout')) {
    return 'GREETING_TIMEOUT';
  }
  if (
    (code === 'ETIMEDOUT' && (err.syscall === 'connect' || msg.includes('connection timeout') || msg.includes('connect etimedout'))) ||
    msg.includes('connection timeout')
  ) {
    return 'CONNECTION_TIMEOUT';
  }
  if (code === 'ESOCKETTIMEDOUT' || msg.includes('socket timeout') || msg.includes('socket timed out')) {
    return 'SOCKET_TIMEOUT';
  }
  if (code === 'ECONNREFUSED') {
    return 'CONNECTION_REFUSED';
  }
  if (code === 'ENETUNREACH' || code === 'EHOSTUNREACH') {
    return 'NETWORK_UNREACHABLE';
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return 'DNS_RESOLUTION_FAILURE';
  }
  if (err.responseCode === 421 || err.responseCode === 450 || err.responseCode === 451) {
    return 'RATE_LIMITED';
  }
  if (err.responseCode >= 500) {
    return 'REJECTED';
  }
  return 'GENERIC_SMTP_ERROR';
}

/**
 * Redacts email addresses and sensitive patterns from error messages for safe logging.
 *
 * @param {string|undefined} message
 * @returns {string} Sanitized message
 */
function sanitizeErrorMessage(message) {
  if (!message || typeof message !== 'string') return 'Unknown error';
  return message.replace(/([a-zA-Z0-9_\-\.]+)@([a-zA-Z0-9_\-\.]+)/g, '[REDACTED_EMAIL]');
}

/**
 * Builds safe structured diagnostic logging object without leaking secrets or PII.
 *
 * @param {object|Error|null} err
 * @param {object} context
 * @returns {object}
 */
function formatSafeLog(err, context = {}) {
  const timeoutClassification = classifySmtpError(err);
  return {
    ...context,
    timeoutClassification,
    code: err?.code || 'UNKNOWN',
    command: err?.command || 'NONE',
    responseCode: err?.responseCode || null,
    syscall: err?.syscall || null,
    message: sanitizeErrorMessage(err?.message),
  };
}

/**
 * Audits environment variables for SMTP configuration and aliases.
 * Detects common naming variants without exposing values.
 *
 * @param {object} env
 * @returns {object} Clean credentials and audit metadata
 */
function inspectEnvironmentVariables(env = process.env) {
  const userKeys = ['GMAIL_USER', 'EMAIL_USER', 'SMTP_USER'];
  const passKeys = ['GMAIL_APP_PASSWORD', 'EMAIL_PASS', 'SMTP_PASS', 'GMAIL_PASSWORD'];

  let matchedUserKey = null;
  let rawUser = null;
  for (const k of userKeys) {
    if (env[k] && typeof env[k] === 'string' && env[k].trim()) {
      matchedUserKey = k;
      rawUser = env[k];
      break;
    }
  }

  let matchedPassKey = null;
  let rawPass = null;
  for (const k of passKeys) {
    if (env[k] && typeof env[k] === 'string' && env[k].trim()) {
      matchedPassKey = k;
      rawPass = env[k];
      break;
    }
  }

  const cleanUser = rawUser ? rawUser.trim().replace(/^['"]|['"]$/g, '') : null;
  const cleanPass = rawPass ? rawPass.trim().replace(/^['"]|['"]$/g, '').replace(/\s+/g, '') : null;

  const domain = cleanUser && cleanUser.includes('@') ? `@${cleanUser.split('@')[1]}` : null;
  const passLength = cleanPass ? cleanPass.length : 0;

  return {
    cleanUser,
    cleanPass,
    isConfigured: Boolean(cleanUser && cleanPass),
    userKey: matchedUserKey,
    passKey: matchedPassKey,
    passLength,
    domain,
  };
}

/**
 * Dispatches an OTP email via Brevo HTTPS Transactional API (POST https://api.brevo.com/v3/smtp/email).
 * Enforces:
 * - 8 second timeout per attempt (using AbortSignal.timeout(8000))
 * - ONE retry on failure (total 2 attempts)
 * - Safe logging: only provider status code and error body (never OTP, API key, or full email)
 * - Friendly 503 error on failure: "Could not send the code, please try again"
 *
 * @param {object} params
 * @param {string} params.to - Recipient email
 * @param {string} params.code - 6-digit OTP code
 * @param {object} params.env - Environment config
 * @param {Function} [params.fetchFn] - Custom fetch function for unit tests
 * @returns {Promise<object>} Result metadata
 */
async function sendBrevoEmail({ to, code, env, fetchFn = globalThis.fetch }) {
  const apiKey = (env.BREVO_API_KEY || '').trim().replace(/^['"]|['"]$/g, '');
  const senderEmail = (env.MAIL_FROM_EMAIL || '').trim().replace(/^['"]|['"]$/g, '');
  const senderName = (env.MAIL_FROM_NAME || 'Finzin Banking').trim().replace(/^['"]|['"]$/g, '');

  if (!apiKey || !senderEmail) {
    console.warn('[mailer] Brevo credentials missing; email skipped in demo/dev mode');
    return { skipped: true };
  }

  // Construct Brevo v3 transactional email payload
  const payload = {
    sender: {
      name: senderName,
      email: senderEmail,
    },
    to: [
      {
        email: to,
      },
    ],
    subject: 'Your Finzin Verification Code',
    htmlContent: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #0f172a; margin-top: 0;">Finzin Verification</h2>
        <p style="color: #475569; font-size: 15px;">Use the verification code below to complete your login or registration. It expires in 5 minutes.</p>
        <div style="background: #f1f5f9; padding: 16px; border-radius: 6px; text-align: center; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #0f172a; margin: 24px 0;">
          ${code}
        </div>
        <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">If you did not request this code, please ignore this email. Finzin will never ask for your PIN or OTP.</p>
      </div>
    `,
    textContent: `Your Finzin verification code is: ${code}. This code will expire in 5 minutes. Do not share this code with anyone.`,
  };

  const maxAttempts = 2; // Initial attempt + ONE retry
  let lastStatus = null;
  let lastErrorBody = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // 8 second timeout per attempt
      const response = await fetchFn('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });

      lastStatus = response.status;

      if (response.ok) {
        let result = null;
        try {
          result = await response.json();
        } catch {
          result = { messageId: 'brevo-sent' };
        }
        console.log(`[mailer] OTP email delivered via Brevo (attempt ${attempt}, messageId: ${result?.messageId || 'ok'})`);
        return result;
      }

      // Read error body from non-2xx response
      let rawBody = '';
      try {
        rawBody = await response.text();
      } catch {
        rawBody = 'Unable to read response body';
      }

      lastErrorBody = rawBody;
      // Log ONLY provider status code and error body (never OTP, credentials, or PII)
      console.error(`[mailer] Brevo delivery failed (attempt ${attempt}/${maxAttempts}):`, {
        status: lastStatus,
        error: sanitizeErrorMessage(rawBody),
      });
    } catch (netErr) {
      const isTimeout =
        netErr.name === 'TimeoutError' ||
        netErr.name === 'AbortError' ||
        (netErr.message && netErr.message.toLowerCase().includes('timeout'));

      lastStatus = isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR';
      lastErrorBody = netErr.message || 'Network error';

      console.error(`[mailer] Brevo request error (attempt ${attempt}/${maxAttempts}):`, {
        status: lastStatus,
        error: sanitizeErrorMessage(lastErrorBody),
      });
    }

    // Pause briefly before the single retry
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // All attempts exhausted: return 503 with friendly message
  throw new AppError(503, 'Could not send the code, please try again');
}

/**
 * Creates a mailer instance based on validated environment variables.
 * Automatically selects Brevo HTTPS or SMTP based on EMAIL_PROVIDER.
 *
 * @param {object} env - Validated environment config
 * @param {object} [options] - Optional overrides (e.g. fetchFn for unit tests)
 * @returns {object} Mailer with sendOtpEmail and verifyConnection methods
 */
function createMailer(env, options = {}) {
  const provider = (env.EMAIL_PROVIDER || (env.BREVO_API_KEY ? 'brevo' : 'smtp')).toLowerCase();
  const fetchFn = options.fetchFn || globalThis.fetch;

  // 1. BREVO HTTPS PROVIDER (Cloud / Render default over port 443)
  if (provider === 'brevo') {
    const apiKey = (env.BREVO_API_KEY || '').trim().replace(/^['"]|['"]$/g, '');
    const senderEmail = (env.MAIL_FROM_EMAIL || '').trim().replace(/^['"]|['"]$/g, '');
    const isConfigured = Boolean(apiKey && senderEmail);

    return {
      provider: 'brevo',

      isConfigured() {
        return isConfigured;
      },

      async verifyConnection() {
        if (!isConfigured) {
          return {
            configured: false,
            provider: 'brevo',
            status: 'UNCONFIGURED',
            message: 'BREVO_API_KEY or MAIL_FROM_EMAIL missing from environment',
          };
        }

        try {
          // Lightweight account verification ping
          const res = await fetchFn('https://api.brevo.com/v3/account', {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'api-key': apiKey,
            },
            signal: AbortSignal.timeout(5000),
          });

          if (res.ok) {
            return {
              configured: true,
              provider: 'brevo',
              status: 'CONNECTED',
              statusCode: res.status,
            };
          }

          const errText = await res.text().catch(() => '');
          return {
            configured: true,
            provider: 'brevo',
            status: res.status === 401 ? 'AUTH_FAILURE' : 'PROVIDER_ERROR',
            statusCode: res.status,
            error: sanitizeErrorMessage(errText),
          };
        } catch (pingErr) {
          return {
            configured: true,
            provider: 'brevo',
            status: 'CONNECTION_TIMEOUT',
            error: sanitizeErrorMessage(pingErr.message),
          };
        }
      },

      async sendOtpEmail({ to, code }) {
        return sendBrevoEmail({ to, code, env, fetchFn });
      },
    };
  }

  // 2. SMTP PROVIDER (Local development / Gmail SMTP fallback)
  const { cleanUser, cleanPass, isConfigured: hasCredentials } = inspectEnvironmentVariables(env);

  let transporter587 = null;
  let transporter465 = null;

  if (hasCredentials) {
    // Port 587 (STARTTLS)
    transporter587 = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: cleanUser,
        pass: cleanPass,
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 8000,
      family: 4, // Strictly enforce IPv4
      tls: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
      },
    });

    // Port 465 (Direct SSL/TLS) fallback
    transporter465 = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: cleanUser,
        pass: cleanPass,
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 8000,
      family: 4,
      tls: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
      },
    });
  }

  function buildEmailPayload(to, code) {
    return {
      from: `"Finzin Banking" <${cleanUser}>`,
      to,
      subject: 'Your Finzin Verification Code',
      text: `Your Finzin verification code is: ${code}. This code will expire in 5 minutes. Do not share this code with anyone.`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0f172a; margin-top: 0;">Finzin Verification</h2>
          <p style="color: #475569; font-size: 15px;">Use the verification code below to complete your login or registration. It expires in 5 minutes.</p>
          <div style="background: #f1f5f9; padding: 16px; border-radius: 6px; text-align: center; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #0f172a; margin: 24px 0;">
            ${code}
          </div>
          <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">If you did not request this code, please ignore this email. Finzin will never ask for your PIN or OTP.</p>
        </div>
      `,
    };
  }

  return {
    provider: 'smtp',

    isConfigured() {
      return hasCredentials;
    },

    async verifyConnection() {
      if (!transporter587 && !transporter465) {
        return {
          configured: false,
          provider: 'smtp',
          status: 'UNCONFIGURED',
          message: 'GMAIL_USER or GMAIL_APP_PASSWORD missing from environment',
        };
      }

      const report = {
        configured: true,
        provider: 'smtp',
        host: 'smtp.gmail.com',
        family: 4,
        port587: null,
        port465: null,
      };

      if (transporter587) {
        try {
          await transporter587.verify();
          report.port587 = { ok: true, secure: false, status: 'CONNECTED' };
        } catch (err587) {
          report.port587 = formatSafeLog(err587, { ok: false, port: 587, secure: false });
        }
      }

      if (transporter465) {
        try {
          await transporter465.verify();
          report.port465 = { ok: true, secure: true, status: 'CONNECTED' };
        } catch (err465) {
          report.port465 = formatSafeLog(err465, { ok: false, port: 465, secure: true });
        }
      }

      return report;
    },

    async sendOtpEmail({ to, code }) {
      if (!transporter587 && !transporter465) {
        console.warn('[mailer] Gmail credentials not set; email skipped in demo/dev mode');
        return;
      }

      const mailOptions = buildEmailPayload(to, code);
      let lastError = null;

      if (transporter587) {
        try {
          const info = await transporter587.sendMail(mailOptions);
          console.log('[mailer] OTP email delivered via SMTP port 587 (id: ' + info.messageId + ')');
          return info;
        } catch (err587) {
          lastError = err587;
          console.warn('[mailer] Port 587 delivery failed:', formatSafeLog(err587, { port: 587 }));
        }
      }

      if (transporter465) {
        try {
          const info = await transporter465.sendMail(mailOptions);
          console.log('[mailer] OTP email delivered via SMTP port 465 (id: ' + info.messageId + ')');
          return info;
        } catch (err465) {
          lastError = err465;
          console.error('[mailer] Port 465 fallback delivery failed:', formatSafeLog(err465, { port: 465 }));
        }
      }

      const failureReport = formatSafeLog(lastError, { stage: 'all_ports_exhausted' });
      console.error('[mailer] All SMTP delivery attempts failed:', failureReport);

      throw new AppError(503, 'Could not send the code, please try again');
    },
  };
}

module.exports = {
  createMailer,
  sendBrevoEmail,
  classifySmtpError,
  sanitizeErrorMessage,
  formatSafeLog,
  inspectEnvironmentVariables,
};
