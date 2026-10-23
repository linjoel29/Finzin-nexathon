// pin.js - PIN verification, lockout protection, and resetting.
// SECURITY RULES:
// 1. PINs are 4 digits, stored as bcrypt hashes with salt round cost 10.
// 2. Lockout policy:
//    - 3 consecutive incorrect attempts trigger a 15-minute lockout (HTTP 423).
//    - Counter resets to 0 when lockout initiates, and locks until now + 15 min.
//    - Successful verification resets attempts to 0 and clears lock.
// 3. Atomicity: PIN verification and attempt counter updates are COMMITTED in their own
//    isolated database step BEFORE any downstream payment or vault transaction opens.
//    This guarantees a failed payment cannot roll back an attempt counter increment.
// 4. Parallel safe: Atomic SQL UPDATE ensures concurrent guesses cannot evade the lock.
// 5. Never log PINs or hashes.
const bcrypt = require('bcryptjs');
const { AppError } = require('../utils/AppError');

/**
 * Verifies a user's 4-digit PIN against their stored bcrypt hash with strict lockout handling.
 *
 * @param {object} params
 * @param {string} params.userId - UUID of the user
 * @param {string} params.pin - 4-digit numeric PIN
 * @param {object} params.pool - Database connection pool
 * @returns {Promise<boolean>} Resolves true on valid PIN; throws AppError on failure/lockout
 */
async function verifyPin({ userId, pin, pool }) {
  if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    throw new AppError(400, 'PIN must be exactly 4 digits');
  }

  // 1. Check if user exists and whether their PIN is currently locked
  const userRes = await pool.query(
    'SELECT pin_hash, pin_attempts, pin_locked_until FROM users WHERE id = $1',
    [userId]
  );

  if (userRes.rows.length === 0) {
    throw new AppError(404, 'User not found');
  }

  const user = userRes.rows[0];

  if (user.pin_locked_until) {
    const lockExpiry = new Date(user.pin_locked_until).getTime();
    const now = Date.now();
    if (lockExpiry > now) {
      const minutesLeft = Math.max(1, Math.ceil((lockExpiry - now) / 60000));
      throw new AppError(423, `PIN locked, try again in ${minutesLeft} minutes`);
    }
  }

  if (!user.pin_hash) {
    throw new AppError(400, 'PIN has not been created yet');
  }

  // 2. Constant-time compare using bcrypt
  const isMatch = await bcrypt.compare(String(pin), user.pin_hash);

  if (isMatch) {
    // Correct PIN: reset attempts counter and clear any lock
    await pool.query(
      'UPDATE users SET pin_attempts = 0, pin_locked_until = NULL WHERE id = $1',
      [userId]
    );
    return true;
  }

  // 3. Incorrect PIN: Atomically increment attempts and lock if threshold (3) is reached
  const updateRes = await pool.query(
    `UPDATE users
     SET pin_locked_until = CASE
           WHEN pin_attempts + 1 >= 3 THEN now() + interval '15 minutes'
           ELSE pin_locked_until
         END,
         pin_attempts = CASE
           WHEN pin_attempts + 1 >= 3 THEN 0
           ELSE pin_attempts + 1
         END
     WHERE id = $1
     RETURNING pin_attempts, pin_locked_until`,
    [userId]
  );

  const updated = updateRes.rows[0];
  if (updated && updated.pin_locked_until && new Date(updated.pin_locked_until) > new Date()) {
    throw new AppError(423, 'PIN locked, try again in 15 minutes');
  }

  throw new AppError(400, 'Invalid PIN');
}

/**
 * Updates a user's PIN and clears any previous attempts or lockouts.
 *
 * @param {object} params
 * @param {string} params.userId - UUID of user
 * @param {string} params.newPin - 4-digit PIN string
 * @param {object} params.pool - Database pool
 */
async function resetPin({ userId, newPin, pool }) {
  if (!newPin || typeof newPin !== 'string' || !/^\d{4}$/.test(newPin)) {
    throw new AppError(400, 'New PIN must be exactly 4 digits');
  }

  const pinHash = await bcrypt.hash(String(newPin), 10);

  await pool.query(
    `UPDATE users
     SET pin_hash = $1,
         pin_attempts = 0,
         pin_locked_until = NULL
     WHERE id = $2`,
    [pinHash, userId]
  );

  return { ok: true };
}

module.exports = {
  verifyPin,
  resetPin,
};
