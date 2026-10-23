// league.js - Core business logic for Finzin League.
// Handles championships, participants, server-authoritative XP,
// daily budget calculations (5% buffer), saver streaks, leaderboards, and achievements.

const crypto = require('crypto');
const { AppError } = require('../utils/AppError');
const { paiseToRupees } = require('../utils/money');
const { getDailyQuizForDate, evaluateQuizSubmission } = require('./leagueQuiz');

/**
 * Returns the current date in Asia/Kolkata timezone as "YYYY-MM-DD".
 *
 * @param {Date} [d=new Date()]
 * @returns {string} Date string YYYY-MM-DD
 */
function getKolkataDateStr(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
}

/**
 * Converts a full name or email to a privacy-friendly display name.
 * e.g., "Rahul Sharma" -> "Rahul S." or "student@finzin" -> "Student"
 *
 * @param {string} fullName
 * @returns {string} Safe display name
 */
function formatDisplayName(fullName) {
  if (!fullName) return 'Finzin Member';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 15);
  const firstName = parts[0];
  const lastInitial = parts[parts.length - 1][0] || '';
  return `${firstName} ${lastInitial}.`.slice(0, 25);
}

/**
 * Computes League Tier from lifetime XP points.
 *
 * @param {number} lifetimeXp
 * @returns {{ tier: string, minXp: number, maxXp: number, nextTier: string|null, icon: string }}
 */
function getTier(lifetimeXp) {
  const xp = Math.max(0, Number(lifetimeXp) || 0);
  if (xp >= 1000) {
    return { tier: 'Diamond Saver', minXp: 1000, maxXp: null, nextTier: null, icon: '💎' };
  }
  if (xp >= 500) {
    return { tier: 'Gold Saver', minXp: 500, maxXp: 999, nextTier: 'Diamond Saver', icon: '🥇' };
  }
  if (xp >= 200) {
    return { tier: 'Silver Saver', minXp: 200, maxXp: 499, nextTier: 'Gold Saver', icon: '🥈' };
  }
  return { tier: 'Bronze Saver', minXp: 0, maxXp: 199, nextTier: 'Silver Saver', icon: '🥉' };
}

/**
 * Initializes or retrieves user streak state.
 *
 * @param {object} client - pg pool or transaction client
 * @param {string} userId - UUID
 */
async function ensureUserStreakState(client, userId) {
  const existing = await client.query(
    'SELECT * FROM league_user_streaks WHERE user_id = $1',
    [userId]
  );
  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  // Get user's full name to initialize privacy-friendly display name
  const userRes = await client.query('SELECT full_name FROM users WHERE id = $1', [userId]);
  const fullName = userRes.rows[0]?.full_name || 'Finzin Student';
  const displayName = formatDisplayName(fullName);

  const insertRes = await client.query(
    `INSERT INTO league_user_streaks (user_id, display_name, daily_budget_limit_paise)
     VALUES ($1, $2, 20000)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
     RETURNING *`,
    [userId, displayName]
  );
  return insertRes.rows[0];
}

/**
 * Retrieves comprehensive summary for Explore card and League dashboard.
 *
 * @param {object} client - pg pool or client
 * @param {string} userId - UUID
 */
