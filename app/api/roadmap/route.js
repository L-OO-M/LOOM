import { ok, fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { nextStepForStudent } from "@/lib/roadmap-next";

export async function GET(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, sql } = ctx;

  const requested = request ? new URL(request.url).searchParams.get("domain") : null;
  const step = await nextStepForStudent(sql, user.id, requested);

  const nodes = await sql`SELECT * FROM roadmap_nodes ORDER BY sort_order ASC`;
  const done = await sql`
    SELECT node_id, status, evidence_state FROM student_roadmap_progress WHERE student_id = ${user.id}
  `;
  const map = Object.fromEntries(done.map((d) => [d.node_id, d.status]));
  const verified = done.filter((d) => d.status === "completed" && d.evidence_state === "verified");
  return ok({
    nodes: nodes.map((n) => ({ ...n, status: map[n.id] || "locked" })),
    completed: verified.length,
    awaitingReview: done.filter((d) => d.status === "completed" && d.evidence_state !== "verified").length,
    total: nodes.length,
    domain: step.domain,
    next: step.node,
    prerequisites: step.prerequisites,
    reason: step.reason
  });
}
