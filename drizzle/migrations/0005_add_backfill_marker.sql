-- Mark users whose JSONB lesson progress has been backfilled into user_lesson_progress.
-- Set once per user; NULL means the backfill has not yet run for that account.
ALTER TABLE users ADD COLUMN IF NOT EXISTS progress_backfilled_at TIMESTAMPTZ;
