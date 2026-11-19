-- 084_student_tracks: follow more than one roadmap.
--
-- profiles.primary_domain answers "which track did you pick at onboarding?" and
-- still drives the default roadmap. It cannot answer "which roadmaps are you
-- working on now?": a web member who starts the AI/ML path had nowhere to record
-- that, and the dashboard only ever counted one track.
--
-- Each row is an explicit follow. The primary domain is always treated as
-- followed on read, so existing members get a correct dashboard without a write.
-- Backfilling the primary here keeps the table honest for queries that do not
-- apply that rule (analytics, admin views).
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.student_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  domain text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_tracks_domain_check CHECK (
    domain IN ('ai_ml', 'web', 'cybersecurity', 'dsa', 'blockchain', 'embedded', 'backend', 'devops')
  ),
  UNIQUE (tenant_id, user_id, domain)
);

CREATE INDEX IF NOT EXISTS student_tracks_user_idx
  ON public.student_tracks (tenant_id, user_id, created_at);

ALTER TABLE public.student_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_tracks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.student_tracks;
CREATE POLICY tenant_isolation_policy ON public.student_tracks AS PERMISSIVE TO public
  USING (
    current_setting('app.tenant_id', true) = ''
    OR current_setting('app.tenant_id', true) IS NULL
    OR tenant_id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.tenant_id', true) = ''
    OR current_setting('app.tenant_id', true) IS NULL
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );

-- A stored display label ("Cybersecurity") never matched the roadmap's domain
-- key, so the member's own track resolved to the first available roadmap.
UPDATE public.profiles
SET primary_domain = lower(primary_domain)
WHERE primary_domain IS NOT NULL AND primary_domain <> lower(primary_domain);

INSERT INTO public.student_tracks (tenant_id, user_id, domain)
SELECT tenant_id, user_id, primary_domain
FROM public.profiles
WHERE tenant_id IS NOT NULL
  AND primary_domain IN ('ai_ml', 'web', 'cybersecurity', 'dsa', 'blockchain', 'embedded', 'backend', 'devops')
ON CONFLICT (tenant_id, user_id, domain) DO NOTHING;

COMMENT ON TABLE public.student_tracks IS
  'Roadmaps a member explicitly follows. profiles.primary_domain stays the default; this allows several at once.';
