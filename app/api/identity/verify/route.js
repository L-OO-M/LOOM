import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  fetchProofPage,
  proofHostAllowed,
  providerFor,
  tokenPresent
} from "@/lib/identity";

const schema = z.object({
  provider: z.string().min(1).max(40),
  // The public page where the member pasted their code. Deliberately a URL, not
  // free text: the verifier must be able to fetch exactly what it checked.
  proofUrl: z.string().min(8).max(500)
});

/**
 * POST /api/identity/verify  { provider, proofUrl }
 *
 * Fetches a public page the member controls and looks for their one-time code.
 * A hit is durable proof of control at this moment; a miss is recorded so a
 * stale claim cannot keep looking verified.
 */
export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);

  const limit = await checkRateLimit(request, { userId: user.id, limit: 6, windowMs: 60_000, durable: true });
  if (!limit.ok) return fail("RATE_LIMITED", `Too many requests. Retry after ${limit.retryAfter}s`, 429);

  let body;
  try {
    body = schema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }

  const spec = providerFor(body.provider);
  if (!spec) return fail("VALIDATION_ERROR", "Unknown provider", 400);

  const [row] = await sql`
    SELECT provider, handle, verify_token, status
    FROM identity_links
    WHERE tenant_id = ${tenant.id}::uuid AND user_id = ${user.id} AND provider = ${spec.key}
  `;
  if (!row) return fail("NOT_FOUND", "Save the handle before verifying it.", 404);
  if (!row.verify_token) return fail("NOT_READY", "No verification code yet. Save the handle again.", 409);

  if (!proofHostAllowed(spec.key, body.proofUrl)) {
    return fail(
      "VALIDATION_ERROR",
      spec.proofHosts
        ? `Proof URL must be a public ${spec.proofHosts[0]} page.`
        : "Proof URL must be a public page.",
      400,
      { field: "proofUrl" }
    );
  }

  const page = await fetchProofPage(body.proofUrl);
  const checkedAt = new Date();
  if (page.error) {
    await sql`
      UPDATE identity_links
      SET status = 'rejected', last_checked_at = ${checkedAt}, check_error = ${page.error}, proof_url = ${body.proofUrl}, updated_at = now()
      WHERE tenant_id = ${tenant.id}::uuid AND user_id = ${user.id} AND provider = ${spec.key}
    `;
    return fail("PROOF_UNREACHABLE", page.error, 400, { field: "proofUrl" });
  }

  const found = tokenPresent(page.text, row.verify_token);
  const status = found ? "verified" : "rejected";
  await sql`
    UPDATE identity_links
    SET status = ${status},
        method = 'token',
        proof_url = ${body.proofUrl},
        verified_at = ${found ? checkedAt : null},
        last_checked_at = ${checkedAt},
        check_error = ${found ? null : "Code not found on that page."},
        updated_at = now()
    WHERE tenant_id = ${tenant.id}::uuid AND user_id = ${user.id} AND provider = ${spec.key}
  `;
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant.id,
    action: found ? "identity.verified" : "identity.verify_failed",
    resource: "identity_link", resourceId: spec.key,
    after: { proofUrl: body.proofUrl, verified: found }
  });

  if (!found) {
    return fail(
      "PROOF_NOT_FOUND",
      "That page was reachable, but the code was not on it. Paste the code, save the page, then check again.",
      400,
      { field: "proofUrl" }
    );
  }

  return ok({ provider: spec.key, status, verifiedAt: checkedAt.toISOString() });
}
