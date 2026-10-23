// payments.js - payments transfer and save-to-vault endpoints.
// Implements ACID-compliant atomic transfers, idempotency, row-level locks, and unified history.
const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { validateBody } = require('../middleware/validate');
const { createAuthMiddleware } = require('../middleware/auth');
const { paymentsLimiter, pinCheckLimiter } = require('../middleware/rateLimiters');
const { AppError } = require('../utils/AppError');
const { withTransaction } = require('../config/db');
const { verifyPin } = require('../services/pin');
const { rupeesToPaise, paiseToRupees } = require('../utils/money');
const { processVaultDeposit } = require('../services/vault');

// Date formatting helper for Asia/Kolkata timezone: produces 'YYYY-MM-DD'
function formatDateKolkata(date) {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
}

// Allowed transaction categories matching PostgreSQL check constraint
const ALLOWED_CATEGORIES = ['food', 'travel', 'recharge', 'shopping', 'others'];

// Zod schemas
const transferSchema = z
  .object({
    payee: z
      .object({
        mode: z.enum(['upi', 'mobile', 'bank'], {
          errorMap: () => ({ message: 'Payee mode must be upi, mobile, or bank' }),
        }),
        value: z.string().min(1, 'Payee value is required'),
        ifsc: z.string().optional(),
      })
      .optional(),
    recipient_id: z.string().uuid().optional(),
    recipient: z.string().optional(),
    to_user: z.string().optional(),
    amount: z.union([z.number(), z.string()]).optional(),
    amount_paise: z.number().int().positive().optional(),
    pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits').optional(),
    category: z.string().optional().default('others'),
    description: z.string().max(100, 'Description cannot exceed 100 characters').optional(),
    note: z.string().max(100, 'Note cannot exceed 100 characters').optional(),
    idempotency_key: z.string().min(8).max(100).optional(),
    idempotencyKey: z.string().min(8).max(100).optional(),
  })
  .refine((data) => data.payee || data.recipient_id || data.recipient || data.to_user, {
    message: 'Recipient information is required',
  })
  .refine((data) => data.amount !== undefined || data.amount_paise !== undefined, {
    message: 'Amount is required',
  });

const saveSchema = z.object({
  amount: z.union([z.number(), z.string()], {
    errorMap: () => ({ message: 'Amount is required' }),
  }),
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
  idempotencyKey: z.string().min(8, 'Idempotency key must be at least 8 characters').max(100),
}).strict();

/**
 * Resolves a payee on the server to prevent client spoofing.
 */
async function resolvePayee(body, pool) {
  const { payee, recipient_id, recipient, to_user } = body;

  // 1. Direct payee object
  if (payee && payee.mode && payee.value) {
    const mode = payee.mode.toLowerCase();
    const clean = String(payee.value).trim();
    if (mode === 'upi') {
      const { rows } = await pool.query(
        'SELECT id, full_name, upi_id FROM users WHERE lower(upi_id) = lower($1)',
        [clean]
      );
      if (rows.length === 0) throw new AppError(404, 'Recipient not found');
      return rows[0];
    }
    if (mode === 'mobile') {
      const cleanMobile = clean.replace(/\D/g, '').slice(-10);
      const { rows } = await pool.query(
        'SELECT id, full_name, upi_id FROM users WHERE mobile = $1',
        [cleanMobile]
      );
      if (rows.length === 0) throw new AppError(404, 'Recipient not found');
      return rows[0];
    }
    if (mode === 'bank') {
      const ifsc = (payee.ifsc || '').trim().toUpperCase();
      if (ifsc && ifsc !== 'FNZN0000001') {
        throw new AppError(404, 'Recipient not found');
      }
      const { rows } = await pool.query(
        'SELECT id, full_name, upi_id FROM users WHERE account_number = $1',
        [clean]
      );
      if (rows.length === 0) throw new AppError(404, 'Recipient not found');
      return rows[0];
    }
  }

  // 2. Direct recipient_id or recipient string
  const target = recipient_id || recipient || to_user;
  if (target) {
    const clean = String(target).trim();
    // Check if UUID
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) {
      const { rows } = await pool.query(
        'SELECT id, full_name, upi_id FROM users WHERE id = $1',
        [clean]
      );
      if (rows.length > 0) return rows[0];
    }
    // Check if 10-digit mobile
    const digits = clean.replace(/\D/g, '');
    if (digits.length === 10) {
      const { rows } = await pool.query(
        'SELECT id, full_name, upi_id FROM users WHERE mobile = $1',
        [digits]
      );
      if (rows.length > 0) return rows[0];
    }
    // Check if account number
    if (digits.length >= 11) {
      const { rows } = await pool.query(
        'SELECT id, full_name, upi_id FROM users WHERE account_number = $1',
        [digits]
      );
      if (rows.length > 0) return rows[0];
    }
    // Check UPI handle
    const { rows } = await pool.query(
      'SELECT id, full_name, upi_id FROM users WHERE lower(upi_id) = lower($1)',
      [clean]
    );
    if (rows.length > 0) return rows[0];
  }

  throw new AppError(404, 'Recipient not found');
}

