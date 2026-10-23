// profile.js - user profile management and secure account disclosure.
// Covers Step 3 of Finzin banking specifications.
const express = require('express');
const { z } = require('zod');
const { validateBody } = require('../middleware/validate');
const { createAuthMiddleware } = require('../middleware/auth');
const { pinCheckLimiter } = require('../middleware/rateLimiters');
const { verifyPin } = require('../services/pin');
const { maskMobile, maskAccountNumber } = require('../utils/masks');
const { AppError } = require('../utils/AppError');

// Strict zod schemas
const accountDetailsSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
}).strict();

const updateProfileSchema = z.object({
  address: z.object({
    line: z.string().min(3).max(150),
    city: z.string().min(2).max(60),
    state: z.string().min(2).max(60),
    pincode: z.string().regex(/^[0-9]{6}$/, 'Pincode must be 6 digits'),
  }).strict().optional(),
  nominee: z.object({
    name: z.string().min(2).max(80),
    relation: z.string().min(2).max(30),
  }).strict().optional(),
  college: z.string().min(2).max(100).optional(),
}).strict(); // Rejects unknown fields like email, mobile, balance, pin

/**
 * Formats a user DB record into the safe profile object.
 */
function formatProfile(user) {
  // Format Date to YYYY-MM-DD
  let dobStr = user.dob;
  if (user.dob instanceof Date) {
    dobStr = user.dob.toISOString().split('T')[0];
  }

  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    dob: dobStr,
    gender: user.gender,
    mobile: maskMobile(user.mobile),
    accountNumber: maskAccountNumber(user.account_number),
    upiId: user.upi_id,
    ifsc: user.ifsc,
    kycStatus: user.kyc_status,
    kycLast4: user.kyc_last4,
    college: user.college_name,
    studentId: user.student_id,
    address: {
      line: user.address_line,
      city: user.city,
      state: user.state,
      pincode: user.pincode,
    },
    nominee: {
      name: user.nominee_name,
      relation: user.nominee_relation,
    },
  };
}

/**
 * Creates and configures the Profile router.
 */
function createProfileRouter({ env, pool }) {
  const router = express.Router();
  const requireAuth = createAuthMiddleware(env);

  // GET /api/profile - returns masked profile without pin_hash
  router.get('/', requireAuth, async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, email, full_name, dob, gender, mobile, address_line, city, state,
                pincode, college_name, student_id, nominee_name, nominee_relation,
                kyc_status, kyc_last4, upi_id, account_number, ifsc
         FROM users
         WHERE id = $1`,
        [req.user.id]
      );

      if (rows.length === 0) {
        throw new AppError(404, 'User profile not found');
      }

      res.json(formatProfile(rows[0]));
    } catch (err) {
      next(err);
    }
  });

  // POST /api/profile/account-details - reveals FULL account number + IFSC after PIN confirmation
  router.post(
    '/account-details',
    requireAuth,
    pinCheckLimiter,
    validateBody(accountDetailsSchema),
    async (req, res, next) => {
      try {
        await verifyPin({
          userId: req.user.id,
          pin: req.body.pin,
          pool,
        });

        const { rows } = await pool.query(
          'SELECT account_number, ifsc FROM users WHERE id = $1',
          [req.user.id]
        );

        if (rows.length === 0) {
          throw new AppError(404, 'User not found');
        }

        res.json({
          accountNumber: rows[0].account_number,
          ifsc: rows[0].ifsc,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // PATCH /api/profile - edit ONLY address, nominee, and college (strictly rejects other fields)
  router.patch(
    '/',
    requireAuth,
    validateBody(updateProfileSchema),
    async (req, res, next) => {
      try {
        const { address, nominee, college } = req.body;

        if (!address && !nominee && !college) {
          throw new AppError(400, 'At least one editable field (address, nominee, college) must be provided');
        }

        const updates = [];
        const values = [];
        let paramIdx = 1;

        if (address) {
          updates.push(`address_line = $${paramIdx++}`, `city = $${paramIdx++}`, `state = $${paramIdx++}`, `pincode = $${paramIdx++}`);
          values.push(address.line.trim(), address.city.trim(), address.state.trim(), address.pincode.trim());
        }

        if (nominee) {
          updates.push(`nominee_name = $${paramIdx++}`, `nominee_relation = $${paramIdx++}`);
          values.push(nominee.name.trim(), nominee.relation.trim());
        }

        if (college) {
          updates.push(`college_name = $${paramIdx++}`);
          values.push(college.trim());
        }

        values.push(req.user.id);
        const query = `
          UPDATE users
          SET ${updates.join(', ')}
          WHERE id = $${paramIdx}
          RETURNING id, email, full_name, dob, gender, mobile, address_line, city, state,
                    pincode, college_name, student_id, nominee_name, nominee_relation,
                    kyc_status, kyc_last4, upi_id, account_number, ifsc
        `;

        const { rows } = await pool.query(query, values);
        if (rows.length === 0) {
          throw new AppError(404, 'User not found');
        }

        res.json(formatProfile(rows[0]));
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

module.exports = { createProfileRouter };
