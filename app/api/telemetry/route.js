/**
 * First-party usage ingest.
 *
 * Called by `components/telemetry/Tracker.jsx` (page views) and the tour
 * (start/step/finish/skip). It must work signed-out on public pages, so auth is
 * resolved but never required.
 *
 * Writes go through the owner connection with an explicit tenant id: anonymous
 * page views have no scoped session to set, and the tenant is resolved from the
 * request host, never from the body. Bots, cross-site posts, opted-out accounts
 * and unknown event names are all dropped before any query runs.
 */
import { fail, ok } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { getSql } from "@/lib/db";
import { getTenantFromRequest } from "@/lib/tenant";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import {
  PAGE_VIEW,
  isBotUserAgent,
  isTrustedRequest,
  sanitizeBatch,
  tourStatePatch,
  visitorKeyFor
} from "@/lib/telemetry";

export const dynamic = "force-dynamic";

const MAX_BODY_EVENTS = 10;

export async function POST(request) {
  const userAgent = request.headers.get("user-agent") || "";
  if (!isTrustedRequest(request) || isBotUserAgent(userAgent)) {
    // Quiet no-op: a crawler learns nothing and no row is written.
    return ok({ stored: 0 });
  }

  const limit = await checkRateLimit(request, { limit: 120, windowMs: 60_000, durable: true });
  if (!limit.ok) return fail("RATE_LIMITED", "Too many telemetry events.", 429);

  const ctx = await getRequestContext();
  if (ctx.profile?.analytics_opt_out) return ok({ stored: 0, optedOut: true });

  let body;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_ERROR", "Send events as JSON.", 400);
  }
  if (Array.isArray(body?.events) && body.events.length > MAX_BODY_EVENTS) {
    return fail("VALIDATION_ERROR", "Too many events in one request.", 413);
  }

  const events = sanitizeBatch(body?.events, body?.path);
  if (events.length === 0) return ok({ stored: 0 });

  let tenant = ctx.tenant;
  if (!tenant?.id) {
    try {
      tenant = await getTenantFromRequest(request);
    } catch {
      tenant = null;
    }
  }
  const tenantId = tenant?.id ?? null;
  const userId = ctx.user?.id ?? null;
  const role = ctx.profile?.role ?? (userId ? "member" : "anonymous");
  const visitorKey = visitorKeyFor({ ip: clientIp(request), userAgent });
  const sql = getSql();

  let stored = 0;
  for (const event of events) {
    if (event.event === PAGE_VIEW) {
      await sql`
        INSERT INTO page_views (tenant_id, visitor_key, user_id, path, session_key, area, role)
        VALUES (${tenantId}::uuid, ${visitorKey}, ${userId}, ${event.path}, ${event.sessionKey}, ${event.area}, ${role})
      `;
      stored += 1;
      continue;
    }

    await sql`
      INSERT INTO ui_events (tenant_id, user_id, session_key, area, path, event, target, metadata)
      VALUES (${tenantId}::uuid, ${userId}, ${event.sessionKey}, ${event.area}, ${event.path}, ${event.event},
              ${event.target}, ${sql.json(event.metadata)})
    `;
    stored += 1;

    const patch = userId ? tourStatePatch(event.event, event.metadata) : null;
    if (patch) {
      await sql`
        UPDATE profiles SET tour_state = tour_state || ${sql.json(patch)}::jsonb
        WHERE user_id = ${userId}
      `;
    }
  }

  return ok({ stored });
}
