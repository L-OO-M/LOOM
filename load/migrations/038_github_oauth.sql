-- 038_github_oauth: repository grants, so ownership is proven rather than asserted.
--
-- WHY THIS EXISTS
--
-- Migration 037 made the ranking ledger trustworthy about *who vouched for* a
-- claim. But one of its own documented limits (docs/20-verified-ranking.md §9)
-- was that repository ownership could still only be ASSERTED: POST /api/projects
-- compared the owner segment of a URL against a handle the student typed in, and
-- a student who claimed a handle they did not control could claim that handle's
-- repositories.
--
-- This migration stores the result of actually asking GitHub. The OAuth exchange
-- happens in the callback (lib/github-oauth.js); what lands here is the durable,
-- auditable result:
--
--   github_connections  -- the account, bound to GitHub's IMMUTABLE numeric id
--   github_repo_grants  -- per repository, what the token could actually do
--
-- WHY github_user_id AND NOT github_username
--
-- A GitHub login is a display name. The user can rename their account at any
-- time, and people DO reuse handles. Binding identity to `login` means a rename
-- or a released handle silently reassigns a student's proof to whoever claims
-- the name next -- the same class of silent misattribution migration 035 was
-- written to close, and the same hole reopened through a different column.
-- `id` is immutable for the life of the account.
--
-- Token storage is AES-256-GCM ciphertext (lib/crypto.js), never plaintext: a
-- database dump or a leaked backup would otherwise hand out live credentials
-- that can read student repositories. The `enc:v1:` prefix carries a key
-- identifier so a key rotation is a detectable, staged migration rather than an
-- unrecoverable loss.
--
-- Idempotent throughout.

-- ---------------------------------------------------------------------------
-- 1. github_connections: the account behind the handle
-- ---------------------------------------------------------------------------
ALTER TABLE public.github_connections ADD COLUMN IF NOT EXISTS github_user_id bigint;
ALTER TABLE public.github_connections ADD COLUMN IF NOT EXISTS access_token_cipher text;
ALTER TABLE public.github_connections ADD COLUMN IF NOT EXISTS refresh_token_cipher text;
ALTER TABLE public.github_connections ADD COLUMN IF NOT EXISTS token_scopes text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.github_connections ADD COLUMN IF NOT EXISTS token_expires_at timestamp with time zone;
ALTER TABLE public.github_connections ADD COLUMN IF NOT EXISTS verified_at timestamp with time zone;
ALTER TABLE public.github_connections ADD COLUMN IF NOT EXISTS webhook_installed_at timestamp with time zone;
ALTER TABLE public.github_connections ADD COLUMN IF NOT EXISTS oauth_linked_at timestamp with time zone;

-- One GitHub account per LOOM account, both directions. Mirrors migration 035's
-- rule for the renameable handle, but on the identifier that cannot be reused.
CREATE UNIQUE INDEX IF NOT EXISTS github_connections_github_user_id_key
  ON public.github_connections (github_user_id)
  WHERE github_user_id IS NOT NULL;

-- A handle claimed by typing must be distinguishable from one GitHub vouched
-- for. `github_user_id IS NULL` is exactly that distinction, and the UI reads it
-- rather than guessing from a timestamp.
COMMENT ON COLUMN public.github_connections.github_user_id IS
  'GitHub''s immutable numeric account id, from GET /user. NULL = handle was typed by the student, not verified by GitHub.';
COMMENT ON COLUMN public.github_connections.access_token_cipher IS
  'AES-256-GCM sealed bearer token (enc:v1:<iv>:<tag>:<ciphertext>). Never store this in plaintext.';
COMMENT ON COLUMN public.github_connections.webhook_installed_at IS
  'When a repository webhook was installed automatically by the OAuth callback. Set only after a successful create -- see lib/github-oauth.js ensureWebhook for why a duplicate hook double-counts commits.';

-- ---------------------------------------------------------------------------
-- 2. github_repo_grants: what this student can actually do in this repository
-- ---------------------------------------------------------------------------
-- A grant is the answer to one question, asked once and cached: "can the student
-- who owns this LOOM account push to owner/repo?"
--
-- Cached because GitHub allows 5,000 requests/hour per token, and re-asking on
-- every page view of the projects list would exhaust it for a chapter.
--
-- can_push is the security-relevant column: it distinguishes ownership from mere
-- read access. can_admin is recorded too because it determines whether a webhook
-- could be installed, which is a useful thing to know when a project never
-- activates.

CREATE TABLE IF NOT EXISTS public.github_repo_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  repo_full_name text NOT NULL,
  github_user_id bigint,
  owner_login text,
  can_push boolean NOT NULL DEFAULT false,
  can_admin boolean NOT NULL DEFAULT false,
  is_private boolean NOT NULL DEFAULT false,
  verified_at timestamptz NOT NULL DEFAULT now(),
  -- A grant is a fact about a moment. Re-verifying refreshes the row rather
  -- than adding one, so revoking access on GitHub eventually shows up.
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, repo_full_name)
);

CREATE INDEX IF NOT EXISTS github_repo_grants_repo_idx
  ON public.github_repo_grants (tenant_id, repo_full_name);
CREATE INDEX IF NOT EXISTS github_repo_grants_user_idx
  ON public.github_repo_grants (user_id);

COMMENT ON TABLE public.github_repo_grants IS
  'Cached result of asking GitHub what a linked student can do in a repository. can_push = true is the ownership proof that replaces comparing a typed handle against a URL (migration 038).';

-- ---------------------------------------------------------------------------
-- 3. Tenant isolation
-- ---------------------------------------------------------------------------
-- Follows migration 031's strict-table pattern: fail CLOSED when app.tenant_id is
-- unset. A grant with no tenant is a cross-chapter grant, and a proof of
-- ownership that leaks across chapters is worse than no proof -- it would let
-- one chapter's student satisfy another chapter's project claim.
--
-- github_connections is deliberately NOT added here: it has no tenant_id column
-- and is keyed by the Supabase user id, which is already chapter-scoped through
-- profiles. Adding a tenant column to it would create two sources of truth for
-- "which chapter is this account in" and they would eventually disagree.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'github_repo_grants_pkey'
      AND conrelid = 'public.github_repo_grants'::regclass
  ) THEN
    ALTER TABLE public.github_repo_grants ADD CONSTRAINT github_repo_grants_pkey PRIMARY KEY (id);
  END IF;
END $$;

ALTER TABLE public.github_repo_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.github_repo_grants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.github_repo_grants;
CREATE POLICY tenant_isolation_policy ON public.github_repo_grants FOR ALL
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

COMMENT ON POLICY tenant_isolation_policy ON public.github_repo_grants IS
  'Fail closed, like migration 031. Deliberately has no "allow when unset" branch: an unscoped grant is a cross-chapter ownership proof.';

-- ---------------------------------------------------------------------------
-- 4. Honest backfill
-- ---------------------------------------------------------------------------
-- Existing rows were created by POST /api/github, which accepted a typed
-- username with no verification. There is nothing to migrate into
-- github_user_id -- GitHub was never asked. Leaving it NULL is the honest state,
-- and the UI must present those rows as unverified rather than as linked.
--
-- This route is deleted in the same change, so no new unverified rows can appear.

UPDATE public.github_connections
   SET oauth_linked_at = connected_at
 WHERE oauth_linked_at IS NULL
   AND github_user_id IS NOT NULL;