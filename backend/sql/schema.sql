-- =====================================================================
-- Finzin database schema (Postgres / Supabase)
-- Paste into Supabase -> SQL Editor -> Run, OR run: npm run db:setup
-- Safe to run more than once (uses IF NOT EXISTS).
-- RULES: money is BIGINT PAISE (Rs 1 = 100 paise), never floats.
--        CHECK constraints make bad data impossible even if app code has a bug.
-- =====================================================================

-- ---------------------------------------------------------------------
-- USERS: the bank-style profile created at registration
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email            TEXT NOT NULL UNIQUE CHECK (email = lower(email)),       -- login identity, always lowercase
  full_name        TEXT NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 80),
  dob              DATE NOT NULL,
  gender           TEXT CHECK (gender IN ('male','female','other','prefer_not_to_say')), -- optional
  mobile           TEXT NOT NULL UNIQUE CHECK (mobile ~ '^[6-9][0-9]{9}$'), -- Indian 10-digit; collected but NOT verified
  address_line     TEXT NOT NULL CHECK (char_length(address_line) BETWEEN 3 AND 150),
  city             TEXT NOT NULL CHECK (char_length(city) BETWEEN 2 AND 60),
  state            TEXT NOT NULL CHECK (char_length(state) BETWEEN 2 AND 60),
  pincode          TEXT NOT NULL CHECK (pincode ~ '^[0-9]{6}$'),
  college_name     TEXT NOT NULL CHECK (char_length(college_name) BETWEEN 2 AND 100),
  student_id       TEXT NOT NULL CHECK (char_length(student_id) BETWEEN 2 AND 30),
  nominee_name     TEXT NOT NULL CHECK (char_length(nominee_name) BETWEEN 2 AND 80),
  nominee_relation TEXT NOT NULL CHECK (char_length(nominee_relation) BETWEEN 2 AND 30),
  -- SIMULATED KYC: we never store full Aadhaar/PAN, only an optional last-4 for show
  kyc_status       TEXT NOT NULL DEFAULT 'demo verified',
  kyc_last4        TEXT CHECK (kyc_last4 ~ '^[0-9]{4}$'),
  -- Generated at registration (server decides, never the client)
  upi_id           TEXT NOT NULL UNIQUE CHECK (upi_id ~ '^[a-z0-9]{3,30}@finzin$'), -- used in QR + pay-to-UPI-ID
  account_number   TEXT NOT NULL UNIQUE CHECK (account_number ~ '^[0-9]{12}$'),     -- DEMO 12-digit number
  ifsc             TEXT NOT NULL DEFAULT 'FNZN0000001',                             -- DEMO IFSC
  -- PIN (bcrypt hash only; NULL until the user sets it)
  pin_hash         TEXT,
  pin_attempts     INT NOT NULL DEFAULT 0 CHECK (pin_attempts >= 0),                -- wrong tries in a row
  pin_locked_until TIMESTAMPTZ,                                                     -- locked 15 min after 3 wrong tries
  consent_at       TIMESTAMPTZ NOT NULL,                                            -- when terms + data-use were accepted
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- ACCOUNTS: one row per user. Wallet (spendable) and Vault (savings pot) are separate.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
  user_id                UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance                BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),          -- wallet, paise. Can never go negative.
  vault_principal        BIGINT NOT NULL DEFAULT 0 CHECK (vault_principal >= 0),  -- Vault money incl. already-folded interest
  vault_interest_earned  BIGINT NOT NULL DEFAULT 0 CHECK (vault_interest_earned >= 0), -- running total, for display
  vault_last_accrued_at  TIMESTAMPTZ NOT NULL DEFAULT now()                       -- LAZY interest: computed from this time, no cron job
);

