-- One participation certificate per (event, student).
--
-- Bug: app/api/admin/events/[id]/attendance minted a fresh random
-- verification_code on every check-in and relied on
-- ON CONFLICT (verification_code) DO NOTHING. A random 10-char code can never
-- collide, so the conflict branch was unreachable and re-checking a student in
-- silently created a second certificate row. The code's own comment claimed
-- "exactly once".
--
-- Fix: make the invariant a database constraint so it holds no matter which
-- caller writes. Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'certificates_event_student_key'
      AND conrelid = 'public.certificates'::regclass
  ) THEN
    -- Collapse any duplicates created before the constraint existed, keeping
    -- the earliest certificate per (event_id, student_id). `issued_at` is the
    -- timestamp column on certificates (000_base_schema.sql:108).
    DELETE FROM public.certificates a
    USING public.certificates b
    WHERE a.event_id = b.event_id
      AND a.student_id = b.student_id
      AND a.issued_at > b.issued_at;

    ALTER TABLE public.certificates
      ADD CONSTRAINT certificates_event_student_key UNIQUE (event_id, student_id);
  END IF;
END $$;