async function getUserSummary(client, userId) {
  const streakState = await ensureUserStreakState(client, userId);
  const todayStr = getKolkataDateStr();

  // 1. Total lifetime XP
  const xpRes = await client.query(
    'SELECT COALESCE(SUM(amount), 0)::int AS lifetime_xp FROM league_xp_ledger WHERE user_id = $1',
    [userId]
  );
  const lifetimeXp = xpRes.rows[0].lifetime_xp;
  const tierInfo = getTier(lifetimeXp);

  // 2. Active joined championships count
  const champCountRes = await client.query(
    `SELECT COUNT(DISTINCT championship_id)::int AS count 
     FROM league_participants 
     WHERE user_id = $1 AND status = 'active'`,
    [userId]
  );
  const joinedChampionshipsCount = champCountRes.rows[0].count;

  // 3. Today's finalized outgoing spending (paise)
  // Only successful outgoing transfers (type = 'transfer' where from_user = user)
  // Excludes self-transfers, slice saves, incoming credits
  const spendRes = await client.query(
    `SELECT COALESCE(SUM(amount), 0)::bigint AS today_spent_paise
     FROM transactions
     WHERE from_user = $1
       AND type = 'transfer'
       AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = $2::date`,
    [userId, todayStr]
  );
  const todaySpentPaise = Number(spendRes.rows[0].today_spent_paise);
  const dailyLimitPaise = Number(streakState.daily_budget_limit_paise);
  // 5% buffer rule using integer arithmetic: limit * 105 / 100
  const maxAllowedPaise = Math.floor((dailyLimitPaise * 105) / 100);
  const isBudgetSafe = todaySpentPaise <= maxAllowedPaise;

  // Check if today's budget reward already claimed
  const budgetClaimRes = await client.query(
    `SELECT id FROM league_xp_ledger 
     WHERE user_id = $1 AND idempotency_key = $2`,
    [userId, `budget_${userId}_${todayStr}`]
  );
  const budgetClaimedToday = budgetClaimRes.rows.length > 0;

  // 4. Today's net Slice savings
  // Sum of Slice goal deposits minus withdrawals for today
  const sliceSaveRes = await client.query(
    `SELECT 
       COALESCE(SUM(CASE WHEN note LIKE 'Slice goal deposit:%' THEN amount ELSE 0 END), 0)::bigint AS deposits,
       COALESCE(SUM(CASE WHEN note LIKE 'Slice goal withdraw:%' THEN amount ELSE 0 END), 0)::bigint AS withdrawals
     FROM transactions
     WHERE from_user = $1
       AND to_user = $1
       AND type = 'save'
       AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = $2::date`,
    [userId, todayStr]
  );
  const sliceDeposits = Number(sliceSaveRes.rows[0].deposits);
  const sliceWithdrawals = Number(sliceSaveRes.rows[0].withdrawals);
  const todayNetSlicePaise = Math.max(0, sliceDeposits - sliceWithdrawals);
  const isSaverEligible = todayNetSlicePaise >= 1000; // >= Rs 10

  // Check if today's saver reward already claimed
  const saverClaimRes = await client.query(
    `SELECT id FROM league_xp_ledger 
     WHERE user_id = $1 AND idempotency_key = $2`,
    [userId, `slice_${userId}_${todayStr}`]
  );
  const saverClaimedToday = saverClaimRes.rows.length > 0;

  // 5. Today's daily quiz status
  const quizRes = await client.query(
    `SELECT passed, score, created_at FROM league_quiz_attempts 
     WHERE user_id = $1 AND quiz_date = $2`,
    [userId, todayStr]
  );
  const quizAttemptedToday = quizRes.rows.length > 0;
  const quizPassedToday = quizAttemptedToday ? quizRes.rows[0].passed : false;

  // Overall primary active streak summary for display
  const activeStreak = Math.max(
    streakState.current_budget_streak,
    streakState.current_saver_streak
  );

  return {
    lifetimeXp,
    tier: tierInfo.tier,
    tierIcon: tierInfo.icon,
    minXp: tierInfo.minXp,
    maxXp: tierInfo.maxXp,
    nextTier: tierInfo.nextTier,
    displayName: streakState.display_name,
    budgetStreak: streakState.current_budget_streak,
    bestBudgetStreak: streakState.best_budget_streak,
    saverStreak: streakState.current_saver_streak,
    bestSaverStreak: streakState.best_saver_streak,
    activeStreak,
    joinedChampionshipsCount,
    today: {
      date: todayStr,
      spentPaise: todaySpentPaise,
      spentRupees: paiseToRupees(todaySpentPaise),
      limitPaise: dailyLimitPaise,
      limitRupees: paiseToRupees(dailyLimitPaise),
      maxAllowedPaise,
      maxAllowedRupees: paiseToRupees(maxAllowedPaise),
      isBudgetSafe,
      budgetClaimedToday,
      netSlicePaise: todayNetSlicePaise,
      netSliceRupees: paiseToRupees(todayNetSlicePaise),
      isSaverEligible,
      saverClaimedToday,
      quizAttemptedToday,
      quizPassedToday,
    },
  };
}

/**
 * Awards server-authoritative XP with idempotency and audit ledger.
 *
 * @param {object} client - pg client with open transaction or pool
 * @param {object} params
 * @returns {Promise<{ awarded: boolean, amount: number, id?: string }>}
 */
async function awardXp(client, { userId, amount, reason, source, idempotencyKey, championshipId = null }) {
  if (amount <= 0) return { awarded: false, amount: 0 };

  const res = await client.query(
    `INSERT INTO league_xp_ledger (user_id, championship_id, amount, reason, source, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id, amount`,
    [userId, championshipId, amount, reason, source, idempotencyKey]
  );

  if (res.rows.length > 0) {
    return { awarded: true, amount: res.rows[0].amount, id: res.rows[0].id };
  }
  return { awarded: false, amount: 0 };
}

