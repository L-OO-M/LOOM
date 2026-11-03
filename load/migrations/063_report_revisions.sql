-- 063_report_revisions: keep every filed version of a department report.
--
-- WHY THIS EXISTS
--
-- `dept_reports` is immutable once submitted, but a draft is recompiled and an
-- admin can reopen a filed report. Both paths used to overwrite `draft` in
-- place, so the version that was actually submitted could be lost. This table
-- stores one snapshot per write, keyed by a monotonic revision number.
--
-- The write path reads `MAX(revision) + 1` in the same statement as the insert;
-- `(report_id, revision)` is unique so a race fails loudly instead of silently
-- rewriting history. Rows are append-only: neither the app nor a migration
-- updates them.
--
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS public.report_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.dept_reports(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  revision integer NOT NULL CHECK (revision > 0),
  status text NOT NULL,
  draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS report_revisions_report_revision_unique
  ON public.report_revisions (report_id, revision);

CREATE INDEX IF NOT EXISTS report_revisions_tenant_idx
  ON public.report_revisions (tenant_id, created_at DESC);

COMMENT ON TABLE public.report_revisions IS
  'Append-only snapshots of dept_reports on every compile/edit/submit. The unique (report_id, revision) key makes a concurrent history write fail instead of overwriting a version.';
