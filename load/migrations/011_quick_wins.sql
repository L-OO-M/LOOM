-- 011_quick_wins: project topic tags + roadmap node difficulty levels
-- Tracked migration. Apply with: node load/migrate.js

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS projects_tags_idx ON public.projects USING gin (tags);

ALTER TABLE public.roadmap_nodes ADD COLUMN IF NOT EXISTS difficulty_level text NOT NULL DEFAULT 'beginner'
  CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced'));

-- Calibrated levels for the 7 seeded nodes (idempotent updates).
UPDATE public.roadmap_nodes SET difficulty_level = 'beginner' WHERE id IN ('node_html_css', 'node_javascript', 'node_git_github');
UPDATE public.roadmap_nodes SET difficulty_level = 'intermediate' WHERE id IN ('node_react', 'node_node', 'node_database');
UPDATE public.roadmap_nodes SET difficulty_level = 'advanced' WHERE id = 'node_deploy';
