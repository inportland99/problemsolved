-- =============================================================
-- Teacher Portal: Multi-District Authorization Upgrade
-- Run this in the Supabase SQL Editor for the math-lessons project
-- AFTER supabase-teacherportal-setup.sql has already been applied.
--
-- Adds:
--   - districts table (seeded with "Reynoldsburg")
--   - teachers.district_id / teachers.role
--   - math_lessons.district_id / math_lessons.created_by
--   - observations.observed_teacher_id
--   - security-definer helper functions (is_admin, current_teacher_district,
--     is_district_admin) used by RLS policies
--   - replacement RLS policies enforcing:
--       * lessons are visible to all teachers (district_id IS NULL) or
--         scoped to one district
--       * teachers can only publish/edit lessons in their own district;
--         only admin can publish/move a lesson to "All Districts"
--       * only a lesson's author or admin can delete it
--       * observations are visible only to the observed teacher and admin
--       * only admin can delete an observation
-- =============================================================

-- 1. DISTRICTS TABLE
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS districts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

INSERT INTO districts (name)
VALUES ('Reynoldsburg')
ON CONFLICT (name) DO NOTHING;

-- Districts are simple reference data; readable by any authenticated user
-- (no RLS needed for a lookup table with no sensitive columns), but enable
-- RLS for consistency and only allow admin writes.
ALTER TABLE districts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read districts" ON districts;
CREATE POLICY "Authenticated users can read districts"
  ON districts
  FOR SELECT
  USING (auth.role() = 'authenticated');


-- 2. TEACHERS TABLE: add district_id + role
-- -------------------------------------------------------
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS district_id uuid REFERENCES districts(id);
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'teacher'
  CHECK (role IN ('teacher', 'district_admin', 'admin'));

-- Migrate the existing admin row (matches the UUID hardcoded in
-- supabase-teacherportal-setup.sql, or by email as a fallback).
UPDATE teachers
SET role = 'admin', district_id = NULL
WHERE auth_id = 'd615d639-fd88-44bf-b468-763cb5bf4c55'::uuid
   OR email = 'raj@drrajshah.com';

CREATE INDEX IF NOT EXISTS idx_teachers_district ON teachers(district_id);


-- 3. MATH_LESSONS TABLE: add district_id + created_by
-- -------------------------------------------------------
ALTER TABLE math_lessons ADD COLUMN IF NOT EXISTS district_id uuid REFERENCES districts(id);
ALTER TABLE math_lessons ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_math_lessons_district ON math_lessons(district_id);


-- 4. OBSERVATIONS TABLE: add observed_teacher_id
-- -------------------------------------------------------
ALTER TABLE observations ADD COLUMN IF NOT EXISTS observed_teacher_id uuid REFERENCES teachers(id);

CREATE INDEX IF NOT EXISTS idx_observations_observed_teacher ON observations(observed_teacher_id);


-- 5. HELPER FUNCTIONS (security definer to avoid RLS recursion on teachers)
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM teachers WHERE auth_id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.current_teacher_district()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT district_id FROM teachers WHERE auth_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_district_admin(target_district uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM teachers
    WHERE auth_id = auth.uid()
      AND role = 'district_admin'
      AND district_id = target_district
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_teacher_district() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_district_admin(uuid) TO authenticated, anon;


-- 6. TEACHERS RLS (replaces admin-only-UUID policy from setup script)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Admin only: full access to teachers" ON teachers;

CREATE POLICY "Teachers can view directory"
  ON teachers
  FOR SELECT
  USING (
    auth_id = auth.uid()
    OR is_admin()
    OR district_id = current_teacher_district()
  );

CREATE POLICY "Admins manage teachers"
  ON teachers
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());


-- 7. MATH_LESSONS RLS (replaces blanket "authenticated" policies)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can read lessons" ON math_lessons;
DROP POLICY IF EXISTS "Authenticated users can insert lessons" ON math_lessons;
DROP POLICY IF EXISTS "Authenticated users can update lessons" ON math_lessons;
DROP POLICY IF EXISTS "Authenticated users can delete lessons" ON math_lessons;

CREATE POLICY "Lessons visible by district"
  ON math_lessons
  FOR SELECT
  USING (
    district_id IS NULL
    OR district_id = current_teacher_district()
    OR is_admin()
  );

CREATE POLICY "Lessons insert own district"
  ON math_lessons
  FOR INSERT
  WITH CHECK (
    is_admin() OR district_id = current_teacher_district()
  );

CREATE POLICY "Lessons update own district"
  ON math_lessons
  FOR UPDATE
  USING (
    is_admin() OR district_id = current_teacher_district()
  )
  WITH CHECK (
    is_admin() OR district_id = current_teacher_district()
  );

CREATE POLICY "Lessons delete by author or admin"
  ON math_lessons
  FOR DELETE
  USING (
    is_admin() OR created_by = auth.uid()
  );


-- 8. OBSERVATIONS RLS (replaces owner-based read/update/delete policies)
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can read observations" ON observations;
DROP POLICY IF EXISTS "Authenticated users can insert observations" ON observations;
DROP POLICY IF EXISTS "Users can update own observations" ON observations;
DROP POLICY IF EXISTS "Users can delete own observations" ON observations;

CREATE POLICY "Observations visible to observed teacher or admin"
  ON observations
  FOR SELECT
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM teachers t
      WHERE t.id = observations.observed_teacher_id
        AND t.auth_id = auth.uid()
    )
  );

CREATE POLICY "Observations insert by authenticated teacher"
  ON observations
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Observations update own or admin"
  ON observations
  FOR UPDATE
  USING (created_by = auth.uid() OR is_admin())
  WITH CHECK (created_by = auth.uid() OR is_admin());

CREATE POLICY "Observations delete admin only"
  ON observations
  FOR DELETE
  USING (is_admin());
