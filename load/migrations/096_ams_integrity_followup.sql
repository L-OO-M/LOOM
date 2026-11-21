-- 096_ams_integrity_followup.sql
-- Append-only follow-up for grants, credentials, evidence, privacy and settings.

-- Scoped grants must point at a profile in the same tenant.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_tenant_user_unique
  ON public.profiles(tenant_id, user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scoped_role_grants_tenant_member_fk'
      AND conrelid = 'public.scoped_role_grants'::regclass
  ) THEN
    ALTER TABLE public.scoped_role_grants
      ADD CONSTRAINT scoped_role_grants_tenant_member_fk
      FOREIGN KEY (tenant_id, user_id)
      REFERENCES public.profiles(tenant_id, user_id)
      ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scoped_role_grants_grantor_tenant_fk'
      AND conrelid = 'public.scoped_role_grants'::regclass
  ) THEN
    ALTER TABLE public.scoped_role_grants
      ADD CONSTRAINT scoped_role_grants_grantor_tenant_fk
      FOREIGN KEY (tenant_id, granted_by)
      REFERENCES public.profiles(tenant_id, user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scoped_role_grants_revoker_tenant_fk'
      AND conrelid = 'public.scoped_role_grants'::regclass
  ) THEN
    ALTER TABLE public.scoped_role_grants
      ADD CONSTRAINT scoped_role_grants_revoker_tenant_fk
      FOREIGN KEY (tenant_id, revoked_by)
      REFERENCES public.profiles(tenant_id, user_id);
  END IF;
END $$;

ALTER TABLE public.scoped_role_grants
  DROP CONSTRAINT IF EXISTS scoped_role_grants_role_name_check;
ALTER TABLE public.scoped_role_grants
  ADD CONSTRAINT scoped_role_grants_role_name_check CHECK (
    role_name IN (
      'dept_lead', 'co_head', 'vertical_lead', 'event_lead',
      'event_door_staff', 'auditor', 'core'
    )
  );

ALTER TABLE public.scoped_role_grants
  DROP CONSTRAINT IF EXISTS scoped_role_grants_revoked_inactive_check;
ALTER TABLE public.scoped_role_grants
  ADD CONSTRAINT scoped_role_grants_revoked_inactive_check CHECK (
    revoked_at IS NULL OR is_active = false
  );

CREATE OR REPLACE FUNCTION public.validate_scoped_role_grant_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.role_name = 'vertical_lead' AND NEW.scope_type <> 'vertical' THEN
    RAISE EXCEPTION 'vertical_lead requires vertical scope';
  ELSIF NEW.role_name IN ('dept_lead', 'co_head') AND NEW.scope_type <> 'department' THEN
    RAISE EXCEPTION 'department leadership requires department scope';
  ELSIF NEW.role_name IN ('event_lead', 'event_door_staff') AND NEW.scope_type <> 'event' THEN
    RAISE EXCEPTION 'event roles require event scope';
  ELSIF NEW.role_name = 'auditor' AND NEW.scope_type NOT IN ('tenant', 'project') THEN
    RAISE EXCEPTION 'auditor requires tenant or project scope';
  ELSIF NEW.role_name = 'core' AND NEW.scope_type NOT IN ('tenant', 'department') THEN
    RAISE EXCEPTION 'core requires tenant or department scope';
  END IF;

  IF NEW.scope_type = 'tenant' THEN
    IF NEW.scope_id <> NEW.tenant_id::text THEN
      RAISE EXCEPTION 'tenant grant scope_id must equal tenant_id';
    END IF;
  ELSIF NEW.scope_type = 'vertical' THEN
    IF NEW.scope_id NOT IN ('technical', 'non_technical') THEN
      RAISE EXCEPTION 'unknown vertical scope';
    END IF;
  ELSIF NEW.scope_type = 'department' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.departments d
      WHERE d.id::text = NEW.scope_id AND d.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'department scope is outside grant tenant';
    END IF;
  ELSIF NEW.scope_type = 'event' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id::text = NEW.scope_id AND e.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'event scope is outside grant tenant';
    END IF;
  ELSIF NEW.scope_type = 'project' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id::text = NEW.scope_id AND p.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'project scope is outside grant tenant';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scoped_role_grants_validate_scope ON public.scoped_role_grants;
