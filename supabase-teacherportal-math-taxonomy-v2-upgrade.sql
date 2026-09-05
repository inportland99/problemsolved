-- =============================================================
-- Teacher Portal: Relational Math Taxonomy Upgrade (v2)
-- Run this in the Supabase SQL Editor for the math-lessons project
--
-- Replaces the flat-array approach from
-- supabase-teacherportal-lesson-taxonomy-upgrade.sql (math_lessons.
-- grade_courses/math_domains/math_topics) with a proper relational
-- model: a lesson has a many-to-many relationship to specific, valid
-- (Grade/Course, Domain, Math Topic) combinations via a taxonomy
-- table, rather than three independent, unlinked tag sets.
--
-- After this is applied and the app is confirmed working with it,
-- run supabase-teacherportal-drop-legacy-taxonomy-columns.sql to
-- remove the old array columns. Seed data (grades/courses, domains,
-- math topics, and the ~192 valid combinations) lives in
-- supabase-teacherportal-math-taxonomy-seed.sql, generated from
-- tools/taxonomy-sources/math_taxonomy.json — run that file after
-- this one.
-- =============================================================

-- 1. GRADES/COURSES
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS grades_courses (
  id         serial PRIMARY KEY,
  name       text UNIQUE NOT NULL,
  sort_order int NOT NULL
);

ALTER TABLE grades_courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read grades_courses" ON grades_courses;
CREATE POLICY "Authenticated users can read grades_courses"
  ON grades_courses
  FOR SELECT
  USING (auth.role() = 'authenticated');


-- 2. DOMAINS
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS domains (
  id         serial PRIMARY KEY,
  name       text UNIQUE NOT NULL,
  sort_order int NOT NULL
);

ALTER TABLE domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read domains" ON domains;
CREATE POLICY "Authenticated users can read domains"
  ON domains
  FOR SELECT
  USING (auth.role() = 'authenticated');


-- 3. MATH TOPICS
-- -------------------------------------------------------
-- Not globally unique on name: a small number of topic names (e.g.
-- "Volume", "Equivalent Expressions") legitimately recur under two
-- different domains with different meaning, and are seeded as two
-- separate rows. The same math_topic row IS reused across multiple
-- grades/courses when the name and domain match (e.g. an HS topic
-- mapped to both Algebra 1 and Algebra 2 references one math_topics
-- row via two separate taxonomy rows).
CREATE TABLE IF NOT EXISTS math_topics (
  id   serial PRIMARY KEY,
  name text NOT NULL
);

ALTER TABLE math_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read math_topics" ON math_topics;
CREATE POLICY "Authenticated users can read math_topics"
  ON math_topics
  FOR SELECT
  USING (auth.role() = 'authenticated');


-- 4. TAXONOMY (valid Grade/Course + Domain + Math Topic combinations)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS taxonomy (
  id              serial PRIMARY KEY,
  grade_course_id int NOT NULL REFERENCES grades_courses(id),
  domain_id       int NOT NULL REFERENCES domains(id),
  math_topic_id   int NOT NULL REFERENCES math_topics(id),
  ccss_reference  text,
  sort_order      int NOT NULL DEFAULT 0,
  active          boolean NOT NULL DEFAULT true,
  UNIQUE (grade_course_id, domain_id, math_topic_id)
);

CREATE INDEX IF NOT EXISTS idx_taxonomy_grade_course ON taxonomy(grade_course_id);
CREATE INDEX IF NOT EXISTS idx_taxonomy_domain ON taxonomy(domain_id);
CREATE INDEX IF NOT EXISTS idx_taxonomy_math_topic ON taxonomy(math_topic_id);

ALTER TABLE taxonomy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read taxonomy" ON taxonomy;
CREATE POLICY "Authenticated users can read taxonomy"
  ON taxonomy
  FOR SELECT
  USING (auth.role() = 'authenticated');


-- 5. LESSON <-> TAXONOMY JUNCTION
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS lesson_math_topics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id   uuid NOT NULL REFERENCES math_lessons(id) ON DELETE CASCADE,
  taxonomy_id int NOT NULL REFERENCES taxonomy(id),
  is_primary  boolean NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (lesson_id, taxonomy_id)
);

-- At most one primary topic per lesson, enforced at the DB level.
CREATE UNIQUE INDEX IF NOT EXISTS ux_lesson_math_topics_one_primary
  ON lesson_math_topics(lesson_id)
  WHERE is_primary;

CREATE INDEX IF NOT EXISTS idx_lesson_math_topics_lesson ON lesson_math_topics(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_math_topics_taxonomy ON lesson_math_topics(taxonomy_id);

ALTER TABLE lesson_math_topics ENABLE ROW LEVEL SECURITY;

-- Mirrors the "Lessons visible by district" policy on math_lessons:
-- a lesson's tags are visible to whoever can see the lesson itself.
DROP POLICY IF EXISTS "Lesson tags visible with lesson" ON lesson_math_topics;
CREATE POLICY "Lesson tags visible with lesson"
  ON lesson_math_topics
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM math_lessons ml
      WHERE ml.id = lesson_math_topics.lesson_id
        AND (ml.district_id IS NULL OR ml.district_id = current_teacher_district() OR is_admin())
    )
  );

-- Mirrors "Lessons insert own district" / "Lessons update own
-- district": a teacher can only tag/untag lessons they're already
-- allowed to edit.
DROP POLICY IF EXISTS "Lesson tags editable with lesson" ON lesson_math_topics;
CREATE POLICY "Lesson tags editable with lesson"
  ON lesson_math_topics
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM math_lessons ml
      WHERE ml.id = lesson_math_topics.lesson_id
        AND (is_admin() OR ml.district_id = current_teacher_district())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM math_lessons ml
      WHERE ml.id = lesson_math_topics.lesson_id
        AND (is_admin() OR ml.district_id = current_teacher_district())
    )
  );
