-- =============================================================
-- Reyn Portal: Supabase Setup SQL
-- Run this in the Supabase SQL Editor for the math-lessons project
-- =============================================================

-- 1. TEACHERS TABLE (user directory — admin-only access)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS teachers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id     uuid REFERENCES auth.users(id),
  name        text NOT NULL,
  email       text UNIQUE NOT NULL,
  grade_course text,
  school      text,
  created_at  timestamptz DEFAULT now()
);

-- Enable RLS on teachers
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;

-- IMPORTANT: Replace YOUR_AUTH_USER_ID_HERE with your actual Supabase Auth user ID.
-- You can find it in Supabase Dashboard → Authentication → Users → click your user → copy the UUID.
CREATE POLICY "Admin only: full access to teachers"
  ON teachers
  FOR ALL
  USING (auth.uid() = 'd615d639-fd88-44bf-b468-763cb5bf4c55'::uuid)
  WITH CHECK (auth.uid() = 'd615d639-fd88-44bf-b468-763cb5bf4c55'::uuid);


-- 2. OBSERVATIONS TABLE
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS observations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_name          text,
  grade_course          text,
  lesson                text,
  observation_date      date,
  observer_name         text,
  planning_score        numeric,
  planning_notes        text,
  launch_score          numeric,
  launch_notes          text,
  problem_solving_score numeric,
  problem_solving_notes text,
  closing_score         numeric,
  closing_notes         text,
  additional_notes      text,
  created_by            uuid REFERENCES auth.users(id),
  created_at            timestamptz DEFAULT now()
);

-- Enable RLS on observations
ALTER TABLE observations ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all observations
CREATE POLICY "Authenticated users can read observations"
  ON observations
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Authenticated users can insert observations
CREATE POLICY "Authenticated users can insert observations"
  ON observations
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Users can update their own observations
CREATE POLICY "Users can update own observations"
  ON observations
  FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- Users can delete their own observations
CREATE POLICY "Users can delete own observations"
  ON observations
  FOR DELETE
  USING (auth.uid() = created_by);


-- 3. RLS ON EXISTING math_lessons TABLE
-- -------------------------------------------------------
ALTER TABLE math_lessons ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all lessons
CREATE POLICY "Authenticated users can read lessons"
  ON math_lessons
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Authenticated users can insert lessons
CREATE POLICY "Authenticated users can insert lessons"
  ON math_lessons
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Authenticated users can update lessons
CREATE POLICY "Authenticated users can update lessons"
  ON math_lessons
  FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Authenticated users can delete lessons
CREATE POLICY "Authenticated users can delete lessons"
  ON math_lessons
  FOR DELETE
  USING (auth.role() = 'authenticated');
