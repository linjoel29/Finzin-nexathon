// mailer.js - email delivery service for OTPs using Nodemailer and Gmail SMTP.
// SECURITY: Never log the OTP code or user email in logs.
const nodemailer = require('nodemailer');
const { AppError } = require('../utils/AppError');

/**
 * Creates a mailer instance based on environment variables.
 *
 * @param {object} env - Validated environment config
 * @returns {object} Mailer with sendOtpEmail method
 */
function createMailer(env) {
  let transporter = null;

  if (env.GMAIL_USER && env.GMAIL_APP_PASSWORD) {
    // Gmail App Passwords may be copied with or without 4-character chunk spaces
    const cleanPassword = String(env.GMAIL_APP_PASSWORD).replace(/\s+/g, '');
    const cleanUser = String(env.GMAIL_USER).trim();

    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: cleanUser,
        pass: cleanPassword,
      },
      connectionTimeout: 10000, // 10s connection timeout stops hanging requests
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }

  return {
    /**
     * Sends an OTP verification email to the user.
     *
     * @param {object} params
     * @param {string} params.to - Recipient email address
     * @param {string} params.code - 6-digit one-time password
     */
    async sendOtpEmail({ to, code }) {
      if (!transporter) {
        // In local development without Gmail credentials, log a safe notice
        console.warn('[mailer] Gmail credentials not set; email skipped in demo/dev mode');
        return;
      }

      try {
        await transporter.sendMail({
          from: `"Finzin Banking" <${env.GMAIL_USER}>`,
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
        });
      } catch (err) {
        // Safe logging: log the error reason without exposing sensitive credentials or OTP codes
        console.error('[mailer] Failed to deliver OTP email:', err.message);
        throw new AppError(503, 'Email delivery service is temporarily unavailable. Please try again shortly.');
      }
    },
  };
}

module.exports = { createMailer };
