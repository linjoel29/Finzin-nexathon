-- =====================================================================
-- Finzin Migration: Slice Goals Enhancements & Student Corner Bookmarks
-- Safe to run repeatedly (uses IF NOT EXISTS / DROP CONSTRAINT IF EXISTS).
-- =====================================================================

-- 1. Goals enhancements: optional target_amount and optional target_date
ALTER TABLE goals ADD COLUMN IF NOT EXISTS target_date DATE;
ALTER TABLE goals ALTER COLUMN target_amount DROP NOT NULL;
ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_target_amount_check;
ALTER TABLE goals ADD CONSTRAINT goals_target_amount_check CHECK (target_amount IS NULL OR target_amount > 0);

-- 2. User Bookmarks for Student Corner opportunities (internships, scholarships, offers)
CREATE TABLE IF NOT EXISTS user_bookmarks (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type     TEXT NOT NULL CHECK (item_type IN ('internship', 'scholarship', 'offer')),
  item_id       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_user_bookmarks_user ON user_bookmarks (user_id, created_at DESC);

-- Enable RLS for user_bookmarks
ALTER TABLE user_bookmarks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON user_bookmarks FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON user_bookmarks FROM authenticated;
  END IF;
END $$;
