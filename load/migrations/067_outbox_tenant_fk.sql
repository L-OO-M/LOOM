-- 067_outbox_tenant_fk: make a bad tenant fail at enqueue time, not at drain.
--
-- `notifications`, `audit_logs` and every other tenant-owned table reference
-- `tenants(id)`. Without the same constraint the outbox accepts a row for a
-- tenant that does not exist and only discovers it when the drainer tries to
-- write the side effect -- by which point the failure is a retry loop that ends
-- in the dead-letter pile instead of a clear error at the call site.
--
-- ON DELETE CASCADE: a deleted chapter's queued events should go with it rather
-- than block the delete.
--
-- Idempotent: guarded by a catalog check so re-running is a no-op.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.outbox'::regclass
      AND conname = 'outbox_tenant_id_fkey'
  ) THEN
    ALTER TABLE public.outbox
      ADD CONSTRAINT outbox_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;
END $$;
