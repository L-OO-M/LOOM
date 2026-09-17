-- 021_mentor_booking: full booking workflow for the Mentors feature.
-- Extends the minimal mentors directory (001) without touching applied
-- migrations. mentor_sessions.mentor_id keeps storing mentors.user_id.

-- Richer mentor profiles (all nullable/additive; old rows keep working).
ALTER TABLE public.mentors ADD COLUMN IF NOT EXISTS headline text NOT NULL DEFAULT '';
ALTER TABLE public.mentors ADD COLUMN IF NOT EXISTS skills text NOT NULL DEFAULT '';
ALTER TABLE public.mentors ADD COLUMN IF NOT EXISTS experience_years integer;
ALTER TABLE public.mentors ADD COLUMN IF NOT EXISTS languages text NOT NULL DEFAULT '';
ALTER TABLE public.mentors ADD COLUMN IF NOT EXISTS timezone text;
ALTER TABLE public.mentors ADD COLUMN IF NOT EXISTS hourly_rate integer;
ALTER TABLE public.mentors ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR';
ALTER TABLE public.mentors ADD COLUMN IF NOT EXISTS session_minutes integer NOT NULL DEFAULT 60;
ALTER TABLE public.mentors ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

-- Weekly availability per mentor (mentor_id stores mentors.user_id).
CREATE TABLE IF NOT EXISTS public.mentor_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id text NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time text NOT NULL,
  end_time text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mentor_id, day_of_week, start_time)
);
CREATE INDEX IF NOT EXISTS mentor_availability_mentor_idx ON public.mentor_availability(mentor_id, day_of_week);

-- Mentor sessions gain booking detail (all additive).
ALTER TABLE public.mentor_sessions ADD COLUMN IF NOT EXISTS topic text NOT NULL DEFAULT '';
ALTER TABLE public.mentor_sessions ADD COLUMN IF NOT EXISTS message text NOT NULL DEFAULT '';
ALTER TABLE public.mentor_sessions ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 30;
ALTER TABLE public.mentor_sessions ADD COLUMN IF NOT EXISTS price integer;
ALTER TABLE public.mentor_sessions ADD COLUMN IF NOT EXISTS meeting_url text;
CREATE INDEX IF NOT EXISTS mentor_sessions_mentor_idx ON public.mentor_sessions(mentor_id, scheduled_at);
CREATE INDEX IF NOT EXISTS mentor_sessions_student_idx ON public.mentor_sessions(student_id, scheduled_at);

-- Reviews can reference the session they came from.
ALTER TABLE public.mentor_reviews ADD COLUMN IF NOT EXISTS session_id uuid;

-- Direct student <-> mentor messages.
CREATE TABLE IF NOT EXISTS public.mentor_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id text NOT NULL,
  receiver_id text NOT NULL,
  body text NOT NULL DEFAULT '',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mentor_messages_thread_idx ON public.mentor_messages(sender_id, receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mentor_messages_receiver_idx ON public.mentor_messages(receiver_id, read_at);
