-- 016_announcements_contributions: broadcast + the contribution ledger.
--
-- announcements: society | vertical | department scoped broadcasts. Dept
-- Heads post to their own feed only (enforced in the API via
-- lib/permissions.js post_announcement=own_feed); delivery fans out into
-- the existing per-user notifications table, so no new inbox is needed.
-- member_contributions: the plan's contribution log (section 5.3/5.4) — the
-- single data source for certificates, department reports, and the annual
-- report. Self-logged rows carry logged_by = student_id; lead-logged rows
-- carry the lead's id (API-enforced via log_contribution). OSS proof stays
-- in student_oss_contributions; kind here covers everything else.
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'society',
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  vertical text,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  author_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT announcements_scope_check CHECK (scope IN ('society', 'vertical', 'department'))
);
CREATE INDEX IF NOT EXISTS announcements_tenant_idx
  ON public.announcements(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS announcements_scope_idx
  ON public.announcements(department_id, vertical);

CREATE TABLE IF NOT EXISTS public.member_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'project',
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  evidence_url text,
  logged_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_contributions_kind_check CHECK (kind IN ('project', 'competition', 'certification', 'event'))
);
CREATE INDEX IF NOT EXISTS member_contrib_student_idx
  ON public.member_contributions(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS member_contrib_dept_idx
  ON public.member_contributions(department_id, created_at DESC);
