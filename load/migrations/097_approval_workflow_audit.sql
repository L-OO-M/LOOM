-- 097_approval_workflow_audit.sql
-- Shared approvals, cross-department workflows and append-only governance records.

CREATE TABLE IF NOT EXISTS public.approval_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  policy_key text NOT NULL,
  resource_type text NOT NULL,
  required_approvals integer NOT NULL DEFAULT 1 CHECK (required_approvals > 0),
  eligible_roles text[] NOT NULL DEFAULT '{}'::text[],
  separation_of_duties boolean NOT NULL DEFAULT true,
  escalation_hours integer CHECK (escalation_hours IS NULL OR escalation_hours > 0),
  independent_escalation_role text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, policy_key)
);

CREATE TABLE IF NOT EXISTS public.approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  policy_key text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  resource_version integer NOT NULL DEFAULT 1 CHECK (resource_version > 0),
  requested_by text NOT NULL,
  required_approvals integer NOT NULL CHECK (required_approvals > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'superseded')),
  request_snapshot jsonb NOT NULL,
  reason text,
  due_at timestamptz,
  escalated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  UNIQUE (tenant_id, resource_type, resource_id, resource_version, policy_key)
);

CREATE TABLE IF NOT EXISTS public.approval_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  approval_request_id uuid NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  approver_id text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected', 'exception_approved')),
  reason text,
  authorization_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (approval_request_id, approver_id)
);

CREATE INDEX IF NOT EXISTS approval_requests_queue_idx
  ON public.approval_requests(tenant_id, status, due_at, created_at);
CREATE INDEX IF NOT EXISTS approval_decisions_request_idx
  ON public.approval_decisions(tenant_id, approval_request_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS approval_requests_tenant_id_id_unique
  ON public.approval_requests(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS departments_tenant_id_id_unique
  ON public.departments(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS events_tenant_id_id_unique
  ON public.events(tenant_id, id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'approval_requests_requester_tenant_fk') THEN
    ALTER TABLE public.approval_requests ADD CONSTRAINT approval_requests_requester_tenant_fk
      FOREIGN KEY (tenant_id, requested_by) REFERENCES public.profiles(tenant_id, user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'approval_decisions_request_tenant_fk') THEN
    ALTER TABLE public.approval_decisions ADD CONSTRAINT approval_decisions_request_tenant_fk
      FOREIGN KEY (tenant_id, approval_request_id) REFERENCES public.approval_requests(tenant_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'approval_decisions_approver_tenant_fk') THEN
    ALTER TABLE public.approval_decisions ADD CONSTRAINT approval_decisions_approver_tenant_fk
      FOREIGN KEY (tenant_id, approver_id) REFERENCES public.profiles(tenant_id, user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.workflow_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workflow_type text NOT NULL,
  title text NOT NULL,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  initiating_department_id uuid NOT NULL REFERENCES public.departments(id),
  owner_id text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'blocked', 'completed', 'cancelled')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.workflow_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES public.workflow_instances(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  from_department_id uuid REFERENCES public.departments(id),
  to_department_id uuid NOT NULL REFERENCES public.departments(id),
  assigned_owner_id text,
  required_deliverables jsonb NOT NULL DEFAULT '[]'::jsonb,
  dependencies text[] NOT NULL DEFAULT '{}'::text[],
  deadline timestamptz,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'in_progress', 'submitted', 'approved', 'returned', 'blocked', 'cancelled')),
  submitted_by text,
  submitted_at timestamptz,
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  deliverable jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, step_key)
);