/**
 * Fetches existing idempotent transaction result.
 */
async function getExistingTransfer({ userId, idempotencyKey, pool }) {
  const { rows } = await pool.query(
    `SELECT t.id, t.amount, t.category, t.note, t.created_at, u.full_name AS payee_name
     FROM transactions t
     JOIN users u ON u.id = t.to_user
     WHERE t.from_user = $1 AND t.idempotency_key = $2`,
    [userId, idempotencyKey]
  );

  if (rows.length === 0) return null;

  const tx = rows[0];
  const accRes = await pool.query('SELECT balance FROM accounts WHERE user_id = $1', [userId]);
  const currentBalance = accRes.rows[0]?.balance || 0;

  return {
    success: true,
    transaction_id: tx.id,
    counterparty_name: tx.payee_name,
    amount_paise: tx.amount,
    amount: paiseToRupees(tx.amount),
    type: 'DEBIT',
    category: tx.category,
    description: tx.note || '',
    created_at: tx.created_at.toISOString(),
    status: 'SUCCESS',
    balance_paise: currentBalance,
    balance: paiseToRupees(currentBalance),
    transaction: {
      id: tx.id,
      transaction_id: tx.id,
      title: tx.payee_name,
      counterparty_name: tx.payee_name,
      category: tx.category,
      amount: paiseToRupees(tx.amount),
      amount_paise: tx.amount,
      date: formatDateKolkata(tx.created_at),
      created_at: tx.created_at.toISOString(),
      createdAt: tx.created_at.toISOString(),
      type: 'debit',
      status: 'SUCCESS',
    },
  };
}

/**
 * Creates and configures the Payments router.
 */
