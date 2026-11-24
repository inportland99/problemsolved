-- Run against the math-lessons project BEFORE deploying the gallery UI.
-- Requires the districts/RLS upgrade. Does not change legacy public images.
BEGIN;

ALTER TABLE public.math_lessons
  ADD COLUMN IF NOT EXISTS lesson_images jsonb,
  ADD COLUMN IF NOT EXISTS student_work jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.math_lessons
SET lesson_images = CASE WHEN diagram_url IS NOT NULL AND diagram_url <> ''
  THEN jsonb_build_array(jsonb_build_object('id', 'legacy-diagram', 'url', diagram_url))
  ELSE '[]'::jsonb END
WHERE lesson_images IS NULL;

ALTER TABLE public.math_lessons
  ALTER COLUMN lesson_images SET DEFAULT '[]'::jsonb,
  ALTER COLUMN lesson_images SET NOT NULL;

CREATE OR REPLACE FUNCTION public.valid_lesson_gallery_images(
  images jsonb, lesson_id uuid, student boolean
) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = public
AS $$
DECLARE image jsonb; seen text[] := '{}'; image_id text;
BEGIN
  IF jsonb_typeof(images) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  FOR image IN SELECT value FROM jsonb_array_elements(images) LOOP
    image_id := image->>'id';
    IF jsonb_typeof(image) IS DISTINCT FROM 'object'
       OR jsonb_typeof(image->'id') IS DISTINCT FROM 'string'
       OR image_id = '' OR image_id = ANY(seen) THEN RETURN false; END IF;
    seen := array_append(seen, image_id);
    IF image ? 'path' THEN
      IF jsonb_typeof(image->'path') IS DISTINCT FROM 'string'
         OR image->>'path' !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|gif|avif)$'
         OR split_part(image->>'path', '/', 2) <> lesson_id::text
         OR image ? 'url' THEN RETURN false; END IF;
    ELSE
      -- Only legacy public lesson diagrams may use URLs instead of paths.
      IF student OR jsonb_typeof(image->'url') IS DISTINCT FROM 'string'
         OR image->>'url' !~ '^https://' THEN RETURN false; END IF;
    END IF;
    IF student AND jsonb_typeof(image->'caption') IS DISTINCT FROM 'string'
      THEN RETURN false; END IF;
    IF NOT student AND image ? 'caption' THEN RETURN false; END IF;
    IF (image - ARRAY['id', 'path', 'url', 'caption']) <> '{}'::jsonb
      THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.valid_lesson_student_work(groups jsonb, lesson_id uuid)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public
AS $$
DECLARE implementation jsonb; seen text[] := '{}'; group_id text; date_text text;
BEGIN
  IF jsonb_typeof(groups) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  FOR implementation IN SELECT value FROM jsonb_array_elements(groups) LOOP
    group_id := implementation->>'id';
    IF jsonb_typeof(implementation) IS DISTINCT FROM 'object'
       OR jsonb_typeof(implementation->'id') IS DISTINCT FROM 'string'
       OR group_id = '' OR group_id = ANY(seen)
       OR jsonb_typeof(implementation->'label') IS DISTINCT FROM 'string'
       OR jsonb_typeof(implementation->'date') IS DISTINCT FROM 'string'
      THEN RETURN false; END IF;
    seen := array_append(seen, group_id);
    date_text := implementation->>'date';
    IF date_text = '' AND btrim(implementation->>'label') = '' THEN RETURN false; END IF;
    IF date_text <> '' THEN
      IF date_text !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN false; END IF;
      IF to_char(date_text::date, 'YYYY-MM-DD') <> date_text THEN RETURN false; END IF;
    END IF;
    IF NOT public.valid_lesson_gallery_images(implementation->'images', lesson_id, true)
      OR (implementation - ARRAY['id', 'date', 'label', 'images']) <> '{}'::jsonb
      THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RETURN false;
END;
$$;

ALTER TABLE public.math_lessons DROP CONSTRAINT IF EXISTS valid_lesson_images;
ALTER TABLE public.math_lessons ADD CONSTRAINT valid_lesson_images
  CHECK (public.valid_lesson_gallery_images(lesson_images, id, false));
