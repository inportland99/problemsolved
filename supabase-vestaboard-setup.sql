-- =============================================================
-- Vestaboard Tool: Supabase Setup SQL
-- Run this in the Supabase SQL Editor for the problemsolved project.
--
-- Before running:
--   1. In Supabase Dashboard -> Database -> Extensions, enable
--      "pg_cron" and "pg_net" (both are free but must be turned on
--      per-project).
--   2. Deploy the `vestaboard-send` Edge Function
--      (supabase functions deploy vestaboard-send) and set its
--      secrets: VESTABOARD_API_KEY, VESTABOARD_CRON_SECRET.
--   3. Replace the placeholders near the bottom of this file
--      (YOUR_PROJECT_REF and YOUR_CRON_SECRET) before running the
--      cron.schedule(...) statement.
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

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

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
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/vestaboard-send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', 'YOUR_CRON_SECRET'
    ),
    body := jsonb_build_object('action', 'run-schedule')
  );
  $$
);