/**
 * Unlocks an achievement for a user and awards the milestone XP.
 *
 * @param {object} client - pg client
 * @param {string} userId - UUID
 * @param {string} achievementId - ID
 */
async function unlockAchievement(client, userId, achievementId) {
  const achRes = await client.query('SELECT * FROM league_achievements WHERE id = $1', [achievementId]);
  if (achRes.rows.length === 0) return { unlocked: false };
  const ach = achRes.rows[0];

  const insertRes = await client.query(
    `INSERT INTO league_user_achievements (user_id, achievement_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, achievement_id) DO NOTHING
     RETURNING unlocked_at`,
    [userId, achievementId]
  );

  if (insertRes.rows.length > 0) {
    if (ach.xp_reward > 0) {
      await awardXp(client, {
        userId,
        amount: ach.xp_reward,
        reason: `Unlocked Achievement: ${ach.title}`,
        source: 'achievement',
        idempotencyKey: `ach_${userId}_${achievementId}`,
      });
    }
    return { unlocked: true, title: ach.title, icon: ach.icon };
  }
  return { unlocked: false, alreadyUnlocked: true };
}

/**
 * Evaluates and claims the daily budget discipline reward (+10 XP).
 * Safe integer arithmetic: spending <= limit * 1.05.
 *
 * @param {object} client - pg client
 * @param {string} userId - UUID
 * @param {string} [targetDateStr] - YYYY-MM-DD
 */
async function evaluateDailyBudgetReward(client, userId, targetDateStr = getKolkataDateStr()) {
  const streakState = await ensureUserStreakState(client, userId);
  const dailyLimitPaise = Number(streakState.daily_budget_limit_paise);
  const maxAllowedPaise = Math.floor((dailyLimitPaise * 105) / 100);

  // Authoritative outgoing transfers for that date
  const spendRes = await client.query(
    `SELECT COALESCE(SUM(amount), 0)::bigint AS spent_paise
     FROM transactions
     WHERE from_user = $1
       AND type = 'transfer'
       AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = $2::date`,
    [userId, targetDateStr]
  );
  const spentPaise = Number(spendRes.rows[0].spent_paise);

  if (spentPaise > maxAllowedPaise) {
    // Over budget: reset streak
    await client.query(
      `UPDATE league_user_streaks 
       SET current_budget_streak = 0, last_budget_eval_date = $2, updated_at = now()
       WHERE user_id = $1`,
      [userId, targetDateStr]
    );
    return {
      eligible: false,
      spentPaise,
      limitPaise: dailyLimitPaise,
      maxAllowedPaise,
      awarded: false,
      streak: 0,
      reason: `Spending (₹${paiseToRupees(spentPaise)}) exceeded budget limit + 5% buffer (₹${paiseToRupees(maxAllowedPaise)}).`,
    };
  }

  // Eligible! Attempt to award +10 XP
  const awardResult = await awardXp(client, {
    userId,
    amount: 10,
    reason: `Daily budget maintained within limit (${targetDateStr})`,
    source: 'budget_day',
    idempotencyKey: `budget_${userId}_${targetDateStr}`,
  });

  if (!awardResult.awarded) {
    return {
      eligible: true,
      spentPaise,
      limitPaise: dailyLimitPaise,
      maxAllowedPaise,
      awarded: false,
      alreadyClaimed: true,
      streak: streakState.current_budget_streak,
    };
  }

  // Update streak
  const newStreak = streakState.current_budget_streak + 1;
  const bestStreak = Math.max(newStreak, streakState.best_budget_streak);

  await client.query(
    `UPDATE league_user_streaks 
     SET current_budget_streak = $2, best_budget_streak = $3, last_budget_eval_date = $4, updated_at = now()
     WHERE user_id = $1`,
    [userId, newStreak, bestStreak, targetDateStr]
  );

  // Check 7-day milestone
  if (newStreak === 7) {
    await awardXp(client, {
      userId,
      amount: 25,
      reason: '7-Day Budget Streak Milestone',
      source: 'streak_7d',
      idempotencyKey: `streak_7d_budget_${userId}_${targetDateStr}`,
    });
    await unlockAchievement(client, userId, 'week_warrior');
  }

  // Check 30-day milestone
  if (newStreak === 30) {
    await awardXp(client, {
      userId,
      amount: 100,
      reason: '30-Day Budget Consistency Milestone',
      source: 'streak_30d',
      idempotencyKey: `streak_30d_budget_${userId}_${targetDateStr}`,
    });
    await unlockAchievement(client, userId, 'consistency_champion');
  }

  return {
    eligible: true,
    spentPaise,
    limitPaise: dailyLimitPaise,
    maxAllowedPaise,
    awarded: true,
    streak: newStreak,
    xpAwarded: 10,
  };
}

