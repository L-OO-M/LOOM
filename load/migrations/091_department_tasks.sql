-- 091_department_tasks: give every department its own work board, with proof.
--
-- WHY THIS EXISTS
-- Task assignment lived only in event_ops_tasks, and only the Management
-- department could create or complete one. A Web/Design/AI head could not hand
-- work to their own people, and the person a task was assigned to could not
-- even mark it started. Work that happened was visible only as a self-logged
-- contribution with an optional link - nothing tied a claim to an assignment or
-- to a second human confirming it.
--
-- department_tasks closes that gap:
--   * the head assigns work inside their own department;
--   * the assignee moves it forward and must attach evidence to submit;
--   * a head reviews it, and the reviewer can never be the person who
--     submitted it (co-head model), so "I did it, trust me" is not a state;
--   * every transition is audited by the API, and nothing is hard-deleted.
--
-- Additive and idempotent.

CREATE TABLE IF NOT EXISTS public.department_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  title text NOT NULL,
  detail text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'task',
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'assigned',
  assignee_id text REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  due_at timestamptz,
  -- submission: what the assignee says they did, and where the proof lives.
  submitted_at timestamptz,
  submitted_by text REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  evidence_url text,
  completion_note text,
  -- review: who checked it, when, and what they said (approve or return).
  reviewed_at timestamptz,
  reviewed_by text REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  review_note text,
  created_by text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT department_tasks_kind_check CHECK (
    kind IN ('task', 'deliverable', 'review', 'outreach', 'documentation')
  ),
  CONSTRAINT department_tasks_priority_check CHECK (priority IN ('low', 'medium', 'high')),
  CONSTRAINT department_tasks_status_check CHECK (
    status IN ('assigned', 'in_progress', 'blocked', 'submitted', 'done')
  ),
  -- Submitting without evidence is not a submission. The API also validates
  -- the URL; the constraint keeps a future writer honest.
  CONSTRAINT department_tasks_evidence_required CHECK (
    status <> 'submitted' OR evidence_url IS NOT NULL
  ),
  CONSTRAINT department_tasks_review_pair CHECK (
    (reviewed_at IS NULL) = (reviewed_by IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS department_tasks_board_idx
  ON public.department_tasks(tenant_id, department_id, is_active, status, due_at);

CREATE INDEX IF NOT EXISTS department_tasks_assignee_idx
  ON public.department_tasks(tenant_id, assignee_id, status)
  WHERE is_active AND assignee_id IS NOT NULL;

-- One row per department task; the board reads by department, the member's
-- "my work" page reads by assignee. Both are covered above.

DO $$
BEGIN
  ALTER TABLE public.department_tasks ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.department_tasks FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS tenant_isolation_policy ON public.department_tasks;
  CREATE POLICY tenant_isolation_policy ON public.department_tasks AS PERMISSIVE
    FOR ALL
    USING (tenant_id::text = current_setting('app.tenant_id', true))
    WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
END $$;
