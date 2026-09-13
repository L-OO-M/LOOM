-- 004_resource_kind: typed catalog for resource filter chips (Articles/Docs/Videos)
-- Tracked migration. Apply with: npm run db:migrate
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'article';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resources_kind_check') THEN
    ALTER TABLE public.resources ADD CONSTRAINT resources_kind_check CHECK (kind IN ('article', 'doc', 'video'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS resources_kind_idx ON public.resources(kind);
-- Backfill docs by URL pattern; everything else stays 'article'
UPDATE public.resources SET kind = 'doc'
WHERE kind = 'article' AND (
  url LIKE '%developer.mozilla.org%' OR url LIKE '%css-tricks.com%'
  OR url LIKE '%learngitbranching%' OR url LIKE '%react.dev%'
);
