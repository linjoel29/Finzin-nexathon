// vault.js - Vault deposits, withdrawals, portfolio overview, and goals management.
// Covers Step 5 Vault & Goals specifications.
const express = require('express');
const { z } = require('zod');
const { validateBody, validateParams } = require('../middleware/validate');
const { createAuthMiddleware } = require('../middleware/auth');
const { paymentsLimiter, pinCheckLimiter } = require('../middleware/rateLimiters');
const { AppError } = require('../utils/AppError');
const { verifyPin } = require('../services/pin');
const { withTransaction } = require('../config/db');
const { rupeesToPaise, paiseToRupees } = require('../utils/money');
const {
  processVaultDeposit,
  processVaultWithdraw,
  getPortfolio,
  calculateAccruedInterest,
  processSliceDeposit,
  processSliceWithdraw,
} = require('../services/vault');

// Zod schemas
const vaultOperationSchema = z.object({
  amount: z.union([z.number(), z.string()], {
    errorMap: () => ({ message: 'Amount is required' }),
  }),
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
  idempotencyKey: z.string().min(8, 'Idempotency key must be at least 8 characters').max(100),
}).strict();

const createGoalSchema = z.object({
  name: z.string().min(1, 'Goal name is required').max(50, 'Goal name cannot exceed 50 characters'),
  target: z.union([z.number(), z.string()]).optional().nullable(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().nullable(),
}).strict();

const updateGoalSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  target: z.union([z.number(), z.string()]).optional().nullable(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().nullable(),
  allocated: z.union([z.number(), z.string()]).optional(),
}).strict();

const goalParamsSchema = z.object({
  id: z.string().uuid('Invalid goal ID format'),
}).strict();

/**
 * Creates and configures the Vault & Portfolio router.
 */
