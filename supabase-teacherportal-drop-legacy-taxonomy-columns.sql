-- =============================================================
-- Teacher Portal: Drop Legacy Flat-Array Taxonomy Columns
-- Run this in the Supabase SQL Editor for the math-lessons project
--
-- DEFERRED / MANUAL: do NOT run this automatically as part of the
-- math-taxonomy-v2 upgrade. Only run it once you've confirmed the
-- new relational taxonomy (grades_courses/domains/math_topics/
-- taxonomy/lesson_math_topics, from
-- supabase-teacherportal-math-taxonomy-v2-upgrade.sql) is working
-- correctly in the app — lesson tagging, viewing, and filtering all
-- read/write through the new tables with no remaining dependency on
-- the columns below.
--
-- This drops the original flat-array columns added by
-- supabase-teacherportal-lesson-taxonomy-upgrade.sql, which stored
-- grade/domain/topic as three independent, unlinked tag sets.
-- =============================================================

DROP INDEX IF EXISTS idx_math_lessons_grade_courses;
DROP INDEX IF EXISTS idx_math_lessons_math_domains;
DROP INDEX IF EXISTS idx_math_lessons_math_topics;

ALTER TABLE math_lessons DROP COLUMN IF EXISTS grade_courses;
ALTER TABLE math_lessons DROP COLUMN IF EXISTS math_domains;
ALTER TABLE math_lessons DROP COLUMN IF EXISTS math_topics;
