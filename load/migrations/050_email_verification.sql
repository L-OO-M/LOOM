-- 050_email_verification: optional, provider-agnostic email verification.
--
-- Why this table exists at all:
--   - A college-email allowlist was rejected. Many colleges never issue student
--     addresses, and the product is meant to grow into a cross-college
--     community, so gating access on a domain would exclude the people it is
--     for.
--   - Supabase's built-in confirmation email depends on its shared SMTP, whose
--     rate limit is not viable in production. Turning that on would make signup
--     fail unpredictably.
--
-- So verification is a TRUST SIGNAL, not a gate. Accounts work unverified. When
-- a transactional email provider is configured, a member can prove control of
-- their address; the result is recorded on the profile and shown honestly.
--
-- Tokens are stored hashed (SHA-256) so a database read cannot be replayed as a
-- verification link. Each token is single-use and expires.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_verification_source text;

CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  tenant_id uuid,
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_verification_tokens_user_idx
  ON public.email_verification_tokens (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS email_verification_tokens_expiry_idx
  ON public.email_verification_tokens (expires_at)
  WHERE used_at IS NULL;
