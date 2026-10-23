// helpers.js - shared test utilities for database setup and test user provisioning.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { signSessionToken } = require('../src/middleware/auth');

/**
 * Cleans up test users and their related accounts, transactions, and goals.
 */
async function cleanUsers(pool, emails = [], mobiles = []) {
  if (!pool || (emails.length === 0 && mobiles.length === 0)) return;
  await pool.query(
    `DELETE FROM transactions
     WHERE from_user IN (SELECT id FROM users WHERE email = ANY($1::text[]) OR mobile = ANY($2::text[]))
        OR to_user IN (SELECT id FROM users WHERE email = ANY($1::text[]) OR mobile = ANY($2::text[]))`,
    [emails, mobiles]
  );
  await pool.query(
    'DELETE FROM accounts WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1::text[]) OR mobile = ANY($2::text[]))',
    [emails, mobiles]
  );
  await pool.query(
    'DELETE FROM goals WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1::text[]) OR mobile = ANY($2::text[]))',
    [emails, mobiles]
  );
  await pool.query('DELETE FROM users WHERE email = ANY($1::text[]) OR mobile = ANY($2::text[])', [emails, mobiles]);
  await pool.query('DELETE FROM otps WHERE email = ANY($1::text[])', [emails]);
}

/**
 * Directly provisions a test user, account, and welcome ledger entry in the test database.
 */
async function insertTestUser(pool, { email, mobile, pin = '1234', balancePaise = 500000, env }) {
  await cleanUsers(pool, [email], [mobile]);

  const pinHash = await bcrypt.hash(String(pin), 10);
  const accNum = crypto.randomInt(100000000000, 1000000000000).toString();
  const upiId = `${mobile}@finzin`;

  const { rows } = await pool.query(
    `INSERT INTO users (
       email, full_name, dob, gender, mobile, address_line, city, state, pincode,
       college_name, student_id, nominee_name, nominee_relation, kyc_status,
       upi_id, account_number, ifsc, pin_hash, consent_at
     ) VALUES (
       $1, 'User ' || right($2, 4), '2004-01-01', 'female', $2,
       'Campus St', 'Mangalore', 'Karnataka', '575001',
       'Engineering Institute', 'ID_' || right($2, 4), 'Guardian', 'Father', 'demo verified',
       $3, $4, 'FNZN0000001', $5, now()
     ) RETURNING id, email, full_name, mobile, upi_id, account_number, ifsc`,
    [email, mobile, upiId, accNum, pinHash]
  );

  const user = rows[0];

  await pool.query(
    `INSERT INTO accounts (user_id, balance, vault_principal, vault_interest_earned, vault_last_accrued_at)
     VALUES ($1, $2, 0, 0, now())`,
    [user.id, balancePaise]
  );

  await pool.query(
    `INSERT INTO transactions (type, from_user, to_user, amount, category, note)
     VALUES ('welcome_credit', NULL, $1, $2, 'others', 'Welcome credit')`,
    [user.id, balancePaise]
  );

  const token = signSessionToken({
    userId: user.id,
    email: user.email,
    otpFresh: true,
    env,
  });

  return {
    id: user.id,
    token,
    email: user.email,
    mobile: user.mobile,
    upiId: user.upi_id,
    accountNumber: user.account_number,
    ifsc: user.ifsc,
  };
}

module.exports = {
  cleanUsers,
  insertTestUser,
};
