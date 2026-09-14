-- 013_mentor_applications: the generational cycle, made concrete.
--
-- The PDF's core promise: a member's ultimate goal is to mentor the next
-- intake. Applications carry an eligibility snapshot computed from evidence
-- (roadmap completion, verified OSS, forum solutions, shipped projects) so
-- reviewers judge proof, not promises. One pending application per student.
CREATE TABLE IF NOT EXISTS public.mentor_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id),
  statement text NOT NULL DEFAULT '',
  expertise text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  eligibility jsonb NOT NULL DEFAULT '{}',
  reviewer_id text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mentor_applications_one_pending_idx
  ON public.mentor_applications(student_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS mentor_applications_tenant_idx
  ON public.mentor_applications(tenant_id, status, created_at DESC);
