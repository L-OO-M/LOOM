import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";
import { recomputeScore, revokeEvidence, recordEvidence } from "@/lib/ranking";
import { signCredential } from "@/lib/credentials";

// The evidence review queue.
//
// Deliberately NOT a blocking approval workflow. A student's claim never waits
// on a human: it sits as 'provisional', scores nothing, and is confirmed or
// refused in passing. That is the whole design choice — the previous system
// needed no review at all and that is precisely why it could not be trusted,
// but a queue that gates progress would trade a fake leaderboard for a stalled
// one, and chapter leads would learn to rubber-stamp.
//
// So: volume is what this surface optimizes for. The queue is ordered oldest
// first, the evidence is inlined (no navigation to judge a claim), and the
// expensive action -- reversing a student's whole unverified record -- is one
// button rather than a workflow.

export async function GET() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin access required", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { tenant, sql } = ctx;
  const tid = tenant?.id ?? null;

  // Pooler-safe: sequential, never Promise.all. Nodes first, then projects --
  // two statements rather than a UNION so each keeps its own evidence columns.
  const nodes = await sql`
    SELECT srp.id, srp.student_id, srp.node_id, srp.evidence_note, srp.evidence_url,
           srp.created_at, srp.updated_at, n.title AS item_title, n.domain,
           p.name AS student_name
      FROM student_roadmap_progress srp
      LEFT JOIN roadmap_nodes n ON n.id = srp.node_id
      LEFT JOIN profiles p ON p.user_id = srp.student_id
     WHERE srp.tenant_id = ${tid}::uuid
       AND srp.status = 'completed'
       AND srp.evidence_state = 'provisional'
     ORDER BY srp.updated_at ASC
     LIMIT 60
  `;
  const projects = await sql`
    SELECT pr.id, pr.owner_id AS student_id, pr.title AS item_title, pr.repo_url,
           pr.repo_full_name, pr.description, pr.created_at, pr.updated_at,
           p.name AS student_name
      FROM projects pr
      LEFT JOIN profiles p ON p.user_id = pr.owner_id
     WHERE pr.tenant_id = ${tid}::uuid
       AND pr.evidence_state = 'provisional'
     ORDER BY pr.updated_at ASC
     LIMIT 60
  `;

  // Anything signed that never activated a project: a repo with no webhook on
  // it. Surfaced so the queue shows the full backlog, not just the automatable
  // part of it.
  const unattested = await sql`
    SELECT pr.id, pr.owner_id AS student_id, pr.title AS item_title, pr.repo_full_name,
           pr.created_at, p.name AS student_name,
           EXISTS (
             SELECT 1 FROM github_events ge
              WHERE ge.tenant_id = ${tid}::uuid
                AND ge.student_id = pr.owner_id
                AND lower(ge.repository_name) = lower(pr.repo_full_name)
           ) AS has_attested_activity
      FROM projects pr
      LEFT JOIN profiles p ON p.user_id = pr.owner_id
     WHERE pr.tenant_id = ${tid}::uuid
       AND pr.evidence_state = 'provisional'
       AND pr.repo_full_name IS NOT NULL
     ORDER BY pr.updated_at ASC
     LIMIT 60
  `;

  return ok({
    nodes,
    projects,
    unattested,
    counts: { nodes: nodes.length, projects: projects.length }
  });
}

const reviewSchema = z.object({
  kind: z.enum(["roadmap_node", "project"]),
  id: z.string().uuid(),
  decision: z.enum(["verified", "rejected"]),
  // Optional bulk reversal. Deliberately a separate, explicitly named action:
  // "reject this" and "reject all of this student's unverified claims" are very
  // different acts and must not share a button.
  clearAllForStudent: z.boolean().optional()
});