ALTER TABLE public.math_lessons DROP CONSTRAINT IF EXISTS valid_student_work;
ALTER TABLE public.math_lessons ADD CONSTRAINT valid_student_work
  CHECK (public.valid_lesson_student_work(student_work, id));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('student-work-images', 'student-work-images', false, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Apply the same upload limits to lesson images without changing their public status.
UPDATE storage.buckets SET file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
WHERE id = 'lesson-images';

-- SECURITY DEFINER is intentional: distinguish an absent draft lesson from a
-- real lesson hidden by RLS. All authorization is checked explicitly below.
-- Paths: uploader-auth-uuid / lesson-uuid / image-uuid.extension.
CREATE OR REPLACE FUNCTION public.lesson_gallery_object_access(object_name text, editing boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE lesson public.math_lessons%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR object_name !~
    '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|gif|avif)$'
    THEN RETURN false; END IF;
  SELECT * INTO lesson FROM public.math_lessons
    WHERE id::text = split_part(object_name, '/', 2);
  IF NOT FOUND THEN
    RETURN split_part(object_name, '/', 1) = auth.uid()::text
      AND EXISTS (SELECT 1 FROM public.teachers WHERE auth_id = auth.uid());
  END IF;
  IF public.is_admin() THEN RETURN true; END IF;
  IF editing THEN
    RETURN coalesce(lesson.district_id = public.current_teacher_district(), false);
  END IF;
  RETURN lesson.district_id IS NULL
    OR coalesce(lesson.district_id = public.current_teacher_district(), false);
END;
$$;

CREATE OR REPLACE FUNCTION public.lesson_gallery_object_unreferenced(object_name text, bucket text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.math_lessons ml
    WHERE ml.id::text = split_part(object_name, '/', 2)
      AND (
        (bucket = 'lesson-images' AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(ml.lesson_images) image
          WHERE image->>'path' = object_name
        ))
        OR (bucket = 'student-work-images' AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(ml.student_work) implementation,
            LATERAL jsonb_array_elements(implementation->'images') image
          WHERE image->>'path' = object_name
        ))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.lesson_gallery_object_access(text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lesson_gallery_object_unreferenced(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lesson_gallery_object_access(text, boolean) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.lesson_gallery_object_unreferenced(text, text) TO authenticated, anon;

-- Restrictive guards also apply when an older storage policy grants broad
-- access to authenticated users (permissive policies are otherwise OR-ed).
DROP POLICY IF EXISTS "Private student work read guard" ON storage.objects;
CREATE POLICY "Private student work read guard" ON storage.objects
AS RESTRICTIVE FOR SELECT TO authenticated, anon USING (
  bucket_id <> 'student-work-images' OR public.lesson_gallery_object_access(name, false)
);
DROP POLICY IF EXISTS "Private student work insert guard" ON storage.objects;
CREATE POLICY "Private student work insert guard" ON storage.objects
AS RESTRICTIVE FOR INSERT TO authenticated, anon WITH CHECK (
  bucket_id <> 'student-work-images' OR (
    split_part(name, '/', 1) = auth.uid()::text
    AND public.lesson_gallery_object_access(name, true)
  )
);
DROP POLICY IF EXISTS "Private student work update guard" ON storage.objects;
CREATE POLICY "Private student work update guard" ON storage.objects
AS RESTRICTIVE FOR UPDATE TO authenticated, anon
USING (bucket_id <> 'student-work-images')
WITH CHECK (bucket_id <> 'student-work-images');
DROP POLICY IF EXISTS "Private student work delete guard" ON storage.objects;
CREATE POLICY "Private student work delete guard" ON storage.objects
AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (
  bucket_id <> 'student-work-images' OR (
    public.lesson_gallery_object_access(name, true)
    AND public.lesson_gallery_object_unreferenced(name, bucket_id)
  )
);

DROP POLICY IF EXISTS "Student work readable with lesson" ON storage.objects;
CREATE POLICY "Student work readable with lesson" ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'student-work-images' AND public.lesson_gallery_object_access(name, false)
);

DROP POLICY IF EXISTS "Student work upload by lesson editor" ON storage.objects;
CREATE POLICY "Student work upload by lesson editor" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'student-work-images'
  AND split_part(name, '/', 1) = auth.uid()::text
  AND public.lesson_gallery_object_access(name, true)
);

DROP POLICY IF EXISTS "Student work cleanup by lesson editor" ON storage.objects;
CREATE POLICY "Student work cleanup by lesson editor" ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'student-work-images'
  AND public.lesson_gallery_object_access(name, true)
  AND public.lesson_gallery_object_unreferenced(name, bucket_id)
);

-- Add policies for the new public-image path convention. Legacy lesson-images
-- policies are intentionally not removed by this upgrade.
DROP POLICY IF EXISTS "Gallery lesson images readable" ON storage.objects;
CREATE POLICY "Gallery lesson images readable" ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'lesson-images' AND public.lesson_gallery_object_access(name, false)
);
DROP POLICY IF EXISTS "Gallery lesson images upload" ON storage.objects;
CREATE POLICY "Gallery lesson images upload" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'lesson-images'
  AND split_part(name, '/', 1) = auth.uid()::text
  AND public.lesson_gallery_object_access(name, true)
);
DROP POLICY IF EXISTS "Gallery lesson images cleanup" ON storage.objects;
CREATE POLICY "Gallery lesson images cleanup" ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'lesson-images'
  AND public.lesson_gallery_object_access(name, true)
  AND public.lesson_gallery_object_unreferenced(name, bucket_id)
);
COMMIT;
