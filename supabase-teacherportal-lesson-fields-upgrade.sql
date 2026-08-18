-- =============================================================
-- Teacher Portal: Add title / lesson_content_name to math_lessons
-- Run this in the Supabase SQL Editor for the math-lessons project
-- =============================================================

ALTER TABLE math_lessons ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE math_lessons ADD COLUMN IF NOT EXISTS lesson_content_name text;

-- Nullable at the DB level (existing rows have no title yet) -- "required"
-- for new/edited lessons is enforced in the app form, matching how
-- learning_goal/task/author are already handled.
