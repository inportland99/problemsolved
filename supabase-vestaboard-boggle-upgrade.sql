-- Run against the PERSONAL Supabase project, after the original Vestaboard tables.
-- No credentials belong in this file. See WARP.md for Vault setup and deployment.
BEGIN;

CREATE TABLE IF NOT EXISTS public.vestaboard_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  board jsonb NOT NULL CHECK (jsonb_typeof(board) = 'array' AND jsonb_array_length(board) = 16),
  status text NOT NULL DEFAULT 'launching'
    CHECK (status IN ('launching', 'running', 'finished', 'cancelled', 'failed')),
  cancel_requested boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  ended_at timestamptz,
  last_step integer NOT NULL DEFAULT -1 CHECK (last_step BETWEEN -1 AND 9),
  failures integer NOT NULL DEFAULT 0,
  last_error text
);
CREATE INDEX IF NOT EXISTS vestaboard_rounds_owner_created
  ON public.vestaboard_rounds(user_id, created_at DESC);
ALTER TABLE public.vestaboard_rounds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read own Boggle rounds" ON public.vestaboard_rounds;
CREATE POLICY "Read own Boggle rounds" ON public.vestaboard_rounds
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.vestaboard_rounds FROM anon, authenticated;
GRANT SELECT ON public.vestaboard_rounds TO authenticated;
GRANT ALL ON public.vestaboard_rounds TO service_role;

