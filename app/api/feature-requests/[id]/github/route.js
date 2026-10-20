import { ok, fail } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { syncFeatureRequestToGitHub } from "@/lib/github-issues";
import { checkRateLimit } from "@/lib/rate-limit";

// POST /api/feature-requests/:id/github
//
// Admin-only. Creates the issue if the request has none, otherwise refreshes the
// stored state from GitHub. Separate from PATCH so a retry after an outage does
// not also re-run the status decision.
export async function POST(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error) return fail(ctx.error, "Auth required", 401);
  if (ctx.profile?.role !== "admin") return fail("FORBIDDEN", "Admin only", 403);
  const { user, tenant, sql } = ctx;
  const { id } = await params;

  const limited = checkRateLimit(`feature-req-github:${user.id}`, { limit: 10, windowMs: 60_000 });
  if (!limited.ok) return fail("RATE_LIMITED", "Too many GitHub syncs — wait a minute", 429);

  const [row] = await sql`
    SELECT fr.*, p.name AS requester_name
    FROM feature_requests fr
    LEFT JOIN profiles p ON p.user_id = fr.requester_id
    WHERE fr.id = ${id}::uuid
      AND (fr.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
    LIMIT 1
  `;
  if (!row) return fail("NOT_FOUND", "Not found", 404);

  const result = await syncFeatureRequestToGitHub({
    sql,
    row,
    tenantId: tenant?.id ?? null,
    tenantName: tenant?.name,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
  });

  if (result.ok) {
    await writeAudit({
      sql,
      actorId: user.id,
      tenantId: tenant?.id,
      action: row.github_issue_number ? "feature_request_github_refreshed" : "feature_request_github_created",
      resource: "feature_request",
      resourceId: id,
      after: { issue: result.row?.github_issue_number || null },
    });
    return ok({ request: result.row, synced: true });
  }

  if (result.code === "NOT_CONFIGURED") {
    return fail("NOT_CONFIGURED", "GitHub Issues is not configured. Set GITHUB_ISSUES_REPO and GITHUB_ISSUES_TOKEN.", 400);
  }
  return fail(result.code || "GITHUB_SYNC_FAILED", result.message || "GitHub sync failed", 502);
}
