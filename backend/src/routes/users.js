// users.js - user lookup and current authenticated session summary (/api/me).
// Covers Step 4 lookup & me endpoint requirements.
const express = require('express');
const { z } = require('zod');
const { validateQuery } = require('../middleware/validate');
const { createAuthMiddleware } = require('../middleware/auth');
const { lookupLimiter } = require('../middleware/rateLimiters');
const { AppError } = require('../utils/AppError');
const { paiseToRupees } = require('../utils/money');
const { calculateAccruedInterest } = require('../services/vault');

const lookupQuerySchema = z.object({
  mode: z.enum(['upi', 'mobile', 'bank'], {
    errorMap: () => ({ message: 'Mode must be one of: upi, mobile, bank' }),
  }),
  value: z.string().min(1, 'Lookup value is required'),
  ifsc: z.string().optional(),
}).strict();

/**
 * Creates and configures the Users router.
 */
function createUsersRouter({ env, pool }) {
  const router = express.Router();
  const requireAuth = createAuthMiddleware(env);

  // GET /api/users/lookup (or /lookup if mounted under /api/users)
  const lookupHandler = async (req, res, next) => {
    try {
      const { mode, value, ifsc } = req.query;
      const cleanValue = value.trim();

      let query = '';
      let params = [];

      if (mode === 'upi') {
        query = 'SELECT id, full_name, upi_id FROM users WHERE upi_id = lower($1)';
        params = [cleanValue];
      } else if (mode === 'mobile') {
        query = 'SELECT id, full_name, upi_id FROM users WHERE mobile = $1';
        params = [cleanValue];
      } else if (mode === 'bank') {
        // Enforce demo IFSC requirement for bank account lookup
        if (!ifsc || ifsc.trim().toUpperCase() !== 'FNZN0000001') {
          throw new AppError(404, 'Recipient not found');
        }
        query = 'SELECT id, full_name, upi_id FROM users WHERE account_number = $1';
        params = [cleanValue];
      }

      const { rows } = await pool.query(query, params);

      if (rows.length === 0) {
        throw new AppError(404, 'Recipient not found');
      }

      // Return ONLY name and upiId (never leak email, mobile, or account number)
      res.json({
        name: rows[0].full_name,
        upiId: rows[0].upi_id,
      });
    } catch (err) {
      next(err);
    }
  };

  router.get('/lookup', requireAuth, lookupLimiter, validateQuery(lookupQuerySchema), lookupHandler);
  router.get('/users/lookup', requireAuth, lookupLimiter, validateQuery(lookupQuerySchema), lookupHandler);

  // GET /api/me - dashboard header summary
  router.get('/me', requireAuth, async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT u.full_name, u.upi_id, a.balance, a.vault_principal, a.vault_last_accrued_at
         FROM users u
         JOIN accounts a ON a.user_id = u.id
         WHERE u.id = $1`,
        [req.user.id]
      );

      if (rows.length === 0) {
        throw new AppError(404, 'User account not found');
      }

      const row = rows[0];
      const accrued = calculateAccruedInterest(row.vault_principal, row.vault_last_accrued_at);
      const vaultTotalPaise = BigInt(row.vault_principal) + accrued;

      res.json({
        user: {
          name: row.full_name,
          handle: row.upi_id, // Frontend calls UPI handle
        },
        balance: paiseToRupees(row.balance),
        savings: paiseToRupees(vaultTotalPaise),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createUsersRouter };
