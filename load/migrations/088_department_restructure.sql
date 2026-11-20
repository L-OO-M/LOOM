-- 088_department_restructure: restructure departments per 2025 org audit
--
-- Changes:
--   Technical: remove backend, devops (become shared domains only)
--   Non-technical: split pr_outreach into smm_content, publicity, public_relations
--                rename sponsorship_evm -> sponsorship
--                add documentation, management
--   Total: 13 departments (6 technical, 7 non-technical)

-- Remove departments that are now shared domains only
-- Members will be migrated to appropriate departments in the data migration below
DELETE FROM public.departments
WHERE slug IN ('backend', 'devops', 'pr_outreach')
  AND tenant_id IN (SELECT id FROM public.tenants);

-- Rename sponsorship_evm to sponsorship
UPDATE public.departments
SET name = 'Sponsorship', description = 'Sponsor pipeline, outreach, proposals, commitments, deliverables, sponsorship agreements.'
WHERE slug = 'sponsorship_evm';

-- Add new non-technical departments
INSERT INTO public.departments (tenant_id, name, slug, vertical, description, is_active)
SELECT t.id, d.name, d.slug, d.vertical, d.description, true
FROM public.tenants t
CROSS JOIN LATERAL (VALUES
  ('Documentation', 'documentation', 'non_technical', 'Event records, reports, minutes, budgets, post-event analysis, official documentation templates.'),
  ('SMM & Content Creation', 'smm_content', 'non_technical', 'Social media content calendars, video editing, photography, reels, content archives, publishing workflows.'),
  ('Publicity', 'publicity', 'non_technical', 'Promotional campaigns, event awareness, campus presence, campaign effectiveness tracking, distribution coordination.'),
  ('Management', 'management', 'non_technical', 'Event execution, logistics, task assignment, interdepartmental coordination, schedules, event-day operations.'),
  ('Public Relations', 'public_relations', 'non_technical', 'External institutional contacts, outreach records, collaborations, partnerships, external communication follow-ups.')
) AS d(name, slug, vertical, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.departments d2
  WHERE d2.tenant_id = t.id AND d2.slug = d.slug
);

-- Data migration: move members from removed departments to appropriate new ones
-- backend, devops members -> web (closest technical domain)
-- pr_outreach members -> publicity (default; admins can reassign)
DO $$
DECLARE
  tenant_rec RECORD;
  web_dept_id uuid;
  publicity_dept_id uuid;
BEGIN
  FOR tenant_rec IN SELECT id FROM public.tenants LOOP
    -- Find web department for this tenant
    SELECT id INTO web_dept_id
    FROM public.departments
    WHERE tenant_id = tenant_rec.id AND slug = 'web'
    LIMIT 1;

    -- Find publicity department for this tenant
    SELECT id INTO publicity_dept_id
    FROM public.departments
    WHERE tenant_id = tenant_rec.id AND slug = 'publicity'
    LIMIT 1;

    -- Migrate backend members
    IF web_dept_id IS NOT NULL THEN
      UPDATE public.department_memberships dm
      SET department_id = web_dept_id
      FROM public.departments d
      WHERE dm.department_id = d.id
        AND d.tenant_id = tenant_rec.id
        AND d.slug = 'backend';
    END IF;

    -- Migrate devops members
    IF web_dept_id IS NOT NULL THEN
      UPDATE public.department_memberships dm
      SET department_id = web_dept_id
      FROM public.departments d
      WHERE dm.department_id = d.id
        AND d.tenant_id = tenant_rec.id
        AND d.slug = 'devops';
    END IF;

    -- Migrate pr_outreach members
    IF publicity_dept_id IS NOT NULL THEN
      UPDATE public.department_memberships dm
      SET department_id = publicity_dept_id
      FROM public.departments d
      WHERE dm.department_id = d.id
        AND d.tenant_id = tenant_rec.id
        AND d.slug = 'pr_outreach';
    END IF;
  END LOOP;
END $$;

