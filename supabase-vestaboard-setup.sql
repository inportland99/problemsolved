-- =============================================================
-- Vestaboard Tool: Supabase Setup SQL
-- Run this in the Supabase SQL Editor for the problemsolved project.
--
-- Before running:
--   1. In Supabase Dashboard -> Database -> Extensions, enable
--      "pg_cron" and "pg_net" (both are free but must be turned on
--      per-project). If prompted for a schema: pg_cron must go in
--      "pg_catalog" (it's non-relocatable); pg_net should go in
--      "extensions". Both extensions create their own schemas
--      ("cron" and "net" respectively) for their actual functions
--      and tables regardless of this choice. This SQL file also
--      creates both extensions itself, so you can skip this step
--      in the dashboard and just run the whole file instead.
--   2. Deploy the `vestaboard-send` Edge Function:
--      supabase functions deploy vestaboard-send
--   3. Set its VESTABOARD_API_KEY secret (your Vestaboard Cloud API
--      token) with:
--      supabase secrets set VESTABOARD_API_KEY=...
--      VESTABOARD_CRON_SECRET has already been generated and set on
--      this project, and is already filled in below.
-- =============================================================

-- 1. VESTABOARD_ITEMS TABLE
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS vestaboard_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  name         text NOT NULL,
  mode         text NOT NULL CHECK (mode IN ('text', 'grid')),
  text_content text,
  grid_content jsonb,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE vestaboard_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own vestaboard items"
  ON vestaboard_items
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own vestaboard items"
  ON vestaboard_items
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own vestaboard items"
  ON vestaboard_items
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own vestaboard items"
  ON vestaboard_items
  FOR DELETE
  USING (auth.uid() = user_id);


-- 2. VESTABOARD_SCHEDULES TABLE
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS vestaboard_schedules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  item_id       uuid NOT NULL REFERENCES vestaboard_items(id) ON DELETE CASCADE,
  days_of_week  int[] NOT NULL, -- 0=Sunday .. 6=Saturday
  time_of_day   time NOT NULL,
  timezone      text NOT NULL DEFAULT 'America/New_York',
  enabled       boolean NOT NULL DEFAULT true,
  last_sent_at  timestamptz,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE vestaboard_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own vestaboard schedules"
  ON vestaboard_schedules
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own vestaboard schedules"
  ON vestaboard_schedules
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own vestaboard schedules"
  ON vestaboard_schedules
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own vestaboard schedules"
  ON vestaboard_schedules
  FOR DELETE
  USING (auth.uid() = user_id);

-- Keep updated_at current on vestaboard_items
CREATE OR REPLACE FUNCTION set_vestaboard_items_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vestaboard_items_updated_at ON vestaboard_items;
CREATE TRIGGER trg_vestaboard_items_updated_at
  BEFORE UPDATE ON vestaboard_items
  FOR EACH ROW
  EXECUTE FUNCTION set_vestaboard_items_updated_at();


-- 3. SCHEDULED CRON JOB (unattended sends)
-- -------------------------------------------------------
-- The run-schedule action has no user session, so it authenticates
-- via a shared secret header instead of a Supabase JWT. The Edge
-- Function itself uses the service role key (available to it by
-- default) to bypass RLS when reading schedules/items.

-- pg_cron ships non-relocatable on current Supabase Postgres versions and
-- must be installed in pg_catalog; it then creates its own "cron" schema
-- for cron.job / cron.schedule() etc.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- pg_net is recommended to live in the "extensions" schema (avoids the
-- Security Advisor "extension in public" warning); it creates its own
-- "net" schema for net.http_post() etc. regardless of where it's installed.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Remove any previous registration of this job before re-creating it,
-- so this file is safe to re-run.
SELECT cron.unschedule('vestaboard-schedule-check')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'vestaboard-schedule-check'
);

SELECT cron.schedule(
  'vestaboard-schedule-check',
  '* * * * *', -- every minute
  $$
  SELECT net.http_post(
    url := 'https://skgqvheszlquwflignze.supabase.co/functions/v1/vestaboard-send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', 'd0542c41ad4b1513647923fac919d4a7f5dec498cd3c7200331d1e562cdccf2c'
    ),
    body := jsonb_build_object('action', 'run-schedule')
  );
  $$
);
