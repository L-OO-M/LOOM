-- 072_announcement_lifecycle: drafts and expiry for the composer.
--
-- The announcements API could only publish immediately, so there was no safe
-- place to draft and review. Existing rows are backfilled as published;
-- students only ever read published, unexpired rows, while authors/admins can
-- read drafts through the manage view.

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by text;

UPDATE public.announcements
SET status = 'published', published_at = COALESCE(published_at, created_at)
WHERE status = 'published' AND published_at IS NULL;

ALTER TABLE public.announcements DROP CONSTRAINT IF EXISTS announcements_status_check;
ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_status_check CHECK (status IN ('draft', 'published'));

CREATE INDEX IF NOT EXISTS announcements_tenant_status_expiry_idx
  ON public.announcements(tenant_id, status, expires_at);
