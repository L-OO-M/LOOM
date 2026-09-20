-- 023_roadmap_graph: branching roadmap support (roadmap.sh style)
-- Adds node graph metadata + edge DAG. sort_order remains fallback for linear view.
ALTER TABLE public.roadmap_nodes ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'topic'
  CHECK (kind IN ('topic','group','label'));
ALTER TABLE public.roadmap_nodes ADD COLUMN IF NOT EXISTS group_id text REFERENCES public.roadmap_nodes(id) ON DELETE SET NULL;
ALTER TABLE public.roadmap_nodes ADD COLUMN IF NOT EXISTS is_highlighted boolean NOT NULL DEFAULT false;
ALTER TABLE public.roadmap_nodes ADD COLUMN IF NOT EXISTS is_optional boolean NOT NULL DEFAULT false;
ALTER TABLE public.roadmap_nodes ADD COLUMN IF NOT EXISTS x integer;
ALTER TABLE public.roadmap_nodes ADD COLUMN IF NOT EXISTS y integer;

CREATE TABLE IF NOT EXISTS public.roadmap_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id text NOT NULL REFERENCES public.roadmap_nodes(id) ON DELETE CASCADE,
  to_id text NOT NULL REFERENCES public.roadmap_nodes(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'required' CHECK (kind IN ('required','optional','alternative')),
  label text,
  UNIQUE(from_id,to_id)
);
CREATE INDEX IF NOT EXISTS roadmap_edges_from_idx ON public.roadmap_edges(from_id);
CREATE INDEX IF NOT EXISTS roadmap_edges_to_idx ON public.roadmap_edges(to_id);
