-- =============================================================
-- Teacher Portal: Typed Lesson Questions Upgrade
-- Run this in the Supabase SQL Editor for the math-lessons project
--
-- Replaces the single free-text "Connecting Questions" list with a
-- typed list of questions, each tagged as one of three kinds:
-- Extension, Probing, or Connecting.
--
-- New column `questions` is a jsonb array of objects shaped like:
--   { "type": "extension" | "probing" | "connecting", "text": "..." }
--
-- The old `connecting_questions text[]` column is left in place for
-- now (existing data is not auto-migrated); the app no longer reads
-- or writes it going forward.
-- =============================================================

ALTER TABLE math_lessons ADD COLUMN IF NOT EXISTS questions jsonb DEFAULT '[]'::jsonb;
