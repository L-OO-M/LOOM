-- Role requests: asking for core, or for a department seat, with proof.
--
-- The problem this table solves: a request used to be free. Anyone could ask
-- for core or a Head seat as often as they liked, so the queue filled with
-- claims that carried no evidence and leads learned to ignore it. A request is
-- now an application with a snapshot of the applicant's real record attached,
-- one open request at a time, and a cooldown after a decision.
--
-- The snapshot columns are deliberately denormalised. They record what the
-- applicant looked like AT REQUEST TIME, so a later review cannot be argued
-- about ("I had three projects when I asked") and a later score change cannot
-- retroactively justify a decision.

CREATE TABLE IF NOT EXISTS public.role_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  target_role text NOT NULL CHECK (target_role IN ('core', 'dept_lead')),
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  statement text NOT NULL,
  score_at_request integer NOT NULL DEFAULT 0,
  tier_at_request text,
  proof_at_request jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'approved', 'rejected', 'withdrawn')),
  decided_by text,
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One open request per target. A partial unique index is the enforcement, not a
-- read-then-write check: two tabs submitting at once must not both land.
CREATE UNIQUE INDEX IF NOT EXISTS role_requests_one_open_idx
  ON public.role_requests (
    tenant_id,
    user_id,
    target_role,
    COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE status = 'open';

-- The lead queue reads newest-first per chapter.
CREATE INDEX IF NOT EXISTS role_requests_tenant_status_idx
  ON public.role_requests (tenant_id, status, created_at DESC);

-- Cooldown lookup: the applicant's most recent decided request.
CREATE INDEX IF NOT EXISTS role_requests_user_recent_idx
  ON public.role_requests (user_id, created_at DESC);
