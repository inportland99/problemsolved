-- PERSONAL project only. Apply after supabase-vestaboard-boggle-upgrade.sql.
-- Coordinate with the framed-layout worker deployment while the board is idle.
-- Keeps historical terminal step 9; new running stages are 0–7 (step 8 unused).
BEGIN;

DO $$
DECLARE control public.vestaboard_control;
BEGIN
  SELECT * INTO control FROM public.vestaboard_control WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Install the original Boggle upgrade first'; END IF;
  IF control.active_round IS NOT NULL OR control.write_until > now() THEN
    RAISE EXCEPTION 'Wait until the Vestaboard is idle before applying the design upgrade';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.boggle_frame_step(p_started_at timestamptz, p_now timestamptz)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_started_at IS NULL THEN 0
    WHEN p_now >= p_started_at + interval '180 seconds' THEN 9
    ELSE greatest(0, least(7, floor(extract(epoch FROM (p_now - p_started_at)) / 22.5)::integer))
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
    s := CASE WHEN r.cancel_requested THEN 9 ELSE public.boggle_frame_step(r.started_at, now()) END;
    IF s <= r.last_step THEN RETURN jsonb_build_object('skip', 'No new timer frame'); END IF;
  END IF;
  token := gen_random_uuid();
  UPDATE public.vestaboard_control SET write_token = token,
    write_until = now() + interval '90 seconds', next_write_at = now() + interval '20 seconds' WHERE id = 1;
  RETURN jsonb_build_object('token', token, 'leaseUntil', now() + interval '90 seconds',
    'round', CASE WHEN p_kind = 'tick' THEN to_jsonb(r) ELSE NULL END, 'step', s);
END;
$$;

CREATE OR REPLACE FUNCTION public.boggle_tick_due()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vestaboard_control c JOIN public.vestaboard_rounds r ON r.id = c.active_round
    WHERE c.next_write_at <= now() AND (c.write_until IS NULL OR c.write_until <= now())
      AND (r.last_step = -1 OR r.cancel_requested OR r.failures > 0
        OR r.created_at < now() - interval '10 minutes'
        OR r.last_step < public.boggle_frame_step(r.started_at, now()))
  );
$$;

REVOKE ALL ON FUNCTION public.boggle_frame_step(timestamptz,timestamptz),
  public.boggle_claim(text,uuid), public.boggle_tick_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.boggle_frame_step(timestamptz,timestamptz),
  public.boggle_claim(text,uuid), public.boggle_tick_due() TO service_role;
COMMIT;
