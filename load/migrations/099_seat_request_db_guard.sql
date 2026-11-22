-- Seat requests, enforced in the database.
--
-- The API in lib/role-requests.js already refuses a request from a member whose
-- verified record does not clear the bar. That is a policy check in application
-- code, and application code can be bypassed: a new route, a forgotten `await`,
-- a direct write from a script. The invariant is not "the API should refuse" --
-- it is "a request for a seat must not exist for someone with no verified work".
-- So it lives here too.
--
-- Two triggers, one predicate:
--   * role_requests        -- no request row without the verified record
--   * department_memberships -- no `core_requested` flag without it either,
--                               because the one-click department button raises
--                               that flag directly.
--
-- The thresholds are duplicated from REQUIREMENTS in lib/role-requests.js on
-- purpose. A single shared source would mean the database asks the application
-- what the rule is, which is exactly the bypass this closes. Change both.

CREATE OR REPLACE FUNCTION public.role_request_verified_proof(p_user_id text, p_tenant_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT
    (SELECT COUNT(*)::int FROM public.student_roadmap_progress
      WHERE student_id = p_user_id AND tenant_id = p_tenant_id
        AND status = 'completed' AND evidence_state = 'verified')
  + (SELECT COUNT(*)::int FROM public.projects
      WHERE owner_id = p_user_id AND tenant_id = p_tenant_id
        AND evidence_state = 'verified')
  + (SELECT COUNT(*)::int FROM public.student_oss_contributions
      WHERE student_id = p_user_id AND status = 'verified')
  + (SELECT COUNT(*)::int FROM public.forum_replies
      WHERE author_id = p_user_id AND is_answer = true AND status = 'visible');
$$;

COMMENT ON FUNCTION public.role_request_verified_proof(text, uuid) IS
  'Verified proof total (roadmap nodes + projects + merged OSS + accepted answers). Mirrors lib/role-requests.js; used by the seat-request triggers.';

CREATE OR REPLACE FUNCTION public.enforce_role_request_proof()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_min integer;
  v_proof integer;
BEGIN
  IF NEW.status IS DISTINCT FROM 'open' THEN
    RETURN NEW;
  END IF;

  v_min := CASE NEW.target_role
             WHEN 'core' THEN 3
             WHEN 'dept_lead' THEN 5
             ELSE NULL
           END;
  IF v_min IS NULL THEN
    RETURN NEW;
  END IF;

  v_proof := public.role_request_verified_proof(NEW.user_id, NEW.tenant_id);
  IF v_proof < v_min THEN
    RAISE EXCEPTION
      'ROLE_REQUEST_BELOW_BAR: % needs % verified pieces of work; this member has %',
      NEW.target_role, v_min, v_proof
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS role_requests_require_proof ON public.role_requests;
CREATE TRIGGER role_requests_require_proof
  BEFORE INSERT OR UPDATE ON public.role_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_role_request_proof();

CREATE OR REPLACE FUNCTION public.enforce_core_request_proof()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_proof integer;
BEGIN
  IF NEW.core_requested IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  -- Only the transition matters. Re-saving a row that already asked is not a
  -- new request, and must not fail because the record changed since.
  IF TG_OP = 'UPDATE' AND OLD.core_requested IS TRUE THEN
    RETURN NEW;
  END IF;

  v_proof := public.role_request_verified_proof(NEW.user_id, NEW.tenant_id);
  IF v_proof < 3 THEN
    RAISE EXCEPTION
      'CORE_REQUEST_BELOW_BAR: Core needs 3 verified pieces of work; this member has %',
      v_proof
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS department_memberships_require_core_proof ON public.department_memberships;
CREATE TRIGGER department_memberships_require_core_proof
  BEFORE INSERT OR UPDATE ON public.department_memberships
  FOR EACH ROW EXECUTE FUNCTION public.enforce_core_request_proof();
