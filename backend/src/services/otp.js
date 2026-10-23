// otp.js - one-time password generation, hashing, rate-limiting, and verification.
// SECURITY RULES:
// 1. Store ONLY HMAC-SHA256 hashes of OTPs in the database; plaintext codes exist in memory only.
// 2. Constant-time comparison prevents timing side-channel attacks.
// 3. 60-second cooldown per email (returns 429 with seconds remaining).
// 4. Maximum 5 failed attempts before the OTP is permanently destroyed.
// 5. Always delete the OTP immediately upon successful verification (single-use).
// 6. Generic response on send-otp whether an account exists or not (stops user enumeration).
const crypto = require('crypto');
const { AppError } = require('../utils/AppError');
const { signSessionToken, signRegistrationToken } = require('../middleware/auth');

/**
 * Computes the HMAC-SHA256 hash of a code using the server's JWT_SECRET.
 *
 * @param {string} code - 6-digit code
 * @param {string} secret - Secret key
 * @returns {string} Hex-encoded HMAC
 */
function hashOtp(code, secret) {
  return crypto.createHmac('sha256', secret).update(String(code)).digest('hex');
}

/**
 * Generates a 6-digit numeric OTP code.
 * If DEMO_OTP is configured, returns it for predictable demo environments.
 *
 * @param {object} env - Validated env object
 * @returns {string} 6-digit code
 */
function generateOtpCode(env) {
  if (env.DEMO_OTP) {
    return env.DEMO_OTP;
  }
  // Cryptographically secure random 6-digit number in [100000, 999999]
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Sends an OTP to the specified email with rate limiting and upsert logic.
 */
async function sendOtp({ email, pool, env, mailer }) {
  const normalizedEmail = email.trim().toLowerCase();

  // Opportunistic cleanup of expired OTP rows across the table
  await pool.query('DELETE FROM otps WHERE expires_at < now()').catch(() => {});

  // Check 60-second cooldown on existing OTP for this email
  const existingRes = await pool.query(
    'SELECT last_sent_at FROM otps WHERE email = $1',
    [normalizedEmail]
  );

  if (existingRes.rows.length > 0) {
    const lastSentAt = new Date(existingRes.rows[0].last_sent_at).getTime();
    const elapsedSeconds = (Date.now() - lastSentAt) / 1000;
    if (elapsedSeconds < 60) {
      const remaining = Math.ceil(60 - elapsedSeconds);
      throw new AppError(429, `Please wait ${remaining} seconds before requesting a new OTP`);
    }
  }

  // Generate code and compute its HMAC
  const code = generateOtpCode(env);
  const codeHash = hashOtp(code, env.JWT_SECRET);

  // Upsert OTP record: expires in 5 minutes, reset attempts to 0, record last_sent_at
  await pool.query(
    `INSERT INTO otps (email, code_hash, attempts, expires_at, last_sent_at)
     VALUES ($1, $2, 0, now() + interval '5 minutes', now())
     ON CONFLICT (email) DO UPDATE
     SET code_hash = EXCLUDED.code_hash,
         attempts = 0,
         expires_at = EXCLUDED.expires_at,
         last_sent_at = EXCLUDED.last_sent_at`,
    [normalizedEmail, codeHash]
  );

  // Dispatch email (mailer handles transport and failure gracefully)
  if (mailer && typeof mailer.sendOtpEmail === 'function') {
    await mailer.sendOtpEmail({ to: normalizedEmail, code });
  }

  // Always return the exact same generic message regardless of user existence
  return { message: 'If this email is valid, a verification code has been sent' };
}

/**
 * Verifies the provided OTP code.
 * Enforces maximum 5 attempts, constant-time comparison, and single-use deletion.
 */
async function verifyOtp({ email, code, pool, env }) {
  const normalizedEmail = email.trim().toLowerCase();

  // Opportunistic cleanup of other expired OTPs
  await pool.query('DELETE FROM otps WHERE expires_at < now() AND email != $1', [normalizedEmail]).catch(() => {});

  const res = await pool.query(
    'SELECT code_hash, attempts, expires_at FROM otps WHERE email = $1',
    [normalizedEmail]
  );

  if (res.rows.length === 0) {
    throw new AppError(400, 'Invalid or expired OTP');
  }

  const record = res.rows[0];

  // Check expiration
  if (new Date(record.expires_at) < new Date()) {
    await pool.query('DELETE FROM otps WHERE email = $1', [normalizedEmail]);
    throw new AppError(400, 'Invalid or expired OTP');
  }

  // Check attempts limit (dead if >= 5 attempts)
  if (record.attempts >= 5) {
    await pool.query('DELETE FROM otps WHERE email = $1', [normalizedEmail]);
    throw new AppError(400, 'OTP expired due to too many failed attempts. Please request a new code');
  }

  // Constant-time compare using HMAC hashes
  const incomingHash = hashOtp(code, env.JWT_SECRET);
  const storedHashBuf = Buffer.from(record.code_hash, 'hex');
  const incomingHashBuf = Buffer.from(incomingHash, 'hex');

  let matches = false;
  if (storedHashBuf.length === incomingHashBuf.length) {
    matches = crypto.timingSafeEqual(storedHashBuf, incomingHashBuf);
  }

  if (!matches) {
    // Atomically increment attempts
    const updateRes = await pool.query(
      'UPDATE otps SET attempts = attempts + 1 WHERE email = $1 RETURNING attempts',
      [normalizedEmail]
    );

    const attemptsNow = updateRes.rows[0]?.attempts || (record.attempts + 1);
    if (attemptsNow >= 5) {
      await pool.query('DELETE FROM otps WHERE email = $1', [normalizedEmail]);
      throw new AppError(400, 'Invalid OTP. Code has expired due to too many failed attempts');
    }

    throw new AppError(400, 'Invalid OTP code');
  }

  // Success: Delete OTP immediately to ensure single-use
  await pool.query('DELETE FROM otps WHERE email = $1', [normalizedEmail]);

  // Check if existing user
  const userRes = await pool.query(
    'SELECT id, email, full_name, upi_id FROM users WHERE email = $1',
    [normalizedEmail]
  );

  if (userRes.rows.length > 0) {
    // Existing user -> issue 7-day session token with otpFresh=true
    const user = userRes.rows[0];
    const token = signSessionToken({
      userId: user.id,
      email: user.email,
      otpFresh: true,
      env,
    });
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        upiId: user.upi_id,
      },
      otpFresh: true,
    };
  }

  // New user -> issue 30-minute registration token bound to this verified email
  const registrationToken = signRegistrationToken({
    email: normalizedEmail,
    env,
  });

  return {
    registrationToken,
    isNewUser: true,
  };
}

module.exports = {
  hashOtp,
  generateOtpCode,
  sendOtp,
  verifyOtp,
};
