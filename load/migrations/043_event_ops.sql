-- 043_event_ops: the operations board for running events to a deadline.
--
-- One row per operational task attached to an event (or to the chapter in
-- general, when event_id is NULL): "book the auditorium", "print posters",
-- "collect reimbursement". This is what turns an event from a calendar entry
-- into a checklist someone owns and finishes by a date.
--
-- The P5 reminder job scans status <> 'done' AND due_at near, so the index
-- below leads with the columns that scan uses.
--
-- Additive and idempotent (AGENTS.md iron rule 6). Fail-closed RLS in the same
-- style and order as migrations 031/040/041/042.

CREATE TABLE IF NOT EXISTS public.event_ops_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  title text NOT NULL,
  detail text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'checklist',
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'todo',
  owner_id text REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  due_at timestamptz,
  done_at timestamptz,
  done_by text,
  created_by text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_ops_kind_check CHECK (
    kind IN ('checklist', 'logistics', 'venue', 'marketing', 'finance', 'volunteers', 'other')
  ),
  CONSTRAINT event_ops_priority_check CHECK (priority IN ('low', 'medium', 'high')),
  CONSTRAINT event_ops_status_check CHECK (status IN ('todo', 'in_progress', 'blocked', 'done'))
);
CREATE INDEX IF NOT EXISTS event_ops_tenant_idx
  ON public.event_ops_tasks(tenant_id, is_active, status, due_at);
CREATE INDEX IF NOT EXISTS event_ops_event_idx
  ON public.event_ops_tasks(tenant_id, event_id);
CREATE INDEX IF NOT EXISTS event_ops_owner_idx
  ON public.event_ops_tasks(tenant_id, owner_id);

-- Fail-closed RLS, mirroring migrations 031/040/041/042. NULL tenant_id is
-- never a legitimate state here, so there is no "allow unset" arm.
DO $$
DECLARE
  t text;
  new_tables text[] := ARRAY['event_ops_tasks'];
BEGIN
  FOREACH t IN ARRAY new_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY tenant_isolation_policy ON public.%I AS PERMISSIVE
           FOR ALL
           USING (tenant_id::text = current_setting(''app.tenant_id'', true))
           WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))', t);
    END IF;
  END LOOP;
END $$;