function createVaultRouter({ env, pool }) {
  const router = express.Router();
  const requireAuth = createAuthMiddleware(env);

  // POST /api/vault/deposit
  const depositHandler = async (req, res, next) => {
    try {
      const { amount, pin, idempotencyKey } = req.body;
      const userId = req.user.id;

      // Verify PIN in its own committed step
      await verifyPin({
        userId,
        pin,
        pool,
      });

      const result = await processVaultDeposit({
        userId,
        amountRupees: amount,
        idempotencyKey,
        pool,
        type: 'vault_deposit',
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  router.post('/deposit', requireAuth, paymentsLimiter, pinCheckLimiter, validateBody(vaultOperationSchema), depositHandler);
  router.post('/vault/deposit', requireAuth, paymentsLimiter, pinCheckLimiter, validateBody(vaultOperationSchema), depositHandler);

  // POST /api/vault/withdraw
  const withdrawHandler = async (req, res, next) => {
    try {
      const { amount, pin, idempotencyKey } = req.body;
      const userId = req.user.id;

      // Verify PIN in its own committed step
      await verifyPin({
        userId,
        pin,
        pool,
      });

      const result = await processVaultWithdraw({
        userId,
        amountRupees: amount,
        idempotencyKey,
        pool,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  router.post('/withdraw', requireAuth, paymentsLimiter, pinCheckLimiter, validateBody(vaultOperationSchema), withdrawHandler);
  router.post('/vault/withdraw', requireAuth, paymentsLimiter, pinCheckLimiter, validateBody(vaultOperationSchema), withdrawHandler);

  // GET /api/portfolio
  router.get('/portfolio', requireAuth, async (req, res, next) => {
    try {
      const portfolio = await getPortfolio(req.user.id, pool);
      res.json(portfolio);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/goals - retrieve all goals for user with summary
  router.get('/goals', requireAuth, async (req, res, next) => {
    try {
      const userId = req.user.id;
      const { rows } = await pool.query(
        "SELECT id, name, target_amount, allocated, to_char(target_date, 'YYYY-MM-DD') AS target_date, created_at FROM goals WHERE user_id = $1 ORDER BY created_at ASC",
        [userId]
      );

      const accRes = await pool.query('SELECT balance FROM accounts WHERE user_id = $1', [userId]);
      const walletBalance = accRes.rows[0] ? paiseToRupees(accRes.rows[0].balance) : 0;

      const goals = rows.map((g) => ({
        id: g.id,
        name: g.name,
        target: g.target_amount ? paiseToRupees(g.target_amount) : null,
        targetDate: g.target_date || null,
        allocated: paiseToRupees(g.allocated),
        createdAt: g.created_at,
      }));

      const sliceTotalPaise = rows.reduce((sum, g) => sum + BigInt(g.allocated || 0), 0n);

      res.json({
        goals,
        sliceTotal: paiseToRupees(sliceTotalPaise),
        walletBalance,
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/goals - create a savings goal
  router.post('/goals', requireAuth, validateBody(createGoalSchema), async (req, res, next) => {
    try {
      const userId = req.user.id;
      const { name, target, targetDate } = req.body;

      let targetPaise = null;
      if (target !== undefined && target !== null && target !== '') {
        targetPaise = rupeesToPaise(target, 100_000_000);
      }

      const { rows } = await pool.query(
        `INSERT INTO goals (user_id, name, target_amount, allocated, target_date)
         VALUES ($1, $2, $3, 0, $4)
         RETURNING id, name, target_amount, allocated, to_char(target_date, 'YYYY-MM-DD') AS target_date, created_at`,
        [userId, name.trim(), targetPaise, targetDate || null]
      );

      const created = rows[0];
      res.status(201).json({
        id: created.id,
        name: created.name,
        target: created.target_amount ? paiseToRupees(created.target_amount) : null,
        targetDate: created.target_date || null,
        allocated: paiseToRupees(created.allocated),
        createdAt: created.created_at,
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/goals/:id/deposit - deposit money into Slice goal pot
  router.post(
    '/goals/:id/deposit',
    requireAuth,
    paymentsLimiter,
    pinCheckLimiter,
    validateParams(goalParamsSchema),
    validateBody(vaultOperationSchema),
    async (req, res, next) => {
      try {
        const { amount, pin, idempotencyKey } = req.body;
        const userId = req.user.id;
        const goalId = req.params.id;

        // Verify PIN in dedicated committed step
        await verifyPin({
          userId,
          pin,
          pool,
        });

        const result = await processSliceDeposit({
          userId,
          goalId,
          amountRupees: amount,
          idempotencyKey,
          pool,
        });

        res.json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/goals/:id/withdraw - withdraw money from Slice goal pot back to wallet
  router.post(
    '/goals/:id/withdraw',
    requireAuth,
    paymentsLimiter,
    pinCheckLimiter,
    validateParams(goalParamsSchema),
    validateBody(vaultOperationSchema),
    async (req, res, next) => {
      try {
        const { amount, pin, idempotencyKey } = req.body;
        const userId = req.user.id;
        const goalId = req.params.id;

        // Verify PIN in dedicated committed step
        await verifyPin({
          userId,
          pin,
          pool,
        });

        const result = await processSliceWithdraw({
          userId,
          goalId,
          amountRupees: amount,
          idempotencyKey,
          pool,
        });

        res.json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  // PATCH /api/goals/:id - update goal details (name, target, targetDate) or allocated funds (legacy compat)
  router.patch(
    '/goals/:id',
    requireAuth,
    validateParams(goalParamsSchema),
    validateBody(updateGoalSchema),
    async (req, res, next) => {
      try {
        const userId = req.user.id;
        const goalId = req.params.id;
        const { allocated, name, target, targetDate } = req.body;

        // Backward compatibility for legacy tests that pass { allocated }
        if (allocated !== undefined) {
          const allocatedPaise = rupeesToPaise(allocated, 100_000_000);

          const accRes = await pool.query(
            'SELECT vault_principal, vault_last_accrued_at FROM accounts WHERE user_id = $1',
            [userId]
          );

          if (accRes.rows.length === 0) {
            throw new AppError(404, 'Account not found');
          }

          const acc = accRes.rows[0];
          const accrued = calculateAccruedInterest(acc.vault_principal, acc.vault_last_accrued_at);
          const vaultTotalPaise = BigInt(acc.vault_principal) + accrued;

          if (BigInt(allocatedPaise) > vaultTotalPaise) {
            throw new AppError(400, 'Allocated amount cannot exceed total vault savings');
          }

          const { rows } = await pool.query(
            `UPDATE goals
             SET allocated = $1
             WHERE id = $2 AND user_id = $3
             RETURNING id, name, target_amount, allocated, target_date`,
            [allocatedPaise, goalId, userId]
          );

          if (rows.length === 0) {
            throw new AppError(404, 'Goal not found');
          }

          const updated = rows[0];
          return res.json({
            id: updated.id,
            name: updated.name,
            target: updated.target_amount ? paiseToRupees(updated.target_amount) : null,
            targetDate: updated.target_date || null,
            allocated: paiseToRupees(updated.allocated),
          });
        }

        // Rename / Target / Date updates
        const fields = [];
        const values = [];
        let idx = 1;

        if (name !== undefined) {
          fields.push(`name = $${idx++}`);
          values.push(name.trim());
        }

        if (target !== undefined) {
          fields.push(`target_amount = $${idx++}`);
          values.push(target ? rupeesToPaise(target, 100_000_000) : null);
        }

        if (targetDate !== undefined) {
          fields.push(`target_date = $${idx++}`);
          values.push(targetDate || null);
        }

        if (fields.length === 0) {
          throw new AppError(400, 'No valid fields provided for update');
        }

        values.push(goalId, userId);
        const query = `UPDATE goals SET ${fields.join(', ')} WHERE id = $${idx++} AND user_id = $${idx++} RETURNING id, name, target_amount, allocated, to_char(target_date, 'YYYY-MM-DD') AS target_date`;

        const { rows } = await pool.query(query, values);
        if (rows.length === 0) {
          throw new AppError(404, 'Goal not found');
        }

        const updated = rows[0];
        res.json({
          id: updated.id,
          name: updated.name,
          target: updated.target_amount ? paiseToRupees(updated.target_amount) : null,
          targetDate: updated.target_date || null,
          allocated: paiseToRupees(updated.allocated),
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // DELETE /api/goals/:id - delete a goal (safe balance handling: returns any allocated funds to wallet)
  router.delete(
    '/goals/:id',
    requireAuth,
    validateParams(goalParamsSchema),
    async (req, res, next) => {
      try {
        const userId = req.user.id;
        const goalId = req.params.id;

        await withTransaction(pool, async (client) => {
          // Verify goal ownership and allocated balance with lock
          const { rows } = await client.query(
            'SELECT id, name, allocated FROM goals WHERE id = $1 AND user_id = $2 FOR UPDATE',
            [goalId, userId]
          );

          if (rows.length === 0) {
            throw new AppError(404, 'Goal not found');
          }

          const goal = rows[0];

          // If goal has funds, safely sweep them back to wallet before deletion
          if (BigInt(goal.allocated) > 0n) {
            const accRes = await client.query(
              'SELECT balance FROM accounts WHERE user_id = $1 FOR UPDATE',
              [userId]
            );
            if (accRes.rows.length > 0) {
              const newBalance = BigInt(accRes.rows[0].balance) + BigInt(goal.allocated);
              await client.query('UPDATE accounts SET balance = $1 WHERE user_id = $2', [
                newBalance.toString(),
                userId,
              ]);

              // Record safe sweep in transaction ledger
              const note = `Slice closure return: ${goal.name}`;
              await client.query(
                `INSERT INTO transactions (type, from_user, to_user, amount, category, note)
                 VALUES ('save', $1, $1, $2, 'others', $3)`,
                [userId, goal.allocated, note]
              );
            }
          }

          await client.query('DELETE FROM goals WHERE id = $1 AND user_id = $2', [goalId, userId]);
        });

        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

module.exports = { createVaultRouter };
