import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { isGithubEnabled } from "@/lib/github";
import { cryptoConfigured } from "@/lib/crypto";
import { env } from "@/lib/env";

export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const [conn] = await sql`SELECT * FROM github_connections WHERE user_id = ${user.id} LIMIT 1`;
  const repos = await sql`SELECT * FROM repositories WHERE student_id = ${user.id} ORDER BY connected_at DESC LIMIT 20`;
  // Same 120-day window the /student/github page renders.
  const activity = await sql`SELECT day, commits, pull_requests, reviews FROM student_daily_activity WHERE student_id = ${user.id} ORDER BY day DESC LIMIT 120`;
  // Fail-closed: missing flag/table/error reads as paused (see lib/github.js).
  const ingestionPaused = tenant?.id ? !(await isGithubEnabled(sql, tenant.id)) : true;
  let lastEventAt = null;
  if (conn?.github_username) {
    try {
      const [row] = await sql`
        SELECT MAX(received_at) AS m FROM github_events
        WHERE lower(actor_login) = lower(${conn.github_username})
      `;
      lastEventAt = row?.m ?? null;
    } catch {
      lastEventAt = null;
    }
  }
  // Repositories where GitHub confirmed this student has push access.
  const grants = await sql`
    SELECT repo_full_name, can_push, can_admin, is_private, verified_at
    FROM github_repo_grants
    WHERE user_id = ${user.id} AND tenant_id = ${tenant?.id ?? null}::uuid
    ORDER BY verified_at DESC
    LIMIT 20
  `;

  // Both halves must be configured before linking is offered, and the UI must be
  // able to say WHY rather than showing a button that 503s.
  const oauthConfigured = Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);

  return ok({
    connected: !!conn,
    githubUsername: conn?.github_username ?? null,
    // The distinction that matters: a typed handle is asserted, an OAuth-linked
    // one is vouched for by GitHub. Anything reading this must not conflate them.
    identityVerified: conn?.github_user_id != null,
    githubUserId: conn?.github_user_id ?? null,
    connectedAt: conn?.oauth_linked_at ?? conn?.connected_at ?? null,
    oauthConfigured,
    // False when OAuth works but the token-sealing key is missing -- in that
    // state linking would store a credential we could never read back.
    tokenStorageReady: cryptoConfigured(),
    ingestionPaused,
    lastEventAt,
    repos, activity, grants,
    note: !conn
      ? "Link your GitHub account so your pushes, pull requests and reviews start counting as proof."
      : conn.github_user_id == null
        ? "This handle was typed in, not verified by GitHub. Link your account so your identity — and your repositories — can be confirmed."
        : ingestionPaused
          ? "Ingestion is currently paused for your chapter, so new activity is not being recorded. Previously recorded data is still shown."
          : null
  });
}

const connectSchema = z.object({ githubUsername: z.string().min(1).max(39).regex(/^[a-zA-Z0-9-]+$/) });

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  let body;
  try {
    body = connectSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }

  // This endpoint used to accept ANY handle and write it straight into
  // github_connections and profiles.github_username, guarded only by a
  // "is someone else holding it" check. That is an assertion: a student who
  // typed a handle they do not control would absorb that account's pushes and
  // pull requests as their own score, because resolveStudentIdByLogin attributes
  // by login. It was the same hole migration 035 closed, reopened here.
  //
  // Now that GitHub OAuth exists, identity comes from GitHub and only from
  // GitHub. An unverified handle is not a lesser claim -- it is no claim, and
  // accepting it would leave the vulnerability while appearing to close it.
  const [conn] = await sql`
    SELECT github_user_id FROM github_connections WHERE user_id = ${user.id} LIMIT 1
  `;

  if (conn?.github_user_id != null) {
    return fail(
      "GITHUB_ALREADY_LINKED",
      "Your GitHub account is already verified. Unlink it first if you want to connect a different one.",
      409
    );
  }

  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return fail(
      "GITHUB_OAUTH_NOT_CONFIGURED",
      "GitHub linking is not configured for this chapter. Ask an admin to set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.",
      503
    );
  }

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id,
    action: "rejected_typed_github_claim", resource: "github_connection", resourceId: user.id,
    after: { attempted: body.githubUsername }
  });

  // Point them at the real flow instead of erroring into a dead end.
  const start = new URL("/api/github/oauth/start", env.NEXT_PUBLIC_APP_URL);
  return fail(
    "USE_OAUTH",
    "Linking is done through GitHub so your identity can be verified. Opening the GitHub authorization page…",
    409,
    { authorizeUrl: start.toString() }
  );
}

// Unlink the caller's own GitHub connection. Ownership is the session
// user_id — one student's disconnect can never touch another student's row.
export async function DELETE() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const [before] = await sql`SELECT github_username FROM github_connections WHERE user_id = ${user.id} LIMIT 1`;

  // Revoking access means the proofs derived from it must go too. Leaving
  // ranking_events rows behind would let a member hand their token to someone
  // else, unlink, and hand it back -- a laundering path that only exists because
  // the revocation did not cascade.
  const revoked = await sql`
    DELETE FROM ranking_events
    WHERE tenant_id = ${tenant?.id ?? null}::uuid
      AND user_id = ${user.id}
      AND source = 'webhook'
      AND verified_by LIKE 'github:%'
    RETURNING ref_id
  `;
  const revokedCount = revoked.length;

  await sql`DELETE FROM github_connections WHERE user_id = ${user.id}`;
  await sql`DELETE FROM github_repo_grants WHERE user_id = ${user.id}`;
  await sql`UPDATE profiles SET github_username = NULL WHERE user_id = ${user.id}`;

  if (revokedCount) {
    const { recomputeScore } = await import("@/lib/ranking");
    await recomputeScore(sql, tenant?.id, user.id);
  }

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id,
    action: "unlinked_github", resource: "github_connection", resourceId: user.id,
    before: before ? { githubUsername: before.github_username } : null,
    after: { connected: false, revokedEvidence: revokedCount }
  });
  return ok({ connected: false, githubUsername: null, revokedEvidence: revokedCount });
}