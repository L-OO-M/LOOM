-- 036_tenant_leading_indexes: index every tenant-owned table on tenant_id first.
--
-- WHY THIS EXISTS
-- Tenant isolation is enforced in the application layer (every query filters
-- `WHERE tenant_id = $1`, hardened in migration-adjacent code and asserted by
-- tests/tenant-isolation.test.js). That makes tenant_id the single most common
-- predicate in the whole database -- and an audit of pg_index found ten
-- tenant-owned tables with no index led by it, so every one of those queries
-- degrades to a sequential scan as the table grows.
--
-- An index is not a correctness control, so this is a scale change rather than a
-- security fix. It is written here anyway because it belongs with the schema and
-- because it is measured: on a table large enough for the planner to care, the
-- difference is milliseconds per row turned into an index scan.
--
-- COMPOSITE, not single-column: the leading tenant_id satisfies isolation, and
-- the second column matches the ordering/predicate that actually follows it in
-- the hot queries. A bare (tenant_id) index would have to sort afterwards.
--
-- Idempotent: CREATE INDEX IF NOT EXISTS throughout. Safe to re-run.
--
-- Scoped deliberately:
--   * open_source_projects is a GLOBAL catalogue (tenant_id IS NULL is its
--     intended representation) and is deliberately absent here.
--   * Tables with no tenant_id column are absent by construction.
--   * Existing tenant_id-leading indexes are left alone; only genuine gaps are
--     filled, so this cannot regress a hand-tuned index.

-- ── Verification / proof tables ───────────────────────────────────────────────
-- A credential or badge is always fetched by tenant, then by owner or id.
CREATE INDEX IF NOT EXISTS verifiable_credentials_tenant_student_idx
  ON public.verifiable_credentials (tenant_id, student_id);

CREATE INDEX IF NOT EXISTS certificates_tenant_event_student_idx
  ON public.certificates (tenant_id, event_id, student_id);

CREATE INDEX IF NOT EXISTS oss_badges_tenant_student_idx
  ON public.oss_badges (tenant_id, student_id);

CREATE INDEX IF NOT EXISTS student_achievements_tenant_student_idx
  ON public.student_achievements (tenant_id, student_id);

CREATE INDEX IF NOT EXISTS mentor_effectiveness_tenant_mentor_idx
  ON public.mentor_effectiveness (tenant_id, mentor_id);

-- ── Inbox ─────────────────────────────────────────────────────────────────────
-- GET /api/notifications is `WHERE user_id = $1`; any tenant-wide read (admin
-- fan-out, unread counts) leads with tenant_id.
CREATE INDEX IF NOT EXISTS notifications_tenant_user_created_idx
  ON public.notifications (tenant_id, user_id, created_at DESC);

-- ── Public profiles ───────────────────────────────────────────────────────────
-- /u/<username> and the social directory both filter tenant then username.
CREATE INDEX IF NOT EXISTS user_profiles_tenant_username_idx
  ON public.user_profiles (tenant_id, username);

-- ── Peer help ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS help_matches_tenant_signal_status_idx
  ON public.help_matches (tenant_id, signal_id, status);

-- ── Contribution ledger ───────────────────────────────────────────────────────
-- /admin/reports groups contributions per department within a tenant.
CREATE INDEX IF NOT EXISTS member_contributions_tenant_department_idx
  ON public.member_contributions (tenant_id, department_id, created_at DESC);

-- ── Open-source claims ────────────────────────────────────────────────────────
-- /api/opensource/contributions leads with tenant then student.
CREATE INDEX IF NOT EXISTS student_oss_contributions_tenant_student_idx
  ON public.student_oss_contributions (tenant_id, student_id);