CREATE TRIGGER scoped_role_grants_validate_scope
  BEFORE INSERT OR UPDATE OF tenant_id, role_name, scope_type, scope_id
  ON public.scoped_role_grants
  FOR EACH ROW EXECUTE FUNCTION public.validate_scoped_role_grant_scope();

-- Existing role labels and department leadership predate scoped grants. Backfill
-- only when a same-tenant admin can be recorded as the grantor; tenants without
-- one fail closed and must appoint through the admin workflow.
INSERT INTO public.scoped_role_grants (
  tenant_id, user_id, role_name, scope_type, scope_id, granted_by,
  starts_at, expires_at, is_active
)
SELECT
  p.tenant_id, p.user_id, 'vertical_lead', 'vertical', p.vertical, grantor.user_id,
  COALESCE(p.role_term_start::timestamptz, now()),
  CASE WHEN p.role_term_end IS NULL THEN NULL ELSE (p.role_term_end + 1)::timestamptz END,
  true
FROM public.profiles p
JOIN LATERAL (
  SELECT a.user_id FROM public.profiles a
  WHERE a.tenant_id = p.tenant_id AND a.role = 'admin'
  ORDER BY a.created_at ASC NULLS LAST, a.user_id
  LIMIT 1
) grantor ON true
WHERE p.role = 'vertical_lead'
  AND p.vertical IN ('technical', 'non_technical')
  AND (p.role_term_end IS NULL OR p.role_term_end >= CURRENT_DATE)
  AND NOT EXISTS (
    SELECT 1 FROM public.scoped_role_grants g
    WHERE g.tenant_id = p.tenant_id AND g.user_id = p.user_id
      AND g.role_name = 'vertical_lead' AND g.scope_type = 'vertical'
      AND g.scope_id = p.vertical AND g.is_active AND g.revoked_at IS NULL
  );

INSERT INTO public.scoped_role_grants (
  tenant_id, user_id, role_name, scope_type, scope_id, granted_by,
  starts_at, expires_at, is_active
)
SELECT
  m.tenant_id, m.user_id, 'dept_lead', 'department', m.department_id::text,
  grantor.user_id, COALESCE(m.term_start::timestamptz, now()),
  CASE WHEN m.term_end IS NULL THEN NULL ELSE (m.term_end + 1)::timestamptz END,
  true
FROM public.department_memberships m
JOIN LATERAL (
  SELECT a.user_id FROM public.profiles a
  WHERE a.tenant_id = m.tenant_id AND a.role = 'admin'
  ORDER BY a.created_at ASC NULLS LAST, a.user_id
  LIMIT 1
) grantor ON true
WHERE m.level = 'dept_lead'
  AND (m.term_end IS NULL OR m.term_end >= CURRENT_DATE)
  AND NOT EXISTS (
    SELECT 1 FROM public.scoped_role_grants g
    WHERE g.tenant_id = m.tenant_id AND g.user_id = m.user_id
      AND g.role_name = 'dept_lead' AND g.scope_type = 'department'
      AND g.scope_id = m.department_id::text AND g.is_active AND g.revoked_at IS NULL
  );

-- New events use the FSM vocabulary. Existing migration 094 owns the CHECK.
ALTER TABLE public.events ALTER COLUMN status SET DEFAULT 'draft';

