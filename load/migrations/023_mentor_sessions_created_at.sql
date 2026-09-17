-- 023_mentor_sessions_created_at: backfill the audit column the booking
-- workflow assumes. mentor_sessions predates the tracked migrations
-- (001 notes it "already exists"), so its schema drifted behind.
CREATE TABLE IF NOT EXISTS public.mentor_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id text NOT NULL,
  student_id text NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  scheduled_at timestamptz
);
ALTER TABLE public.mentor_sessions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
