-- Add last_active_date column to users table.
-- This column is used by updateStreak() to determine streak continuity.
-- ensureUsersTable() already adds it via ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_active_date" text;