/**
 * Evaluates and claims the daily Slice saver reward (+5 XP).
 * Requires net Slice deposit >= 1000 paise (₹10).
 *
 * @param {object} client - pg client
 * @param {string} userId - UUID
 * @param {string} [targetDateStr] - YYYY-MM-DD
 */
async function evaluateDailySaverReward(client, userId, targetDateStr = getKolkataDateStr()) {
  const streakState = await ensureUserStreakState(client, userId);

  const sliceSaveRes = await client.query(
    `SELECT 
       COALESCE(SUM(CASE WHEN note LIKE 'Slice goal deposit:%' THEN amount ELSE 0 END), 0)::bigint AS deposits,
       COALESCE(SUM(CASE WHEN note LIKE 'Slice goal withdraw:%' THEN amount ELSE 0 END), 0)::bigint AS withdrawals
     FROM transactions
     WHERE from_user = $1
       AND to_user = $1
       AND type = 'save'
       AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = $2::date`,
    [userId, targetDateStr]
  );
  const sliceDeposits = Number(sliceSaveRes.rows[0].deposits);
  const sliceWithdrawals = Number(sliceSaveRes.rows[0].withdrawals);
  const netPaise = Math.max(0, sliceDeposits - sliceWithdrawals);

  if (netPaise < 1000) {
    return {
      eligible: false,
      netPaise,
      awarded: false,
      streak: streakState.current_saver_streak,
      reason: `Net Slice savings for today is ₹${paiseToRupees(netPaise)}. At least ₹10.00 is required to qualify.`,
    };
  }

  // Eligible! Attempt to award +5 XP
  const awardResult = await awardXp(client, {
    userId,
    amount: 5,
    reason: `Daily Slice savings goal deposit (${targetDateStr})`,
    source: 'slice_deposit',
    idempotencyKey: `slice_${userId}_${targetDateStr}`,
  });

  if (!awardResult.awarded) {
    return {
      eligible: true,
      netPaise,
      awarded: false,
      alreadyClaimed: true,
      streak: streakState.current_saver_streak,
    };
  }

  // Update streak
  const newStreak = streakState.current_saver_streak + 1;
  const bestStreak = Math.max(newStreak, streakState.best_saver_streak);

  await client.query(
    `UPDATE league_user_streaks 
     SET current_saver_streak = $2, best_saver_streak = $3, last_saver_eval_date = $4, updated_at = now()
     WHERE user_id = $1`,
    [userId, newStreak, bestStreak, targetDateStr]
  );

  // Check 7-day saver milestone (+25 XP)
  if (newStreak === 7) {
    await awardXp(client, {
      userId,
      amount: 25,
      reason: '7-Day Saver Streak Milestone',
      source: 'streak_7d',
      idempotencyKey: `streak_7d_saver_${userId}_${targetDateStr}`,
    });
  }

  // Check 30-day saver milestone (+100 XP)
  if (newStreak === 30) {
    await awardXp(client, {
      userId,
      amount: 100,
      reason: '30-Day Saver Streak Milestone',
      source: 'streak_30d',
      idempotencyKey: `streak_30d_saver_${userId}_${targetDateStr}`,
    });
  }

  return {
    eligible: true,
    netPaise,
    awarded: true,
    streak: newStreak,
    xpAwarded: 5,
  };
}

/**
 * Submits daily financial literacy quiz answer, verifies server-side,
 * records attempt, and awards +5 XP if passed.
 *
 * @param {object} client - pg client
 * @param {string} userId - UUID
 * @param {object} body - { questionId, selectedIndex }
 */
