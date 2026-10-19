-- The original department seed (load/seed-departments.js) shipped the three
-- non-technical verticals — PR & Outreach, Design, Sponsorship & EVM — with
-- is_active = false, on the theory that a chapter activates them once staffed.
-- In practice that hid them from every public surface (/domains, the homepage
-- grid, /api/public/departments all filter on is_active) and buried them in the
-- admin list's collapsed "Archived" panel, so the non-technical half of the
-- chapter had no visible home on the website.
--
-- Activate the seeded non-technical departments for every existing tenant.
-- Scoped by slug AND vertical so a TECHNICAL department an admin intentionally
-- archived is never touched, and bounded to is_active = false so re-running is a
-- no-op. Migrations run once (tracked in schema_migrations), so this cannot
-- re-activate a department an admin archives later.
UPDATE public.departments
   SET is_active = true
 WHERE vertical = 'non_technical'
   AND slug IN ('pr_outreach', 'design', 'sponsorship_evm')
   AND is_active = false;
