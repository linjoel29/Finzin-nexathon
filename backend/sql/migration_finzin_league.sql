-- =====================================================================
-- Finzin Migration: Finzin League Gamification & Championships
-- Safe to run repeatedly (uses IF NOT EXISTS / ADD CONSTRAINT IF NOT EXISTS).
-- Money arithmetic is stored in BIGINT PAISE.
-- XP is strictly non-negative integer.
-- All tables have Row Level Security enabled.
-- =====================================================================

-- 1. CHAMPIONSHIPS: Public and private habit-building tournaments
CREATE TABLE IF NOT EXISTS league_championships (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 40),
  description          TEXT CHECK (description IS NULL OR char_length(description) <= 200),
  visibility           TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
  room_id              TEXT UNIQUE NOT NULL CHECK (room_id ~ '^[A-Z0-9]{6,12}$'),
  duration_days        INT NOT NULL CHECK (duration_days IN (7, 14, 30)),
  start_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date             DATE NOT NULL,
  participant_limit    INT NOT NULL DEFAULT 50 CHECK (participant_limit BETWEEN 2 AND 500),
  challenge_categories TEXT[] NOT NULL DEFAULT '{"daily","weekly","savings","literacy","special"}',
  status               TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('upcoming', 'active', 'completed', 'cancelled')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_league_champ_status ON league_championships (status, visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_league_champ_room ON league_championships (room_id);

-- 2. PARTICIPANTS: Users joined in championships
CREATE TABLE IF NOT EXISTS league_participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES league_championships(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name    TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 50),
  is_creator      BOOLEAN NOT NULL DEFAULT false,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left')),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT league_participant_unique UNIQUE (championship_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_league_part_user ON league_participants (user_id, status);
CREATE INDEX IF NOT EXISTS idx_league_part_champ ON league_participants (championship_id, status);

-- 3. XP LEDGER: Append-only ledger of earned experience points
CREATE TABLE IF NOT EXISTS league_xp_ledger (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  championship_id UUID REFERENCES league_championships(id) ON DELETE SET NULL,
  amount          INT NOT NULL CHECK (amount > 0),
  reason          TEXT NOT NULL CHECK (char_length(reason) <= 120),
  source          TEXT NOT NULL CHECK (source IN (
    'budget_day', 'slice_deposit', 'quiz', 'activity', 'goal_reached', 
    'streak_7d', 'streak_30d', 'challenge', 'achievement'
  )),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_league_xp_user ON league_xp_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_league_xp_champ ON league_xp_ledger (championship_id, user_id, created_at);

-- 4. USER STREAKS & BUDGET CONFIGURATION
CREATE TABLE IF NOT EXISTS league_user_streaks (
  user_id                  UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name             TEXT CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 2 AND 50),
  daily_budget_limit_paise BIGINT NOT NULL DEFAULT 20000 CHECK (daily_budget_limit_paise > 0), -- default Rs 200
  current_budget_streak    INT NOT NULL DEFAULT 0 CHECK (current_budget_streak >= 0),
  best_budget_streak       INT NOT NULL DEFAULT 0 CHECK (best_budget_streak >= 0),
  last_budget_eval_date    DATE,
  current_saver_streak     INT NOT NULL DEFAULT 0 CHECK (current_saver_streak >= 0),
  best_saver_streak        INT NOT NULL DEFAULT 0 CHECK (best_saver_streak >= 0),
  last_saver_eval_date     DATE,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. CHALLENGES: Curated habit and literacy challenges
CREATE TABLE IF NOT EXISTS league_challenges (
  id                TEXT PRIMARY KEY,
  category          TEXT NOT NULL CHECK (category IN ('daily', 'weekly', 'savings', 'literacy', 'special')),
  title             TEXT NOT NULL,
  description       TEXT NOT NULL,
  xp_reward         INT NOT NULL CHECK (xp_reward > 0),
  verification_type TEXT NOT NULL CHECK (verification_type IN ('budget', 'slice_deposit', 'quiz', 'activity', 'goal')),
  requirements      JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active         BOOLEAN NOT NULL DEFAULT true
);

-- Seed default core challenges
INSERT INTO league_challenges (id, category, title, description, xp_reward, verification_type, requirements)
VALUES
  ('daily_budget', 'daily', 'Daily Budget Discipline', 'Keep outgoing spending within your daily limit (+5% buffer)', 10, 'budget', '{"buffer_percent": 5}'),
  ('daily_quiz', 'daily', 'Daily Money Quiz', 'Answer today''s financial literacy question correctly', 5, 'quiz', '{}'),
  ('daily_slice_save', 'daily', 'Slice Daily Saver', 'Deposit at least ₹10 into any Slice savings goal today', 5, 'slice_deposit', '{"min_paise": 1000}'),
  ('weekly_budget_5d', 'weekly', '5-Day Budget Master', 'Stay within daily budget for at least 5 days this week', 25, 'activity', '{"target_days": 5}'),
  ('weekly_slice_4d', 'weekly', 'Consistent Saver', 'Make Slice deposits on 4 separate days this week', 25, 'activity', '{"target_days": 4}'),
  ('goal_getter_reach', 'savings', 'Goal Getter', 'Reach 100% of your targeted Slice savings goal', 50, 'goal', '{"target_percent": 100}'),
  ('scam_smart_quiz', 'literacy', 'Payment Scam Awareness', 'Learn to identify phishing links, fake customer care & payment scams', 15, 'quiz', '{}'),
  ('fd_vs_bond_study', 'literacy', 'FD Interest vs. Bond Yield', 'Learn how Fixed Deposits differ from Bond coupon rates and yields', 15, 'activity', '{}'),
  ('emergency_fund_setup', 'savings', 'Emergency Pot Setup', 'Create a Slice goal specifically named Emergency Fund', 20, 'activity', '{"keyword": "emergency"}'),
  ('ai_coach_reflection', 'special', 'AI Coach Spending Review', 'Ask Finzin AI Coach for a personalized budget tip and review it', 10, 'activity', '{}')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  xp_reward = EXCLUDED.xp_reward;

-- 6. ACHIEVEMENTS: Permanent milestones
CREATE TABLE IF NOT EXISTS league_achievements (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  icon        TEXT NOT NULL,
  xp_reward   INT NOT NULL DEFAULT 0
);

INSERT INTO league_achievements (id, title, description, icon, xp_reward)
VALUES
  ('week_warrior', 'Week Warrior', 'Complete a 7-day budget streak', '🛡️', 25),
  ('goal_getter', 'Goal Getter', 'Complete a Slice savings goal', '🎯', 50),
  ('money_mind', 'Money Mind', 'Complete 10 financial literacy quizzes', '🧠', 50),
  ('consistency_champion', 'Consistency Champion', 'Complete a 30-day budget streak', '👑', 100),
  ('budget_builder', 'Budget Builder', 'Maintain active budget tracking for 14 days', '📊', 30),
  ('scam_smart', 'Scam Smart', 'Pass the fraud-awareness literacy challenge', '🔍', 20)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon;

-- 7. USER ACHIEVEMENTS: Unlocked badges per user
CREATE TABLE IF NOT EXISTS league_user_achievements (
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES league_achievements(id) ON DELETE CASCADE,
  unlocked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_league_achieve_user ON league_user_achievements (user_id, unlocked_at DESC);

-- 8. QUIZ ATTEMPTS: One official quiz attempt per user per day
CREATE TABLE IF NOT EXISTS league_quiz_attempts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quiz_date   DATE NOT NULL,
  question_id TEXT NOT NULL,
  passed      BOOLEAN NOT NULL DEFAULT true,
  score       INT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT league_quiz_unique_day UNIQUE (user_id, quiz_date)
);

CREATE INDEX IF NOT EXISTS idx_league_quiz_user ON league_quiz_attempts (user_id, quiz_date);

-- 9. USER CHALLENGES: Independent progress records
CREATE TABLE IF NOT EXISTS league_user_challenges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id    TEXT NOT NULL REFERENCES league_challenges(id) ON DELETE CASCADE,
  championship_id UUID REFERENCES league_championships(id) ON DELETE CASCADE,
  period_key      TEXT NOT NULL, -- e.g. "2026-10-24" or "2026-W43"
  status          TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  progress        INT NOT NULL DEFAULT 0,
  target          INT NOT NULL DEFAULT 1,
  completed_at    TIMESTAMPTZ,
  CONSTRAINT league_user_challenge_period UNIQUE (user_id, challenge_id, period_key)
);

CREATE INDEX IF NOT EXISTS idx_league_user_chal ON league_user_challenges (user_id, status);

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY: ON for every table, with NO public policies.
-- Express server connects as DB owner and bypasses RLS.
-- ---------------------------------------------------------------------
ALTER TABLE league_championships    ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_participants     ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_xp_ledger        ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_user_streaks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_challenges       ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_achievements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_quiz_attempts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_user_challenges  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON league_championships, league_participants, league_xp_ledger, 
                  league_user_streaks, league_challenges, league_achievements, 
                  league_user_achievements, league_quiz_attempts, league_user_challenges FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON league_championships, league_participants, league_xp_ledger, 
                  league_user_streaks, league_challenges, league_achievements, 
                  league_user_achievements, league_quiz_attempts, league_user_challenges FROM authenticated;
  END IF;
END $$;
