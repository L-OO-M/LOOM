-- 010_events_social: workshops/hackathons + attendance + certificates + public profiles
-- Tracked migration. Apply with: node load/migrate.js

CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL DEFAULT 'workshop' CHECK (event_type IN ('workshop', 'hackathon', 'talk', 'mentoring', 'contest')),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  domain text NOT NULL DEFAULT 'general',
  speaker_name text,
  speaker_bio text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  location text,
  capacity integer,
  registered_count integer NOT NULL DEFAULT 0,
  is_online boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'past', 'cancelled')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_tenant_idx ON public.events(tenant_id, status, starts_at);

CREATE TABLE IF NOT EXISTS public.event_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  student_id text NOT NULL,
  status text NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'attended', 'no-show', 'cancelled')),
  attended_at timestamptz,
  feedback_score integer CHECK (feedback_score IS NULL OR (feedback_score BETWEEN 1 AND 5)),
  feedback_text text,
  check_in_code text NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, student_id)
);
CREATE INDEX IF NOT EXISTS event_reg_event_idx ON public.event_registrations(event_id, status);

CREATE TABLE IF NOT EXISTS public.event_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  file_type text NOT NULL DEFAULT 'slide' CHECK (file_type IN ('slide', 'recording', 'handout', 'code', 'link')),
  title text NOT NULL,
  storage_url text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

-- Certificates are printable HTML at /certificates/<verification_code>.
CREATE TABLE IF NOT EXISTS public.certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  student_id text NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  title text NOT NULL,
  verification_code text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS certificates_student_idx ON public.certificates(student_id);

-- Public profile card per user (username powers /student/<username>).
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  username text NOT NULL UNIQUE,
  bio text NOT NULL DEFAULT '',
  avatar_url text,
  location text,
  social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  primary_domain text,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.followers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id text NOT NULL,
  following_id text NOT NULL CHECK (follower_id <> following_id),
  followed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(follower_id, following_id)
);
CREATE INDEX IF NOT EXISTS followers_following_idx ON public.followers(following_id);

CREATE TABLE IF NOT EXISTS public.user_endorsements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endorser_id text NOT NULL,
  endorsee_id text NOT NULL CHECK (endorser_id <> endorsee_id),
  skill text NOT NULL,
  endorsed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(endorser_id, endorsee_id, skill)
);

CREATE TABLE IF NOT EXISTS public.mentor_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id text NOT NULL,
  reviewer_id text NOT NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text text NOT NULL DEFAULT '',
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mentor_id, reviewer_id)
);
CREATE INDEX IF NOT EXISTS mentor_reviews_mentor_idx ON public.mentor_reviews(mentor_id);