-- Update events that reference removed departments
-- backend, devops -> web; pr_outreach -> publicity
DO $$
DECLARE
  tenant_rec RECORD;
  web_dept_id uuid;
  publicity_dept_id uuid;
BEGIN
  FOR tenant_rec IN SELECT id FROM public.tenants LOOP
    SELECT id INTO web_dept_id
    FROM public.departments
    WHERE tenant_id = tenant_rec.id AND slug = 'web'
    LIMIT 1;

    SELECT id INTO publicity_dept_id
    FROM public.departments
    WHERE tenant_id = tenant_rec.id AND slug = 'publicity'
    LIMIT 1;

    IF web_dept_id IS NOT NULL THEN
      UPDATE public.events
      SET department_id = web_dept_id
      WHERE tenant_id = tenant_rec.id
        AND department_id IN (
          SELECT id FROM public.departments WHERE tenant_id = tenant_rec.id AND slug IN ('backend', 'devops')
        );
    END IF;

    IF publicity_dept_id IS NOT NULL THEN
      UPDATE public.events
      SET department_id = publicity_dept_id
      WHERE tenant_id = tenant_rec.id
        AND department_id IN (
          SELECT id FROM public.departments WHERE tenant_id = tenant_rec.id AND slug = 'pr_outreach'
        );
    END IF;
  END LOOP;
END $$;

-- Update member_contributions for removed departments
DO $$
DECLARE
  tenant_rec RECORD;
  web_dept_id uuid;
  publicity_dept_id uuid;
BEGIN
  FOR tenant_rec IN SELECT id FROM public.tenants LOOP
    SELECT id INTO web_dept_id
    FROM public.departments
    WHERE tenant_id = tenant_rec.id AND slug = 'web'
    LIMIT 1;

    SELECT id INTO publicity_dept_id
    FROM public.departments
    WHERE tenant_id = tenant_rec.id AND slug = 'publicity'
    LIMIT 1;

    IF web_dept_id IS NOT NULL THEN
      UPDATE public.member_contributions
      SET department_id = web_dept_id
      WHERE tenant_id = tenant_rec.id
        AND department_id IN (
          SELECT id FROM public.departments WHERE tenant_id = tenant_rec.id AND slug IN ('backend', 'devops')
        );
    END IF;

    IF publicity_dept_id IS NOT NULL THEN
      UPDATE public.member_contributions
      SET department_id = publicity_dept_id
      WHERE tenant_id = tenant_rec.id
        AND department_id IN (
          SELECT id FROM public.departments WHERE tenant_id = tenant_rec.id AND slug = 'pr_outreach'
        );
    END IF;
  END LOOP;
END $$;

-- Update dept_reports for removed departments
DO $$
DECLARE
  tenant_rec RECORD;
  web_dept_id uuid;
  publicity_dept_id uuid;
BEGIN
  FOR tenant_rec IN SELECT id FROM public.tenants LOOP
    SELECT id INTO web_dept_id
    FROM public.departments
    WHERE tenant_id = tenant_rec.id AND slug = 'web'
    LIMIT 1;

    SELECT id INTO publicity_dept_id
    FROM public.departments
    WHERE tenant_id = tenant_rec.id AND slug = 'publicity'
    LIMIT 1;

    IF web_dept_id IS NOT NULL THEN
      UPDATE public.dept_reports
      SET department_id = web_dept_id
      WHERE tenant_id = tenant_rec.id
        AND department_id IN (
          SELECT id FROM public.departments WHERE tenant_id = tenant_rec.id AND slug IN ('backend', 'devops')
        );
    END IF;

    IF publicity_dept_id IS NOT NULL THEN
      UPDATE public.dept_reports
      SET department_id = publicity_dept_id
      WHERE tenant_id = tenant_rec.id
        AND department_id IN (
          SELECT id FROM public.departments WHERE tenant_id = tenant_rec.id AND slug = 'pr_outreach'
        );
    END IF;
  END LOOP;
END $$;