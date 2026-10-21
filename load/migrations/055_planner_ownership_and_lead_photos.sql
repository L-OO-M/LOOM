-- 055_planner_ownership_and_lead_photos: planner handover + lead/head photos.
--
-- Two small, additive changes that finish the Collective Planner:
--
-- 1. `planner_sessions.owner_user_id` — the member accountable for a session.
--    The planner is shared by everyone at lead level and above; when a lead
--    leaves, an admin (or a vertical lead) reassigns their rows to the successor
--    in one move instead of editing the calendar week by week.
--
-- 2. `lead_directory.photo_url` — the photo shown for a lead or head. It lives
--    on the directory entry (not on the account) so a past holder, a faculty
--    advisor or a partner can be shown without an account. Account-linked
--    entries fall back to `user_profiles.avatar_url`, which is now writable
--    only for lead-and-above roles.
--
-- Additive and idempotent; every column is nullable so existing rows are
-- unchanged.

ALTER TABLE public.planner_sessions
  ADD COLUMN IF NOT EXISTS owner_user_id uuid;

COMMENT ON COLUMN public.planner_sessions.owner_user_id IS
  'Accountable member for this session. NULL = unassigned. Reassigned on handover.';

CREATE INDEX IF NOT EXISTS planner_sessions_owner_idx
  ON public.planner_sessions (tenant_id, owner_user_id);

ALTER TABLE public.lead_directory
  ADD COLUMN IF NOT EXISTS photo_url text;

COMMENT ON COLUMN public.lead_directory.photo_url IS
  'Public photo for this lead/head. Falls back to user_profiles.avatar_url when account-linked.';
