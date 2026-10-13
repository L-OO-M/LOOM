-- 030_app_role: a non-owner, non-BYPASSRLS application role.
--
-- WHY THIS EXISTS
-- The app connects to Postgres as `postgres`, which has rolbypassrls = true.
-- BYPASSRLS overrides everything -- including FORCE ROW LEVEL SECURITY. So the
-- 17 policies installed by 025 are not merely leaky, they are not evaluated at
-- all for app traffic. Tenant isolation is currently 100% hand-written WHERE
-- clauses in the application.
--
-- RLS cannot become a real control until request handling stops running as a
-- BYPASSRLS role. This migration creates that role and grants it exactly what
-- the application needs. It deliberately does NOT create a password (secrets
-- never live in tracked files) and does NOT switch DATABASE_URL -- nothing uses
-- this role until DATABASE_APP_URL is configured and lib/db.js opts in.
--
-- Usage: node load/create-app-role.js   (generates the password, sets it,
-- prints the DATABASE_APP_URL to paste into .env.local / Vercel)
--
-- Idempotent.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loom_app') THEN
    -- NOLOGIN: the password is set out-of-band by load/create-app-role.js.
    -- NOSUPERUSER / NOBYPASSRLS / NOCREATEDB / NOCREATEROLE are the point.
    CREATE ROLE loom_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END $$;

-- Schema usage. 026 revoked CREATE from PUBLIC; loom_app needs USAGE to read.
GRANT USAGE ON SCHEMA public TO loom_app;

-- Full DML on existing tables. 026 revoked from PUBLIC/anon/authenticated, and
-- loom_app was created after that, so it starts with no privileges at all.
-- EXECUTE is included because the schema has helper functions
-- (is_tenant_member) that the 025 policies call.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO loom_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO loom_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO loom_app;

-- Keep future tables covered. Only affects objects created by the role that
-- runs the ALTER DEFAULT (migrations run as postgres).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO loom_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO loom_app;

-- Safety rail for the RLS rollout. Uses the EXISTING feature_flags schema:
--   id, tenant_id, key, enabled, config, updated_at  (PRIMARY KEY id)
-- tenant_id is NOT NULL and must come from a real tenant row, not a literal.
-- One row per tenant so the app can read it without an RLS-protected table.
INSERT INTO public.feature_flags (tenant_id, key, enabled, config)
SELECT t.id, 'tenant_rls_enforced', false, '{}'::jsonb
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.feature_flags f
  WHERE f.tenant_id = t.id AND f.key = 'tenant_rls_enforced'
);

COMMENT ON ROLE loom_app IS
  'Application request-handling role. NOBYPASSRLS, non-owner. Required for '
  'Row Level Security to be enforced at all. Migrations/seeds stay on the '
  'owner connection (DATABASE_URL); request handling uses DATABASE_APP_URL.';