-- Outbox idempotency is tenant-local, and every processing claim owns a lease
-- token so an expired worker cannot finalize a row reclaimed by another worker.
DROP INDEX IF EXISTS public.outbox_topic_dedupe_unique;
CREATE UNIQUE INDEX IF NOT EXISTS outbox_tenant_topic_dedupe_unique
  ON public.outbox(tenant_id, topic, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
ALTER TABLE public.outbox ADD COLUMN IF NOT EXISTS lease_token uuid;
UPDATE public.outbox
SET status = 'pending', locked_at = NULL, lease_token = NULL
WHERE status = 'processing';
ALTER TABLE public.outbox DROP CONSTRAINT IF EXISTS outbox_processing_lease_check;
ALTER TABLE public.outbox ADD CONSTRAINT outbox_processing_lease_check CHECK (
  (status = 'processing' AND locked_at IS NOT NULL AND lease_token IS NOT NULL)
  OR (status <> 'processing' AND locked_at IS NULL AND lease_token IS NULL)
);

-- Contributor identity is authoritative input to separation-of-duty checks.
ALTER TABLE public.department_tasks
  ADD COLUMN IF NOT EXISTS contributors text[] NOT NULL DEFAULT '{}'::text[];

-- Evidence-specific idempotency replaces the over-broad kind/ref/user key.
ALTER TABLE public.ranking_events
  DROP CONSTRAINT IF EXISTS ranking_events_tenant_id_kind_ref_id_user_id_key;
ALTER TABLE public.ranking_events
  ADD COLUMN IF NOT EXISTS scoring_rule_version integer NOT NULL DEFAULT 1;
UPDATE public.ranking_events SET points = GREATEST(weight, 0) WHERE points = 0;

-- Correct privacy defaults: a profile and its internal work are not public by default.
ALTER TABLE public.profiles ALTER COLUMN passport_privacy SET DEFAULT '{
  "visibility": "chapter",
  "show_roll_number": "private",
  "show_branch": "chapter",
  "show_year": "chapter",
  "show_department_work": "private",
  "show_github_stats": "private",
  "show_certificates": "public"
}'::jsonb;

UPDATE public.profiles
SET passport_privacy = '{
  "visibility": "chapter",
  "show_roll_number": "private",
  "show_branch": "chapter",
  "show_year": "chapter",
  "show_department_work": "private",
  "show_github_stats": "private",
  "show_certificates": "public"
}'::jsonb
WHERE passport_privacy = '{
  "visibility": "chapter",
  "show_roll_number": "private",
  "show_branch": "chapter",
  "show_year": "chapter",
  "show_department_work": "chapter",
  "show_github_stats": "public",
  "show_certificates": "public"
}'::jsonb;

-- Credential records identify their trusted algorithm and signing key.
ALTER TABLE public.certificates
  ADD COLUMN IF NOT EXISTS credential_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS algorithm text NOT NULL DEFAULT 'HMAC-SHA256',
  ADD COLUMN IF NOT EXISTS key_id text,
  ADD COLUMN IF NOT EXISTS signed_payload jsonb,
  ADD COLUMN IF NOT EXISTS revoked_by text,
  ADD COLUMN IF NOT EXISTS revocation_reason text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_algorithm_check;
ALTER TABLE public.certificates ADD CONSTRAINT certificates_algorithm_check
  CHECK (algorithm IN ('HMAC-SHA256', 'Ed25519'));
ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_version_algorithm_check;
ALTER TABLE public.certificates ADD CONSTRAINT certificates_version_algorithm_check CHECK (
  (credential_version = 1 AND algorithm = 'HMAC-SHA256' AND key_id IS NULL)
  OR (credential_version = 2 AND algorithm = 'Ed25519' AND key_id IS NOT NULL AND signed_payload IS NOT NULL)
);
ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_revocation_pair_check;
ALTER TABLE public.certificates ADD CONSTRAINT certificates_revocation_pair_check CHECK (
  (revoked_at IS NULL AND revoked_by IS NULL)
  OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
);

