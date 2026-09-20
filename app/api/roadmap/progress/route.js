import { z } from "zod";
import { revalidateTag } from "next/cache";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";
import { milestoneFor } from "@/lib/mentorship";
import { recordRankingEvent, recomputeScores } from "@/lib/ranking";

const progressSchema = z.object({
  nodeId: z.string().min(1),
  status: z.enum(["active", "completed"])
});

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;

  let body;
  try {
    body = progressSchema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }

  const [node] = await sql`
    SELECT * FROM roadmap_nodes WHERE id = ${body.nodeId} LIMIT 1
  `;
  if (!node) return fail("ROADMAP_NODE_NOT_FOUND", "Roadmap node was not found", 404);

  const completedAt = body.status === "completed" ? new Date().toISOString() : null;
  const [row] = await sql`
    INSERT INTO student_roadmap_progress (student_id, node_id, status, completed_at)
    VALUES (${user.id}, ${body.nodeId}, ${body.status}, ${completedAt})
    ON CONFLICT (student_id, node_id) DO UPDATE SET status = EXCLUDED.status, completed_at = EXCLUDED.completed_at, updated_at = NOW()
    RETURNING *
  `;

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id,
    action: body.status === "completed" ? "completed_roadmap_node" : "started_roadmap_node",
    resource: "roadmap_node", resourceId: body.nodeId,
    after: { nodeId: body.nodeId, status: body.status }
  });
  // Purge 10s stale progress cache + warm resource catalog on milestone
  revalidateTag("progress:nodes");
  revalidateTag("resources:counts");

  let milestone = null;
  if (body.status === "completed") {
    milestone = await maybeAwardMilestone({ sql, studentId: user.id, tenantId: tenant?.id });
    await notify({
      sql, tenantId: tenant?.id, userId: user.id,
      type: "roadmap",
      title: milestone ? `Milestone: ${milestone.label}` : `Completed: ${node.title}`,
      body: milestone
        ? "Proof recorded as a chapter achievement — it now lives on your record."
        : "Roadmap progress updated.",
      link: milestone ? "/student/credentials" : "/student/roadmap"
    });
    // Evidence-based ranking
    await recordRankingEvent({ sql, tenantId: tenant?.id, userId: user.id, kind: "roadmap_done", refId: body.nodeId });
    await recomputeScores(sql, tenant?.id);
  } else {
    // Recurrent stuck signal: count active->active without progress as struggle
    try {
      const [cnt] = await sql`SELECT COUNT(*)::int AS n FROM student_roadmap_progress WHERE student_id=${user.id} AND node_id=${body.nodeId} AND status='active'`;
      if (cnt.n >= 1) {
        await sql`
          INSERT INTO help_signals (tenant_id, user_id, kind, ref_id, failures_count, last_failed_at, status, updated_at)
          VALUES (${tenant?.id}::uuid, ${user.id}, 'roadmap_node', ${body.nodeId}, 1, now(), 'open', now())
          ON CONFLICT (tenant_id, user_id, kind, ref_id) DO UPDATE SET failures_count = help_signals.failures_count + 1, last_failed_at=now(), updated_at=now()
        `;
      }
    } catch {}
  }

  return ok({ progress: row, studentId: user.id, role: profile.role, milestone });
}

// Milestones turn sustained motion into chapter achievements — the same
// evidence trail credentials are built from. Idempotent per milestone key.
async function maybeAwardMilestone({ sql, studentId, tenantId }) {
  const [{ nodes = 0 } = {}] = await sql`SELECT COUNT(*)::int AS nodes FROM roadmap_nodes`;
  if (!nodes) return null;
  const [{ done = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS done FROM student_roadmap_progress
    WHERE student_id = ${studentId} AND status = 'completed'
  `;
  const earned = milestoneFor(done, nodes);
  if (!earned) return null;
  const [exists] = await sql`
    SELECT id FROM student_achievements
    WHERE student_id = ${studentId} AND source_type = 'roadmap' AND source_ref = ${earned.key}
    LIMIT 1
  `;
  if (exists) return null;
  const [row] = await sql`
    INSERT INTO student_achievements (student_id, tenant_id, source_type, source_ref, level, evidence_url)
    VALUES (${studentId}, ${tenantId}, 'roadmap', ${earned.key}, ${earned.level}, '/student/roadmap')
    RETURNING *
  `;
  await writeAudit({
    sql, actorId: studentId, tenantId,
    action: "earned_milestone", resource: "achievement", resourceId: row.id,
    after: { key: earned.key, level: earned.level }
  });
  return earned;
}