async function submitDailyQuiz(client, userId, { questionId, selectedIndex }) {
  const todayStr = getKolkataDateStr();

  // Check if already attempted today
  const prevAttempt = await client.query(
    'SELECT * FROM league_quiz_attempts WHERE user_id = $1 AND quiz_date = $2',
    [userId, todayStr]
  );
  if (prevAttempt.rows.length > 0) {
    const q = prevAttempt.rows[0];
    const evalData = evaluateQuizSubmission(questionId, selectedIndex);
    return {
      alreadyCompleted: true,
      passed: q.passed,
      explanation: evalData.explanation,
      correctIndex: evalData.correctIndex,
    };
  }

  const { passed, correctIndex, explanation } = evaluateQuizSubmission(questionId, selectedIndex);

  await client.query(
    `INSERT INTO league_quiz_attempts (user_id, quiz_date, question_id, passed, score)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, todayStr, questionId, passed, passed ? 1 : 0]
  );

  let xpAwarded = 0;
  if (passed) {
    const awardResult = await awardXp(client, {
      userId,
      amount: 5,
      reason: `Daily financial literacy quiz completed (${todayStr})`,
      source: 'quiz',
      idempotencyKey: `quiz_${userId}_${todayStr}`,
    });
    if (awardResult.awarded) xpAwarded = 5;

    // Check "Money Mind" achievement: 10 passed quizzes
    const countRes = await client.query(
      'SELECT COUNT(*)::int AS count FROM league_quiz_attempts WHERE user_id = $1 AND passed = true',
      [userId]
    );
    if (countRes.rows[0].count >= 10) {
      await unlockAchievement(client, userId, 'money_mind');
    }
  }

  return {
    passed,
    correctIndex,
    explanation,
    xpAwarded,
  };
}

/**
 * Generates an unguessable 8-character uppercase room ID for private invitations.
 *
 * @returns {string} e.g. "7K9A2M84"
 */
function generateRoomId() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

/**
 * Creates a new Championship and enrolls the creator as host participant.
 *
 * @param {object} client - pg client (inside withTransaction)
 * @param {string} creatorId - UUID
 * @param {object} data
 */
async function createChampionship(client, creatorId, data) {
  const durationDays = Number(data.durationDays);
  if (![7, 14, 30].includes(durationDays)) {
    throw new AppError(400, 'Duration must be 7, 14, or 30 days');
  }

  const participantLimit = Number(data.participantLimit) || 50;
  if (participantLimit < 2 || participantLimit > 500) {
    throw new AppError(400, 'Participant limit must be between 2 and 500');
  }

  const visibility = data.visibility === 'private' ? 'private' : 'public';
  const name = String(data.name || '').trim();
  if (name.length < 3 || name.length > 40) {
    throw new AppError(400, 'Championship name must be between 3 and 40 characters');
  }

  const description = data.description ? String(data.description).trim().slice(0, 200) : null;
  const roomId = generateRoomId();

  // Compute start_date and end_date in Asia/Kolkata
  const todayStr = getKolkataDateStr();
  const now = new Date();
  const endDateObj = new Date(now.getTime() + durationDays * 86400000);
  const endDate = getKolkataDateStr(endDateObj);

  const insertChamp = await client.query(
    `INSERT INTO league_championships 
     (creator_id, name, description, visibility, room_id, duration_days, start_date, end_date, participant_limit)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [creatorId, name, description, visibility, roomId, durationDays, todayStr, endDate, participantLimit]
  );
  const champ = insertChamp.rows[0];

  // Get creator display name and enroll them in the same transaction
  const streakState = await ensureUserStreakState(client, creatorId);
  const displayName = streakState.display_name || 'Host';

  await client.query(
    `INSERT INTO league_participants (championship_id, user_id, display_name, is_creator)
     VALUES ($1, $2, $3, true)`,
    [champ.id, creatorId, displayName]
  );

  return {
    ...champ,
    participants_count: 1,
    is_joined: true,
    is_creator: true,
  };
}

/**
 * Joins a public championship atomically.
 *
 * @param {object} client - pg client (inside withTransaction)
 * @param {string} userId - UUID
 * @param {string} championshipId - UUID
 */