-- ---------------------------------------------------------------------
-- TRANSACTIONS: append-only ledger. Rows are never updated or deleted by the app.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL CHECK (type IN ('transfer','save','vault_deposit','vault_withdraw','welcome_credit')),
  from_user       UUID REFERENCES users(id),
  to_user         UUID REFERENCES users(id),
  amount          BIGINT NOT NULL CHECK (amount > 0),                              -- paise
  category        TEXT NOT NULL DEFAULT 'others' CHECK (category IN ('food','travel','recharge','shopping','others')),
  note            TEXT CHECK (char_length(note) <= 100),
  idempotency_key TEXT CHECK (char_length(idempotency_key) BETWEEN 8 AND 100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Row shape must match its type (stops malformed ledger rows):
  CONSTRAINT tx_shape CHECK (
    (type = 'transfer'       AND from_user IS NOT NULL AND to_user IS NOT NULL AND from_user <> to_user)
 OR (type IN ('save','vault_deposit','vault_withdraw') AND from_user IS NOT NULL AND to_user = from_user)
 OR (type = 'welcome_credit' AND from_user IS NULL AND to_user IS NOT NULL)
  ),
  -- Idempotency: the same sender can never reuse a key (NULL keys are allowed, e.g. welcome credit)
  CONSTRAINT tx_idempotency UNIQUE (from_user, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_tx_from ON transactions (from_user, created_at DESC); -- "my debits" history
CREATE INDEX IF NOT EXISTS idx_tx_to   ON transactions (to_user,   created_at DESC); -- "my credits" history

-- ---------------------------------------------------------------------
-- GOALS: named labels over Vault money (purely informational)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS goals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50),
  target_amount BIGINT CHECK (target_amount IS NULL OR target_amount > 0),         -- paise (optional)
  allocated     BIGINT NOT NULL DEFAULT 0 CHECK (allocated >= 0),                   -- paise set aside for this goal
  target_date   DATE,                                                               -- optional target completion date
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_goals_user ON goals (user_id);

-- ---------------------------------------------------------------------
-- USER_BOOKMARKS: saved scholarships, internships, and student offers
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_bookmarks (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type     TEXT NOT NULL CHECK (item_type IN ('internship', 'scholarship', 'offer')),
  item_id       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_type, item_id)
);
CREATE INDEX IF NOT EXISTS idx_user_bookmarks_user ON user_bookmarks (user_id, created_at DESC);

-- ---------------------------------------------------------------------
-- OTPS: one live code per email (a new send replaces the old one).
-- Postgres has no TTL index, so expired rows are removed by the app on each send/verify.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS otps (
  email        TEXT PRIMARY KEY CHECK (email = lower(email)),
  code_hash    TEXT NOT NULL,                                                       -- hash only, never the code
  attempts     INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),                        -- wrong guesses (max 5)
  expires_at   TIMESTAMPTZ NOT NULL,                                                -- now + 5 minutes
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now()                                   -- for the 60 s resend cooldown
);
CREATE INDEX IF NOT EXISTS idx_otps_expires ON otps (expires_at);

-- ---------------------------------------------------------------------
-- FINZIN LEAGUE: Championships, Participants, XP Ledger, Streaks, Challenges
-- ---------------------------------------------------------------------
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

CREATE TABLE IF NOT EXISTS league_user_streaks (
  user_id                  UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name             TEXT CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 2 AND 50),
  daily_budget_limit_paise BIGINT NOT NULL DEFAULT 20000 CHECK (daily_budget_limit_paise > 0),
  current_budget_streak    INT NOT NULL DEFAULT 0 CHECK (current_budget_streak >= 0),
  best_budget_streak       INT NOT NULL DEFAULT 0 CHECK (best_budget_streak >= 0),
  last_budget_eval_date    DATE,
  current_saver_streak     INT NOT NULL DEFAULT 0 CHECK (current_saver_streak >= 0),
  best_saver_streak        INT NOT NULL DEFAULT 0 CHECK (best_saver_streak >= 0),
  last_saver_eval_date     DATE,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS league_achievements (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  icon        TEXT NOT NULL,
  xp_reward   INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS league_user_achievements (
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES league_achievements(id) ON DELETE CASCADE,
  unlocked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_league_achieve_user ON league_user_achievements (user_id, unlocked_at DESC);

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

CREATE TABLE IF NOT EXISTS league_user_challenges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id    TEXT NOT NULL REFERENCES league_challenges(id) ON DELETE CASCADE,
  championship_id UUID REFERENCES league_championships(id) ON DELETE CASCADE,
  period_key      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  progress        INT NOT NULL DEFAULT 0,
  target          INT NOT NULL DEFAULT 1,
  completed_at    TIMESTAMPTZ,
  CONSTRAINT league_user_challenge_period UNIQUE (user_id, challenge_id, period_key)
);

CREATE INDEX IF NOT EXISTS idx_league_user_chal ON league_user_challenges (user_id, status);

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY: ON for every table, with NO policies.
-- Effect: Supabase's public API (anon / authenticated keys) can read NOTHING.
-- Our Express server connects as the database owner, which bypasses RLS.
-- ---------------------------------------------------------------------
ALTER TABLE users                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE otps                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_bookmarks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_championships     ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_participants      ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_xp_ledger         ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_user_streaks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_challenges        ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_achievements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_quiz_attempts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_user_challenges   ENABLE ROW LEVEL SECURITY;

-- Extra layer: also remove table privileges from the public API roles.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON users, accounts, transactions, goals, otps, user_bookmarks,
                  league_championships, league_participants, league_xp_ledger, 
                  league_user_streaks, league_challenges, league_achievements, 
                  league_user_achievements, league_quiz_attempts, league_user_challenges FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON users, accounts, transactions, goals, otps, user_bookmarks,
                  league_championships, league_participants, league_xp_ledger, 
                  league_user_streaks, league_challenges, league_achievements, 
                  league_user_achievements, league_quiz_attempts, league_user_challenges FROM authenticated;
  END IF;
END $$;