CREATE INDEX IF NOT EXISTS workflow_instances_tenant_status_idx
  ON public.workflow_instances(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS workflow_handoffs_queue_idx
  ON public.workflow_handoffs(tenant_id, to_department_id, status, deadline);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_instances_tenant_id_id_unique
  ON public.workflow_instances(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_handoffs_tenant_id_id_unique
  ON public.workflow_handoffs(tenant_id, id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_instances_owner_tenant_fk') THEN
    ALTER TABLE public.workflow_instances ADD CONSTRAINT workflow_instances_owner_tenant_fk
      FOREIGN KEY (tenant_id, owner_id) REFERENCES public.profiles(tenant_id, user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_instances_department_tenant_fk') THEN
    ALTER TABLE public.workflow_instances ADD CONSTRAINT workflow_instances_department_tenant_fk
      FOREIGN KEY (tenant_id, initiating_department_id) REFERENCES public.departments(tenant_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_handoffs_to_department_tenant_fk') THEN
    ALTER TABLE public.workflow_handoffs ADD CONSTRAINT workflow_handoffs_to_department_tenant_fk
      FOREIGN KEY (tenant_id, to_department_id) REFERENCES public.departments(tenant_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_handoffs_workflow_tenant_fk') THEN
    ALTER TABLE public.workflow_handoffs ADD CONSTRAINT workflow_handoffs_workflow_tenant_fk
      FOREIGN KEY (tenant_id, workflow_id)
      REFERENCES public.workflow_instances(tenant_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_handoffs_from_department_tenant_fk') THEN
    ALTER TABLE public.workflow_handoffs ADD CONSTRAINT workflow_handoffs_from_department_tenant_fk
      FOREIGN KEY (tenant_id, from_department_id) REFERENCES public.departments(tenant_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_handoffs_assignee_tenant_fk') THEN
    ALTER TABLE public.workflow_handoffs ADD CONSTRAINT workflow_handoffs_assignee_tenant_fk
      FOREIGN KEY (tenant_id, assigned_owner_id) REFERENCES public.profiles(tenant_id, user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_handoffs_submitter_tenant_fk') THEN
    ALTER TABLE public.workflow_handoffs ADD CONSTRAINT workflow_handoffs_submitter_tenant_fk
      FOREIGN KEY (tenant_id, submitted_by) REFERENCES public.profiles(tenant_id, user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_handoffs_reviewer_tenant_fk') THEN
    ALTER TABLE public.workflow_handoffs ADD CONSTRAINT workflow_handoffs_reviewer_tenant_fk
      FOREIGN KEY (tenant_id, reviewed_by) REFERENCES public.profiles(tenant_id, user_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.validate_workflow_tenant_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.event_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.events e WHERE e.id = NEW.event_id AND e.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'workflow event is outside tenant';
  END IF;
  IF NEW.project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = NEW.project_id AND p.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'workflow project is outside tenant';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS workflow_instances_validate_tenant ON public.workflow_instances;
CREATE TRIGGER workflow_instances_validate_tenant
  BEFORE INSERT OR UPDATE OF tenant_id, event_id, project_id
  ON public.workflow_instances
  FOR EACH ROW EXECUTE FUNCTION public.validate_workflow_tenant_links();

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS request_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS approval_request_id uuid REFERENCES public.approval_requests(id),
  ADD COLUMN IF NOT EXISTS expenditure_group_key text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_approval_request_tenant_fk') THEN
    ALTER TABLE public.expenses ADD CONSTRAINT expenses_approval_request_tenant_fk
      FOREIGN KEY (tenant_id, approval_request_id)
      REFERENCES public.approval_requests(tenant_id, id);
  END IF;
END $$;

-- Bring existing undecided expenses under the shared approval engine.
INSERT INTO public.approval_requests (
  tenant_id, policy_key, resource_type, resource_id, resource_version,
  requested_by, required_approvals, request_snapshot, reason
)
SELECT
  e.tenant_id,
  CASE
    WHEN COALESCE((t.settings->'dual_head_approval'->>'require_dual_on_budget')::boolean, true)
      AND e.amount >= COALESCE((t.settings->'dual_head_approval'->>'budget_threshold')::numeric, 10000)
      THEN 'finance.dual_head'
    ELSE 'expense.standard'
  END,
  'expense', e.id::text, e.request_version, e.created_by,
  CASE
    WHEN COALESCE((t.settings->'dual_head_approval'->>'require_dual_on_budget')::boolean, true)
      AND e.amount >= COALESCE((t.settings->'dual_head_approval'->>'budget_threshold')::numeric, 10000)
      THEN 2
    ELSE 1
  END,
  jsonb_build_object(
    'proposerId', e.created_by,
    'amount', e.amount,
    'departmentId', e.department_id,
    'note', e.note
  ),
  'Migrated pending expense'
FROM public.expenses e
JOIN public.tenants t ON t.id = e.tenant_id
WHERE e.status = 'proposed'
ON CONFLICT (tenant_id, resource_type, resource_id, resource_version, policy_key) DO NOTHING;

UPDATE public.expenses e
SET approval_request_id = ar.id
FROM public.approval_requests ar
WHERE ar.tenant_id = e.tenant_id
  AND ar.resource_type = 'expense'
  AND ar.resource_id = e.id::text
  AND ar.resource_version = e.request_version
  AND e.approval_request_id IS NULL;

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS ip_address inet,
  ADD COLUMN IF NOT EXISTS authorization_context jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.prevent_governance_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_TABLE_NAME = 'audit_logs'
     AND TG_OP = 'DELETE'
     AND current_setting('app.audit_retention_prune', true) = '1' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_logs', 'event_status_history', 'approval_decisions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_append_only ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_append_only BEFORE UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.prevent_governance_history_mutation()', t, t
    );
  END LOOP;
END $$;

CREATE SCHEMA IF NOT EXISTS loom_private;
REVOKE ALL ON SCHEMA loom_private FROM PUBLIC;
GRANT USAGE ON SCHEMA loom_private TO loom_app;

CREATE OR REPLACE FUNCTION loom_private.prune_audit_logs_before(cutoff timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF cutoff IS NULL OR cutoff > pg_catalog.now() - interval '365 days' THEN
    RAISE EXCEPTION 'audit retention cutoff must be at least 365 days old';
  END IF;
  PERFORM pg_catalog.set_config('app.audit_retention_prune', '1', true);
  DELETE FROM public.audit_logs WHERE created_at < cutoff;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
REVOKE ALL ON FUNCTION loom_private.prune_audit_logs_before(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION loom_private.prune_audit_logs_before(timestamptz) TO loom_app;
REVOKE DELETE ON public.audit_logs FROM loom_app;

-- Status history must outlive its resource; deleting an event with governance
-- history is intentionally refused. Archive the event instead.
ALTER TABLE public.event_status_history
  DROP CONSTRAINT IF EXISTS event_status_history_event_id_fkey;
ALTER TABLE public.event_status_history
  ADD CONSTRAINT event_status_history_event_id_fkey
  FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE RESTRICT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_status_history_event_tenant_fk') THEN
    ALTER TABLE public.event_status_history ADD CONSTRAINT event_status_history_event_tenant_fk
      FOREIGN KEY (tenant_id, event_id) REFERENCES public.events(tenant_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_status_history_actor_tenant_fk') THEN
    ALTER TABLE public.event_status_history ADD CONSTRAINT event_status_history_actor_tenant_fk
      FOREIGN KEY (tenant_id, performed_by) REFERENCES public.profiles(tenant_id, user_id);
  END IF;
END $$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'approval_policies', 'approval_requests', 'approval_decisions',
    'workflow_instances', 'workflow_handoffs'
  ] LOOP
    BEGIN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t); EXCEPTION WHEN OTHERS THEN NULL; END;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO loom_app', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_policy ON public.%I FOR ALL '
      'USING (tenant_id::text = current_setting(''app.tenant_id'', true)) '
      'WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))', t
    );
  END LOOP;
END $$;
