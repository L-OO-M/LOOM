-- 060_consent_records: durable evidence that a member accepted the current
-- Terms and Privacy notice.
--
-- WHY THIS EXISTS
--
-- Registration used to send `terms_accepted_at` from the browser, which nobody
-- could verify and which Auth0 identities never produced at all. The client-only
-- checkbox looked like consent without recording anything server-side.
--
-- This table is append-only by intent: a new policy version inserts a new row,
-- while retrying the same acceptance is a no-op through the unique key. The API
-- checks the newest row against lib/legal.js POLICY_VERSIONS on every guarded
-- mutation, so changing a policy version re-prompts everyone.
--
-- Idempotent throughout.

CREATE TABLE IF NOT EXISTS public.consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  actor text,
  source text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS consent_records_user_policy_unique
  ON public.consent_records (user_id, terms_version, privacy_version);

CREATE INDEX IF NOT EXISTS consent_records_user_accepted_idx
  ON public.consent_records (user_id, accepted_at DESC);

CREATE INDEX IF NOT EXISTS consent_records_tenant_idx
  ON public.consent_records (tenant_id, accepted_at DESC);

COMMENT ON TABLE public.consent_records IS
  'Append-only acceptance history for Terms and Privacy policy versions. The newest row for a user is compared with lib/legal.js POLICY_VERSIONS.';
