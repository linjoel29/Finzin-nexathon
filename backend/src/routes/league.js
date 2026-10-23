// league.js - Finzin League API router.
// Manages gamification, private/public championships, XP ledger, daily budget rewards,
// saver streaks, server-verified financial quizzes, and deterministic leaderboards.

const express = require('express');
const { z } = require('zod');
const { validateBody, validateParams } = require('../middleware/validate');
const { createAuthMiddleware } = require('../middleware/auth');
const { roomCodeLimiter } = require('../middleware/rateLimiters');
const { AppError } = require('../utils/AppError');
const { withTransaction } = require('../config/db');
const { rupeesToPaise } = require('../utils/money');
const {
  getUserSummary,
  getPublicChampionships,
  getMyChampionships,
  createChampionship,
  joinPublicChampionship,
  joinByRoomId,
  leaveChampionship,
  getChampionshipLeaderboard,
  getChallengesWithProgress,
  getUserAchievements,
  evaluateDailyBudgetReward,
  evaluateDailySaverReward,
  submitDailyQuiz,
  getKolkataDateStr,
  awardXp,
  unlockAchievement,
} = require('../services/league');
const { getDailyQuizForDate } = require('../services/leagueQuiz');

// Zod schemas
const createChampSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(40, 'Name cannot exceed 40 characters'),
  description: z.string().max(200, 'Description cannot exceed 200 characters').optional().nullable(),
  visibility: z.enum(['public', 'private']),
  durationDays: z.union([z.number(), z.string()]).transform((val) => Number(val)).refine((n) => [7, 14, 30].includes(n), {
    message: 'Duration must be 7, 14, or 30 days',
  }),
  participantLimit: z.union([z.number(), z.string()]).transform((val) => Number(val)).refine((n) => n >= 2 && n <= 500, {
    message: 'Participant limit must be between 2 and 500',
  }).optional(),
}).strict();

const joinCodeSchema = z.object({
  roomId: z.string().min(6, 'Room ID must be at least 6 characters').max(12, 'Room ID is too long'),
}).strict();

const champIdParamsSchema = z.object({
  id: z.string().uuid('Invalid championship ID format'),
}).strict();

const challengeIdParamsSchema = z.object({
  id: z.string().min(2, 'Invalid challenge ID'),
}).strict();

const quizSubmitSchema = z.object({
  questionId: z.string().min(1, 'Question ID is required'),
  selectedIndex: z.union([z.number(), z.string()]).transform((val) => Number(val)).refine((n) => n >= 0 && n <= 3, {
    message: 'Selected index must be between 0 and 3',
  }),
}).strict();

const updatePreferencesSchema = z.object({
  dailyBudgetLimitRupees: z.union([z.number(), z.string()]).optional(),
  displayName: z.string().min(2, 'Display name must be at least 2 characters').max(30, 'Display name cannot exceed 30 characters').optional(),
}).strict();

/**
 * Creates the League API router.
 *
 * @param {object} deps - { env, pool }
 * @returns {Router}
 */