-- All calls that physically write to the one configured board share this row.
CREATE TABLE IF NOT EXISTS public.vestaboard_control (
  id integer PRIMARY KEY CHECK (id = 1),
  active_round uuid REFERENCES public.vestaboard_rounds(id),
  write_token uuid,
  write_until timestamptz,
  next_write_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.vestaboard_control(id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE public.vestaboard_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vestaboard_control FROM anon, authenticated;
GRANT ALL ON public.vestaboard_control TO service_role;

-- Service-only RPCs. The Edge Function validates user JWTs and supplies user_id.
CREATE OR REPLACE FUNCTION public.boggle_start(p_user uuid, p_board jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.vestaboard_control; r public.vestaboard_rounds;
BEGIN
  IF p_user IS NULL OR jsonb_typeof(p_board) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid board or user';
  END IF;
  IF jsonb_array_length(p_board) <> 16 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_board) x
    WHERE jsonb_typeof(x) <> 'string' OR (x #>> '{}') !~ '^[A-Z]$'
  ) THEN RAISE EXCEPTION 'Invalid board'; END IF;
  SELECT * INTO c FROM public.vestaboard_control WHERE id = 1 FOR UPDATE;
  IF c.active_round IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'A round is already active. Cancel it before starting another.');
  END IF;
  INSERT INTO public.vestaboard_rounds(user_id, board) VALUES (p_user, p_board) RETURNING * INTO r;
  UPDATE public.vestaboard_control SET active_round = r.id WHERE id = 1;
  RETURN jsonb_build_object('round', to_jsonb(r));
END;
$$;

CREATE OR REPLACE FUNCTION public.boggle_cancel(p_user uuid, p_round uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.vestaboard_control;
BEGIN
  SELECT * INTO c FROM public.vestaboard_control WHERE id = 1 FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.vestaboard_rounds WHERE id = p_round AND user_id = p_user) THEN
    RETURN jsonb_build_object('error', 'Round not found');
  END IF;
  IF c.active_round = p_round THEN
    UPDATE public.vestaboard_rounds SET cancel_requested = true WHERE id = p_round;
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.boggle_claim(p_kind text, p_user uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.vestaboard_control; r public.vestaboard_rounds; s integer; token uuid;
BEGIN
  IF p_kind NOT IN ('tick', 'manual', 'schedule') OR p_kind IS NULL THEN
    RAISE EXCEPTION 'Invalid write kind';
  END IF;
  IF p_kind = 'manual' AND p_user IS NULL THEN RAISE EXCEPTION 'User required'; END IF;
  SELECT * INTO c FROM public.vestaboard_control WHERE id = 1 FOR UPDATE;
  -- A lease greatly exceeds the worker's 8-second HTTP timeout. A lost worker
  -- can recover without parallel sends; completion is fenced by a unique token.
  IF c.write_until > now() THEN
    RETURN jsonb_build_object('skip', 'Board write in progress', 'gameActive', c.active_round IS NOT NULL);
  END IF;
  IF c.active_round IS NOT NULL THEN
    SELECT * INTO r FROM public.vestaboard_rounds WHERE id = c.active_round FOR UPDATE;
    IF r.created_at < now() - interval '10 minutes' OR r.failures >= 6 THEN
      UPDATE public.vestaboard_rounds SET status = 'failed', ended_at = now(),
        last_error = coalesce(last_error, 'Round timed out; check board connectivity.') WHERE id = r.id;
      UPDATE public.vestaboard_control SET active_round = NULL, write_token = NULL, write_until = NULL WHERE id = 1;
      c.active_round := NULL;
    END IF;
  END IF;
  IF p_kind <> 'tick' AND c.active_round IS NOT NULL THEN
    RETURN jsonb_build_object('skip', 'A Boggle round owns the board', 'gameActive', true);
  END IF;
  IF p_kind = 'tick' AND c.active_round IS NULL THEN RETURN jsonb_build_object('skip', 'No active round'); END IF;
  IF c.next_write_at > now() THEN RETURN jsonb_build_object('skip', 'Board is cooling down; try again shortly'); END IF;
  IF p_kind = 'tick' THEN
    s := CASE WHEN r.cancel_requested THEN 9 WHEN r.started_at IS NULL THEN 0 ELSE
      least(9, greatest(0, floor(extract(epoch FROM (now() - r.started_at)) / 20)::integer)) END;
    IF s <= r.last_step THEN RETURN jsonb_build_object('skip', 'No new timer frame'); END IF;
  END IF;
  token := gen_random_uuid();
  UPDATE public.vestaboard_control SET write_token = token,
    write_until = now() + interval '90 seconds', next_write_at = now() + interval '20 seconds' WHERE id = 1;
  RETURN jsonb_build_object('token', token, 'leaseUntil', now() + interval '90 seconds',
    'round', CASE WHEN p_kind = 'tick' THEN to_jsonb(r) ELSE NULL END, 'step', s);
END;
$$;

CREATE OR REPLACE FUNCTION public.boggle_complete(p_token uuid, p_round uuid, p_step integer, p_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.vestaboard_control; r public.vestaboard_rounds;
BEGIN
  SELECT * INTO c FROM public.vestaboard_control WHERE id = 1 FOR UPDATE;
  IF c.write_token IS DISTINCT FROM p_token OR p_token IS NULL THEN RETURN false; END IF;
  IF p_round IS NOT NULL THEN
    IF c.active_round IS DISTINCT FROM p_round OR p_step IS NULL OR p_step NOT BETWEEN 0 AND 9 THEN
      RAISE EXCEPTION 'Invalid round completion';
    END IF;
    SELECT * INTO r FROM public.vestaboard_rounds WHERE id = p_round FOR UPDATE;
    IF p_error IS NOT NULL THEN
      UPDATE public.vestaboard_rounds SET failures = failures + 1, last_error = left(p_error, 500) WHERE id = p_round;
    ELSE
      UPDATE public.vestaboard_rounds SET last_step = p_step, failures = 0, last_error = NULL,
        started_at = CASE WHEN p_step = 0 THEN coalesce(started_at, now()) ELSE started_at END,
        status = CASE WHEN p_step = 9 THEN CASE WHEN cancel_requested THEN 'cancelled' ELSE 'finished' END ELSE 'running' END,
        ended_at = CASE WHEN p_step = 9 THEN now() ELSE NULL END
      WHERE id = p_round;
      IF p_step = 9 THEN UPDATE public.vestaboard_control SET active_round = NULL WHERE id = 1; END IF;
    END IF;
  END IF;
  UPDATE public.vestaboard_control SET write_token = NULL, write_until = NULL,
    next_write_at = greatest(next_write_at, now() + interval '20 seconds') WHERE id = 1;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.boggle_tick_due()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vestaboard_control c JOIN public.vestaboard_rounds r ON r.id = c.active_round
    WHERE c.next_write_at <= now() AND (c.write_until IS NULL OR c.write_until <= now())
      AND (r.last_step = -1 OR r.cancel_requested OR r.failures > 0
        OR r.created_at < now() - interval '10 minutes'
        OR r.last_step < least(9, floor(extract(epoch FROM (now() - r.started_at)) / 20)::integer))
  );
$$;

REVOKE ALL ON FUNCTION public.boggle_start(uuid,jsonb), public.boggle_cancel(uuid,uuid),
  public.boggle_claim(text,uuid), public.boggle_complete(uuid,uuid,integer,text), public.boggle_tick_due()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.boggle_start(uuid,jsonb), public.boggle_cancel(uuid,uuid),
  public.boggle_claim(text,uuid), public.boggle_complete(uuid,uuid,integer,text), public.boggle_tick_due()
  TO service_role;
COMMIT;

-- Scheduler registration is separate so core schema can be tested in stock Postgres.
-- Requires existing pg_cron / pg_net and Vault secrets vestaboard_project_url
-- and vestaboard_cron_secret. These are read at invocation, never pasted into job text.
CREATE OR REPLACE FUNCTION public.vestaboard_enqueue(p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE project_url text; cron_secret text;
BEGIN
  IF p_action NOT IN ('game-tick', 'run-schedule') OR p_action IS NULL THEN RAISE EXCEPTION 'Invalid worker action'; END IF;
  IF p_action = 'game-tick' AND NOT public.boggle_tick_due() THEN RETURN; END IF;
  SELECT decrypted_secret INTO project_url FROM vault.decrypted_secrets WHERE name = 'vestaboard_project_url';
  SELECT decrypted_secret INTO cron_secret FROM vault.decrypted_secrets WHERE name = 'vestaboard_cron_secret';
  IF project_url IS NULL OR cron_secret IS NULL THEN RAISE EXCEPTION 'Vestaboard Vault configuration missing'; END IF;
  PERFORM net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/vestaboard-send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', cron_secret),
    body := jsonb_build_object('action', p_action), timeout_milliseconds := 15000);
END;
$$;
REVOKE ALL ON FUNCTION public.vestaboard_enqueue(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vestaboard_enqueue(text) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'vestaboard_project_url')
    OR NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'vestaboard_cron_secret') THEN
    RAISE EXCEPTION 'Configure Vestaboard Vault secrets before installing cron jobs';
  END IF;
END;
$$;
SELECT cron.schedule('vestaboard-boggle-tick', '5 seconds', $$SELECT public.vestaboard_enqueue('game-tick')$$);
SELECT cron.schedule('vestaboard-schedule-check', '* * * * *', $$SELECT public.vestaboard_enqueue('run-schedule')$$);
SELECT cron.schedule('vestaboard-cron-history-cleanup', '17 4 * * *', $$
  DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'
    AND jobid IN (SELECT jobid FROM cron.job WHERE jobname IN (
      'vestaboard-boggle-tick', 'vestaboard-schedule-check', 'vestaboard-cron-history-cleanup'))
$$);
