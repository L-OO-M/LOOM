-- 083_identity_links: durable, honest verification state per developer account.
--
-- A handle typed into a settings form is a CLAIM, not proof. This table records
-- both the claim and, when it exists, the evidence that the account belongs to
-- the member:
--
--   claimed   the handle was saved, nothing has checked it
--   linked    a platform API confirmed the account EXISTS (LeetCode's profile
--             endpoint). Existence is not ownership, so the UI says "linked".
--   verified  a machine-checkable signal proved control: an OAuth-backed
--             connection already on file, or a one-time code found at a public
--             URL the member controls.
--   rejected  a check ran and the evidence was not there. Kept so a stale claim
--             cannot silently look verified.
--
-- `verify_token` is generated per row and shown only to its owner. It is not a
-- secret credential: it proves control of the page it is pasted on, not access
-- to the account.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.identity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  provider text NOT NULL,
  handle text NOT NULL,
  proof_url text,
  status text NOT NULL DEFAULT 'claimed',
  method text NOT NULL DEFAULT 'claim',
  verify_token text,
  verified_at timestamptz,
  last_checked_at timestamptz,
  check_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_links_provider_check CHECK (
    provider IN ('github', 'leetcode', 'linkedin', 'x', 'discord', 'kaggle',
                 'unstop', 'devfolio', 'huggingface', 'website')
  ),
  CONSTRAINT identity_links_status_check CHECK (
    status IN ('claimed', 'linked', 'verified', 'rejected')
  ),
  CONSTRAINT identity_links_method_check CHECK (
    method IN ('claim', 'oauth', 'api', 'token')
  ),
  CONSTRAINT identity_links_handle_check CHECK (char_length(handle) BETWEEN 1 AND 120),
  CONSTRAINT identity_links_proof_url_check CHECK (
    proof_url IS NULL OR proof_url ~ '^https?://'
  ),
  UNIQUE (tenant_id, user_id, provider)
);

CREATE INDEX IF NOT EXISTS identity_links_user_idx
  ON public.identity_links (tenant_id, user_id);

ALTER TABLE public.identity_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identity_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.identity_links;
-- Same house pattern as every other tenant table: a public card reads through
-- the unscoped client (unset app.tenant_id), while a scoped read/write is
-- always constrained to its own tenant.
CREATE POLICY tenant_isolation_policy ON public.identity_links AS PERMISSIVE TO public
  USING (
    current_setting('app.tenant_id', true) = ''
    OR current_setting('app.tenant_id', true) IS NULL
    OR tenant_id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.tenant_id', true) = ''
    OR current_setting('app.tenant_id', true) IS NULL
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );

COMMENT ON TABLE public.identity_links IS
  'One row per developer account a member claims, with the method that proved it. Only status = verified earns a public tick.';
