import { unstable_cache } from "next/cache";
import { getSql } from "@/lib/db";

// Global catalog — rarely changes (admin curates). 30s stale + tag-based
// revalidation on mutations (revalidateTag("resources:…")) keeps instant
// revisit while protecting pooler QPS (max:10).
export const getCachedResourceCounts = unstable_cache(
  async () => {
    const sql = getSql();
    return sql`SELECT domain, COUNT(*)::int AS n FROM resources GROUP BY domain`;
  },
  ["resources:counts"],
  { revalidate: 30, tags: ["resources:counts"] }
);

export const getCachedResourceLevels = unstable_cache(
  async () => {
    const sql = getSql();
    return sql`SELECT DISTINCT level FROM resources ORDER BY level ASC`;
  },
  ["resources:levels"],
  { revalidate: 30, tags: ["resources:levels"] }
);

export const getCachedResourceTotal = unstable_cache(
  async () => {
    const sql = getSql();
    const rows = await sql`SELECT COUNT(*)::int AS n FROM resources`;
    return rows;
  },
  ["resources:total"],
  { revalidate: 30, tags: ["resources:total"] }
);

// User progress — 10s stale + tag revalidation on POST /api/roadmap/progress
// and POST /api/resources. Instant back/forward for 10s window.
export const getCachedNodeProgress = unstable_cache(
  async (studentId) => {
    const sql = getSql();
    return sql`SELECT node_id FROM student_roadmap_progress WHERE student_id = ${studentId} AND status = 'completed'`;
  },
  ["progress:nodes"],
  { revalidate: 10, tags: ["progress:nodes"] }
);
