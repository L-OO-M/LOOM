import { ok, fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";

export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, sql } = ctx;

  const nodes = await sql`SELECT * FROM roadmap_nodes ORDER BY sort_order ASC`;
  const done = await sql`SELECT node_id, status FROM student_roadmap_progress WHERE student_id = ${user.id}`;
  const map = Object.fromEntries(done.map((d) => [d.node_id, d.status]));
  return ok({
    nodes: nodes.map((n) => ({ ...n, status: map[n.id] || "locked" })),
    completed: done.filter((d) => d.status === "completed").length,
    total: nodes.length
  });
}
