"""Run only in a disposable cluster; never connects to an existing database."""
from pathlib import Path
import os
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
U1 = "10000000-0000-0000-0000-000000000001"
U2 = "20000000-0000-0000-0000-000000000002"
ADMIN = "30000000-0000-0000-0000-000000000003"
LESSON = "40000000-0000-0000-0000-000000000004"
GLOBAL = "50000000-0000-0000-0000-000000000005"
OTHER = "60000000-0000-0000-0000-000000000006"
IMAGE = "70000000-0000-0000-0000-000000000007"
DRAFT = "80000000-0000-0000-0000-000000000008"
PATH = f"{U1}/{LESSON}/{IMAGE}.png"

FIXTURE = f"""
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE TABLE public.teachers(auth_id uuid, district_id uuid, role text);
CREATE TABLE public.math_lessons(id uuid PRIMARY KEY, diagram_url text, district_id uuid);
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS(SELECT 1 FROM public.teachers WHERE auth_id = auth.uid() AND role = 'admin')
$$;
CREATE FUNCTION public.current_teacher_district() RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  SELECT district_id FROM public.teachers WHERE auth_id = auth.uid()
$$;
CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects(id bigserial PRIMARY KEY, bucket_id text, name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
-- Deliberately overbroad legacy policy: restrictive guards must still protect work.
CREATE POLICY legacy_broad ON storage.objects FOR ALL TO authenticated, anon
  USING (true) WITH CHECK (true);
GRANT USAGE ON SCHEMA public, auth, storage TO authenticated, anon;
GRANT ALL ON storage.objects TO authenticated, anon;
GRANT USAGE ON SEQUENCE storage.objects_id_seq TO authenticated, anon;
INSERT INTO storage.buckets VALUES ('lesson-images', 'lesson-images', true, null, null);
INSERT INTO public.teachers VALUES
  ('{U1}', '{U1}', 'teacher'), ('{U2}', '{U2}', 'teacher'), ('{ADMIN}', null, 'admin');
INSERT INTO public.math_lessons VALUES
  ('{LESSON}', 'https://example.com/legacy.png', '{U1}'),
  ('{GLOBAL}', null, null), ('{OTHER}', null, '{U2}');
CREATE FUNCTION public.assert_test(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'TEST FAILED: %', message; END IF; END;
$$;
"""

