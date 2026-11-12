-- 070_finance_hardening: budget ownership, receipt metadata, payout state.
--
-- WHY THIS EXISTS
-- A department lead could charge a budget head they did not hold: heads had no
-- department, so the only scope check was vertical-or-department on the expense
-- row, not on the budget being spent. Heads now optionally belong to a
-- department; the API requires the proposer to lead that department (or its
-- vertical) before accepting the charge.
--
-- Money also stopped at `approved`, which cannot answer "was it paid?".
-- `paid` is a terminal state with paid_at/paid_by, and receipts keep the
-- uploaded object's metadata (bytes stay in the private loom-files bucket).

ALTER TABLE public.budget_heads
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS budget_heads_tenant_department_idx
  ON public.budget_heads(tenant_id, department_id);

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS receipt_path text,
  ADD COLUMN IF NOT EXISTS receipt_name text,
  ADD COLUMN IF NOT EXISTS receipt_mime text,
  ADD COLUMN IF NOT EXISTS receipt_size integer,
  ADD COLUMN IF NOT EXISTS receipt_uploaded_by text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_by text;

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_status_check;
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_status_check
  CHECK (status IN ('proposed', 'approved', 'rejected', 'paid'));

ALTER TABLE public.sponsorships
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by text;
