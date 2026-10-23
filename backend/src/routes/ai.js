// ai.js - AI financial coach endpoint.
// Implements financial coaching via Groq API with aggregated data privacy.
const express = require('express');
const { z } = require('zod');
const { validateBody } = require('../middleware/validate');
const { createAuthMiddleware } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimiters');
const { paiseToRupees } = require('../utils/money');
const { getKolkataMonthBoundaries, getCurrentMonthKolkata } = require('./expenses');
const { createGroqService } = require('../services/gemini');

// Zod schema accepting optional month, question, and capped conversation history
const aiAdviceRequestSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format').optional(),
  question: z.string().max(300).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'model', 'assistant']),
        text: z.string().max(300),
      })
    )
    .max(6)
    .optional(),
}).strict();

/**
 * Calculates remaining days in a specified month under Indian Standard Time (Asia/Kolkata).
 * @param {string} monthStr - 'YYYY-MM'
 * @returns {number}
 */
function getDaysLeftInMonth(monthStr) {
  const [yearStr, monthNumStr] = monthStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthNumStr, 10);

  const totalDays = new Date(year, month, 0).getDate();
  const kolkataDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [currY, currM, currD] = kolkataDateStr.split('-').map(Number);

  if (year === currY && month === currM) {
    return Math.max(1, totalDays - currD + 1);
  } else if (year < currY || (year === currY && month < currM)) {
    return 0;
  }
  return totalDays;
}

/**
 * Creates and configures the AI advice router.
 */
function createAiRouter({ env, pool, ai }) {
  const router = express.Router();
  const requireAuth = createAuthMiddleware(env);
  const aiService = ai || createGroqService(env);

  // POST /api/ai/advice
  router.post('/advice', requireAuth, aiLimiter, validateBody(aiAdviceRequestSchema), async (req, res, next) => {
    try {
      const userId = req.user.id;
      const month = req.body.month || getCurrentMonthKolkata();
      const { start, end } = getKolkataMonthBoundaries(month);

      // 1. Fetch user account balances (wallet balance + vault savings)
      const accRes = await pool.query(
        'SELECT balance, vault_principal FROM accounts WHERE user_id = $1',
        [userId]
      );
      const acc = accRes.rows[0] || {};
      const walletBalance = paiseToRupees(acc.balance || 0);
      const savingsTotal = paiseToRupees(acc.vault_principal || 0);

      // 2. Fetch category expenses for the month
      const { rows } = await pool.query(
        `SELECT category, SUM(amount) AS total_paise
         FROM transactions
         WHERE from_user = $1
           AND type = 'transfer'
           AND created_at >= $2
           AND created_at < $3
         GROUP BY category`,
        [userId, start, end]
      );

      const categoryTotals = {
        food: 0,
        travel: 0,
        recharge: 0,
        shopping: 0,
        others: 0,
      };

      let totalPaise = 0n;
      for (const row of rows) {
        const cat = row.category in categoryTotals ? row.category : 'others';
        categoryTotals[cat] = paiseToRupees(row.total_paise);
        totalPaise += BigInt(row.total_paise);
      }

      const totalSpent = paiseToRupees(totalPaise);
      const budget = 8000;
      const daysLeft = getDaysLeftInMonth(month);

      // 3. Send ONLY anonymous aggregates + sanitized question to Groq (NO user identifiers)
      const advice = await aiService.getAdvice({
        categoryTotals,
        budget,
        totalSpent,
        walletBalance,
        savingsTotal,
        daysLeft,
        question: req.body.question,
        history: req.body.history,
      });

      res.json(advice);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createAiRouter };
