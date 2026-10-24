// mailer.js - email delivery service for OTPs using Nodemailer and Gmail SMTP.
// SECURITY RULES:
// 1. Never log plaintext OTP codes, email credentials, or personal recipient emails.
// 2. Force IPv4 (family: 4) to prevent hanging on cloud hosts without IPv6 routing (e.g. Render).
// 3. Strict connection and socket timeouts prevent requests from hanging if firewalls drop SMTP packets.
// 4. Multi-port resilience: tries port 587 (STARTTLS) and falls back to port 465 (SSL/TLS).
const nodemailer = require('nodemailer');
const { AppError } = require('../utils/AppError');

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
 * Creates a mailer instance based on validated environment variables.
 *
 * @param {object} env - Validated environment config
 * @returns {object} Mailer with sendOtpEmail method
 */
function createMailer(env) {
  const rawUser = env.GMAIL_USER;
  const rawPass = env.GMAIL_APP_PASSWORD;

  const hasUser = Boolean(rawUser && typeof rawUser === 'string' && rawUser.trim().length > 0);
  const hasPass = Boolean(rawPass && typeof rawPass === 'string' && rawPass.trim().length > 0);

  const cleanUser = hasUser ? String(rawUser).trim() : null;
  const cleanPass = hasPass ? String(rawPass).replace(/\s+/g, '') : null;

  // Safe startup diagnostic: confirms variables exist and password length without exposing credentials
  console.log('[mailer] Environment check:', {
    gmailUserConfigured: hasUser,
    gmailUserDomain: hasUser && cleanUser.includes('@') ? `@${cleanUser.split('@')[1]}` : null,
    gmailPasswordConfigured: hasPass,
    gmailPasswordLength: cleanPass ? cleanPass.length : 0,
    passwordFormatValid: cleanPass ? cleanPass.length === 16 : false,
  });

  let transporter587 = null;
  let transporter465 = null;

  if (cleanUser && cleanPass) {
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
      connectionTimeout: 7000, // 7s timeout stops hanging on blocked ports
      greetingTimeout: 7000,
      socketTimeout: 10000,
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
      connectionTimeout: 7000,
      greetingTimeout: 7000,
      socketTimeout: 10000,
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
      return Boolean(cleanUser && cleanPass);
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
          console.warn('[mailer] Port 587 attempt failed:', {
            code: err587.code || 'UNKNOWN',
            command: err587.command || 'NONE',
            responseCode: err587.responseCode || null,
            syscall: err587.syscall || null,
            message: sanitizeErrorMessage(err587.message),
          });
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
          console.error('[mailer] Port 465 fallback attempt failed:', {
            code: err465.code || 'UNKNOWN',
            command: err465.command || 'NONE',
            responseCode: err465.responseCode || null,
            syscall: err465.syscall || null,
            message: sanitizeErrorMessage(err465.message),
          });
        }
      }

      // Safe final logging: detail error code, command, and response without exposing sensitive data
      console.error('[mailer] All SMTP delivery attempts failed:', {
        code: lastError?.code || 'UNKNOWN',
        command: lastError?.command || 'NONE',
        responseCode: lastError?.responseCode || null,
        syscall: lastError?.syscall || null,
        message: sanitizeErrorMessage(lastError?.message),
      });

      throw new AppError(503, 'Email delivery service is temporarily unavailable. Please try again shortly.');
    },
  };
}

module.exports = { createMailer, sanitizeErrorMessage };
