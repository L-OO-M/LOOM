-- 041_mou: Memoranda of Understanding with partners, sponsors and colleges.
--
-- One row per agreement plus an append-only document history. Documents are
-- stored in Supabase Storage (lib/storage.js, scope "mou"); these tables hold
-- only metadata and object paths, never bytes — same split as migration 040.
--
-- Versioning model: mou_documents rows are immutable. A named document (label)
-- gains a new row with version = previous + 1, so every signed copy stays
-- recoverable and the newest row per label is the live one.
--
-- expiry_notified_at backs the reminder job (P5): the job sets it after it has
-- pushed an in-app notification, so a near-expiry MoU is not announced twice.
--
-- Additive and idempotent (AGENTS.md iron rule 6). Fail-closed RLS in the same
-- style and order as migrations 031/040.

CREATE TABLE IF NOT EXISTS public.mous (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  partner_name text NOT NULL,
  partner_type text NOT NULL DEFAULT 'other',
  summary text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  -- NULL vertical = society-wide agreement.
  vertical text,
  value_amount numeric(12,2),
  value_currency text NOT NULL DEFAULT 'INR',
  signed_on date,
  starts_on date,
  ends_on date,
  owner_id text NOT NULL,
  notes text NOT NULL DEFAULT '',
  expiry_notified_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mous_partner_type_check CHECK (
    partner_type IN ('sponsor', 'company', 'college', 'community', 'government', 'other')
  ),
  CONSTRAINT mous_status_check CHECK (
    status IN ('draft', 'sent', 'active', 'expired', 'terminated')
  ),
  CONSTRAINT mous_vertical_check CHECK (vertical IS NULL OR vertical IN ('technical', 'non_technical')),
  CONSTRAINT mous_value_check CHECK (value_amount IS NULL OR value_amount >= 0),
  CONSTRAINT mous_window_check CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS mous_tenant_idx
  ON public.mous(tenant_id, is_active, ends_on);
CREATE INDEX IF NOT EXISTS mous_status_idx
  ON public.mous(tenant_id, status);
CREATE INDEX IF NOT EXISTS mous_owner_idx
  ON public.mous(tenant_id, owner_id);

CREATE TABLE IF NOT EXISTS public.mou_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  mou_id uuid NOT NULL REFERENCES public.mous(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Agreement',
  version integer NOT NULL DEFAULT 1,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mou_documents_unique UNIQUE (mou_id, label, version)
);
CREATE INDEX IF NOT EXISTS mou_documents_tenant_idx
  ON public.mou_documents(tenant_id, mou_id, label, version DESC);

-- Fail-closed RLS, mirroring migrations 031/040. NULL tenant_id is never a
-- legitimate state for these tables, so there is no "allow unset" arm.
DO $$
DECLARE
  t text;
  new_tables text[] := ARRAY['mous', 'mou_documents'];
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
