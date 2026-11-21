-- 094_capability_and_lifecycle_hardening.sql
-- Establishes scoped role grants with tenant-membership integrity,
-- extended event FSM states, event status history, and media asset categorization.

-- ---------------------------------------------------------------------------
-- 1. Scoped Role Grants
-- ---------------------------------------------------------------------------
-- Replaces linear role hierarchy with scoped capabilities.
-- Enforces tenant membership integrity and expiry validation.
CREATE TABLE IF NOT EXISTS public.scoped_role_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  role_name text NOT NULL, -- 'dept_lead', 'co_head', 'event_lead', 'event_door_staff', 'auditor', 'core'
  scope_type text NOT NULL, -- 'tenant', 'vertical', 'department', 'event', 'project'
  scope_id text NOT NULL,   -- department_id, event_id, project_id, vertical name, or tenant_id
  granted_by text NOT NULL REFERENCES public.profiles(user_id),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  revoked_at timestamptz,
  revoked_by text REFERENCES public.profiles(user_id),
  revocation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scoped_role_grants_scope_type_check CHECK (
    scope_type IN ('tenant', 'vertical', 'department', 'event', 'project')
  ),
  CONSTRAINT scoped_role_grants_expiry_check CHECK (
    expires_at IS NULL OR expires_at > starts_at
  ),
  CONSTRAINT scoped_role_grants_revocation_pair CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL) OR
    (revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
  ),
  -- Foreign key ensuring profile exists
  CONSTRAINT scoped_role_grants_user_fk FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS scoped_role_grants_active_lookup_idx
  ON public.scoped_role_grants(tenant_id, user_id, is_active, scope_type, scope_id)
  WHERE is_active = true AND revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Extended Event FSM Statuses & Lifecycle Controls
-- ---------------------------------------------------------------------------
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE public.events ADD CONSTRAINT events_status_check CHECK (
  status IN (
    'draft',
    'submitted',
    'under_review',
    'approved',
    'published',
    'registration_closed',
    'live',
    'completed',
    'archived',
    'rejected',
    'cancelled',
    'postponed'
  )
);

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS registration_opens_at timestamptz,
  ADD COLUMN IF NOT EXISTS registration_closes_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by text REFERENCES public.profiles(user_id),
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS lock_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_registration_window_check;
ALTER TABLE public.events ADD CONSTRAINT events_registration_window_check CHECK (
  registration_closes_at IS NULL OR registration_opens_at IS NULL OR registration_closes_at > registration_opens_at
);

-- Event Status Audit & Transition History
CREATE TABLE IF NOT EXISTS public.event_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  previous_status text NOT NULL,
  new_status text NOT NULL,
  performed_by text NOT NULL REFERENCES public.profiles(user_id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_status_history_event_idx
  ON public.event_status_history(tenant_id, event_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. Media Assets Categorization and Lifecycle Status
-- ---------------------------------------------------------------------------
-- Ensure any existing rows have a valid default before applying check constraint
ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'event_creative',
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'draft';

-- Migrate any legacy or unexpected categories before adding the constraint
UPDATE public.media_assets
SET category = 'event_creative'
WHERE category NOT IN (
  'brand_identity',
  'event_creative',
  'social_clip',
  'event_photo',
  'official_document',
  'presentation_deck',
  'merchandise'
);

ALTER TABLE public.media_assets DROP CONSTRAINT IF EXISTS media_assets_category_check;
ALTER TABLE public.media_assets ADD CONSTRAINT media_assets_category_check CHECK (
  category IN (
    'brand_identity',
    'event_creative',
    'social_clip',
    'event_photo',
    'official_document',
    'presentation_deck',
    'merchandise'
  )
);

ALTER TABLE public.media_assets DROP CONSTRAINT IF EXISTS media_assets_lifecycle_status_check;
ALTER TABLE public.media_assets ADD CONSTRAINT media_assets_lifecycle_status_check CHECK (
  lifecycle_status IN ('draft', 'pending_approval', 'approved', 'archived')
);

-- ---------------------------------------------------------------------------
-- 4. Structured Chapter Settings
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{
    "relaxation_window": {
      "enabled": false,
      "start": null,
      "end": null,
      "allowed_categories": []
    },
    "dual_head_approval": {
      "require_dual_on_budget": true,
      "budget_threshold": 10000,
      "currency": "INR"
    },
    "public_passport_defaults": {
      "visibility": "chapter",
      "show_academic_info": false,
      "show_unverified_projects": false
    }
  }'::jsonb;
