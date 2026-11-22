-- Deadline intelligence and blocked-work context for department tasks.
--
-- Append-only. Everything here is additive: four nullable columns, two partial
-- indexes, and one constraint that only applies while a task is blocked.
--
-- Why two reminder stamps instead of one `reminded_at`:
--   due_soon_reminded_at -- "this is due in two days". Sent once, before the
--                           deadline, so the assignee can still act.
--   overdue_notified_at  -- "this is late". Sent once, after the deadline, and
--                           to a different audience (the head as well).
-- One column cannot express both: a task reminded at T-2 must still be able to
-- fire the overdue notice at T+1, and a task whose deadline is extended must
-- re-arm both. Both are cleared whenever due_at changes (see the task PATCH
-- route), which is the only correct way to re-arm them.
--
-- Blocked work needs a reason and a category because "blocked" on its own is
-- not information: a head cannot tell whether to unblock access, chase a
-- person, or narrow the scope. The category is a closed list so the queue can
-- group by it later without free-text archaeology.

ALTER TABLE public.department_tasks
  ADD COLUMN IF NOT EXISTS due_soon_reminded_at timestamptz,
  ADD COLUMN IF NOT EXISTS overdue_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_reason text,
  ADD COLUMN IF NOT EXISTS blocked_category text;

-- Closed vocabulary, nullable so every existing (and every non-blocked) row is
-- valid without a backfill.
ALTER TABLE public.department_tasks
  DROP CONSTRAINT IF EXISTS department_tasks_blocked_category_check;
ALTER TABLE public.department_tasks
  ADD CONSTRAINT department_tasks_blocked_category_check
  CHECK (
    blocked_category IS NULL
    OR blocked_category IN (
      'waiting_on_person',
      'waiting_on_access',
      'waiting_on_dependency',
      'unclear_scope',
      'external'
    )
  );

-- A blocked task without a reason is a dead end: the next person to open it has
-- to guess. Enforced in the database as well as the API so a future writer
-- cannot reintroduce the silent block.
ALTER TABLE public.department_tasks
  DROP CONSTRAINT IF EXISTS department_tasks_blocked_reason_check;
ALTER TABLE public.department_tasks
  ADD CONSTRAINT department_tasks_blocked_reason_check
  CHECK (status <> 'blocked' OR length(btrim(coalesce(blocked_reason, ''))) > 0);

-- Sweep indexes. The reminder job asks exactly two questions -- "due soon and
-- not yet reminded", "overdue and not yet notified" -- so both are partial
-- indexes over only the rows that can still fire. A completed or already
-- reminded task drops out of the index instead of bloating it.
CREATE INDEX IF NOT EXISTS department_tasks_due_soon_idx
  ON public.department_tasks(tenant_id, due_at)
  WHERE is_active
    AND status IN ('assigned', 'in_progress', 'blocked')
    AND due_at IS NOT NULL
    AND due_soon_reminded_at IS NULL;

CREATE INDEX IF NOT EXISTS department_tasks_overdue_idx
  ON public.department_tasks(tenant_id, due_at)
  WHERE is_active
    AND status IN ('assigned', 'in_progress', 'blocked')
    AND due_at IS NOT NULL
    AND overdue_notified_at IS NULL;