async function joinPublicChampionship(client, userId, championshipId) {
  // Lock championship row for concurrency control
  const champRes = await client.query(
    `SELECT * FROM league_championships WHERE id = $1 FOR UPDATE`,
    [championshipId]
  );
  if (champRes.rows.length === 0) {
    throw new AppError(404, 'Championship not found');
  }
  const champ = champRes.rows[0];

  if (champ.visibility !== 'public') {
    throw new AppError(403, 'This championship is private. Please join using its 8-character Room ID');
  }

  if (champ.status === 'completed' || champ.status === 'cancelled') {
    throw new AppError(400, `Cannot join a ${champ.status} championship`);
  }

  // Count active participants
  const countRes = await client.query(
    `SELECT COUNT(*)::int AS count FROM league_participants WHERE championship_id = $1 AND status = 'active'`,
    [championshipId]
  );
  if (countRes.rows[0].count >= champ.participant_limit) {
    throw new AppError(400, 'Championship has reached its maximum participant limit');
  }

  // Check if already joined
  const partRes = await client.query(
    `SELECT * FROM league_participants WHERE championship_id = $1 AND user_id = $2`,
    [championshipId, userId]
  );
  if (partRes.rows.length > 0) {
    if (partRes.rows[0].status === 'active') {
      return { alreadyJoined: true, championship: champ };
    }
    // Re-activate if left previously
    await client.query(
      `UPDATE league_participants SET status = 'active', joined_at = now() WHERE championship_id = $1 AND user_id = $2`,
      [championshipId, userId]
    );
    return { joined: true, championship: champ };
  }

  const streakState = await ensureUserStreakState(client, userId);
  await client.query(
    `INSERT INTO league_participants (championship_id, user_id, display_name)
     VALUES ($1, $2, $3)`,
    [championshipId, userId, streakState.display_name]
  );

  return { joined: true, championship: champ };
}

/**
 * Joins a private championship using its Room ID.
 *
 * @param {object} client - pg client (inside withTransaction)
 * @param {string} userId - UUID
 * @param {string} roomId - Uppercase 8-character string
 */
async function joinByRoomId(client, userId, roomId) {
  const cleanCode = String(roomId || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6,12}$/.test(cleanCode)) {
    throw new AppError(400, 'Invalid Room ID format. Room IDs consist of 6-12 letters and digits.');
  }

  const champRes = await client.query(
    `SELECT * FROM league_championships WHERE room_id = $1 FOR UPDATE`,
    [cleanCode]
  );
  if (champRes.rows.length === 0) {
    throw new AppError(404, 'No championship found with this Room ID. Please verify the code.');
  }
  const champ = champRes.rows[0];

  if (champ.status === 'completed' || champ.status === 'cancelled') {
    throw new AppError(400, `This championship has already been ${champ.status}.`);
  }

  // Check capacity
  const countRes = await client.query(
    `SELECT COUNT(*)::int AS count FROM league_participants WHERE championship_id = $1 AND status = 'active'`,
    [champ.id]
  );
  if (countRes.rows[0].count >= champ.participant_limit) {
    throw new AppError(400, 'This private championship is full.');
  }

  // Check existing membership
  const partRes = await client.query(
    `SELECT * FROM league_participants WHERE championship_id = $1 AND user_id = $2`,
    [champ.id, userId]
  );
  if (partRes.rows.length > 0) {
    if (partRes.rows[0].status === 'active') {
      return { alreadyJoined: true, championship: champ };
    }
    await client.query(
      `UPDATE league_participants SET status = 'active', joined_at = now() WHERE championship_id = $1 AND user_id = $2`,
      [champ.id, userId]
    );
    return { joined: true, championship: champ };
  }

  const streakState = await ensureUserStreakState(client, userId);
  await client.query(
    `INSERT INTO league_participants (championship_id, user_id, display_name)
     VALUES ($1, $2, $3)`,
    [champ.id, userId, streakState.display_name]
  );

  return { joined: true, championship: champ };
}

/**
 * Leaves a championship.
 *
 * @param {object} client - pg client
 * @param {string} userId - UUID
 * @param {string} championshipId - UUID
 */
async function leaveChampionship(client, userId, championshipId) {
  const partRes = await client.query(
    `SELECT * FROM league_participants WHERE championship_id = $1 AND user_id = $2`,
    [championshipId, userId]
  );
  if (partRes.rows.length === 0 || partRes.rows[0].status !== 'active') {
    throw new AppError(400, 'You are not an active participant in this championship.');
  }

  await client.query(
    `UPDATE league_participants SET status = 'left' WHERE championship_id = $1 AND user_id = $2`,
    [championshipId, userId]
  );

  return { success: true };
}

/**
 * Ranks participants within a specific championship during its defined period.
 * Privacy-friendly: only returns safe display names, rank, and tournament XP.
 * Zero leaks of wallet balance, email, phone, account number, or raw transactions.
 *
 * @param {object} client - pg client
 * @param {string} championshipId - UUID
 * @param {string} currentUserId - UUID
 */
