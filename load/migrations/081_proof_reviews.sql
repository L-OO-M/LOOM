-- 081_proof_reviews: a durable human decision on a claimed proof signal.
--
-- The self-proof read model (lib/proof.js) only marks an item verified when an
-- authoritative source backs it: a GitHub push grant, LeetCode's own API, an
-- issued certificate, or a signed GitHub delivery. Everything else is shown as
-- unverified, which is honest but leaves a human decision nowhere to live.
--
-- This table is that decision. It is deliberately append-one-row-per-signal
-- (not a workflow state machine): an idea can be re-decided, and re-deciding
-- overwrites the previous row so `buildProof` never has to reason about which
-- decision is current. Rejecting records a refusal and leaves the underlying
-- evidence (projects, contributions) untouched.
--
-- Idempotent throughout: safe to re-run.

CREATE TABLE IF NOT EXISTS public.proof_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  -- Stable key the read model can match: 'project:<uuid>', 'oss:<uuid>'.
  signal text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  note text,
  decided_by text REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proof_reviews_signal_check CHECK (char_length(signal) BETWEEN 3 AND 200),
  UNIQUE (tenant_id, user_id, signal)
);

-- The admin queue reads "everything still undecided in this chapter"; the read
-- model reads "this member's decisions". The UNIQUE constraint already covers
-- (tenant_id, user_id, signal), so only the queue's tenant-only scan needs help.
CREATE INDEX IF NOT EXISTS proof_reviews_tenant_decided_idx
  ON public.proof_reviews (tenant_id, decided_at DESC);

ALTER TABLE public.proof_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proof_reviews FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.proof_reviews;
-- Same shape as every other tenant policy in 000_base_schema: an UNSET setting
-- (public reads such as /u/<username>, which use the unscoped client) must not
-- hide a decision, while a set setting always scopes to that tenant. A stricter
-- equality-only policy would have made a human approval invisible on the very
-- public card it is meant to verify.
CREATE POLICY tenant_isolation_policy ON public.proof_reviews AS PERMISSIVE TO public
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

COMMENT ON TABLE public.proof_reviews IS
  'One current human decision per proof signal. A missing row means undecided; buildProof treats only decision = approved as a verification and never deletes the underlying evidence on a rejection.';
