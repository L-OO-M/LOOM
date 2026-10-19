-- 044_event_ops_reminders: dedupe marker for the deadline reminder job.
--
-- `event_ops_tasks` gained the reminder job after 043 was applied, and the job
-- needs to know it has already warned about a task so a worker that runs hourly
-- does not send the same nudge twelve times a day. `reminded_at` is that marker;
-- the job sets it after a successful notification, and clears it whenever
-- `due_at` moves so a rescheduled task can be announced again.
--
-- Additive and idempotent (AGENTS.md iron rule 6). No RLS change: the column
-- lives on a table whose policy is already fail-closed (043).

ALTER TABLE public.event_ops_tasks
  ADD COLUMN IF NOT EXISTS reminded_at timestamptz;
