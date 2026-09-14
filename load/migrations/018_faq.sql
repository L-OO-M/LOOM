-- 018_faq: public frequently-asked-questions per tenant.
-- Tracked migration. Apply with: node load/migrate.js
--
-- faqs powers the public /faq page (published rows only) and the tiny
-- admin manager at /admin/faq. (tenant_id, slug) is the idempotency key
-- so load/seed-faq.js can run safely for every tenant.

CREATE TABLE IF NOT EXISTS public.faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  slug text NOT NULL DEFAULT '',
  question text NOT NULL,
  answer text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT faqs_slug_unique UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS faqs_tenant_idx
  ON public.faqs(tenant_id, is_published, sort_order);
