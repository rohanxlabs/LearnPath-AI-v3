-- Add email_verified column to users table.
-- This column tracks whether the user has clicked the verification link sent
-- after registration. ensureUsersTable() now adds it via ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "streak" integer NOT NULL DEFAULT 0;