function createPaymentsRouter({ env, pool }) {
  const router = express.Router();
  const requireAuth = createAuthMiddleware(env);

  // POST /api/payments/transfer
  router.post(
    '/transfer',
    requireAuth,
    paymentsLimiter,
    pinCheckLimiter,
    validateBody(transferSchema),
    async (req, res, next) => {
      try {
        const senderId = req.user.id;
        const { pin, description, note } = req.body;
        const idempotencyKey =
          req.body.idempotency_key || req.body.idempotencyKey || crypto.randomUUID();

        // 1. Calculate amount in integer paise (avoid float errors)
        let amountPaise;
        if (req.body.amount_paise !== undefined && req.body.amount_paise !== null) {
          amountPaise = parseInt(req.body.amount_paise, 10);
          if (isNaN(amountPaise) || amountPaise <= 0) {
            throw new AppError(400, 'Invalid amount_paise');
          }
          if (amountPaise > 50_000 * 100) {
            throw new AppError(400, 'Single transfer limit is Rs 50,000');
          }
        } else if (req.body.amount !== undefined && req.body.amount !== null) {
          amountPaise = rupeesToPaise(req.body.amount);
        } else {
          throw new AppError(400, 'Amount is required');
        }

        // 2. Validate category to match PostgreSQL schema constraint
        const rawCategory = (req.body.category || 'others').toLowerCase().trim();
        const category = ALLOWED_CATEGORIES.includes(rawCategory) ? rawCategory : 'others';

        // 3. Verify PIN in its OWN committed step BEFORE opening the payment transaction (if PIN provided)
        if (pin) {
          await verifyPin({
            userId: senderId,
            pin,
            pool,
          });
        }

        // 4. Resolve payee dynamically on the server (client never provides the payee name or balance)
        const payee = await resolvePayee(req.body, pool);
        const receiverId = payee.id;

        // Rollback condition: Cannot pay yourself
        if (receiverId === senderId) {
          throw new AppError(400, 'Cannot transfer to yourself');
        }

        // 5. Idempotency check: if already processed, return original without re-charging
        const existingTx = await getExistingTransfer({
          userId: senderId,
          idempotencyKey,
          pool,
        });

        if (existingTx) {
          return res.json(existingTx);
        }

        // 6. Explicit ACID PostgreSQL transaction via withTransaction
        let result;
        try {
          result = await withTransaction(pool, async (client) => {
            // Sort user IDs to guarantee consistent locking order and prevent deadlocks
            const sortedIds = [senderId, receiverId].sort();
            for (const uid of sortedIds) {
              await client.query(
                'SELECT user_id, balance, balance AS balance_paise FROM accounts WHERE user_id = $1 FOR UPDATE',
                [uid]
              );
            }

            // Verify sender has sufficient balance using row-level locking
            const senderAccRes = await client.query(
              'SELECT balance, balance AS balance_paise FROM accounts WHERE user_id = $1',
              [senderId]
            );
            const senderBalance = senderAccRes.rows[0]?.balance ?? 0;

            if (senderBalance < amountPaise) {
              throw new AppError(400, 'Insufficient funds');
            }

            // a) Deduct amount_paise from the sender's account
            const debitRes = await client.query(
              `UPDATE accounts
               SET balance = balance - $1
               WHERE user_id = $2 AND balance >= $1
               RETURNING balance, balance AS balance_paise`,
              [amountPaise, senderId]
            );

            if (debitRes.rows.length === 0) {
              throw new AppError(400, 'Insufficient funds');
            }

            const senderNewBalance = debitRes.rows[0].balance;

            // b) Credit amount_paise to the recipient's account
            await client.query(
              'UPDATE accounts SET balance = balance + $1 WHERE user_id = $2',
              [amountPaise, receiverId]
            );

            // c) Insert debit ledger record for the sender and credit record for the recipient
            const txRes = await client.query(
              `INSERT INTO transactions (type, from_user, to_user, amount, category, note, idempotency_key)
               VALUES ('transfer', $1, $2, $3, $4, $5, $6)
               RETURNING id, created_at`,
              [
                senderId,
                receiverId,
                amountPaise,
                category,
                note || description || null,
                idempotencyKey,
              ]
            );

            const txRow = txRes.rows[0];

            return {
              success: true,
              transaction_id: txRow.id,
              counterparty_name: payee.full_name,
              amount_paise: amountPaise,
              amount: paiseToRupees(amountPaise),
              type: 'DEBIT',
              category,
              description: note || description || '',
              sender_id: senderId,
              recipient_id: receiverId,
              status: 'SUCCESS',
              created_at: txRow.created_at.toISOString(),
              balance_paise: senderNewBalance,
              balance: paiseToRupees(senderNewBalance),
              transaction: {
                id: txRow.id,
                transaction_id: txRow.id,
                title: payee.full_name,
                counterparty_name: payee.full_name,
                category,
                amount: paiseToRupees(amountPaise),
                amount_paise: amountPaise,
                date: formatDateKolkata(txRow.created_at),
                created_at: txRow.created_at.toISOString(),
                createdAt: txRow.created_at.toISOString(),
                type: 'debit',
                status: 'SUCCESS',
              },
            };
          });
        } catch (err) {
          // Handle Postgres unique constraint violation 23505 (parallel race condition for duplicate idempotency key)
          if (err.code === '23505') {
            const parallelResult = await getExistingTransfer({
              userId: senderId,
              idempotencyKey,
              pool,
            });
            if (parallelResult) {
              return res.json(parallelResult);
            }
          }
          throw err;
        }

        res.json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/payments/history - Unified transaction history ordered chronologically
  router.get('/history', requireAuth, async (req, res, next) => {
    try {
      const userId = req.user.id;
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

      const query = `
        SELECT
          t.id AS transaction_id,
          t.type AS kind,
          t.from_user,
          t.to_user,
          t.amount AS amount_paise,
          t.category,
          t.note AS description,
          t.created_at,
          u_from.full_name AS from_user_name,
          u_to.full_name AS to_user_name
        FROM transactions t
        LEFT JOIN users u_from ON u_from.id = t.from_user
        LEFT JOIN users u_to ON u_to.id = t.to_user
        WHERE (t.from_user = $1 OR t.to_user = $1)
        ORDER BY t.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const { rows } = await pool.query(query, [userId, limit, offset]);

      const history = rows.map((r) => {
        let counterparty_name = 'Finzin';
        let type = 'DEBIT';

        if (r.kind === 'welcome_credit') {
          counterparty_name = 'Finzin Welcome Reward';
          type = 'CREDIT';
        } else if (r.kind === 'vault_deposit' || r.kind === 'save') {
          counterparty_name = 'Finzin Vault';
          type = 'DEBIT';
        } else if (r.kind === 'vault_withdraw') {
          counterparty_name = 'Finzin Vault';
          type = 'CREDIT';
        } else if (r.kind === 'transfer') {
          if (r.from_user === userId) {
            counterparty_name = r.to_user_name || 'Recipient';
            type = 'DEBIT';
          } else {
            counterparty_name = r.from_user_name || 'Sender';
            type = 'CREDIT';
          }
        }

        const amountRupees = paiseToRupees(r.amount_paise);

        return {
          transaction_id: r.transaction_id,
          id: r.transaction_id,
          counterparty_name,
          title: counterparty_name,
          amount_paise: r.amount_paise,
          amount: amountRupees,
          type, // 'DEBIT' vs 'CREDIT'
          type_lower: type.toLowerCase(),
          category: r.category || 'others',
          description: r.description || '',
          created_at: r.created_at.toISOString(),
          createdAt: r.created_at.toISOString(),
          date: formatDateKolkata(r.created_at),
          status: 'SUCCESS',
        };
      });

      res.json(history);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/payments/save - transfers funds from spendable wallet into vault with type 'save'
  router.post(
    '/save',
    requireAuth,
    paymentsLimiter,
    pinCheckLimiter,
    validateBody(saveSchema),
    async (req, res, next) => {
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
          type: 'save',
        });

        res.json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

module.exports = { createPaymentsRouter, formatDateKolkata };