CHECKS = f"""
SELECT public.assert_test(
  (SELECT lesson_images->0->>'url' = 'https://example.com/legacy.png'
   FROM public.math_lessons WHERE id = '{LESSON}'), 'legacy backfill');
SELECT public.assert_test(
  (SELECT NOT public FROM storage.buckets WHERE id = 'student-work-images'), 'private bucket');
SELECT public.assert_test(NOT public.valid_lesson_gallery_images(
  '[{{"id":"a","url":"https://public/student.png","caption":""}}]', '{LESSON}', true),
  'student URL rejected');
SELECT public.assert_test(NOT public.valid_lesson_student_work(
  '[{{"id":"g","date":"","label":" ","images":[]}}]', '{LESSON}'), 'unidentified group rejected');
SELECT public.assert_test(NOT public.valid_lesson_student_work(
  '[{{"id":"g","date":"2026-02-30","label":"","images":[]}}]', '{LESSON}'), 'invalid date rejected');
SELECT public.assert_test(NOT public.valid_lesson_gallery_images(
  '[{{"id":"a","path":"{U1}/{OTHER}/{IMAGE}.png","caption":""}}]', '{LESSON}', true),
  'cross-lesson path rejected');
SELECT public.assert_test(NOT public.valid_lesson_gallery_images(
  '[{{"id":"a","url":"https://example.com/image","preview":"blob:private"}}]', '{LESSON}', false),
  'unexpected metadata rejected');
UPDATE public.math_lessons SET student_work =
  '[{{"id":"g","date":"2026-11-09","label":"Class A",
      "images":[{{"id":"i","path":"{PATH}","caption":"Strategy"}}]}}]'
  WHERE id = '{LESSON}';
INSERT INTO storage.objects(bucket_id, name) VALUES
  ('student-work-images', '{PATH}'),
  ('student-work-images', '{ADMIN}/{GLOBAL}/{IMAGE}.png'),
  ('student-work-images', '{U2}/{OTHER}/{IMAGE}.png');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '{U1}', false);
SELECT public.assert_test((SELECT count(*) = 2 FROM storage.objects), 'own district plus global');
INSERT INTO storage.objects(bucket_id, name)
  VALUES ('student-work-images', '{U1}/{DRAFT}/{IMAGE}.png');
SELECT public.assert_test((SELECT count(*) = 3 FROM storage.objects), 'draft uploader can preview');
DO $$ BEGIN
  INSERT INTO storage.objects(bucket_id, name)
    VALUES ('student-work-images', '{U1}/{OTHER}/{IMAGE}.png');
  RAISE EXCEPTION 'TEST FAILED: other district insert allowed';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DELETE FROM storage.objects WHERE name = '{PATH}';
SELECT public.assert_test(EXISTS(SELECT 1 FROM storage.objects WHERE name = '{PATH}'),
  'referenced image protected from delete');
UPDATE storage.objects SET name = '{U1}/{LESSON}/{IMAGE}.jpg' WHERE name = '{PATH}';
SELECT public.assert_test(EXISTS(SELECT 1 FROM storage.objects WHERE name = '{PATH}'),
  'student objects cannot be overwritten or moved');
SELECT set_config('request.jwt.claim.sub', '{U2}', false);
SELECT public.assert_test((SELECT count(*) = 2 FROM storage.objects), 'other district isolation');
SELECT set_config('request.jwt.claim.sub', '{ADMIN}', false);
SELECT public.assert_test((SELECT count(*) = 3 FROM storage.objects), 'admin sees all committed lessons');
SELECT public.assert_test(public.lesson_gallery_object_access('{PATH}', true), 'admin may edit');
SET ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT public.assert_test((SELECT count(*) = 0 FROM storage.objects), 'anonymous blocked despite broad policy');
DO $$ BEGIN
  INSERT INTO storage.objects(bucket_id, name) VALUES ('student-work-images', '{PATH}');
  RAISE EXCEPTION 'TEST FAILED: anonymous insert allowed';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
UPDATE public.math_lessons SET student_work = '[]' WHERE id = '{LESSON}';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '{U1}', false);
DELETE FROM storage.objects WHERE name = '{PATH}';
SELECT public.assert_test(NOT EXISTS(SELECT 1 FROM storage.objects WHERE name = '{PATH}'),
  'unreferenced image cleanup allowed after save');
RESET ROLE;
"""

def main():
    # Ignore any inherited PG connection environment: this harness must use only
    # its own private Unix socket and cluster, not the user's running database.
    env = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
    with tempfile.TemporaryDirectory(prefix="gallery-pg-", dir="/tmp") as temp:
        data = str(Path(temp) / "data")
        subprocess.run(["initdb", "-D", data, "-U", "gallery_test", "-A", "trust"],
                       env=env, check=True, capture_output=True, text=True)
        subprocess.run(["pg_ctl", "-D", data, "-l", str(Path(temp) / "server.log"),
                        "-o", f"-k {temp} -p 55479 -c listen_addresses=''", "-w", "start"],
                       env=env, check=True, capture_output=True, text=True)
        try:
            migration = (ROOT / "supabase-teacherportal-image-galleries-upgrade.sql").read_text()
            # Run twice to check upgrade idempotence.
            result = subprocess.run(
                ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-h", temp, "-p", "55479",
                 "-U", "gallery_test", "-d", "postgres"],
                input=FIXTURE + migration + migration + CHECKS,
                env=env, capture_output=True, text=True)
            if result.returncode:
                raise RuntimeError(result.stderr + result.stdout)
            print("Gallery SQL passed: backfill, rerun, metadata validation, district/admin/anonymous RLS, draft upload, and safe cleanup.")
        finally:
            subprocess.run(["pg_ctl", "-D", data, "-m", "fast", "-w", "stop"],
                           env=env, check=True, capture_output=True, text=True)

if __name__ == "__main__":
    main()
