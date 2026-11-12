CREATE TABLE IF NOT EXISTS public.practice_connections (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  leetcode_username text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  last_attempt_at timestamptz,
  next_sync_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz NOT NULL DEFAULT 'epoch',
  sync_state text NOT NULL DEFAULT 'never',
  sync_error text,
  failures integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id),
  CONSTRAINT practice_connections_username_check CHECK (leetcode_username ~ '^[a-z0-9_-]{1,30}$'),
  CONSTRAINT practice_connections_state_check CHECK (sync_state IN ('never', 'ready', 'syncing', 'error')),
  CONSTRAINT practice_connections_failures_check CHECK (failures >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS practice_connections_username_idx
  ON public.practice_connections(tenant_id, lower(leetcode_username));
CREATE INDEX IF NOT EXISTS practice_connections_due_idx
  ON public.practice_connections(next_sync_at, lease_until)
  WHERE active;

CREATE TABLE IF NOT EXISTS public.practice_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_by text REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_weeks_title_check CHECK (char_length(title) BETWEEN 1 AND 120),
  CONSTRAINT practice_weeks_range_check CHECK (end_at > start_at),
  CONSTRAINT practice_weeks_status_check CHECK (status IN ('draft', 'scheduled')),
  UNIQUE (tenant_id, start_at)
);
CREATE INDEX IF NOT EXISTS practice_weeks_tenant_start_idx
  ON public.practice_weeks(tenant_id, start_at DESC);

CREATE TABLE IF NOT EXISTS public.practice_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  week_id uuid NOT NULL REFERENCES public.practice_weeks(id) ON DELETE CASCADE,
  position integer NOT NULL,
  title text NOT NULL,
  slug text NOT NULL,
  difficulty text NOT NULL,
  topic text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_questions_position_check CHECK (position BETWEEN 1 AND 7),
  CONSTRAINT practice_questions_title_check CHECK (char_length(title) BETWEEN 1 AND 160),
  CONSTRAINT practice_questions_slug_check CHECK (slug ~ '^[a-z0-9-]+$'),
  CONSTRAINT practice_questions_difficulty_check CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
  CONSTRAINT practice_questions_topic_check CHECK (char_length(topic) <= 80),
  UNIQUE (tenant_id, week_id, position),
  UNIQUE (tenant_id, week_id, slug)
);
CREATE INDEX IF NOT EXISTS practice_questions_week_idx
  ON public.practice_questions(tenant_id, week_id, position);
CREATE INDEX IF NOT EXISTS practice_questions_slug_idx
  ON public.practice_questions(tenant_id, slug);

CREATE TABLE IF NOT EXISTS public.practice_solves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.practice_questions(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  slug text NOT NULL,
  accepted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, question_id),
  UNIQUE (tenant_id, user_id, external_id)
);
CREATE INDEX IF NOT EXISTS practice_solves_user_time_idx
  ON public.practice_solves(tenant_id, user_id, accepted_at DESC);
CREATE INDEX IF NOT EXISTS practice_solves_slug_idx
  ON public.practice_solves(tenant_id, slug, accepted_at);

CREATE TABLE IF NOT EXISTS public.practice_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.practice_questions(id) ON DELETE CASCADE,
  credited boolean NOT NULL,
  accepted_at timestamptz,
  evidence_url text NOT NULL,
  reason text NOT NULL,
  corrected_by text NOT NULL REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_corrections_evidence_check CHECK (evidence_url ~ '^https://'),
  CONSTRAINT practice_corrections_reason_check CHECK (char_length(reason) BETWEEN 5 AND 500),
  CONSTRAINT practice_corrections_accepted_check CHECK (credited = false OR accepted_at IS NOT NULL),
  UNIQUE (tenant_id, user_id, question_id)
);
CREATE INDEX IF NOT EXISTS practice_corrections_question_idx
  ON public.practice_corrections(tenant_id, question_id);

CREATE TABLE IF NOT EXISTS public.practice_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  checked integer NOT NULL DEFAULT 0,
  successful integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  error_summary text,
  CONSTRAINT practice_sync_runs_kind_check CHECK (kind IN ('automatic', 'manual')),
  CONSTRAINT practice_sync_runs_counts_check CHECK (checked >= 0 AND successful >= 0 AND failed >= 0)
);
CREATE INDEX IF NOT EXISTS practice_sync_runs_tenant_time_idx
  ON public.practice_sync_runs(tenant_id, started_at DESC);

DO $$
DECLARE
  t text;
  new_tables text[] := ARRAY[
    'practice_connections',
    'practice_weeks',
    'practice_questions',
    'practice_solves',
    'practice_corrections',
    'practice_sync_runs'
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
