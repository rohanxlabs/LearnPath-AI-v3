-- Migration: add is_unlocked column to user_lesson_progress and backfill.
--
-- is_unlocked tracks, per-user, whether the next lesson has been unlocked for
-- them.  Previously this was written to the global lessons.status column
-- (unlockNextLesson called updateLessonStatus('available')), which polluted
-- all users.  Now the unlock is stored here.
--
-- Backfill logic:
-- For every row where completed = TRUE we find the next lesson by order_index
-- in the same module, or (if none) the first lesson in the next module of the
-- same phase, or (if none) the first lesson in the first module of the next
-- phase.  We then upsert is_unlocked = TRUE for that next lesson using the
-- same owner_email / roadmap_id / module_id / phase_id context.

-- 1. Add the column.
ALTER TABLE "user_lesson_progress"
  ADD COLUMN IF NOT EXISTS "is_unlocked" BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Backfill: mark the next lesson as unlocked for every user who has already
--    completed the preceding lesson.
--
-- Step 2a — unlock next lesson within the same module.
INSERT INTO user_lesson_progress (
  id,
  owner_email,
  roadmap_id,
  lesson_id,
  module_id,
  phase_id,
  completed,
  is_unlocked,
  attempts,
  study_minutes,
  updated_at
)
SELECT
  ulp.owner_email || '::' || next_l.id AS id,
  ulp.owner_email,
  ulp.roadmap_id,
  next_l.id           AS lesson_id,
  ulp.module_id,
  ulp.phase_id,
  FALSE               AS completed,
  TRUE                AS is_unlocked,
  0                   AS attempts,
  0                   AS study_minutes,
  NOW()               AS updated_at
FROM user_lesson_progress ulp
JOIN lessons completed_l ON completed_l.id = ulp.lesson_id
JOIN lessons next_l
  ON  next_l.module_id   = ulp.module_id
  AND next_l.order_index = (
        SELECT MIN(l2.order_index)
        FROM lessons l2
        WHERE l2.module_id   = ulp.module_id
          AND l2.order_index > completed_l.order_index
      )
WHERE ulp.completed = TRUE
ON CONFLICT (owner_email, lesson_id)
  DO UPDATE SET is_unlocked = TRUE, updated_at = NOW();

-- Step 2b — when the completed lesson was the last in its module, unlock the
--           first lesson of the next module in the same phase.
INSERT INTO user_lesson_progress (
  id,
  owner_email,
  roadmap_id,
  lesson_id,
  module_id,
  phase_id,
  completed,
  is_unlocked,
  attempts,
  study_minutes,
  updated_at
)
SELECT
  ulp.owner_email || '::' || first_next_l.id AS id,
  ulp.owner_email,
  ulp.roadmap_id,
  first_next_l.id     AS lesson_id,
  next_mod.id         AS module_id,
  next_mod.phase_id,
  FALSE               AS completed,
  TRUE                AS is_unlocked,
  0                   AS attempts,
  0                   AS study_minutes,
  NOW()               AS updated_at
FROM user_lesson_progress ulp
JOIN lessons completed_l ON completed_l.id = ulp.lesson_id
JOIN modules cur_mod     ON cur_mod.id      = ulp.module_id
-- no next lesson in same module
LEFT JOIN lessons same_mod_next
  ON  same_mod_next.module_id   = ulp.module_id
  AND same_mod_next.order_index > completed_l.order_index
JOIN modules next_mod
  ON  next_mod.phase_id   = cur_mod.phase_id
  AND next_mod.order_index = (
        SELECT MIN(m2.order_index)
        FROM modules m2
        WHERE m2.phase_id   = cur_mod.phase_id
          AND m2.order_index > cur_mod.order_index
      )
JOIN lessons first_next_l
  ON  first_next_l.module_id   = next_mod.id
  AND first_next_l.order_index = (
        SELECT MIN(l3.order_index)
        FROM lessons l3
        WHERE l3.module_id = next_mod.id
      )
WHERE ulp.completed = TRUE
  AND same_mod_next.id IS NULL        -- only when current lesson was last in module
ON CONFLICT (owner_email, lesson_id)
  DO UPDATE SET is_unlocked = TRUE, updated_at = NOW();

-- Step 2c — when the completed lesson was the last in its module AND its phase
--           had no more modules, unlock the first lesson of the first module of
--           the next phase.
INSERT INTO user_lesson_progress (
  id,
  owner_email,
  roadmap_id,
  lesson_id,
  module_id,
  phase_id,
  completed,
  is_unlocked,
  attempts,
  study_minutes,
  updated_at
)
SELECT
  ulp.owner_email || '::' || first_next_l.id AS id,
  ulp.owner_email,
  ulp.roadmap_id,
  first_next_l.id       AS lesson_id,
  first_next_mod.id     AS module_id,
  next_phase.id         AS phase_id,
  FALSE                 AS completed,
  TRUE                  AS is_unlocked,
  0                     AS attempts,
  0                     AS study_minutes,
  NOW()                 AS updated_at
FROM user_lesson_progress ulp
JOIN lessons completed_l ON completed_l.id = ulp.lesson_id
JOIN modules cur_mod     ON cur_mod.id      = ulp.module_id
JOIN phases  cur_phase   ON cur_phase.id    = cur_mod.phase_id
-- no next lesson in same module
LEFT JOIN lessons same_mod_next
  ON  same_mod_next.module_id   = ulp.module_id
  AND same_mod_next.order_index > completed_l.order_index
-- no next module in same phase
LEFT JOIN modules same_phase_next_mod
  ON  same_phase_next_mod.phase_id    = cur_mod.phase_id
  AND same_phase_next_mod.order_index > cur_mod.order_index
JOIN phases next_phase
  ON  next_phase.roadmap_id   = cur_phase.roadmap_id
  AND next_phase.order_index  = (
        SELECT MIN(p2.order_index)
        FROM phases p2
        WHERE p2.roadmap_id   = cur_phase.roadmap_id
          AND p2.order_index  > cur_phase.order_index
      )
JOIN modules first_next_mod
  ON  first_next_mod.phase_id    = next_phase.id
  AND first_next_mod.order_index = (
        SELECT MIN(m3.order_index)
        FROM modules m3
        WHERE m3.phase_id = next_phase.id
      )
JOIN lessons first_next_l
  ON  first_next_l.module_id    = first_next_mod.id
  AND first_next_l.order_index  = (
        SELECT MIN(l4.order_index)
        FROM lessons l4
        WHERE l4.module_id = first_next_mod.id
      )
WHERE ulp.completed = TRUE
  AND same_mod_next.id         IS NULL
  AND same_phase_next_mod.id   IS NULL
ON CONFLICT (owner_email, lesson_id)
  DO UPDATE SET is_unlocked = TRUE, updated_at = NOW();
