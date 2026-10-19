-- Endorsement controls for the profile owner.
--
-- The security report found there was no way for a member to remove an abusive
-- endorsement they had received, nor to opt out of showing endorsements at all.
-- Individual endorsements can already be deleted by their recipient (no schema
-- change); this adds the field that powers the "hide endorsements" opt-out.
--
-- Additive and idempotent, per AGENTS.md iron rule 6.
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS endorsements_visible boolean NOT NULL DEFAULT true;
