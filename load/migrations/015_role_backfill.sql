-- 015_role_backfill: retire the mentor role value.
--
-- Mentorship is capability (approved application + mentor bar), not a role.
-- Every legacy 'mentor' becomes 'core' (Core Member). Idempotent: only rows
-- still carrying the old value move. Ships with lib/permissions.js + the new
-- lib/auth.js hierarchy so no request ever lands between the two models.
UPDATE public.profiles SET role = 'core', updated_at = NOW() WHERE role = 'mentor';
