// transactions.js - transaction history endpoint.
// Covers Step 4 transaction timeline requirements with unified history shape.
const express = require('express');
const { z } = require('zod');
const { validateQuery } = require('../middleware/validate');
const { createAuthMiddleware } = require('../middleware/auth');
const { paiseToRupees } = require('../utils/money');

function formatDateKolkata(date) {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
}

const listTransactionsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T/)).optional(),
}).strict();

/**
 * Creates and configures the Transactions router.
 */
function createTransactionsRouter({ env, pool }) {
  const router = express.Router();
  const requireAuth = createAuthMiddleware(env);

  // GET /api/transactions
  router.get('/', requireAuth, validateQuery(listTransactionsSchema), async (req, res, next) => {
    try {
      const userId = req.user.id;
      const { limit, before } = req.query;

      let query = `
        SELECT
          t.id, t.type AS kind, t.from_user, t.to_user, t.amount, t.category, t.note, t.created_at,
          u_from.full_name AS from_user_name,
          u_to.full_name AS to_user_name
        FROM transactions t
        LEFT JOIN users u_from ON u_from.id = t.from_user
        LEFT JOIN users u_to ON u_to.id = t.to_user
        WHERE (t.from_user = $1 OR t.to_user = $1)
      `;

      const params = [userId];

      if (before) {
        params.push(new Date(before));
        query += ` AND t.created_at < $${params.length}`;
      }

      params.push(limit);
      query += ` ORDER BY t.created_at DESC LIMIT $${params.length}`;

      const { rows } = await pool.query(query, params);

      const items = rows.map((r) => {
        let counterparty_name = 'Finzin';
        let type = 'debit';

        if (r.kind === 'welcome_credit') {
          counterparty_name = 'Finzin Welcome Reward';
          type = 'credit';
        } else if (r.kind === 'vault_deposit' || r.kind === 'save') {
          counterparty_name = 'Finzin Vault';
          type = 'debit';
        } else if (r.kind === 'vault_withdraw') {
          counterparty_name = 'Finzin Vault';
          type = 'credit';
        } else if (r.kind === 'transfer') {
          if (r.from_user === userId) {
            counterparty_name = r.to_user_name || 'Recipient';
            type = 'debit';
          } else {
            counterparty_name = r.from_user_name || 'Sender';
            type = 'credit';
          }
        }

        const amountRupees = paiseToRupees(r.amount);

        return {
          id: r.id,
          transaction_id: r.id,
          counterparty_name,
          title: counterparty_name,
          category: r.category || 'others',
          amount: amountRupees,
          amount_paise: r.amount,
          date: formatDateKolkata(r.created_at),
          type,                           // 'debit' | 'credit'
          type_upper: type.toUpperCase(),  // 'DEBIT' | 'CREDIT'
          kind: r.kind,
          note: r.note || '',
          description: r.note || '',
          created_at: r.created_at.toISOString(),
          createdAt: r.created_at.toISOString(),
          status: 'SUCCESS',
        };
      });

      res.json(items);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createTransactionsRouter };
