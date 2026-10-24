// mailer.js - email delivery service for OTPs using Nodemailer and Gmail SMTP.
// SECURITY RULES:
// 1. Never log plaintext OTP codes, email credentials, or full recipient email addresses.
// 2. Force IPv4 (family: 4) to prevent hanging on cloud hosts without IPv6 routing (e.g. Render).
// 3. Strict connection and socket timeouts prevent requests from hanging if firewalls drop SMTP packets.
// 4. Multi-port resilience: tries port 587 (STARTTLS) and falls back to port 465 (SSL/TLS).
// 5. Safe structured logging classifies failures (CONNECTION_TIMEOUT, GREETING_TIMEOUT, SOCKET_TIMEOUT, AUTH_FAILURE).
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

  // Safe structured audit logging
  console.log('[mailer] Environment configuration audit:', {
    GMAIL_USER: cleanUser ? `configured (${domain}) via ${matchedUserKey}` : 'MISSING',
    GMAIL_APP_PASSWORD: cleanPass ? `configured (${passLength} chars) via ${matchedPassKey}` : 'MISSING',
    formatValid: passLength === 16,
  });

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
 * Creates a mailer instance based on validated environment variables.
 *
 * @param {object} env - Validated environment config
 * @returns {object} Mailer with sendOtpEmail and verifyConnection methods
 */
function createMailer(env) {
  const { cleanUser, cleanPass, isConfigured: hasCredentials } = inspectEnvironmentVariables(env);

  let transporter587 = null;
  let transporter465 = null;

  if (hasCredentials) {
    // Port 587 (STARTTLS) - standard for modern SMTP with explicit TLS upgrade
    transporter587 = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // upgrades via STARTTLS
      requireTLS: true,
      auth: {
        user: cleanUser,
        pass: cleanPass,
      },
      connectionTimeout: 5000, // 5s connection timeout for fast failover
      greetingTimeout: 5000,
      socketTimeout: 8000,
      family: 4, // Strictly enforce IPv4 to prevent Render IPv6 black hole timeouts
      tls: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
      },
    });

    // Port 465 (Direct SSL/TLS) - fallback if port 587 is blocked
    transporter465 = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true, // direct SSL
      auth: {
        user: cleanUser,
        pass: cleanPass,
      },
      connectionTimeout: 5000, // 5s connection timeout
      greetingTimeout: 5000,
      socketTimeout: 8000,
      family: 4, // Strictly enforce IPv4
      tls: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
      },
    });
  }

  /**
   * Internal helper to build standard Finzin OTP email payload.
   */
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
    /**
     * Checks if mailer is configured with credentials.
     * @returns {boolean}
     */
    isConfigured() {
      return hasCredentials;
    },

    /**
     * Actively tests and verifies connection to Gmail SMTP across supported ports.
     * Safe structured diagnostics are logged and returned without exposing secrets.
     *
     * @returns {Promise<object>} Verification report
     */
    async verifyConnection() {
      if (!transporter587 && !transporter465) {
        return {
          configured: false,
          status: 'UNCONFIGURED',
          message: 'GMAIL_USER or GMAIL_APP_PASSWORD missing from environment',
        };
      }

      const report = {
        configured: true,
        host: 'smtp.gmail.com',
        family: 4,
        port587: null,
        port465: null,
      };

      if (transporter587) {
        try {
          await transporter587.verify();
          report.port587 = { ok: true, secure: false, status: 'CONNECTED' };
          console.log('[mailer] SMTP connection verified successfully on port 587 (STARTTLS)');
        } catch (err587) {
          report.port587 = formatSafeLog(err587, { ok: false, port: 587, secure: false });
          console.warn('[mailer] Port 587 SMTP verification failed:', report.port587);
        }
      }

      if (transporter465) {
        try {
          await transporter465.verify();
          report.port465 = { ok: true, secure: true, status: 'CONNECTED' };
          console.log('[mailer] SMTP connection verified successfully on port 465 (SSL/TLS)');
        } catch (err465) {
          report.port465 = formatSafeLog(err465, { ok: false, port: 465, secure: true });
          console.warn('[mailer] Port 465 SMTP verification failed:', report.port465);
        }
      }

      return report;
    },

    /**
     * Sends an OTP verification email to the user.
     * Tries port 587 first, falling back to port 465 if connection fails or times out.
     *
     * @param {object} params
     * @param {string} params.to - Recipient email address
     * @param {string} params.code - 6-digit one-time password
     */
    async sendOtpEmail({ to, code }) {
      if (!transporter587 && !transporter465) {
        // In local development or demo without credentials, log a safe notice
        console.warn('[mailer] Gmail credentials not set; email skipped in demo/dev mode');
        return;
      }

      const mailOptions = buildEmailPayload(to, code);
      let lastError = null;

      // 1. Attempt Port 587 (STARTTLS)
      if (transporter587) {
        try {
          const info = await transporter587.sendMail(mailOptions);
          console.log('[mailer] OTP email delivered successfully via SMTP port 587 (id: ' + info.messageId + ')');
          return info;
        } catch (err587) {
          lastError = err587;
          console.warn('[mailer] Port 587 delivery failed:', formatSafeLog(err587, { port: 587 }));
        }
      }

      // 2. Attempt Port 465 (Direct SSL) fallback if port 587 failed
      if (transporter465) {
        try {
          const info = await transporter465.sendMail(mailOptions);
          console.log('[mailer] OTP email delivered successfully via SMTP port 465 (id: ' + info.messageId + ')');
          return info;
        } catch (err465) {
          lastError = err465;
          console.error('[mailer] Port 465 fallback delivery failed:', formatSafeLog(err465, { port: 465 }));
        }
      }

      // Safe structured final logging: detail error code, command, response, and classification
      const failureReport = formatSafeLog(lastError, { stage: 'all_ports_exhausted' });
      console.error('[mailer] All SMTP delivery attempts failed:', failureReport);

      throw new AppError(503, 'Email delivery service is temporarily unavailable. Please try again shortly.');
    },
  };
}

module.exports = {
  createMailer,
  classifySmtpError,
  sanitizeErrorMessage,
  formatSafeLog,
  inspectEnvironmentVariables,
};
