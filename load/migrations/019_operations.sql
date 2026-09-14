-- 019_operations: volunteering, monthly reports, handover, and finance.
--
-- volunteer_slots + volunteer_signups: dept leads open titled slots with a
-- capacity on an event; any authenticated member can sign up or cancel
-- (UNIQUE(slot_id, user_id) keeps one seat per member; capacity is enforced
-- in the API against a live count).
-- dept_reports: one row per (department, month). The draft is auto-compiled
-- JSON (contribution counts by kind, events held, new members, upcoming
-- workshops); a dept lead submits draft -> submitted. VL/admin read + export.
-- handover_checklists: admin-owned continuity checklist (done flag).
-- budget_heads + expenses + sponsorships: the finance snapshot. Heads carry
-- an optional vertical (NULL = society-wide); expenses attach to a head
-- and/or department and move proposed -> approved|rejected (admin decides;
-- vertical leads recommend_only via the API, enforced in code).
CREATE TABLE IF NOT EXISTS public.volunteer_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title text NOT NULL,
  capacity integer NOT NULL DEFAULT 10,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT volunteer_slots_capacity_check CHECK (capacity > 0)
);
CREATE INDEX IF NOT EXISTS volunteer_slots_event_idx
  ON public.volunteer_slots(event_id);
CREATE INDEX IF NOT EXISTS volunteer_slots_tenant_idx
  ON public.volunteer_slots(tenant_id);

CREATE TABLE IF NOT EXISTS public.volunteer_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL REFERENCES public.volunteer_slots(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT volunteer_signups_one_seat UNIQUE (slot_id, user_id)
);
CREATE INDEX IF NOT EXISTS volunteer_signups_slot_idx
  ON public.volunteer_signups(slot_id);
CREATE INDEX IF NOT EXISTS volunteer_signups_user_idx
  ON public.volunteer_signups(user_id);

CREATE TABLE IF NOT EXISTS public.dept_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  month date NOT NULL,
  draft jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft',
  submitted_by text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dept_reports_status_check CHECK (status IN ('draft', 'submitted')),
  CONSTRAINT dept_reports_one_per_month UNIQUE (department_id, month)
);
CREATE INDEX IF NOT EXISTS dept_reports_tenant_idx
  ON public.dept_reports(tenant_id, status, month DESC);
CREATE INDEX IF NOT EXISTS dept_reports_dept_idx
  ON public.dept_reports(department_id, month DESC);

CREATE TABLE IF NOT EXISTS public.handover_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  detail text NOT NULL DEFAULT '',
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS handover_checklists_tenant_idx
  ON public.handover_checklists(tenant_id, done);

CREATE TABLE IF NOT EXISTS public.budget_heads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  allocated numeric NOT NULL DEFAULT 0,
  vertical text,
  CONSTRAINT budget_heads_allocated_check CHECK (allocated >= 0),
  CONSTRAINT budget_heads_vertical_check CHECK (vertical IS NULL OR vertical IN ('technical', 'non_technical'))
);
CREATE INDEX IF NOT EXISTS budget_heads_tenant_idx
  ON public.budget_heads(tenant_id);

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  head_id uuid REFERENCES public.budget_heads(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'proposed',
  created_by text NOT NULL,
  decided_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expenses_amount_check CHECK (amount > 0),
  CONSTRAINT expenses_status_check CHECK (status IN ('proposed', 'approved', 'rejected'))
);
CREATE INDEX IF NOT EXISTS expenses_tenant_idx
  ON public.expenses(tenant_id, status);
CREATE INDEX IF NOT EXISTS expenses_head_idx
  ON public.expenses(head_id);

CREATE TABLE IF NOT EXISTS public.sponsorships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pipeline',
  contact text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sponsorships_amount_check CHECK (amount >= 0),
  CONSTRAINT sponsorships_status_check CHECK (status IN ('pipeline', 'committed', 'received'))
);
CREATE INDEX IF NOT EXISTS sponsorships_tenant_idx
  ON public.sponsorships(tenant_id, status);
