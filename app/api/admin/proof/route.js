import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";
import { can } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { listPendingProof } from "@/lib/proof";

// A proof signal is always a kind plus the uuid of the row it points at. The
// check is deliberately strict: the signal is a write key, so a free-form
// string would let a caller record a decision against something that is not
// evidence at all.
const SIGNAL = /^(project|oss):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const reviewSchema = z.object({
  userId: z.string().min(1).max(200),
  signal: z.string().regex(SIGNAL, "Unknown proof signal"),
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).optional()
});

const KIND_LABEL = {
  project: "project",
  oss: "open-source contribution"
};

function contextError(ctx) {
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Access denied", 403);
  if (ctx.error === "CONSENT_REQUIRED") return fail("CONSENT_REQUIRED", "Consent required", 403);
  if (ctx.error === "ACCOUNT_SUSPENDED" || ctx.error === "ACCOUNT_DEACTIVATED") {
    return fail(ctx.error, "Account is not active", 403);
  }
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  return null;
}

// Reading the review queue and recording a decision are both the `verify_evidence`
// capability from lib/permissions.js. That action is admin/platform_admin only by
// design: confirming evidence is what puts a claim on a public proof surface, and
// the matrix deliberately gives no lower tier standing to vouch for someone else.
function proofGate(profile) {
  return can(profile, "verify_evidence").ok;
}

/**
 * GET /api/admin/proof?status=pending
 *
 * Flat list of items that have neither a machine-verifiable source nor a human
 * decision. The UI groups by student; keeping the route flat makes the same
 * response usable from scripts and exports.
 */
export async function GET(request) {
  const ctx = await getRequestContext();
  const err = contextError(ctx);
  if (err) return err;
  const { profile, tenant, sql } = ctx;
  if (!proofGate(profile)) return fail("FORBIDDEN", "Admin access required", 403);
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);

  const url = new URL(request?.url ?? "http://localhost/api/admin/proof");
  const status = (url.searchParams.get("status") || "pending").trim();
  if (status !== "pending") {
    return fail("VALIDATION_ERROR", "Only status=pending is supported", 400);
  }

  const items = await listPendingProof(sql, { tenantId: tenant.id, limit: 200 });
  return ok({ status, items, total: items.length });
}

/**
 * POST /api/admin/proof
 *
 * `{ userId, signal, decision: "approve" | "reject", note? }`
 *
 * Approval records a durable `proof_reviews` row that `buildProof` reads, which
 * is what turns a human decision into `verified: true, source: "review"`.
 * Rejection records the refusal and leaves every piece of evidence where it is.
 */
export async function POST(request) {
  const ctx = await getRequestContext();
  const err = contextError(ctx);
  if (err) return err;
  const { user, profile, tenant, sql } = ctx;
  if (!proofGate(profile)) return fail("FORBIDDEN", "Admin access required", 403);
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);

  const limited = await checkRateLimit(request, {
    userId: user.id,
    limit: 60,
    windowMs: 60_000
  });
  if (!limited.ok) {
    return fail("RATE_LIMITED", `Too many requests. Retry after ${limited.retryAfter}s`, 429);
  }

  let body;
  try {
    body = reviewSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }

  // The target must be a real member of the caller's chapter. Never trust a
  // userId from the body to select a cross-tenant profile.
  const [target] = await sql`
    SELECT user_id, name FROM profiles
    WHERE user_id = ${body.userId} AND tenant_id = ${tenant.id}::uuid
    LIMIT 1
  `;
  if (!target) return fail("NOT_FOUND", "That member is not in this chapter", 404);

  // And the signal must point at a row that belongs to that member and chapter.
  // Without this, an admin could write an approval keyed to arbitrary text and
  // the read model would happily apply it to whatever matched later.
  const [, id] = SIGNAL.exec(body.signal);
  const kind = body.signal.slice(0, body.signal.indexOf(":")).toLowerCase();
  // Canonical form. The read model keys on `project:<lowercase uuid>`, so an
  // uppercase or mixed-case request must not create a decision it cannot match.
  const signal = `${kind}:${id.toLowerCase()}`;
  let evidence;
  if (kind === "project") {
    [evidence] = await sql`
      SELECT id FROM projects
      WHERE id = ${id}::uuid AND tenant_id = ${tenant.id}::uuid AND owner_id = ${body.userId}
      LIMIT 1
    `;
  } else {
    [evidence] = await sql`
      SELECT id FROM student_oss_contributions
      WHERE id = ${id}::uuid AND tenant_id = ${tenant.id}::uuid AND student_id = ${body.userId}
      LIMIT 1
    `;
  }
  if (!evidence) return fail("NOT_FOUND", "That proof signal no longer exists", 404);

  const decision = body.decision === "approve" ? "approved" : "rejected";
  const note = body.note ? body.note.trim() || null : null;

  let review;
  try {
    [review] = await sql`
      INSERT INTO proof_reviews (tenant_id, user_id, signal, decision, note, decided_by, decided_at)
      VALUES (
        ${tenant.id}::uuid, ${body.userId}, ${signal}, ${decision}, ${note}, ${user.id}, now()
      )
      ON CONFLICT (tenant_id, user_id, signal) DO UPDATE SET
        decision = EXCLUDED.decision,
        note = EXCLUDED.note,
        decided_by = EXCLUDED.decided_by,
        decided_at = now()
      RETURNING *
    `;
  } catch (writeError) {
    const missingTable = /proof_reviews|undefined_table|does not exist/i.test(
      String(writeError?.message || "")
    );
    if (missingTable) {
      return fail(
        "PROOF_UNAVAILABLE",
        "Proof review storage is not ready. Apply migration 081 and try again.",
        503
      );
    }
    return fail("PROOF_WRITE_FAILED", "Could not record that decision. Try again.", 500);
  }

  const label = KIND_LABEL[kind] || "proof item";
  await notify({
    sql,
    tenantId: tenant.id,
    userId: body.userId,
    type: "proof_review",
    title: decision === "approved" ? "Proof verified" : "Proof needs another look",
    body:
      note ||
      (decision === "approved"
        ? `A lead verified your ${label}. It now appears as verified proof.`
        : `A lead could not verify your ${label}. The evidence is still saved — talk to your lead about what would make it verifiable.`),
    link: "/student/credentials"
  });

  await writeAudit({
    sql,
    actorId: user.id,
    tenantId: tenant.id,
    action: decision === "approved" ? "approved_proof" : "rejected_proof",
    resource: "proof",
    resourceId: signal,
    after: { student: body.userId, decision, note }
  });

  return ok({ review, decision, signal });
}
