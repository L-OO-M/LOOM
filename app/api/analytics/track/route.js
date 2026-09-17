import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getSql, queryTenant } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { env } from "@/lib/env";

const trackSchema = z.object({
  path: z.string().min(1).max(200).refine((p) => p.startsWith("/"), "Path must start with /"),
  visitorKey: z.string().min(8).max(64),
  referrer: z.string().max(300).optional(),
  userId: z.string().min(1).max(128).optional(),
});

// First-party visit intake. Public by design (logged-out visits count
// too): rate-limited per IP, deduped to one row per visitor + path per
// 30 minutes, tenant resolved from the request host. Never 500s on the
// beacon — failures return ok:false with 200 so pages never break.
export async function POST(request) {
  let body;
  try {
    body = trackSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const limit = checkRateLimit(`pv:${ip}`, { limit: 120, windowMs: 60000 });
  if (!limit.ok) return fail("RATE_LIMITED", "Too many requests", 429);

  const sql = getSql();
  try {
    const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").split(":")[0].toLowerCase();
    let tenantId = null;
    if (host) {
      const [dom] = await sql`
        SELECT t.id FROM tenant_domains d JOIN tenants t ON t.id = d.tenant_id
        WHERE d.domain = ${host} LIMIT 1
      `;
      tenantId = dom?.id ?? null;
    }
    if (!tenantId) {
      const tenant = await queryTenant(env.DEV_TENANT_SLUG || "demo-college");
      tenantId = tenant?.id ?? null;
    }
    if (!tenantId) return ok({ tracked: false, reason: "no-tenant" });

    const [recent] = await sql`
      SELECT id FROM page_views
      WHERE visitor_key = ${body.visitorKey} AND path = ${body.path}
        AND created_at >= NOW() - INTERVAL '30 minutes'
      LIMIT 1
    `;
    if (recent) return ok({ tracked: false, reason: "deduped" });

    await sql`
      INSERT INTO page_views (tenant_id, visitor_key, user_id, path, referrer)
      VALUES (${tenantId}::uuid, ${body.visitorKey}, ${body.userId || null}, ${body.path}, ${body.referrer || null})
    `;
    return ok({ tracked: true }, { status: 201 });
  } catch {
    return fail("TRACK_FAILED", "Could not record visit", 500);
  }
}
