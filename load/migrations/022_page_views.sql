-- 022_page_views: first-party visit tracking for the analytics dashboard.
-- One row per visit (visitor + path, deduped to one per 30 minutes
-- client- and server-side). No third-party scripts, no PII beyond an
-- anonymous visitor key (or the signed-in user_id when available).
CREATE TABLE IF NOT EXISTS public.page_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  visitor_key text NOT NULL,
  user_id text,
  path text NOT NULL DEFAULT '/',
  referrer text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS page_views_tenant_idx ON public.page_views(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS page_views_visitor_idx ON public.page_views(visitor_key, path, created_at DESC);
