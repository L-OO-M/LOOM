import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { writeAudit } from "@/lib/auth-server";
import { requireCan, toGuardResponse } from "@/lib/requirePermission";
import { upsertSignal } from "@/lib/recommend";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

const schema = z.object({
  kind: z.enum(["roadmap_node", "resource", "contest", "topic"]),
  ref_id: z.string().min(1).max(200),
});

export async function POST(request) {
  let ctx;
  try { ctx = await requireCan("help:request"); } catch (e) { const g = toGuardResponse(e); if (g) return fail(g.error.code, g.error.message, g.status); throw e; }
  const { user, tenant, sql } = ctx;
  const rl = checkRateLimit(request, { userId: user.id, limit: 10, windowMs: 60_000 });
  if (!rl.ok) return fail(rateLimitResponse(rl.retryAfter).error.code, rateLimitResponse(rl.retryAfter).error.message, 429);
  let body;
  try { body = schema.parse(await request.json()); } catch (e) { return validationError(e); }
  const tid = tenant?.id;
  if (!tid) return fail("TENANT_NOT_FOUND", "Tenant not found", 404);
  // Ensure helper profile exists/refresh active
  try {
    await sql`
      INSERT INTO helper_profiles (user_id, tenant_id, available, last_active_at, updated_at)
      VALUES (${user.id}, ${tid}::uuid, true, now(), now())
      ON CONFLICT (user_id) DO UPDATE SET last_active_at=now(), updated_at=now(), tenant_id=EXCLUDED.tenant_id
    `;
  } catch {}
  const sig = await upsertSignal({ sql, tenantId: tid, userId: user.id, kind: body.kind, refId: body.ref_id });
  await writeAudit({ sql, actorId: user.id, tenantId: tid, action: "help_signal", resource: "help_signal", resourceId: sig.id, after: body });
  return ok({ signal: sig }, { status: 201 });
}

export async function GET() {
  let ctx;
  try { ctx = await requireCan("help:request"); } catch (e) { const g = toGuardResponse(e); if (g) return fail(g.error.code, g.error.message, g.status); throw e; }
  const { user, tenant, sql } = ctx;
  const rows = await sql`SELECT * FROM help_signals WHERE user_id=${user.id} AND tenant_id=${tenant?.id ?? null}::uuid ORDER BY updated_at DESC LIMIT 20`;
  return ok({ signals: rows });
}
