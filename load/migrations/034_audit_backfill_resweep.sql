-- 034_audit_backfill_resweep: re-run the audit_logs.tenant_id backfill.
--
-- Migration 031 backfilled 53 rows, but a row written by the PRE-FIX writeAudit
-- (which only stuffed the tenant into metadata JSONB) landed afterwards and is
-- still NULL. Under the fail-closed policies from 031 that row is invisible to
-- every tenant -- so /admin/audit would silently under-report by one entry.
--
-- Caught by an owner-vs-scoped parity check across 15 tables (14 identical,
-- audit_logs 55 vs 54). This resweep is idempotent and re-runs the same
-- metadata -> column copy, so any other straggler from before the writeAudit
-- fix is repaired too. After the fix no new row can land NULL, so this only
-- needs to run once -- it is kept as a migration rather than a manual UPDATE
-- so the repair travels with the schema rather than living in someone's shell.
--
-- Idempotent.

DO $$
DECLARE
  repaired integer := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='audit_logs' AND column_name='tenant_id') THEN
    UPDATE public.audit_logs a
       SET tenant_id = NULLIF(a.metadata->>'tenant_id','')::uuid
     WHERE a.tenant_id IS NULL
       AND a.metadata ? 'tenant_id'
       AND NULLIF(a.metadata->>'tenant_id','') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
    GET DIAGNOSTICS repaired = ROW_COUNT;
  END IF;
  RAISE NOTICE 'audit_logs tenant_id backfilled: % row(s)', repaired;
END $$;
