"""Disposable Postgres only; Vault/cron/net are stubs, never contacts Supabase."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import os
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
USER = "10000000-0000-0000-0000-000000000001"
OTHER = "20000000-0000-0000-0000-000000000002"
BOARD = '["C","A","T","S","D","O","G","E","H","O","U","S","T","R","I","N"]'
FIXTURE = f"""
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
INSERT INTO auth.users VALUES ('{USER}'), ('{OTHER}');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
CREATE SCHEMA vault;
CREATE TABLE vault.decrypted_secrets(name text PRIMARY KEY, decrypted_secret text);
INSERT INTO vault.decrypted_secrets VALUES
  ('vestaboard_project_url','https://test.invalid'),
  ('vestaboard_cron_secret','test-only');
CREATE SCHEMA net;
CREATE TABLE net.calls(body jsonb);
CREATE FUNCTION net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer)
RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN
  INSERT INTO net.calls VALUES (body); RETURN 1;
END $$;
CREATE SCHEMA cron;
CREATE TABLE cron.job(jobid bigserial PRIMARY KEY, jobname text UNIQUE, schedule text, command text);
CREATE TABLE cron.job_run_details(jobid bigint, end_time timestamptz);
CREATE FUNCTION cron.schedule(n text, s text, c text) RETURNS bigint LANGUAGE sql AS $$
  INSERT INTO cron.job(jobname,schedule,command) VALUES(n,s,c)
    ON CONFLICT(jobname) DO UPDATE SET schedule=s, command=c RETURNING jobid
