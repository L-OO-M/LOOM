-- 075_succession_read_model: give every continuity checklist item a named owner.
--
-- WHY THIS EXISTS
--
-- The checklist could say "hand over the sponsor sheet" but not who owes it,
-- so the succession screen could list outstanding work without naming anyone
-- accountable. The unified read model (`lib/succession.js`) treats an item
-- without an owner as genuinely unfinished and shows it as unassigned rather
-- than silently implying the admin team owns everything.
--
-- `owner_id` is text for the same reason as `lead_handovers.from_user_id`:
-- account keys can be Auth0 ids (`auth0|...`), not UUIDs. `department_id` is
-- optional and scopes where the handover belongs; both are validated against
-- the caller's tenant by the API before write.
--
-- Idempotent throughout.

ALTER TABLE public.handover_checklists
  ADD COLUMN IF NOT EXISTS owner_id text;

ALTER TABLE public.handover_checklists
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;

-- Existing rows predate the column. The continuity checklist is admin-owned,
-- so give each tenant's untouched items its first active admin as the owner
-- instead of leaving them unassigned. Reassignment is explicit afterwards.
UPDATE public.handover_checklists hc
SET owner_id = (
  SELECT p.user_id
  FROM public.profiles p
  WHERE p.tenant_id = hc.tenant_id
    AND p.role = 'admin'
    AND p.account_status = 'active'
  ORDER BY p.name NULLS LAST, p.user_id
  LIMIT 1
)
WHERE hc.owner_id IS NULL;

CREATE INDEX IF NOT EXISTS handover_checklists_owner_idx
  ON public.handover_checklists (tenant_id, owner_id)
  WHERE owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS handover_checklists_department_idx
  ON public.handover_checklists (tenant_id, department_id)
  WHERE department_id IS NOT NULL;

COMMENT ON COLUMN public.handover_checklists.owner_id IS
  'Named person accountable for handing this item over; text because account keys may be Auth0 ids.';
COMMENT ON COLUMN public.handover_checklists.department_id IS
  'Optional department scope for the continuity item; NULL means chapter-wide.';
