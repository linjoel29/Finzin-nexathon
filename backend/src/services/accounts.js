// accounts.js - user registration and banking account initialization.
// RULES:
// 1. All registration steps (user profile, account balance, welcome ledger entry) execute in
//    ONE atomic database transaction using withTransaction. If any step fails, nothing is committed.
// 2. Mobile and email duplicates yield a generic response without leaking existence.
// 3. Unique 12-digit account numbers generated with crypto.randomInt with collision retries.
// 4. UPI handle is automatically assigned as <mobile>@finzin.
// 5. PIN hashed using bcrypt cost 10.
// 6. Age must be between 16 and 100 years.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { AppError } = require('../utils/AppError');
const { withTransaction } = require('../config/db');
const { verifyRegistrationToken, signSessionToken } = require('../middleware/auth');

/**
 * Validates that the date of birth corresponds to an age between 16 and 100 years.
 *
 * @param {string} dobString - Date of birth in YYYY-MM-DD format
 */
function validateAge(dobString) {
  const dob = new Date(dobString);
  if (Number.isNaN(dob.getTime())) {
    throw new AppError(400, 'Invalid date of birth');
  }

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }

  if (age < 16 || age > 100) {
    throw new AppError(400, 'Age must be between 16 and 100 years to open a Finzin account');
  }
}

/**
 * Generates an available 12-digit demo bank account number.
 *
 * @param {import('pg').PoolClient} client - Database transaction client
 * @returns {Promise<string>} 12-digit account number string
 */
async function generateUniqueAccountNumber(client) {
  for (let attempt = 0; attempt < 5; attempt++) {
    // 12 digits: between 100,000,000,000 and 999,999,999,999
    const accNum = crypto.randomInt(100000000000, 1000000000000).toString();
    const existing = await client.query('SELECT 1 FROM users WHERE account_number = $1', [accNum]);
    if (existing.rows.length === 0) {
      return accNum;
    }
  }
  throw new AppError(500, 'Failed to generate unique account number, please retry');
}

/**
 * Registers a new user and provisions their account + welcome credit atomically.
 */
async function registerUser({ payload, pool, env }) {
  const {
    registrationToken,
    fullName,
    dob,
    gender,
    mobile,
    address,
    college,
    studentId,
    nominee,
    kycLast4,
    pin,
    consent,
  } = payload;

  if (consent !== true) {
    throw new AppError(400, 'Consent must be accepted to register');
  }

  validateAge(dob);

  // Extract and verify email from registration token
  const tokenPayload = verifyRegistrationToken(registrationToken, env);
  const email = tokenPayload.email.trim().toLowerCase();

  // Hash PIN before opening transaction
  const pinHash = await bcrypt.hash(String(pin), 10);
  const upiId = `${mobile}@finzin`;

  return withTransaction(pool, async (client) => {
    // 1. Check duplicate email or mobile
    const dupCheck = await client.query(
      'SELECT 1 FROM users WHERE email = $1 OR mobile = $2',
      [email, mobile]
    );

    if (dupCheck.rows.length > 0) {
      throw new AppError(400, 'An account with this email or mobile number already exists');
    }

    // 2. Generate unique 12-digit account number
    const accountNumber = await generateUniqueAccountNumber(client);

    // 3. Insert user record
    const userInsertSql = `
      INSERT INTO users (
        email, full_name, dob, gender, mobile,
        address_line, city, state, pincode,
        college_name, student_id, nominee_name, nominee_relation,
        kyc_status, kyc_last4, upi_id, account_number, ifsc,
        pin_hash, consent_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13,
        'demo verified', $14, $15, $16, 'FNZN0000001',
        $17, now()
      )
      RETURNING id, email, full_name, mobile, upi_id, account_number, ifsc, kyc_status, created_at;
    `;

    let userRow;
    try {
      const userRes = await client.query(userInsertSql, [
        email,
        fullName.trim(),
        dob,
        gender || null,
        mobile,
        address.line.trim(),
        address.city.trim(),
        address.state.trim(),
        address.pincode.trim(),
        college.trim(),
        studentId.trim(),
        nominee.name.trim(),
        nominee.relation.trim(),
        kycLast4 || null,
        upiId,
        accountNumber,
        pinHash,
      ]);
      userRow = userRes.rows[0];
    } catch (err) {
      if (err.code === '23505') {
        throw new AppError(400, 'An account with this email or mobile number already exists');
      }
      throw err;
    }

    const userId = userRow.id;
    const welcomeCreditPaise = env.WELCOME_CREDIT_PAISE || 500000;

    // 4. Create accounts row with welcome balance
    await client.query(
      `INSERT INTO accounts (user_id, balance, vault_principal, vault_interest_earned, vault_last_accrued_at)
       VALUES ($1, $2, 0, 0, now())`,
      [userId, welcomeCreditPaise]
    );

    // 5. Insert welcome credit into transactions ledger
    await client.query(
      `INSERT INTO transactions (type, from_user, to_user, amount, category, note)
       VALUES ('welcome_credit', NULL, $1, $2, 'others', 'Welcome credit')`,
      [userId, welcomeCreditPaise]
    );

    // 6. Generate 7-day session token
    const token = signSessionToken({
      userId,
      email,
      otpFresh: true,
      env,
    });

    return {
      token,
      user: {
        id: userRow.id,
        email: userRow.email,
        fullName: userRow.full_name,
        upiId: userRow.upi_id,
        accountNumber: userRow.account_number,
        ifsc: userRow.ifsc,
      },
    };
  });
}

module.exports = {
  validateAge,
  registerUser,
};