async function getChampionshipLeaderboard(client, championshipId, currentUserId) {
  const champRes = await client.query(
    `SELECT c.*, u.full_name AS host_name
     FROM league_championships c
     JOIN users u ON u.id = c.creator_id
     WHERE c.id = $1`,
    [championshipId]
  );
  if (champRes.rows.length === 0) {
    throw new AppError(404, 'Championship not found');
  }
  const champ = champRes.rows[0];

  // Verify membership if championship is private
  const memberCheck = await client.query(
    `SELECT is_creator, status FROM league_participants WHERE championship_id = $1 AND user_id = $2`,
    [championshipId, currentUserId]
  );
  const isMember = memberCheck.rows.length > 0 && memberCheck.rows[0].status === 'active';

  if (champ.visibility === 'private' && !isMember) {
    throw new AppError(403, 'Access denied: You must join this private championship with its Room ID to view its leaderboard.');
  }

  // Calculate tournament XP earned within championship duration
  // Deterministic tie-breaking: highest XP first, then earlier achievement of that XP, then earlier join date
  const boardRes = await client.query(
    `SELECT 
       p.user_id,
       p.display_name,
       p.is_creator,
       p.joined_at,
       COALESCE(SUM(l.amount), 0)::int AS championship_xp,
       MAX(l.created_at) AS last_xp_earned_at
     FROM league_participants p
     LEFT JOIN league_xp_ledger l 
       ON l.user_id = p.user_id 
       AND (l.created_at AT TIME ZONE 'Asia/Kolkata')::date >= $2::date
       AND (l.created_at AT TIME ZONE 'Asia/Kolkata')::date <= $3::date
       AND (l.championship_id = $1 OR l.championship_id IS NULL)
     WHERE p.championship_id = $1 AND p.status = 'active'
     GROUP BY p.user_id, p.display_name, p.is_creator, p.joined_at
     ORDER BY championship_xp DESC, last_xp_earned_at ASC NULLS LAST, p.joined_at ASC`,
    [championshipId, champ.start_date, champ.end_date]
  );

  const leaderboard = boardRes.rows.map((row, idx) => ({
    rank: idx + 1,
    displayName: row.display_name,
    championshipXp: row.championship_xp,
    isCreator: row.is_creator,
    isCurrentUser: row.user_id === currentUserId,
    joinedAt: row.joined_at,
  }));

  const userEntry = leaderboard.find((item) => item.isCurrentUser) || null;

  return {
    championship: {
      id: champ.id,
      name: champ.name,
      description: champ.description,
      visibility: champ.visibility,
      status: champ.status,
      durationDays: champ.duration_days,
      startDate: champ.start_date,
      endDate: champ.end_date,
      participantLimit: champ.participant_limit,
      participantCount: leaderboard.length,
      hostName: formatDisplayName(champ.host_name),
      isCreator: champ.creator_id === currentUserId,
      isMember,
      // Only disclose room_id if user is an authorized member
      roomId: isMember ? champ.room_id : undefined,
    },
    leaderboard,
    myRank: userEntry ? userEntry.rank : null,
    myXp: userEntry ? userEntry.championshipXp : 0,
  };
}

/**
 * Retrieves public championships list (safe: excludes private room IDs).
 *
 * @param {object} client - pg client
 * @param {string} currentUserId - UUID
 */
async function getPublicChampionships(client, currentUserId) {
  const res = await client.query(
    `SELECT 
       c.id, c.name, c.description, c.duration_days, c.start_date, c.end_date,
       c.participant_limit, c.status, c.created_at,
       u.full_name AS host_name,
       COUNT(DISTINCT p.id)::int AS participant_count,
       BOOL_OR(p.user_id = $1 AND p.status = 'active') AS is_joined
     FROM league_championships c
     JOIN users u ON u.id = c.creator_id
     LEFT JOIN league_participants p ON p.championship_id = c.id AND p.status = 'active'
     WHERE c.visibility = 'public' AND c.status IN ('upcoming', 'active')
     GROUP BY c.id, u.full_name
     ORDER BY c.created_at DESC
     LIMIT 50`,
    [currentUserId]
  );

  return res.rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    durationDays: row.duration_days,
    startDate: row.start_date,
    endDate: row.end_date,
    participantLimit: row.participant_limit,
    participantCount: row.participant_count,
    status: row.status,
    hostName: formatDisplayName(row.host_name),
    isJoined: Boolean(row.is_joined),
  }));
}

/**
 * Retrieves user's joined and created championships.
 *
 * @param {object} client - pg client
 * @param {string} currentUserId - UUID
 */
