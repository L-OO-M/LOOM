-- 040_media_assets: shared document + creative-asset storage for the lead tools.
--
-- Backs the Media & Creative Asset Library (logos, signatures, templates, MoU
-- templates, banners) and is the storage pattern reused by MoU documents and
-- event files. Files themselves live in Supabase Storage (see lib/storage.js);
-- these tables hold the metadata and the object path, never the bytes.
--
-- Versioning: media_assets.current_version points at the live version, and
-- asset_versions keeps the full history so a replaced logo/template is
-- recoverable.
--
-- Additive and idempotent (AGENTS.md iron rule 6). RLS is enabled fail-closed
-- in the same style as migration 031 so these tables are protected the moment
-- the tenant_rls_enforced rollout flag is turned on.

CREATE TABLE IF NOT EXISTS public.asset_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT asset_categories_slug_unique UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS asset_categories_tenant_idx
  ON public.asset_categories(tenant_id, sort_order);

CREATE TABLE IF NOT EXISTS public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.asset_categories(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'document',
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  -- A file-backed asset has storage_path; a link-out asset (Canva/Figma/Drive)
  -- has external_url. At least one must be present.
  storage_path text,
  external_url text,
  mime_type text,
  size_bytes bigint,
  current_version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_assets_kind_check CHECK (
    kind IN ('logo', 'signature', 'template', 'document', 'image', 'link', 'other')
  ),
  CONSTRAINT media_assets_source_check CHECK (storage_path IS NOT NULL OR external_url IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS media_assets_tenant_idx
  ON public.media_assets(tenant_id, is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS media_assets_category_idx
  ON public.media_assets(tenant_id, category_id);

CREATE TABLE IF NOT EXISTS public.asset_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
  version integer NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT asset_versions_unique UNIQUE (asset_id, version)
);
CREATE INDEX IF NOT EXISTS asset_versions_tenant_idx
  ON public.asset_versions(tenant_id, asset_id, version DESC);

-- Fail-closed RLS, mirroring migration 031. NULL tenant_id rows are not a
-- legitimate state for any of these tables, so there is no "allow unset" arm.
DO $$
DECLARE
  t text;
  new_tables text[] := ARRAY['asset_categories', 'media_assets', 'asset_versions'];
BEGIN
  FOREACH t IN ARRAY new_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY tenant_isolation_policy ON public.%I AS PERMISSIVE
           FOR ALL
           USING (tenant_id::text = current_setting(''app.tenant_id'', true))
           WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))', t);
    END IF;
  END LOOP;
END $$;
