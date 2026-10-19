-- 045_resource_nodes: link a curated resource to the roadmap node it teaches.
--
-- resources carried only a `domain`, so a node page listed six arbitrary books
-- from the whole domain as if they were that node's material — the label said
-- "Study this", the query said "anything in web". node_id lets a curator attach
-- a resource to the exact node. The node query prefers node-linked rows and
-- falls back to the domain (labelled honestly) when a node has none yet, so the
-- change is additive and needs no backfill.
--
-- ON DELETE SET NULL: deleting a node detaches its resources rather than
-- deleting curated catalog entries, which are global and reusable.

ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS node_id text REFERENCES public.roadmap_nodes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS resources_node_idx ON public.resources(node_id);
