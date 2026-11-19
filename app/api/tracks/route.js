import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { DOMAIN_ORDER, normalizeDomainKey } from "@/lib/domains";
import { isTrackDomain, loadFollowedTracks } from "@/lib/tracks";

// Following a roadmap is a personal preference, like linking a dev account: the
// member writes only their own row, scoped by the tenant resolved server-side.
const bodySchema = z.object({
  domain: z.enum(DOMAIN_ORDER)
});

function ctxError(ctx) {
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  return null;
}

/** GET /api/tracks — the member's followed domains. */
export async function GET() {
  const ctx = await getRequestContext();
  const err = ctxError(ctx);
  if (err) return err;
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);
  return ok({ tracks: await loadFollowedTracks(sql, { userId: user.id, tenantId: tenant.id }) });
}

/** POST /api/tracks { domain } — follow a roadmap. */
export async function POST(request) {
  const ctx = await getRequestContext();
  const err = ctxError(ctx);
  if (err) return err;
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);

  const limit = await checkRateLimit(request, { userId: user.id, limit: 30, windowMs: 60_000, durable: true });
  if (!limit.ok) return fail("RATE_LIMITED", `Too many requests. Retry after ${limit.retryAfter}s`, 429);

  let body;
  try {
    body = bodySchema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }

  const domain = normalizeDomainKey(body.domain);
  if (!isTrackDomain(domain)) return fail("VALIDATION_ERROR", "Unknown domain", 400);

  await sql`
    INSERT INTO student_tracks (tenant_id, user_id, domain)
    VALUES (${tenant.id}::uuid, ${user.id}, ${domain})
    ON CONFLICT (tenant_id, user_id, domain) DO NOTHING
  `;
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant.id,
    action: "track.follow", resource: "student_track", resourceId: domain
  });
  return ok({ domain, followed: true, tracks: await loadFollowedTracks(sql, { userId: user.id, tenantId: tenant.id }) });
}

/** DELETE /api/tracks?domain=web — stop following a roadmap. */
export async function DELETE(request) {
  const ctx = await getRequestContext();
  const err = ctxError(ctx);
  if (err) return err;
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);

  const domain = normalizeDomainKey(new URL(request.url).searchParams.get("domain"));
  if (!isTrackDomain(domain)) return fail("VALIDATION_ERROR", "Unknown domain", 400);

  await sql`
    DELETE FROM student_tracks
    WHERE tenant_id = ${tenant.id}::uuid AND user_id = ${user.id} AND domain = ${domain}
  `;
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant.id,
    action: "track.unfollow", resource: "student_track", resourceId: domain
  });
  return ok({ domain, followed: false, tracks: await loadFollowedTracks(sql, { userId: user.id, tenantId: tenant.id }) });
}
