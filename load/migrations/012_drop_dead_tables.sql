-- 012_drop_dead_tables: remove tables that never earned their keep.
--
-- leaderboard_snapshots: created in 006, never written or read once.
--   The leaderboard computes live from profiles + activity + progress.
-- roadmaps: the catalog lives in roadmap_nodes (domain column); no query
--   has ever touched this table.
-- users: write-only mirror (INSERT on login, zero SELECTs). profiles is the
--   source of truth for identity, role, and tenant.
-- tenant_database_routes: multi-DB routing was never built; single DATABASE_URL.
DROP TABLE IF EXISTS public.leaderboard_snapshots CASCADE;
DROP TABLE IF EXISTS public.roadmaps CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.tenant_database_routes CASCADE;
