-- 064_username_change_limits: make username changes accountable.
--
-- WHY THIS EXISTS
--
-- `user_profiles_username_key` kept names unique but nothing stopped a member
-- from renaming daily, which erases the identity peers and mentors rely on and
-- lets someone cycle handles to dodge a reputation history. The API now
-- enforces a 30-day cooldown and a lifetime cap; these columns are the durable
-- state those checks read.
--
-- The count records completed changes only, so creating the first public card
-- does not consume a change. Idempotent throughout.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS username_changed_at timestamptz;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS username_change_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_username_change_count_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_username_change_count_check
  CHECK (username_change_count >= 0);