ALTER TABLE public.tenant_keyrings DROP CONSTRAINT IF EXISTS tenant_keyrings_key_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS tenant_keyrings_tenant_key_id_unique
  ON public.tenant_keyrings(tenant_id, key_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_keyrings_one_active_ed25519
  ON public.tenant_keyrings(tenant_id)
  WHERE algorithm = 'Ed25519' AND is_active = true AND revoked_at IS NULL;
ALTER TABLE public.tenant_keyrings DROP CONSTRAINT IF EXISTS tenant_keyrings_revocation_check;
ALTER TABLE public.tenant_keyrings ADD CONSTRAINT tenant_keyrings_revocation_check CHECK (
  revoked_at IS NULL OR is_active = false
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'certificates_tenant_key_fk'
      AND conrelid = 'public.certificates'::regclass
  ) THEN
    ALTER TABLE public.certificates
      ADD CONSTRAINT certificates_tenant_key_fk
      FOREIGN KEY (tenant_id, key_id)
      REFERENCES public.tenant_keyrings(tenant_id, key_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'certificates_revoker_tenant_fk'
      AND conrelid = 'public.certificates'::regclass
  ) THEN
    ALTER TABLE public.certificates
      ADD CONSTRAINT certificates_revoker_tenant_fk
      FOREIGN KEY (tenant_id, revoked_by)
      REFERENCES public.profiles(tenant_id, user_id);
  END IF;
END $$;

-- Settings remain JSONB, but security/operational sections have a strict shape.
UPDATE public.tenants
SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object(
  'relaxation_window',
    '{"enabled":false,"start":null,"end":null,"allowed_categories":[]}'::jsonb
      || CASE WHEN jsonb_typeof(settings->'relaxation_window') = 'object'
              THEN settings->'relaxation_window' ELSE '{}'::jsonb END,
  'dual_head_approval',
    '{"require_dual_on_budget":true,"budget_threshold":10000,"currency":"INR","escalation_hours":336,"independent_escalation_role":"admin"}'::jsonb
      || CASE WHEN jsonb_typeof(settings->'dual_head_approval') = 'object'
              THEN settings->'dual_head_approval' ELSE '{}'::jsonb END,
  'public_passport_defaults',
    '{"visibility":"chapter","show_academic_info":false,"show_unverified_projects":false}'::jsonb
      || CASE WHEN jsonb_typeof(settings->'public_passport_defaults') = 'object'
              THEN settings->'public_passport_defaults' ELSE '{}'::jsonb END
);

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_settings_shape_check;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_settings_shape_check CHECK (COALESCE((
  jsonb_typeof(settings) = 'object'
  AND jsonb_typeof(settings->'relaxation_window') = 'object'
  AND jsonb_typeof(settings->'dual_head_approval') = 'object'
  AND jsonb_typeof(settings->'public_passport_defaults') = 'object'
  AND jsonb_typeof(settings->'relaxation_window'->'enabled') = 'boolean'
  AND (settings->'relaxation_window'->'start' = 'null'::jsonb
       OR jsonb_typeof(settings->'relaxation_window'->'start') = 'string')
  AND (settings->'relaxation_window'->'end' = 'null'::jsonb
       OR jsonb_typeof(settings->'relaxation_window'->'end') = 'string')
  AND jsonb_typeof(settings->'relaxation_window'->'allowed_categories') = 'array'
  AND jsonb_typeof(settings->'dual_head_approval'->'require_dual_on_budget') = 'boolean'
  AND jsonb_typeof(settings->'dual_head_approval'->'budget_threshold') = 'number'
  AND (settings->'dual_head_approval'->>'budget_threshold')::numeric >= 0
  AND settings->'dual_head_approval'->>'currency' ~ '^[A-Z]{3}$'
  AND jsonb_typeof(settings->'dual_head_approval'->'escalation_hours') = 'number'
  AND (settings->'dual_head_approval'->>'escalation_hours')::integer BETWEEN 1 AND 2160
  AND settings->'dual_head_approval'->>'independent_escalation_role' IN ('admin', 'platform_admin', 'auditor')
  AND settings->'public_passport_defaults'->>'visibility' IN ('private', 'chapter', 'public', 'hidden')
  AND jsonb_typeof(settings->'public_passport_defaults'->'show_academic_info') = 'boolean'
  AND jsonb_typeof(settings->'public_passport_defaults'->'show_unverified_projects') = 'boolean'
), false));

-- Every new tenant-owned table is fail-closed under the app RLS rollout.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['scoped_role_grants', 'event_status_history', 'tenant_keyrings'] LOOP
    BEGIN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t); EXCEPTION WHEN OTHERS THEN NULL; END;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO loom_app', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_policy ON public.%I FOR ALL '
      'USING (tenant_id::text = current_setting(''app.tenant_id'', true)) '
      'WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))', t
    );
  END LOOP;
END $$;
