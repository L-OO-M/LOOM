-- 071_mou_renewals: turn an approaching expiry into an owned task.
--
-- A MoU already carried ends_on and a sponsor partner name, but nothing linked
-- it to the sponsorship ledger and nothing recorded who was chasing renewal.
-- One open renewal task per MoU keeps the attention queue actionable: owner,
-- next action, due date, and an audited close.

ALTER TABLE public.mous
  ADD COLUMN IF NOT EXISTS sponsorship_id uuid REFERENCES public.sponsorships(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS mous_tenant_sponsorship_idx
  ON public.mous(tenant_id, sponsorship_id);

CREATE TABLE IF NOT EXISTS public.mou_renewal_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  mou_id uuid NOT NULL REFERENCES public.mous(id) ON DELETE CASCADE,
  owner_id text NOT NULL,
  next_action text NOT NULL,
  due_on date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_by text,
  closed_at timestamptz
);
CREATE INDEX IF NOT EXISTS mou_renewal_tasks_tenant_idx
  ON public.mou_renewal_tasks(tenant_id, status, due_on);
CREATE UNIQUE INDEX IF NOT EXISTS mou_renewal_tasks_one_open
  ON public.mou_renewal_tasks(mou_id) WHERE status = 'open';

ALTER TABLE public.mou_renewal_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mou_renewal_tasks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.mou_renewal_tasks;
CREATE POLICY tenant_isolation_policy ON public.mou_renewal_tasks
  AS PERMISSIVE FOR ALL
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
