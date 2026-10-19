-- 047_user_identities: map an external identity (Auth0) onto the canonical
-- application user id, so login moves to Auth0 without rewriting any ids.
--
-- WHY THIS EXISTS
--
-- Authentication moves to Auth0 (the "front door"), but the canonical user id
-- threaded through the entire schema -- profiles.user_id, department_memberships,
-- projects.owner_id, notifications, github_repo_grants, ... -- remains the
-- Supabase uid that already exists in every row. Rewriting those ids would be a
-- destructive, hard-to-roll-back migration across the whole database for zero
-- user-visible gain.
--
-- Instead, Auth0's stable `sub` claim is linked ONCE to whatever user_id that
-- person already has (matched by email against auth.users), and every request
-- resolves sub -> user_id through this table. A brand-new signup that has no
-- Supabase account is assigned a fresh uuid as its user_id.
--
-- The row is the durable, auditable record of "this Auth0 identity is this
-- account", in the same spirit as github_connections binding a handle to GitHub's
-- immutable numeric id (migration 038).
--
-- NOT tenant-scoped: like github_connections, this table has no tenant_id. A
-- person's login identity is chapter-independent, and the chapter is resolved
-- from profiles afterwards. Adding a tenant column here would create a second
-- source of truth for "which chapter is this account in".
--
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS public.user_identities (
  -- Auth0's subject claim: "auth0|<id>" for database users, "github|<id>" or
  -- "google-oauth2|<id>" for social connections. Stable for the life of the
  -- identity, and the value the session carries on every request.
  auth0_sub text PRIMARY KEY,
  -- The canonical application user id (profiles.user_id). NOT unique: one person
  -- may legitimately sign in through several connections (email + GitHub) and
  -- they must all resolve to the same account.
  user_id text NOT NULL,
  email text,
  -- The connection prefix of the sub ("auth0", "github", ...), kept for audit.
  provider text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_identities_user_idx
  ON public.user_identities (user_id);
CREATE INDEX IF NOT EXISTS user_identities_email_idx
  ON public.user_identities (lower(email));

COMMENT ON TABLE public.user_identities IS
  'Links an Auth0 subject (front door) to the canonical Supabase user_id used across the schema. Resolution happens server-side only (lib/user-identities.js).';
COMMENT ON COLUMN public.user_identities.user_id IS
  'Canonical app user id (profiles.user_id). Deliberately not unique: multiple connections may map to one account.';

-- ---------------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------------
-- Server-only table: it is read and written exclusively by the auth resolver on
-- the owner connection (lib/user-identities.js), before any tenant is known.
-- The owner role carries rolbypassrls, so ENABLE + FORCE + no permissive policy
-- means the RLS-scoped application role cannot read or write it at all -- which
-- is exactly right, because nothing in the request-serving path should query it
-- directly. This mirrors the "deny by default" posture of migration 031.
ALTER TABLE public.user_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_identities FORCE ROW LEVEL SECURITY;
