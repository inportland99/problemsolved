-- =============================================================
-- Teacher Portal: Observation Math Content (single taxonomy tag)
-- Run in the Supabase SQL Editor for the math-lessons project
-- (or apply via CLI). Safe to re-run.
--
-- Adds optional FKs so an observation can:
--   1. Link to an existing portal lesson (math_lesson_id)
--   2. Carry exactly one Math Content taxonomy tag (taxonomy_id)
-- The observation's taxonomy_id is the source of truth for filters/
-- display. When a lesson is selected in the UI, its primary tag is
-- copied into taxonomy_id (and may be overridden).
-- =============================================================

ALTER TABLE observations
  ADD COLUMN IF NOT EXISTS math_lesson_id uuid REFERENCES math_lessons(id) ON DELETE SET NULL;

ALTER TABLE observations
  ADD COLUMN IF NOT EXISTS taxonomy_id int REFERENCES taxonomy(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_observations_math_lesson
  ON observations(math_lesson_id);

CREATE INDEX IF NOT EXISTS idx_observations_taxonomy
  ON observations(taxonomy_id);

COMMENT ON COLUMN observations.math_lesson_id IS
  'Optional link to a portal math_lessons row when the observed lesson exists in the library.';

COMMENT ON COLUMN observations.taxonomy_id IS
  'Single Math Content taxonomy tag (Grade/Course + Domain + Topic) for this observation.';
