CREATE TABLE IF NOT EXISTS public.practice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  week_id uuid REFERENCES public.practice_weeks(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_sessions_range_check CHECK (completed_at IS NULL OR completed_at >= started_at)
);

CREATE INDEX IF NOT EXISTS practice_sessions_user_time_idx
  ON public.practice_sessions(tenant_id, user_id, started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS practice_sessions_one_active_idx
  ON public.practice_sessions(tenant_id, user_id)
  WHERE completed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.practice_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.practice_questions(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.practice_sessions(id) ON DELETE SET NULL,
  outcome text NOT NULL,
  source text NOT NULL DEFAULT 'self',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_attempts_outcome_check CHECK (outcome IN ('attempted', 'solved')),
  CONSTRAINT practice_attempts_source_check CHECK (source IN ('self', 'leetcode'))
);

CREATE INDEX IF NOT EXISTS practice_attempts_user_time_idx
  ON public.practice_attempts(tenant_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS practice_attempts_question_time_idx
  ON public.practice_attempts(tenant_id, user_id, question_id, created_at DESC);

CREATE INDEX IF NOT EXISTS practice_attempts_session_idx
  ON public.practice_attempts(tenant_id, user_id, session_id, created_at ASC)
  WHERE session_id IS NOT NULL;

DO $$
DECLARE
  t text;
  new_tables text[] := ARRAY[
    'practice_sessions',
    'practice_attempts'
  ];
BEGIN
  FOREACH t IN ARRAY new_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_policy ON public.%I AS PERMISSIVE
         FOR ALL
         USING (tenant_id::text = current_setting(''app.tenant_id'', true))
         WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))', t);
  END LOOP;
END $$;
