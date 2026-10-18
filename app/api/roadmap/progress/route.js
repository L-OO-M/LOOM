import { z } from "zod";
import { revalidateTag } from "next/cache";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";
import { milestoneFor } from "@/lib/mentorship";
import { unmetPrerequisites } from "@/lib/ranking";
import { checkRateLimit } from "@/lib/rate-limit";

const progressSchema = z.object({
  nodeId: z.string().min(1),
  status: z.enum(["active", "completed"]),
  // Evidence is what separates a claim from a record. Both are optional in the
  // schema because "completed" without evidence is still a legal claim — it
  // just stays provisional and scores nothing.
  evidenceUrl: z.string().url().max(500).nullable().optional(),
  evidenceNote: z.string().min(20).max(500).nullable().optional()
});

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;

  // This route used to be an unbounded scoring endpoint: one POST per node was
  // worth 30 points on the public board, with no limit, so the whole roadmap
  // could be self-issued in under a minute. A limit alone would not help —
  // scripted sequential requests look exactly like a student working — so this
  // is defence in depth behind the prerequisite gate and the provisional
  // evidence state, not a substitute for either.
  const limited = checkRateLimit(request, { userId: user.id, limit: 30, windowMs: 60_000 });
  if (!limited.ok) return fail("RATE_LIMITED", "Too many progress updates — pause for a moment", 429);

  let body;
  try {
    body = progressSchema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }

  const [node] = await sql`
    SELECT id, title, is_optional FROM roadmap_nodes WHERE id = ${body.nodeId} LIMIT 1
  `;
  if (!node) return fail("ROADMAP_NODE_NOT_FOUND", "Roadmap node was not found", 404);

  const completing = body.status === "completed";

  // Prerequisite gate.
  //
  // roadmap_edges has modelled the prerequisite DAG since migration 023 and
  // nothing ever read it. It is the only structural fact about the roadmap that
  // a script cannot fake: a student can complete a node in any order they like
  // today, so "completed 40 nodes" carries no information about learning.
  //
  // The error names the exact nodes still outstanding rather than saying
  // "forbidden" — a student who worked ahead of the graph, or forgot one node,
  // should be able to fix it without guessing.
  if (completing) {
    const [completed] = await sql`
      SELECT node_id FROM student_roadmap_progress
      WHERE student_id = ${user.id} AND status = 'completed'
    `;
    const [{ edges }] = await sql`
      SELECT COALESCE(jsonb_agg(jsonb_build_object('from_id', from_id, 'to_id', to_id, 'kind', kind)), '[]'::jsonb) AS edges
      FROM roadmap_edges WHERE kind = 'required'
    `;
    const missing = unmetPrerequisites({
      nodeId: body.nodeId,
      completedNodeIds: completed.map((r) => r.node_id),
      edges,
      nodeOptional: node.is_optional === true
    });
    if (missing.length > 0) {
      const [{ titles }] = await sql`
        SELECT COALESCE(jsonb_agg(title), '[]'::jsonb) AS titles
        FROM roadmap_nodes WHERE id = ANY(${missing})
      `;
      return fail(
        "PREREQUISITES_UNMET",
        "Finish the earlier milestones in this path first",
        409,
        { missing: missing.map((id, i) => ({ id, title: titles[i] || id })) }
      );
    }
  }

  const completedAt = completing ? new Date().toISOString() : null;
  const evidenceState = completing ? "provisional" : null;
  // tenant_id is set explicitly because this table is a strict-RLS table
  // (migration 031): WITH CHECK requires tenant_id = app.tenant_id, and an
  // omitted column is NULL, which fails the check with a 500. Passing the GUC
  // alone is not enough -- the value must be in the row.
  const [row] = await sql`
    INSERT INTO student_roadmap_progress
      (student_id, node_id, status, completed_at, tenant_id, evidence_state, evidence_note, evidence_url, evidence_source)
    VALUES (
      ${user.id}, ${body.nodeId}, ${body.status}, ${completedAt}, ${tenant?.id ?? null}::uuid,
      ${evidenceState}, ${body.evidenceNote ?? null}, ${body.evidenceUrl ?? null}, 'student_claim'
    )
    ON CONFLICT (student_id, node_id) DO UPDATE SET
      status = EXCLUDED.status,
      completed_at = EXCLUDED.completed_at,
      updated_at = NOW(),
      -- Re-claiming a node returns it to provisional: a student who edits their
      -- evidence must not keep a verified standing earned on the old evidence.
      evidence_state = CASE WHEN EXCLUDED.status = 'completed' THEN 'provisional' ELSE NULL END,
      evidence_note = CASE WHEN EXCLUDED.status = 'completed' THEN EXCLUDED.evidence_note ELSE NULL END,
      evidence_url = CASE WHEN EXCLUDED.status = 'completed' THEN EXCLUDED.evidence_url ELSE NULL END,
      evidence_source = CASE WHEN EXCLUDED.status = 'completed' THEN 'student_claim' ELSE NULL END
    RETURNING *
  `;

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id,
    action: completing ? "claimed_roadmap_node" : "started_roadmap_node",
    resource: "roadmap_node", resourceId: body.nodeId,
    after: { nodeId: body.nodeId, status: body.status, evidenceState }
  });
  // Purge 10s stale progress cache + warm resource catalog on milestone
  revalidateTag("progress:nodes");
  revalidateTag("resources:counts");

  let milestone = null;
  if (completing) {
    // Milestones now count VERIFIED nodes only. Previously this counted every
    // self-declared completion, which minted a real student_achievements row --
    // and achievements feed reputation (+10 each) and mentor eligibility. That
    // made the cheapest possible action the highest-leverage one in the whole
    // system, not just on the board.
    milestone = await maybeAwardMilestone({ sql, studentId: user.id, tenantId: tenant?.id });
    await notify({
      sql, tenantId: tenant?.id, userId: user.id,
      type: "roadmap",
      title: milestone ? `Milestone: ${milestone.label}` : `Awaiting review: ${node.title}`,
      body: milestone
        ? "Proof recorded as a chapter achievement — it now lives on your record."
        : "Your evidence is in. A lead will confirm it and it will then count toward your standing.",
      link: milestone ? "/student/credentials" : "/student/roadmap"
    });
    await notifyLeadsOfReview({ sql, tenantId: tenant?.id, studentId: user.id, nodeTitle: node.title });
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

// Ask chapter staff that a claim is waiting. Deliberately not a blocking
// approval: the student keeps working, the claim just scores nothing until it is
// confirmed. Volume, not a decision, is what the queue surfaces.
async function notifyLeadsOfReview({ sql, tenantId, studentId, nodeTitle }) {
  if (!tenantId) return;
  try {
    const [{ name } = {}] = await sql`
      SELECT name FROM profiles WHERE user_id = ${studentId} AND tenant_id = ${tenantId}::uuid LIMIT 1
    `;
    await sql`
      INSERT INTO notifications (tenant_id, user_id, type, title, body, link)
      SELECT ${tenantId}::uuid, p.user_id, 'ranking_review',
             'Roadmap evidence awaiting review',
             ${`${name || "A student"} marked "${nodeTitle}" complete. Confirm it to let it count toward standing.`},
             '/admin/ranking'
        FROM profiles p
       WHERE p.tenant_id = ${tenantId}::uuid
         AND p.role IN ('dept_lead', 'vertical_lead', 'admin', 'platform_admin')
    `;
  } catch {
    /* never fail a student's progress update because staff could not be told */
  }
}

// Milestones turn sustained motion into chapter achievements — the same
// evidence trail credentials are built from. Idempotent per milestone key.
async function maybeAwardMilestone({ sql, studentId, tenantId }) {
  const [{ nodes = 0 } = {}] = await sql`SELECT COUNT(*)::int AS nodes FROM roadmap_nodes`;
  if (!nodes) return null;
  // evidence_state = 'verified' only. 'provisional' is a claim awaiting review
  // and must never mint a credential.
  const [{ done = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS done FROM student_roadmap_progress
    WHERE student_id = ${studentId} AND status = 'completed' AND evidence_state = 'verified'
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