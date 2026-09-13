-- 009_community: forums + wiki + snippets + votes/flags for moderation
-- Tracked migration. Apply with: node load/migrate.js

CREATE TABLE IF NOT EXISTS public.forum_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  domain text NOT NULL DEFAULT 'general',
  author_id text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  view_count integer NOT NULL DEFAULT 0,
  reply_count integer NOT NULL DEFAULT 0,
  upvote_count integer NOT NULL DEFAULT 0,
  solved boolean NOT NULL DEFAULT false,
  solution_post_id uuid,
  pinned boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden')),
  flag_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS forum_threads_tenant_idx ON public.forum_threads(tenant_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS forum_threads_domain_idx ON public.forum_threads(domain);

CREATE TABLE IF NOT EXISTS public.forum_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  author_id text NOT NULL,
  body text NOT NULL DEFAULT '',
  upvote_count integer NOT NULL DEFAULT 0,
  is_answer boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden')),
  flag_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS forum_replies_thread_idx ON public.forum_replies(thread_id, created_at);

-- One vote per student per target (threads, replies, snippets).
CREATE TABLE IF NOT EXISTS public.forum_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('thread', 'reply', 'snippet')),
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS forum_votes_target_idx ON public.forum_votes(target_type, target_id);

-- Flags for moderation queue (spam, abuse, off-topic).
CREATE TABLE IF NOT EXISTS public.forum_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id text NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('thread', 'reply')),
  target_id uuid NOT NULL,
  reason text NOT NULL DEFAULT 'spam',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS public.wiki_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  slug text NOT NULL,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  domain text NOT NULL DEFAULT 'general',
  author_id text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft')),
  view_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS wiki_pages_tenant_idx ON public.wiki_pages(tenant_id, status);

CREATE TABLE IF NOT EXISTS public.wiki_edit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.wiki_pages(id) ON DELETE CASCADE,
  requester_id text NOT NULL,
  proposed_title text,
  proposed_content text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wiki_edits_page_idx ON public.wiki_edit_requests(page_id, status);

CREATE TABLE IF NOT EXISTS public.code_snippets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  author_id text NOT NULL,
  domain text NOT NULL DEFAULT 'general',
  language text NOT NULL DEFAULT 'javascript',
  title text NOT NULL,
  code text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  upvote_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS snippets_tenant_idx ON public.code_snippets(tenant_id, status, upvote_count DESC);
