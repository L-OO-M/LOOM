-- 017_lead_console: what Heads, Co-Heads, and Vertical Leads act on.
--
-- succession_ready: either Head/Co-Head flags a Core Member as a future
-- lead (Vertical Lead dashboard reads the gaps). events.department_id ties
-- workshops to their department; status gains 'proposed' so a dept-level
-- society-wide post waits in the Vertical Lead approval queue instead of
-- going live (permissions note needs_approval, made concrete).
ALTER TABLE public.department_memberships
  ADD COLUMN IF NOT EXISTS succession_ready boolean NOT NULL DEFAULT false;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS events_department_idx ON public.events(department_id);

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_status_check
  CHECK (status IN ('upcoming', 'live', 'past', 'cancelled', 'proposed'));
