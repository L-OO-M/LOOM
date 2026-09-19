-- 021_head_retention_cleanup: idempotent repair for promotion/demotion drift.
--
-- Fixes two classes of drift that accumulate when role changes bypass
-- membership sync (e.g. legacy bulk path, manual SQL):
--   1) Stale vertical scope on demoted vertical leads.
--   2) Orphaned dept_lead memberships where the profile no longer holds a
--      leading role. Downgrade is to 'core' (not 'general') to preserve
--      engagement history (Q1 approved default).
-- Idempotent: safe to re-run. No destructive drops.
-- Clear vertical on any profile that is no longer vertical_lead.
UPDATE public.profiles
SET vertical = NULL, updated_at = NOW()
WHERE role <> 'vertical_lead' AND vertical IS NOT NULL;

-- Downgrade orphaned dept_lead memberships to core where the owner no longer
-- holds a leading role. Keeps the department join, drops the capability.
UPDATE public.department_memberships m
SET level = 'core'
FROM public.profiles p
WHERE m.user_id = p.user_id
  AND m.level = 'dept_lead'
  AND p.role NOT IN ('dept_lead', 'vertical_lead', 'admin', 'platform_admin');