$$;
CREATE FUNCTION public.check_test(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'TEST FAILED: %', message; END IF; END;
$$;
"""

CHECKS = f"""
DO $$
DECLARE stage integer; start_time timestamptz := '2026-01-01 00:00:00+00';
BEGIN
  PERFORM public.check_test(public.boggle_frame_step(NULL, start_time)=0, 'unstarted clock');
  PERFORM public.check_test(public.boggle_frame_step(start_time, start_time-interval '1 second')=0, 'negative elapsed');
  FOR stage IN 0..7 LOOP
    PERFORM public.check_test(
      public.boggle_frame_step(start_time, start_time + stage * interval '22.5 seconds')=stage,
      'exact 22.5-second boundary');
    IF stage > 0 THEN
      PERFORM public.check_test(
        public.boggle_frame_step(start_time, start_time + stage * interval '22.5 seconds' - interval '1 millisecond')=stage-1,
        'immediately before boundary');
    END IF;
  END LOOP;
  PERFORM public.check_test(public.boggle_frame_step(start_time, start_time+interval '179.999 seconds')=7, 'last running stage');
  PERFORM public.check_test(public.boggle_frame_step(start_time, start_time+interval '180 seconds')=9, 'terminal marker at three minutes');
END;
$$;
SELECT public.check_test((SELECT count(*) = 3 FROM cron.job), 'idempotent cron registration');
SELECT public.check_test(NOT public.boggle_tick_due(), 'no idle worker invocations');
SELECT public.vestaboard_enqueue('game-tick');
SELECT public.check_test((SELECT count(*) = 0 FROM net.calls), 'idle cron skips HTTP');
SET ROLE service_role;
SELECT public.check_test(public.boggle_start('{USER}', '{BOARD}') ? 'round', 'service can start');
RESET ROLE;
SELECT public.check_test(public.boggle_start('{USER}', '{BOARD}') ? 'error', 'duplicate start blocked');
SELECT public.check_test((public.boggle_claim('manual', '{USER}')->>'gameActive')::boolean, 'manual blocked');
SELECT public.check_test((public.boggle_claim('schedule')->>'gameActive')::boolean, 'schedule blocked');
SELECT public.check_test(public.boggle_tick_due(), 'initial frame due');
SELECT public.vestaboard_enqueue('game-tick');
SELECT public.check_test((SELECT count(*) = 1 FROM net.calls), 'active cron queues HTTP');
SELECT public.check_test(public.boggle_cancel('{OTHER}', (SELECT active_round FROM public.vestaboard_control)) ? 'error', 'other owner cannot cancel');
DO $$
DECLARE c jsonb; newer jsonb; rid uuid;
BEGIN
  SELECT active_round INTO rid FROM public.vestaboard_control;
  c := public.boggle_claim('tick');
  PERFORM public.check_test((c->>'step')::int = 0, 'initial green frame');
  PERFORM public.check_test(public.boggle_claim('tick') ? 'skip', 'overlap blocked');
  PERFORM public.check_test((public.boggle_claim('schedule')->>'gameActive')::boolean, 'in-flight game still blocks schedule');
  PERFORM public.check_test(public.boggle_complete((c->>'token')::uuid,rid,0), 'initial ack');
  PERFORM public.check_test((SELECT status = 'running' AND started_at IS NOT NULL FROM public.vestaboard_rounds WHERE id=rid), 'clock starts after send');
  PERFORM public.check_test(NOT public.boggle_tick_due(), 'cooldown enforced');
  UPDATE public.vestaboard_control SET next_write_at = now() - interval '1 second';
  PERFORM public.check_test(public.boggle_claim('tick') ? 'skip', 'unchanged frame suppressed');
  UPDATE public.vestaboard_rounds SET started_at = now() - interval '70 seconds' WHERE id=rid;
  c := public.boggle_claim('tick');
  PERFORM public.check_test((c->>'step')::int = 3, 'delayed tick skips obsolete frames');
  PERFORM public.boggle_complete((c->>'token')::uuid,rid,3,'test offline');
  PERFORM public.check_test((SELECT last_step=0 AND failures=1 FROM public.vestaboard_rounds WHERE id=rid), 'failed delivery not acknowledged');
  UPDATE public.vestaboard_control SET next_write_at = now() - interval '1 second';
  c := public.boggle_claim('tick');
  -- Simulate a worker lost long enough that its lease expires.
  UPDATE public.vestaboard_control SET write_until=now()-interval '1 second', next_write_at=now()-interval '1 second';
  newer := public.boggle_claim('tick');
  PERFORM public.check_test(NOT public.boggle_complete((c->>'token')::uuid,rid,3), 'stale completion fenced');
  PERFORM public.check_test(public.boggle_complete((newer->>'token')::uuid,rid,3), 'replacement worker ack');
  UPDATE public.vestaboard_control SET next_write_at = now() - interval '1 second';
  UPDATE public.vestaboard_rounds SET started_at = now() - interval '181 seconds' WHERE id=rid;
  c := public.boggle_claim('tick');
  PERFORM public.check_test((c->>'step')::int=9, 'final black frame due');
  PERFORM public.check_test((SELECT active_round=rid FROM public.vestaboard_control), 'ownership retained before final ack');
  PERFORM public.boggle_complete((c->>'token')::uuid,rid,9);
  PERFORM public.check_test((SELECT status='finished' AND last_step=9 FROM public.vestaboard_rounds WHERE id=rid), 'round finished');
  PERFORM public.check_test((SELECT active_round IS NULL FROM public.vestaboard_control), 'ownership released');
  PERFORM public.check_test(public.boggle_claim('manual','{USER}') ? 'skip', 'final frame cooldown retained');
  UPDATE public.vestaboard_control SET next_write_at = now() - interval '1 second';
  c := public.boggle_claim('manual','{USER}');
  PERFORM public.check_test(c ? 'token', 'normal sends resume');
  PERFORM public.boggle_complete((c->>'token')::uuid,NULL,NULL);
END;
$$;
DO $$
DECLARE c jsonb; rid uuid;
BEGIN
  c := public.boggle_start('{USER}', '{BOARD}');
  rid := (c->'round'->>'id')::uuid;
  PERFORM public.boggle_cancel('{USER}',rid);
  UPDATE public.vestaboard_control SET next_write_at=now()-interval '1 second';
  c := public.boggle_claim('tick');
  PERFORM public.check_test((c->>'step')::int=9, 'cancel uses black frame even before launch');
  PERFORM public.boggle_complete((c->>'token')::uuid,rid,9);
  PERFORM public.check_test((SELECT status='cancelled' FROM public.vestaboard_rounds WHERE id=rid), 'cancel complete');
  c := public.boggle_start('{OTHER}', '{BOARD}');
  rid := (c->'round'->>'id')::uuid;
  UPDATE public.vestaboard_rounds SET failures=6 WHERE id=rid;
  UPDATE public.vestaboard_control SET next_write_at=now()-interval '1 second';
  PERFORM public.boggle_claim('tick');
  PERFORM public.check_test((SELECT status='failed' FROM public.vestaboard_rounds WHERE id=rid), 'bounded failures');
  PERFORM public.check_test((SELECT active_round IS NULL FROM public.vestaboard_control), 'failed round releases board');
  c := public.boggle_start('{OTHER}', '{BOARD}');
  rid := (c->'round'->>'id')::uuid;
  UPDATE public.vestaboard_rounds SET created_at=now()-interval '11 minutes' WHERE id=rid;
  PERFORM public.boggle_claim('tick');
  PERFORM public.check_test((SELECT status='failed' FROM public.vestaboard_rounds WHERE id=rid), 'abandoned round expires');
END;
$$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','{USER}',false);
SELECT public.check_test((SELECT count(*)=2 FROM public.vestaboard_rounds), 'owner-only reads');
DO $$ BEGIN
  PERFORM public.boggle_start('{USER}', '{BOARD}');
  RAISE EXCEPTION 'TEST FAILED: browser RPC allowed';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN
  UPDATE public.vestaboard_rounds SET last_step=9;
  RAISE EXCEPTION 'TEST FAILED: browser mutation allowed';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN
  PERFORM * FROM public.vestaboard_control;
  RAISE EXCEPTION 'TEST FAILED: browser control access allowed';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
SET ROLE anon;
DO $$ BEGIN
  PERFORM * FROM public.vestaboard_rounds;
  RAISE EXCEPTION 'TEST FAILED: anonymous access allowed';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
UPDATE public.vestaboard_control SET active_round=NULL,write_token=NULL,write_until=NULL,next_write_at=now();
DELETE FROM public.vestaboard_rounds;
"""


def main():
    env = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
    with tempfile.TemporaryDirectory(prefix="boggle-pg-", dir="/tmp") as temp:
        data = str(Path(temp) / "data")
        subprocess.run(["initdb", "-D", data, "-U", "boggle_test", "-A", "trust"],
                       env=env, check=True, capture_output=True, text=True)
        subprocess.run(["pg_ctl", "-D", data, "-l", str(Path(temp) / "server.log"),
                        "-o", f"-k {temp} -p 55481 -c listen_addresses=''", "-w", "start"],
                       env=env, check=True, capture_output=True, text=True)
        try:
            def sql(text, expected_error=None):
                result = subprocess.run(["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
                                         "-h", temp, "-p", "55481", "-U", "boggle_test", "-d", "postgres"],
                                        input=text, env=env, capture_output=True, text=True)
                if expected_error:
                    assert result.returncode and expected_error in result.stderr, result.stderr
                    return
                if result.returncode:
                    raise RuntimeError(result.stderr + result.stdout)
                return result.stdout.strip()
            migration = (ROOT / "supabase-vestaboard-boggle-upgrade.sql").read_text()
            design = (ROOT / "supabase-vestaboard-boggle-design-upgrade.sql").read_text()
            sql(FIXTURE + migration + migration)
            historical_id = sql(
                f"INSERT INTO public.vestaboard_rounds(user_id,board,status,last_step) "
                f"VALUES('{USER}','{BOARD}','finished',9) RETURNING id;")
            sql(design + design)
            assert sql(f"SELECT last_step=9 AND status='finished' FROM public.vestaboard_rounds WHERE id='{historical_id}';") == "t"
            sql(f"DELETE FROM public.vestaboard_rounds WHERE id='{historical_id}';")
            sql(CHECKS)
            with ThreadPoolExecutor(max_workers=8) as executor:
                results = list(executor.map(lambda _: sql(
                    f"SELECT public.boggle_start('{USER}', '{BOARD}') ? 'round';"), range(8)))
            assert results.count("t") == 1, results
            assert sql("SELECT count(*) FROM public.vestaboard_rounds;") == "1"
            with ThreadPoolExecutor(max_workers=8) as executor:
                results = list(executor.map(lambda _: sql(
                    "SELECT public.boggle_claim('tick') ? 'token';"), range(8)))
            assert results.count("t") == 1, results
            sql(design, expected_error="Wait until the Vestaboard is idle")
            assert sql("SELECT count(*) FROM public.vestaboard_rounds;") == "1"
            print("Boggle SQL passed: 22.5-second boundaries, historical rounds, idle-only upgrade, rerun, RLS, retry/cancel/expiry, and concurrency.")
        finally:
            subprocess.run(["pg_ctl", "-D", data, "-m", "fast", "-w", "stop"],
                           env=env, check=True, capture_output=True, text=True)


if __name__ == "__main__":
    main()
