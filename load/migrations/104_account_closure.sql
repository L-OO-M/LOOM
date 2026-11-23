-- Self-service account closure.
--
-- "Close my account" must not erase the chapter's ledger. Work, contributions
-- and audit rows keep their meaning only while the id they point at exists, so a
-- closure marks the profile deactivated, strips the identifying fields, removes
-- the public card and the GitHub link, and leaves the id as the stable key.
--
-- The columns below record WHEN and WHY a person left. Without them an admin
-- reviewing a deactivated account sees a state but no story, and a member who
-- comes back cannot be told what happened.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_reason text;

-- Closures are rare and always read by closing date, so a partial index keeps
-- the ordinary "active roster" scan untouched.
CREATE INDEX IF NOT EXISTS profiles_tenant_closed_idx
  ON public.profiles (tenant_id, closed_at)
  WHERE closed_at IS NOT NULL;

COMMENT ON COLUMN public.profiles.closed_at IS
  'When the account holder closed their own account. NULL for accounts closed or suspended by an admin.';
COMMENT ON COLUMN public.profiles.closed_reason IS
  'Optional reason the account holder gave when closing. Visible only to admins.';