async function getMyChampionships(client, currentUserId) {
  const res = await client.query(
    `SELECT 
       c.id, c.name, c.description, c.visibility, c.room_id, c.duration_days, 
       c.start_date, c.end_date, c.status, c.creator_id = $1 AS is_creator,
       p.joined_at,
       (SELECT COUNT(*)::int FROM league_participants lp WHERE lp.championship_id = c.id AND lp.status = 'active') AS participant_count
     FROM league_participants p
     JOIN league_championships c ON c.id = p.championship_id
     WHERE p.user_id = $1 AND p.status = 'active'
     ORDER BY c.created_at DESC`,
    [currentUserId]
  );

  return res.rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    visibility: row.visibility,
    roomId: row.room_id,
    durationDays: row.duration_days,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    isCreator: row.is_creator,
    participantCount: row.participant_count,
    joinedAt: row.joined_at,
  }));
}

/**
 * Retrieves active challenges with user-specific progress.
 *
 * @param {object} client - pg client
 * @param {string} userId - UUID
 */
async function getChallengesWithProgress(client, userId) {
  const challengesRes = await client.query(
    'SELECT * FROM league_challenges WHERE is_active = true ORDER BY category, xp_reward'
  );
  const todayStr = getKolkataDateStr();
  const summary = await getUserSummary(client, userId);

  // Check goal completion for "Goal Getter"
  const goalRes = await client.query(
    `SELECT COUNT(*)::int AS completed_goals 
     FROM goals 
     WHERE user_id = $1 AND target_amount > 0 AND allocated >= target_amount`,
    [userId]
  );
  const completedGoalsCount = goalRes.rows[0].completed_goals;

  const result = challengesRes.rows.map((ch) => {
    let completed = false;
    let progress = 0;
    let maxProgress = 1;
    let actionState = 'available'; // 'available' | 'claimable' | 'completed'

    if (ch.id === 'daily_budget') {
      completed = summary.today.budgetClaimedToday;
      progress = summary.today.isBudgetSafe ? 1 : 0;
      actionState = completed ? 'completed' : summary.today.isBudgetSafe ? 'claimable' : 'available';
    } else if (ch.id === 'daily_quiz') {
      completed = summary.today.quizPassedToday;
      progress = summary.today.quizPassedToday ? 1 : 0;
      actionState = completed ? 'completed' : 'available';
    } else if (ch.id === 'daily_slice_save') {
      completed = summary.today.saverClaimedToday;
      progress = summary.today.isSaverEligible ? 1 : 0;
      actionState = completed ? 'completed' : summary.today.isSaverEligible ? 'claimable' : 'available';
    } else if (ch.id === 'goal_getter_reach') {
      completed = completedGoalsCount > 0;
      progress = Math.min(1, completedGoalsCount);
      actionState = completed ? 'completed' : 'available';
    }

    return {
      id: ch.id,
      category: ch.category,
      title: ch.title,
      description: ch.description,
      xpReward: ch.xp_reward,
      verificationType: ch.verification_type,
      progress,
      maxProgress,
      completed,
      actionState,
    };
  });

  return result;
}

/**
 * Retrieves achievements with unlock status for the user.
 *
 * @param {object} client - pg client
 * @param {string} userId - UUID
 */
async function getUserAchievements(client, userId) {
  const res = await client.query(
    `SELECT 
       a.id, a.title, a.description, a.icon, a.xp_reward,
       ua.unlocked_at,
       ua.unlocked_at IS NOT NULL AS is_unlocked
     FROM league_achievements a
     LEFT JOIN league_user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = $1
     ORDER BY a.xp_reward ASC`,
    [userId]
  );

  return res.rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    icon: row.icon,
    xpReward: row.xp_reward,
    isUnlocked: Boolean(row.is_unlocked),
    unlockedAt: row.unlocked_at,
  }));
}

module.exports = {
  getKolkataDateStr,
  formatDisplayName,
  getTier,
  ensureUserStreakState,
  getUserSummary,
  awardXp,
  unlockAchievement,
  evaluateDailyBudgetReward,
  evaluateDailySaverReward,
  submitDailyQuiz,
  generateRoomId,
  createChampionship,
  joinPublicChampionship,
  joinByRoomId,
  leaveChampionship,
  getChampionshipLeaderboard,
  getPublicChampionships,
  getMyChampionships,
  getChallengesWithProgress,
  getUserAchievements,
};
