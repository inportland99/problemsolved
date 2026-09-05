-- =============================================================
-- Teacher Portal: Lesson Taxonomy Tagging Upgrade
-- Run this in the Supabase SQL Editor for the math-lessons project
--
-- Adds Grade/Course, Math Domain, and Math Topic tagging to
-- math_lessons, backed by the taxonomy in src/_data/math_taxonomy.json.
-- A lesson may be tagged with any number of values in each of the
-- three arrays independently (e.g. a lesson could be tagged for both
-- "Grade 6" and "Grade 7", under both "Geometry" and "Statistics &
-- Probability" domains).
-- =============================================================

ALTER TABLE math_lessons ADD COLUMN IF NOT EXISTS grade_courses text[] DEFAULT '{}';
ALTER TABLE math_lessons ADD COLUMN IF NOT EXISTS math_domains  text[] DEFAULT '{}';
ALTER TABLE math_lessons ADD COLUMN IF NOT EXISTS math_topics   text[] DEFAULT '{}';

-- GIN indexes to support future server-side filtering/search on these
-- array columns (e.g. `WHERE grade_courses && ARRAY['Grade 6']`).
CREATE INDEX IF NOT EXISTS idx_math_lessons_grade_courses ON math_lessons USING GIN (grade_courses);
CREATE INDEX IF NOT EXISTS idx_math_lessons_math_domains  ON math_lessons USING GIN (math_domains);
CREATE INDEX IF NOT EXISTS idx_math_lessons_math_topics   ON math_lessons USING GIN (math_topics);
