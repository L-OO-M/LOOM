-- 005_resource_course_kind: allow 'course' in the resource kind check
-- so curated courses (freeCodeCamp, Kaggle Learn, Hugging Face, ...) can be
-- tagged honestly instead of being forced into article/doc/video.
-- Tracked migration. Apply with: npm run db:migrate
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resources_kind_check') THEN
    ALTER TABLE public.resources DROP CONSTRAINT resources_kind_check;
  END IF;
  ALTER TABLE public.resources ADD CONSTRAINT resources_kind_check
    CHECK (kind IN ('article', 'doc', 'video', 'course'));
END $$;