function createLeagueRouter({ env, pool }) {
  const router = express.Router();
  const requireAuth = createAuthMiddleware(env);

  // All league routes require authentication
  router.use(requireAuth);

  // 1. GET /api/league/summary - User XP, tier, streaks, today's budget progress
  router.get('/summary', async (req, res, next) => {
    try {
      const summary = await getUserSummary(pool, req.user.id);
      res.json(summary);
    } catch (err) {
      next(err);
    }
  });

  // 2. GET /api/league/championships/public - Discover public championships
  router.get('/championships/public', async (req, res, next) => {
    try {
      const championships = await getPublicChampionships(pool, req.user.id);
      res.json({ championships });
    } catch (err) {
      next(err);
    }
  });

  // 3. GET /api/league/championships/mine - My joined and created championships
  router.get('/championships/mine', async (req, res, next) => {
    try {
      const championships = await getMyChampionships(pool, req.user.id);
      res.json({ championships });
    } catch (err) {
      next(err);
    }
  });

  // 4. POST /api/league/championships - Create championship
  router.post('/championships', validateBody(createChampSchema), async (req, res, next) => {
    try {
      const champ = await withTransaction(pool, async (client) => {
        return createChampionship(client, req.user.id, req.body);
      });
      res.status(201).json({
        message: 'Championship created successfully',
        championship: champ,
      });
    } catch (err) {
      next(err);
    }
  });

  // 5. POST /api/league/championships/join-by-code - Join private championship with Room ID
  router.post('/championships/join-by-code', roomCodeLimiter, validateBody(joinCodeSchema), async (req, res, next) => {
    try {
      const result = await withTransaction(pool, async (client) => {
        return joinByRoomId(client, req.user.id, req.body.roomId);
      });
      res.json({
        message: result.alreadyJoined ? 'Already a participant in this championship' : 'Successfully joined private championship',
        championship: result.championship,
      });
    } catch (err) {
      next(err);
    }
  });

  // 6. GET /api/league/championships/:id - Get championship details + leaderboard
  router.get('/championships/:id', validateParams(champIdParamsSchema), async (req, res, next) => {
    try {
      const details = await getChampionshipLeaderboard(pool, req.params.id, req.user.id);
      res.json(details);
    } catch (err) {
      next(err);
    }
  });

  // 7. POST /api/league/championships/:id/join - Join public championship
  router.post('/championships/:id/join', validateParams(champIdParamsSchema), async (req, res, next) => {
    try {
      const result = await withTransaction(pool, async (client) => {
        return joinPublicChampionship(client, req.user.id, req.params.id);
      });
      res.json({
        message: result.alreadyJoined ? 'Already joined' : 'Successfully joined championship',
        championship: result.championship,
      });
    } catch (err) {
      next(err);
    }
  });

  // 8. POST /api/league/championships/:id/leave - Leave championship
  router.post('/championships/:id/leave', validateParams(champIdParamsSchema), async (req, res, next) => {
    try {
      await leaveChampionship(pool, req.user.id, req.params.id);
      res.json({ message: 'Successfully left championship' });
    } catch (err) {
      next(err);
    }
  });

  // 9. GET /api/league/championships/:id/leaderboard - Dedicated leaderboard endpoint
  router.get('/championships/:id/leaderboard', validateParams(champIdParamsSchema), async (req, res, next) => {
    try {
      const details = await getChampionshipLeaderboard(pool, req.params.id, req.user.id);
      res.json(details);
    } catch (err) {
      next(err);
    }
  });

  // 10. GET /api/league/challenges - Active challenges & user progress
  router.get('/challenges', async (req, res, next) => {
    try {
      const challenges = await getChallengesWithProgress(pool, req.user.id);
      res.json({ challenges });
    } catch (err) {
      next(err);
    }
  });

  // 11. POST /api/league/challenges/:id/complete - Authoritative challenge completion/claim
  router.post('/challenges/:id/complete', validateParams(challengeIdParamsSchema), async (req, res, next) => {
    try {
      const challengeId = req.params.id;

      if (challengeId === 'daily_budget') {
        const result = await withTransaction(pool, async (client) => {
          return evaluateDailyBudgetReward(client, req.user.id);
        });
        if (!result.eligible) {
          throw new AppError(400, result.reason || 'Not currently eligible for budget reward');
        }
        return res.json({
          message: result.alreadyClaimed ? 'Today\'s budget reward has already been claimed' : 'Daily budget reward claimed! +10 XP',
          result,
        });
      }

      if (challengeId === 'daily_slice_save') {
        const result = await withTransaction(pool, async (client) => {
          return evaluateDailySaverReward(client, req.user.id);
        });
        if (!result.eligible) {
          throw new AppError(400, result.reason || 'Not currently eligible for saver reward');
        }
        return res.json({
          message: result.alreadyClaimed ? 'Today\'s saver reward has already been claimed' : 'Daily Slice saver reward claimed! +5 XP',
          result,
        });
      }

      if (challengeId === 'goal_getter_reach') {
        const result = await withTransaction(pool, async (client) => {
          const goalRes = await client.query(
            `SELECT * FROM goals WHERE user_id = $1 AND target_amount > 0 AND allocated >= target_amount LIMIT 1`,
            [req.user.id]
          );
          if (goalRes.rows.length === 0) {
            throw new AppError(400, 'No fully funded Slice savings goal found. Deposit funds to reach 100% of your target!');
          }
          const goal = goalRes.rows[0];
          const award = await awardXp(client, {
            userId: req.user.id,
            amount: 50,
            reason: `Reached 100% savings target for goal: ${goal.name}`,
            source: 'goal_reached',
            idempotencyKey: `goal_reach_${req.user.id}_${goal.id}`,
          });
          await unlockAchievement(client, req.user.id, 'goal_getter');
          return award;
        });
        return res.json({
          message: result.awarded ? 'Goal Getter challenge completed! +50 XP' : 'Reward already claimed for this goal milestone',
          result,
        });
      }

      if (challengeId === 'emergency_fund_setup') {
        const result = await withTransaction(pool, async (client) => {
          const goalRes = await client.query(
            `SELECT * FROM goals WHERE user_id = $1 AND lower(name) LIKE '%emergency%' LIMIT 1`,
            [req.user.id]
          );
          if (goalRes.rows.length === 0) {
            throw new AppError(400, 'Create a Slice savings goal named "Emergency Fund" on the Account page first.');
          }
          const goal = goalRes.rows[0];
          return awardXp(client, {
            userId: req.user.id,
            amount: 20,
            reason: 'Created Emergency Fund savings pot',
            source: 'challenge',
            idempotencyKey: `emergency_pot_${req.user.id}_${goal.id}`,
          });
        });
        return res.json({
          message: result.awarded ? 'Emergency Pot challenge completed! +20 XP' : 'Reward already claimed for this emergency goal',
          result,
        });
      }

      if (challengeId === 'fd_vs_bond_study') {
        const result = await withTransaction(pool, async (client) => {
          return awardXp(client, {
            userId: req.user.id,
            amount: 15,
            reason: 'Completed FD vs Bond financial literacy module',
            source: 'activity',
            idempotencyKey: `lit_fd_bond_${req.user.id}`,
          });
        });
        return res.json({
          message: result.awarded ? 'Literacy module completed! +15 XP' : 'Activity already rewarded',
          result,
        });
      }

      if (challengeId === 'ai_coach_reflection') {
        const result = await withTransaction(pool, async (client) => {
          return awardXp(client, {
            userId: req.user.id,
            amount: 10,
            reason: 'Completed AI Coach budget reflection',
            source: 'activity',
            idempotencyKey: `ai_reflection_${req.user.id}_${getKolkataDateStr()}`,
          });
        });
        return res.json({
          message: result.awarded ? 'AI Coach reflection completed! +10 XP' : 'Today\'s reflection already rewarded',
          result,
        });
      }

      throw new AppError(400, 'Unrecognized challenge or manual completion not supported for this type.');
    } catch (err) {
      next(err);
    }
  });

  // 12. GET /api/league/quiz/today - Get today's financial literacy question
  router.get('/quiz/today', async (_req, res, next) => {
    try {
      const todayStr = getKolkataDateStr();
      const question = getDailyQuizForDate(todayStr);
      res.json({ question });
    } catch (err) {
      next(err);
    }
  });

  // 13. POST /api/league/quiz/submit - Submit answer to today's question
  router.post('/quiz/submit', validateBody(quizSubmitSchema), async (req, res, next) => {
    try {
      const result = await withTransaction(pool, async (client) => {
        return submitDailyQuiz(client, req.user.id, req.body);
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // 14. GET /api/league/achievements - Unlocked and available achievements
  router.get('/achievements', async (req, res, next) => {
    try {
      const achievements = await getUserAchievements(pool, req.user.id);
      res.json({ achievements });
    } catch (err) {
      next(err);
    }
  });

  // 15. PATCH /api/league/preferences - Update daily budget limit or league display name
  router.patch('/preferences', validateBody(updatePreferencesSchema), async (req, res, next) => {
    try {
      const { dailyBudgetLimitRupees, displayName } = req.body;
      const updates = [];
      const values = [req.user.id];

      if (dailyBudgetLimitRupees !== undefined) {
        const limitPaise = rupeesToPaise(dailyBudgetLimitRupees);
        if (limitPaise < 5000 || limitPaise > 1000000) { // Rs 50 to Rs 10,000
          throw new AppError(400, 'Daily budget limit must be between ₹50 and ₹10,000');
        }
        values.push(limitPaise);
        updates.push(`daily_budget_limit_paise = $${values.length}`);
      }

      if (displayName !== undefined) {
        const cleanName = String(displayName).trim();
        if (cleanName.length < 2 || cleanName.length > 30) {
          throw new AppError(400, 'Display name must be between 2 and 30 characters');
        }
        values.push(cleanName);
        updates.push(`display_name = $${values.length}`);
      }

      if (updates.length === 0) {
        throw new AppError(400, 'No preference fields provided to update');
      }

      updates.push('updated_at = now()');
      const query = `
        INSERT INTO league_user_streaks (user_id) VALUES ($1)
        ON CONFLICT (user_id) DO UPDATE SET ${updates.join(', ')}
        RETURNING *`;

      const result = await pool.query(query, values);
      res.json({
        message: 'League preferences updated successfully',
        preferences: result.rows[0],
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createLeagueRouter };
