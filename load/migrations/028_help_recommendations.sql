-- 028_help_recommendations: peer recommendation engine (struggle signals + helper profiles + matches)
-- Tenant-isolated via RLS. Auto-eligible helpers + 2/week throttle + opt-out toggle.

CREATE TABLE IF NOT EXISTS public.help_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('roadmap_node','resource','contest','topic')),
  ref_id text NOT NULL,
  failures_count integer NOT NULL DEFAULT 1 CHECK (failures_count >= 1),
  last_failed_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','matched','resolved','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id, kind, ref_id)
);
CREATE INDEX IF NOT EXISTS help_signals_user_idx ON public.help_signals(user_id, status);
CREATE INDEX IF NOT EXISTS help_signals_tenant_idx ON public.help_signals(tenant_id, kind, ref_id);

CREATE TABLE IF NOT EXISTS public.helper_profiles (
  user_id text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  topics text[] NOT NULL DEFAULT '{}',
  available boolean NOT NULL DEFAULT true,
  active_score integer NOT NULL DEFAULT 0,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS helper_profiles_tenant_available_idx ON public.helper_profiles(tenant_id, available, last_active_at DESC);

CREATE TABLE IF NOT EXISTS public.help_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  signal_id uuid NOT NULL REFERENCES public.help_signals(id) ON DELETE CASCADE,
  helper_id text NOT NULL,
  score double precision NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(signal_id, helper_id)
);
CREATE INDEX IF NOT EXISTS help_matches_helper_idx ON public.help_matches(helper_id, status);
CREATE INDEX IF NOT EXISTS help_matches_signal_idx ON public.help_matches(signal_id);

-- Throttle: 2 active matches per helper per week (enforced in app, index helps)
CREATE INDEX IF NOT EXISTS help_matches_helper_week_idx ON public.help_matches(helper_id, created_at) WHERE status IN ('pending','accepted');

-- RLS
ALTER TABLE public.help_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_signals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.help_signals;
CREATE POLICY tenant_isolation_policy ON public.help_signals FOR ALL
  USING (current_setting('app.tenant_id', true) = '' OR current_setting('app.tenant_id', true) IS NULL OR tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.tenant_id', true) = '' OR current_setting('app.tenant_id', true) IS NULL OR tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE public.helper_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helper_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.helper_profiles;
CREATE POLICY tenant_isolation_policy ON public.helper_profiles FOR ALL
  USING (current_setting('app.tenant_id', true) = '' OR current_setting('app.tenant_id', true) IS NULL OR tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.tenant_id', true) = '' OR current_setting('app.tenant_id', true) IS NULL OR tenant_id::text = current_setting('app.tenant_id', true));

ALTER TABLE public.help_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_matches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.help_matches;
CREATE POLICY tenant_isolation_policy ON public.help_matches FOR ALL
  USING (current_setting('app.tenant_id', true) = '' OR current_setting('app.tenant_id', true) IS NULL OR tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.tenant_id', true) = '' OR current_setting('app.tenant_id', true) IS NULL OR tenant_id::text = current_setting('app.tenant_id', true));

COMMENT ON TABLE public.help_signals IS '028 struggle signals: >=2 failures/7d or manual Get Help';
COMMENT ON TABLE public.helper_profiles IS '028 auto-eligible + opt-out toggle; active <=14d';
COMMENT ON TABLE public.help_matches IS '028 top3 scored, 0.5 topic +0.3 activity +0.2 tier, 2/week cap';
