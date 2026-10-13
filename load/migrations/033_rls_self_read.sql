-- 033_rls_self_read: let a member read their own profile before the tenant is known.
--
-- WHY THIS IS NEEDED FOR B2
-- getRequestContext() reads profiles.user_id FIRST, then learns the tenant from
-- profile.tenant_id. So the very first scoped query cannot have app.tenant_id
-- set yet -- the value it would need is inside the row being read.
--
-- Order of operations in lib/auth-server.js:
--   1. SELECT * FROM profiles WHERE user_id = $1     <- needs app.user_id
--   2. tenant := tenants[profile.tenant_id]          <- now known
--   3. everything else                                <- needs app.tenant_id
--
-- Without an own-row branch, step 1 is denied for every request, every profile
-- resolves as not-found, and the entire site redirects to /login.
--
-- The branch is deliberately narrow: it matches ONLY the caller's own user_id
-- (app.user_id, set server-side from the verified session, never from input).
-- It grants no access to any other row, and it grants nothing once
-- app.tenant_id is also set and matches.
--
-- Idempotent.

DROP POLICY IF EXISTS tenant_isolation_policy ON public.profiles;

CREATE POLICY tenant_isolation_policy ON public.profiles AS PERMISSIVE
  FOR ALL
  USING (
    -- Own row: readable before the tenant is resolved.
    user_id = current_setting('app.user_id', true)
    -- OR any row belonging to the caller's own tenant.
    OR tenant_id::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    tenant_id::text = current_setting('app.tenant_id', true)
  );
