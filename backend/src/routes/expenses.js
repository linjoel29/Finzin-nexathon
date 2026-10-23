// expenses.js - expense analysis and category breakdown.
// Covers Step 4 expense summary requirements.
const express = require('express');
const { z } = require('zod');
const { validateQuery } = require('../middleware/validate');
const { createAuthMiddleware } = require('../middleware/auth');
const { paiseToRupees } = require('../utils/money');

function getCurrentMonthKolkata() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
  return parts.slice(0, 7); // 'YYYY-MM'
}

function formatDateKolkata(date) {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
}

/**
 * Calculates start and end timestamps for a given YYYY-MM month in Asia/Kolkata.
 */
function getKolkataMonthBoundaries(monthStr) {
  const [yearStr, monthNumStr] = monthStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthNumStr, 10);

  const startIso = `${yearStr}-${monthNumStr}-01T00:00:00+05:30`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? '01' : String(month + 1).padStart(2, '0');
  const endIso = `${nextYear}-${nextMonth}-01T00:00:00+05:30`;

  return {
    start: new Date(startIso),
    end: new Date(endIso),
  };
}

const expenseSummarySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format').optional(),
}).strict();

/**
 * Creates and configures the Expenses router.
 */
function createExpensesRouter({ env, pool }) {
  const router = express.Router();
  const requireAuth = createAuthMiddleware(env);

  // GET /api/expenses/summary?month=YYYY-MM
  router.get('/summary', requireAuth, validateQuery(expenseSummarySchema), async (req, res, next) => {
    try {
      const userId = req.user.id;
      const month = req.query.month || getCurrentMonthKolkata();
      const { start, end } = getKolkataMonthBoundaries(month);

      // Count ONLY 'transfer' debits sent by this user
      const { rows } = await pool.query(
        `SELECT category, amount, created_at
         FROM transactions
         WHERE from_user = $1
           AND type = 'transfer'
           AND created_at >= $2
           AND created_at < $3
         ORDER BY created_at ASC`,
        [userId, start, end]
      );

      const byCategory = {
        food: 0,
        travel: 0,
        recharge: 0,
        shopping: 0,
        others: 0,
      };

      const daysMap = {};

      for (const row of rows) {
        const cat = row.category in byCategory ? row.category : 'others';
        const rupees = paiseToRupees(row.amount);
        byCategory[cat] = Math.round((byCategory[cat] + rupees) * 100) / 100;

        const dayStr = formatDateKolkata(row.created_at);
        daysMap[dayStr] = Math.round(((daysMap[dayStr] || 0) + rupees) * 100) / 100;
      }

      const spent = Math.round(
        (byCategory.food + byCategory.travel + byCategory.recharge + byCategory.shopping + byCategory.others) * 100
      ) / 100;

      const budget = 8000;
      const remaining = Math.max(0, Math.round((budget - spent) * 100) / 100);

      const days = Object.keys(daysMap)
        .sort()
        .map((date) => ({
          date,
          total: daysMap[date],
        }));

      res.json({
        month,
        budget,
        spent,
        remaining,
        byCategory,
        days,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = {
  createExpensesRouter,
  getKolkataMonthBoundaries,
  getCurrentMonthKolkata,
};
