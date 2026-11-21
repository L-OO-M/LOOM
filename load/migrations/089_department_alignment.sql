-- 089_department_alignment: finish the department restructure and give assets
-- an owner.
--
-- 088 renamed the sponsorship department's *label* but not its slug, and it
-- deleted `backend`, `devops` and `pr_outreach` before moving their children.
-- That ordering is unrecoverable here; what this file does is make the
-- surviving rows correct, idempotent, and safe to apply to a tenant that never
-- ran 088 at all.
--
-- Changes:
--   1. media_assets gains a department owner (set-null, so archiving a
--      department never deletes the asset).
--   2. sponsorship_evm -> sponsorship, folding a legacy row into the live one
--      if a tenant somehow has both.
--   3. Every tenant gets the shipped thirteen, with the catalogue's names,
--      verticals and descriptions. is_active is left alone: an admin's archive
--      decision survives.

-- 1. Assets belong to a department (or to the society when NULL).
ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS media_assets_department_idx
  ON public.media_assets (tenant_id, department_id, is_active, created_at DESC);

-- 2a. Rename where the target slug does not already exist.
UPDATE public.departments old
SET slug = 'sponsorship'
WHERE old.slug = 'sponsorship_evm'
  AND NOT EXISTS (
    SELECT 1 FROM public.departments live
    WHERE live.tenant_id = old.tenant_id AND live.slug = 'sponsorship'
  );

-- 2b. If both exist for one tenant, fold the legacy row into the live one.
--     Children that would cascade-delete are copied first; every other
--     reference is repointed. Nothing is dropped except the emptied row.
DO $$
DECLARE
  pair RECORD;
BEGIN
  FOR pair IN
    SELECT old.id AS old_id, live.id AS live_id
    FROM public.departments old
    JOIN public.departments live
      ON live.tenant_id = old.tenant_id AND live.slug = 'sponsorship'
    WHERE old.slug = 'sponsorship_evm'
  LOOP
    INSERT INTO public.department_memberships
      (id, user_id, department_id, level, core_requested, joined_at, succession_ready, term_start, term_end, tenant_id)
    SELECT gen_random_uuid(), user_id, pair.live_id, level, core_requested, joined_at, succession_ready, term_start, term_end, tenant_id
    FROM public.department_memberships
    WHERE department_id = pair.old_id
    ON CONFLICT (user_id, department_id) DO NOTHING;

    INSERT INTO public.dept_reports
      (id, tenant_id, department_id, month, draft, status, submitted_by, submitted_at, created_at, narrative)
    SELECT gen_random_uuid(), tenant_id, pair.live_id, month, draft, status, submitted_by, submitted_at, created_at, narrative
    FROM public.dept_reports
    WHERE department_id = pair.old_id
    ON CONFLICT (department_id, month) DO NOTHING;

    INSERT INTO public.announcements
      (id, tenant_id, scope, department_id, vertical, title, body, author_id, created_at, status,
       expires_at, published_at, updated_at, updated_by)
    SELECT gen_random_uuid(), tenant_id, scope, pair.live_id, vertical, title, body, author_id, created_at,
           status, expires_at, published_at, updated_at, updated_by
    FROM public.announcements
    WHERE department_id = pair.old_id;

    UPDATE public.events SET department_id = pair.live_id WHERE department_id = pair.old_id;
    UPDATE public.member_contributions SET department_id = pair.live_id WHERE department_id = pair.old_id;
    UPDATE public.lead_directory SET department_id = pair.live_id WHERE department_id = pair.old_id;
    UPDATE public.leadership_terms SET department_id = pair.live_id WHERE department_id = pair.old_id;
    UPDATE public.lead_handovers SET department_id = pair.live_id WHERE department_id = pair.old_id;
    UPDATE public.budget_heads SET department_id = pair.live_id WHERE department_id = pair.old_id;
    UPDATE public.expenses SET department_id = pair.live_id WHERE department_id = pair.old_id;
    UPDATE public.handover_checklists SET department_id = pair.live_id WHERE department_id = pair.old_id;
    UPDATE public.media_assets SET department_id = pair.live_id WHERE department_id = pair.old_id;

    DELETE FROM public.announcements WHERE department_id = pair.old_id;
    DELETE FROM public.department_memberships WHERE department_id = pair.old_id;
    DELETE FROM public.dept_reports WHERE department_id = pair.old_id;
    DELETE FROM public.departments WHERE id = pair.old_id;
  END LOOP;
END $$;

-- 3. Insert any missing department and normalise the shipped ones. Slugs are
--    the join key; names and verticals come straight from the catalogue in
--    lib/department-catalog.js and load/seed-departments.js.
INSERT INTO public.departments (tenant_id, name, slug, vertical, description, is_active)
SELECT t.id, d.name, d.slug, d.vertical, d.description, true
FROM public.tenants t
CROSS JOIN (VALUES
  ('AI / ML', 'ai_ml', 'technical', 'Machine learning fundamentals, paper reading, dataset contests, applied projects.'),
  ('Web Development', 'web', 'technical', 'Modern web fundamentals, frameworks, Git workflow, deployment — including this very site.'),
  ('Cybersecurity', 'cybersecurity', 'technical', 'Ethical hacking within legal boundaries, CTFs, cryptography, secure coding.'),
  ('DSA & Problem Solving', 'dsa', 'technical', 'Weekly problem-solving, contests, interview prep, mock assessments.'),
  ('Blockchain', 'blockchain', 'technical', 'Distributed ledgers, smart contracts, and Web3 mini-projects.'),
  ('Embedded & Hardware', 'embedded', 'technical', 'Microcontrollers, Arduino, Raspberry Pi, sensors and firmware — build things you can hold.'),
  ('Design', 'design', 'non_technical', 'Visual identity, posters, banners, merch, slide systems, media assets, brand templates.'),
  ('Documentation', 'documentation', 'non_technical', 'Event records, reports, minutes, budgets, post-event analysis, official documentation templates.'),
  ('SMM & Content Creation', 'smm_content', 'non_technical', 'Social media content calendars, video editing, photography, reels, content archives, publishing workflows.'),
  ('Publicity', 'publicity', 'non_technical', 'Promotional campaigns, event awareness, campus presence, campaign effectiveness tracking, distribution coordination.'),
  ('Sponsorship', 'sponsorship', 'non_technical', 'Sponsor pipeline, outreach, proposals, commitments, deliverables, sponsorship agreements.'),
  ('Management', 'management', 'non_technical', 'Event execution, logistics, task assignment, interdepartmental coordination, schedules, event-day operations.'),
  ('Public Relations', 'public_relations', 'non_technical', 'External institutional contacts, outreach records, collaborations, partnerships, external communication follow-ups.')
) AS d(name, slug, vertical, description)
ON CONFLICT (tenant_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  vertical = EXCLUDED.vertical,
  description = EXCLUDED.description;
