CREATE TABLE IF NOT EXISTS public.lead_handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  from_user_id text NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  to_user_id text NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  role text NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  vertical text,
  brief jsonb NOT NULL DEFAULT '{}'::jsonb,
  transfer_planner boolean NOT NULL DEFAULT true,
  transfer_event_ops boolean NOT NULL DEFAULT true,
  transfer_head_slot boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'draft',
  review_note text NOT NULL DEFAULT '',
  created_by text NOT NULL,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by text,
  completed_at timestamptz,
  completed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_handovers_role_check CHECK (role IN ('dept_lead', 'vertical_lead', 'admin')),
  CONSTRAINT lead_handovers_vertical_check CHECK (vertical IS NULL OR vertical IN ('technical', 'non_technical')),
  CONSTRAINT lead_handovers_status_check CHECK (status IN ('draft', 'submitted', 'completed', 'cancelled', 'rejected')),
  CONSTRAINT lead_handovers_distinct_users_check CHECK (from_user_id <> to_user_id),
  CONSTRAINT lead_handovers_brief_object_check CHECK (jsonb_typeof(brief) = 'object')
);

CREATE INDEX IF NOT EXISTS lead_handovers_tenant_idx
  ON public.lead_handovers(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_handovers_from_idx
  ON public.lead_handovers(tenant_id, from_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_handovers_to_idx
  ON public.lead_handovers(tenant_id, to_user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS lead_handovers_one_open_per_from
  ON public.lead_handovers(tenant_id, from_user_id)
  WHERE status IN ('draft', 'submitted');

ALTER TABLE public.lead_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_handovers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.lead_handovers;
CREATE POLICY tenant_isolation_policy ON public.lead_handovers AS PERMISSIVE
  FOR ALL
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
