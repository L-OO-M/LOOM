-- 036_roadmap_node_resources: explicit per-node resource shelves.
--
-- The detail page and journey drawer showed a domain-wide shelf
-- (resources WHERE domain = node.domain ORDER BY minutes LIMIT 6), so every
-- node sharing a domain rendered the identical rows. This table is the
-- association; nodes without links render the existing honest empty states.
-- Global catalog (no tenant_id), like its parents roadmap_nodes/resources,
-- so no tenant RLS policy applies. loom_app inherits access via the 030
-- default privileges — verify post-apply with a plain SELECT as the app
-- role before considering this done. DO NOT backfill from the old
-- domain-wide query: that would copy the bug into explicit rows. Populate
-- via load/seed-node-resources.js (reviewed proposal only).
CREATE TABLE IF NOT EXISTS public.roadmap_node_resources (
  node_id text NOT NULL REFERENCES public.roadmap_nodes(id) ON DELETE CASCADE,
  resource_id text NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  PRIMARY KEY (node_id, resource_id)
);
CREATE INDEX IF NOT EXISTS roadmap_node_resources_node_idx
  ON public.roadmap_node_resources(node_id, sort_order);