export async function POST(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin access required", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const tid = tenant?.id ?? null;

  let body;
  try {
    body = reviewSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }

  const reviewer = user.id;
  let studentId = null;
  let refId = null;
  let ledgerKind = null;
  let label = "";

  if (body.kind === "roadmap_node") {
    const [row] = await sql`
      SELECT student_id, node_id FROM student_roadmap_progress
      WHERE id = ${body.id} AND tenant_id = ${tid}::uuid AND status = 'completed'
        AND evidence_state = 'provisional'
      LIMIT 1
    `;
    if (!row) return fail("NOT_FOUND", "That claim is no longer awaiting review", 404);
    studentId = row.student_id;
    refId = row.node_id;
    ledgerKind = "roadmap_done";
    label = `roadmap node ${row.node_id}`;
  } else {
    const [row] = await sql`
      SELECT owner_id, title FROM projects
      WHERE id = ${body.id} AND tenant_id = ${tid}::uuid
        AND evidence_state IN ('provisional', 'verified')
      LIMIT 1
    `;
    if (!row) return fail("NOT_FOUND", "That claim is no longer awaiting review", 404);
    studentId = row.owner_id;
    refId = row.id;
    ledgerKind = "project_verified";
    label = `project "${row.title}"`;
  }

  if (body.clearAllForStudent) {
    await clearUnverifiedFor({ sql, tenantId: tid, studentId, reviewer });
    await recomputeScore(sql, tid, studentId);
    await notify({
      sql, tenantId: tid, userId: studentId,
      type: "ranking_review",
      title: "Evidence claim declined",
      body: "A chapter lead reviewed your unverified claims and could not confirm them. Talk to your lead if you think that is wrong.",
      link: "/student/roadmap"
    });
    await writeAudit({
      sql, actorId: reviewer, tenantId: tid,
      action: "cleared_unverified_evidence", resource: "student", resourceId: studentId,
      after: { count: "all provisional claims", scope: body.kind }
    });
    return ok({ cleared: true, studentId });
  }

  if (body.decision === "verified") {
    if (body.kind === "roadmap_node") {
      const [updated] = await sql`
        UPDATE student_roadmap_progress
           SET evidence_state = 'verified', verified_by = ${reviewer}, verified_at = NOW(), updated_at = NOW()
         WHERE id = ${body.id} AND evidence_state = 'provisional'
        RETURNING *
      `;
      if (!updated) return fail("NOT_FOUND", "That claim is no longer awaiting review", 404);
      await recordEvidence({
        sql, tenantId: tid, userId: studentId, kind: ledgerKind, refId,
        verifiedBy: reviewer, source: "admin",
        evidence: { reviewedIn: "/admin/ranking" }
      });
    } else {
      // Verification, the achievement, and its credential are one act. A
      // partial failure must not leave the project marked verified without the
      // proof a student can share.
      const credential = await sql.begin(async (tx) => {
        const [updated] = await tx`
          UPDATE projects
             SET evidence_state = 'verified', verified_by = ${reviewer}, verified_at = NOW(),
                 reviewed_at = NOW(), status = 'completed', updated_at = NOW()
           WHERE id = ${body.id} AND evidence_state = 'provisional'
          RETURNING *
        `;
        if (!updated) return null;
        await recordEvidence({
          sql: tx, tenantId: tid, userId: studentId, kind: ledgerKind, refId,
          verifiedBy: reviewer, source: "admin",
          evidence: { reviewedIn: "/admin/ranking", repository: updated.repo_full_name }
        });
        const [created] = await tx`
          INSERT INTO student_achievements
            (student_id, tenant_id, source_type, source_ref, level, evidence_url)
          SELECT ${studentId}, ${tid}::uuid, 'project', ${updated.id}, 'gold', ${updated.repo_url}
          WHERE NOT EXISTS (
            SELECT 1 FROM student_achievements
            WHERE student_id = ${studentId} AND source_type = 'project' AND source_ref = ${updated.id}
          )
          RETURNING *
        `;
        let achievement = created;
        if (!achievement) {
          [achievement] = await tx`
            SELECT * FROM student_achievements
            WHERE student_id = ${studentId} AND source_type = 'project' AND source_ref = ${updated.id}
            LIMIT 1
          `;
        }
        if (!achievement) return null;
        const [existing] = await tx`
          SELECT id FROM verifiable_credentials WHERE achievement_id = ${achievement.id} LIMIT 1
        `;
        if (existing) return existing;
        const id = `cred_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
        const issuedAt = new Date().toISOString();
        const signature = signCredential({ id, studentId, type: "project", issuedAt });
        const [issued] = await tx`
          INSERT INTO verifiable_credentials
            (id, student_id, tenant_id, achievement_id, credential_type, title, metadata, issued_at, signature)
          VALUES (${id}, ${studentId}, ${tid}, ${achievement.id}, 'project',
            ${`Verified project · ${updated.title}`},
            ${JSON.stringify({ projectId: updated.id, repo: updated.repo_url, reviewedIn: "/admin/projects" })}::jsonb,
            ${issuedAt}, ${signature})
          RETURNING *
        `;
        return issued;
      });
      if (!credential) return fail("NOT_FOUND", "That claim is no longer awaiting review", 404);
    }
  } else {
    if (body.kind === "roadmap_node") {
      await sql`
        UPDATE student_roadmap_progress
           SET evidence_state = 'rejected', verified_by = ${reviewer}, verified_at = NOW(), updated_at = NOW()
         WHERE id = ${body.id} AND evidence_state = 'provisional'
      `;
    } else {
      await sql.begin(async (tx) => {
        await tx`
          UPDATE projects
             SET evidence_state = 'rejected', verified_by = ${reviewer}, verified_at = NOW(),
                 reviewed_at = NOW(), status = 'rejected', updated_at = NOW()
           WHERE id = ${body.id} AND evidence_state IN ('provisional', 'verified')
        `;
        // Removing the achievement cascades to the credential, so declining a
        // project also withdraws a previously issued share link.
        await tx`
          DELETE FROM student_achievements
          WHERE student_id = ${studentId} AND source_type = 'project' AND source_ref = ${body.id}
        `;
      });
    }
    // Reverse the ledger row too. It normally does not exist yet -- a provisional
    // claim never wrote one -- but if an earlier claim on the same ref was
    // verified, deleting here is what actually takes the points back.
    await revokeEvidence({ sql, tenantId: tid, userId: studentId, kind: ledgerKind, refId });
  }

  // Derived, never incremented, so a reversal is exact and the board cannot
  // drift from the ledger.
  await recomputeScore(sql, tid, studentId);

  await notify({
    sql, tenantId: tid, userId: studentId,
    type: "ranking_review",
    title: body.decision === "verified" ? "Evidence confirmed" : "Evidence declined",
    body: body.decision === "verified"
      ? `A lead confirmed your ${label}. It now counts toward your standing.`
      : `A lead could not confirm your ${label}. Talk to them about what would make it verifiable.`,
    link: body.kind === "project" ? "/student/projects" : "/student/roadmap"
  });

  await writeAudit({
    sql, actorId: reviewer, tenantId: tid,
    action: body.decision === "verified" ? "verified_evidence" : "rejected_evidence",
    resource: body.kind, resourceId: body.id,
    after: { student: studentId, decision: body.decision }
  });

  return ok({ reviewed: true, studentId, decision: body.decision });
}

// Reverse every claim a student has that no verifier stands behind.
//
// Reads the unverified claims BEFORE flipping their state, because the ledger
// row to reverse is keyed by (kind, ref_id) and a rejected claim is
// indistinguishable from a verified one by state alone once we start writing.
//
// Reversal is per claim through revokeEvidence, never a tenant+user DELETE on
// ranking_events: that also wiped verified OSS, roadmap and project evidence,
// which this action has no business touching. A claim that a previous
// confirmation left a ledger row behind for still loses exactly that row; every
// verified claim keeps its own.
async function clearUnverifiedFor({ sql, tenantId, studentId, reviewer }) {
  const roadmapClaims = await sql`
    SELECT node_id
      FROM student_roadmap_progress
     WHERE tenant_id = ${tenantId}::uuid AND student_id = ${studentId}
       AND status = 'completed'
       AND evidence_state IN ('provisional', 'rejected')
  `;
  const projectClaims = await sql`
    SELECT id
      FROM projects
     WHERE tenant_id = ${tenantId}::uuid AND owner_id = ${studentId}
       AND evidence_state IN ('provisional', 'rejected')
  `;

  await sql`
    UPDATE student_roadmap_progress
       SET evidence_state = 'rejected', verified_by = ${reviewer}, verified_at = NOW(), updated_at = NOW()
     WHERE tenant_id = ${tenantId}::uuid AND student_id = ${studentId} AND evidence_state = 'provisional'
  `;
  await sql`
    UPDATE projects
       SET evidence_state = 'rejected', verified_by = ${reviewer}, verified_at = NOW(), updated_at = NOW()
     WHERE tenant_id = ${tenantId}::uuid AND owner_id = ${studentId} AND evidence_state = 'provisional'
  `;

  // Sequential, like every other query here: the pooler is shared and this is
  // one bounded per-claim loop, not a Promise.all batch.
  for (const claim of roadmapClaims) {
    await revokeEvidence({
      sql, tenantId, userId: studentId, kind: "roadmap_done", refId: claim.node_id
    });
  }
  for (const claim of projectClaims) {
    await revokeEvidence({
      sql, tenantId, userId: studentId, kind: "project_verified", refId: claim.id
    });
  }
}