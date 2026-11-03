-- 065_tenant_backfill_indexes: give the tables excluded from 031 a tenant
-- column, backfill it from the owning row, and index the tenant-scoped reads.
--
-- Why these eight: 031 could only policy the tables that already had tenant_id.
-- These were reachable only through a parent row (department, event, contest,
-- slot) or through the acting student's profile, so every tenant-scoped read had
-- to join upward before it could filter. 031 skipped them deliberately; this
-- migration closes that gap without turning RLS on (RLS remains off by
-- decision, see docs/25).
--
-- Backfill rule: derive from the owning row, never from a client-supplied value.
--   department_memberships -> departments.tenant_id
--   event_registrations    -> events.tenant_id, then the student's profile
--   forum_votes/flags      -> the voting student's profile.tenant_id
--   volunteer_signups      -> volunteer_slots.tenant_id, then the student
--   github_events          -> the student's profile (column already existed)
--   mentor_sessions        -> the student's profile, then the mentor's
--   contest_submissions    -> contests.tenant_id, then the student
--
-- A row whose parent/profile cannot be resolved keeps NULL. That is honest: it
-- means the row is unreachable by any tenant, and the app treats NULL as
-- "unknown chapter". No default tenant is invented here.
--
-- All uuid comparisons are uuid = uuid (not ::text), so the index can be used.
-- Idempotent: ADD COLUMN IF NOT EXISTS, backfill only touches NULL rows, and
-- every index is CREATE INDEX IF NOT EXISTS.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
ALTER TABLE department_memberships ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE event_registrations    ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE forum_votes            ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE forum_flags            ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE volunteer_signups      ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE mentor_sessions        ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE contest_submissions    ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- ---------------------------------------------------------------------------
-- 2. Backfill (NULL-only, so a re-run is a no-op and never re-homes a row)
-- ---------------------------------------------------------------------------
UPDATE department_memberships dm
   SET tenant_id = d.tenant_id
  FROM departments d
 WHERE dm.department_id = d.id
   AND dm.tenant_id IS NULL;

UPDATE event_registrations er
   SET tenant_id = e.tenant_id
  FROM events e
 WHERE er.event_id = e.id
   AND er.tenant_id IS NULL;

-- Fallback for a registration whose event row is gone: the student's chapter.
UPDATE event_registrations er
   SET tenant_id = p.tenant_id
  FROM profiles p
 WHERE er.student_id = p.user_id
   AND er.tenant_id IS NULL;

UPDATE forum_votes fv
   SET tenant_id = p.tenant_id
  FROM profiles p
 WHERE fv.student_id = p.user_id
   AND fv.tenant_id IS NULL;

UPDATE forum_flags ff
   SET tenant_id = p.tenant_id
  FROM profiles p
 WHERE ff.student_id = p.user_id
   AND ff.tenant_id IS NULL;

UPDATE volunteer_signups v
   SET tenant_id = s.tenant_id
  FROM volunteer_slots s
 WHERE v.slot_id = s.id
   AND v.tenant_id IS NULL;

UPDATE volunteer_signups v
   SET tenant_id = p.tenant_id
  FROM profiles p
 WHERE v.user_id = p.user_id
   AND v.tenant_id IS NULL;

UPDATE github_events g
   SET tenant_id = p.tenant_id
  FROM profiles p
 WHERE g.student_id = p.user_id
   AND g.tenant_id IS NULL;

UPDATE mentor_sessions m
   SET tenant_id = p.tenant_id
  FROM profiles p
 WHERE m.student_id = p.user_id
   AND m.tenant_id IS NULL;

UPDATE mentor_sessions m
   SET tenant_id = p.tenant_id
  FROM profiles p
 WHERE m.mentor_id = p.user_id
   AND m.tenant_id IS NULL;

UPDATE contest_submissions cs
   SET tenant_id = c.tenant_id
  FROM contests c
 WHERE cs.contest_id = c.id
   AND cs.tenant_id IS NULL;

UPDATE contest_submissions cs
   SET tenant_id = p.tenant_id
  FROM profiles p
 WHERE cs.student_id = p.user_id
   AND cs.tenant_id IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Tenant-leading indexes for the read patterns these tables actually serve
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS department_memberships_tenant_dept_idx
  ON department_memberships (tenant_id, department_id);
CREATE INDEX IF NOT EXISTS department_memberships_tenant_user_idx
  ON department_memberships (tenant_id, user_id);

CREATE INDEX IF NOT EXISTS event_registrations_tenant_event_idx
  ON event_registrations (tenant_id, event_id, status);
CREATE INDEX IF NOT EXISTS event_registrations_tenant_student_idx
  ON event_registrations (tenant_id, student_id);

CREATE INDEX IF NOT EXISTS forum_votes_tenant_target_idx
  ON forum_votes (tenant_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS forum_votes_tenant_student_idx
  ON forum_votes (tenant_id, student_id);

CREATE INDEX IF NOT EXISTS forum_flags_tenant_target_idx
  ON forum_flags (tenant_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS forum_flags_tenant_student_idx
  ON forum_flags (tenant_id, student_id);

CREATE INDEX IF NOT EXISTS volunteer_signups_tenant_slot_idx
  ON volunteer_signups (tenant_id, slot_id);
CREATE INDEX IF NOT EXISTS volunteer_signups_tenant_user_idx
  ON volunteer_signups (tenant_id, user_id);

CREATE INDEX IF NOT EXISTS github_events_tenant_received_idx
  ON github_events (tenant_id, received_at DESC);

CREATE INDEX IF NOT EXISTS mentor_sessions_tenant_scheduled_idx
  ON mentor_sessions (tenant_id, scheduled_at);
CREATE INDEX IF NOT EXISTS mentor_sessions_tenant_student_idx
  ON mentor_sessions (tenant_id, student_id);

CREATE INDEX IF NOT EXISTS contest_submissions_tenant_contest_idx
  ON contest_submissions (tenant_id, contest_id, status);
