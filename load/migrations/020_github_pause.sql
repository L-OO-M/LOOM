-- 020_github_pause: ingestion is opt-IN, not opt-out.
--
-- GitHub webhooks fire automatically once configured. Until a chapter
-- explicitly enables github_integration in /admin/flags, deliveries are
-- acknowledged but never stored, verified, or aggregated. Runs once via the
-- tracked runner; afterwards the flag is owned entirely by /admin/flags.
UPDATE public.feature_flags SET enabled = false, updated_at = NOW()
WHERE key = 'github_integration';

INSERT INTO public.feature_flags (tenant_id, key, enabled)
SELECT t.id, 'github_integration', false FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.feature_flags f
  WHERE f.tenant_id = t.id AND f.key = 'github_integration'
);
