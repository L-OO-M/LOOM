import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { writeAudit, notify } from "@/lib/auth-server";
import { requireCan, toGuardResponse } from "@/lib/requirePermission";
import { findHelpers } from "@/lib/recommend";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

const schema = z.object({
  signal_id: z.string().uuid().optional(),
  kind: z.enum(["roadmap_node", "resource", "contest", "topic"]).optional(),
  ref_id: z.string().min(1).max(200).optional(),
});

export async function POST(request) {
  let ctx;
  try { ctx = await requireCan("help:request"); } catch (e) { const g = toGuardResponse(e); if (g) return fail(g.error.code, g.error.message, g.status); throw e; }
  const { user, tenant, sql } = ctx;
  const rl = checkRateLimit(request, { userId: user.id, limit: 5, windowMs: 60_000 });
  if (!rl.ok) return fail(rateLimitResponse(rl.retryAfter).error.code, rateLimitResponse(rl.retryAfter).error.message, 429);
  let body;
  try { body = schema.parse(await request.json()); } catch (e) { return validationError(e); }
  const tid = tenant?.id;
  if (!tid) return fail("TENANT_NOT_FOUND", "Tenant not found", 404);

  let signal;
  if (body.signal_id) {
    const [s] = await sql`SELECT * FROM help_signals WHERE id=${body.signal_id}::uuid AND user_id=${user.id} LIMIT 1`;
    if (!s) return fail("NOT_FOUND", "Signal not found", 404);
    signal = s;
  } else if (body.kind && body.ref_id) {
    const [s] = await sql`SELECT * FROM help_signals WHERE tenant_id=${tid}::uuid AND user_id=${user.id} AND kind=${body.kind} AND ref_id=${body.ref_id} LIMIT 1`;
    if (!s) return fail("NOT_FOUND", "Signal not found — create it first via POST /api/help/signals", 404);
    signal = s;
  } else return fail("VALIDATION_ERROR", "Provide signal_id or kind+ref_id", 400);

  if (signal.failures_count < 2) {
    // Allow manual match even before 2 failures (user explicitly asked)
  }

  const helpers = await findHelpers({ sql, tenantId: tid, kind: signal.kind, refId: signal.ref_id, excludeUserId: user.id });
  if (helpers.length === 0) return ok({ helpers: [], message: "No helpers available for this topic yet — try mentorship or forums" });

  const created = [];
  for (const h of helpers) {
    const [m] = await sql`
      INSERT INTO help_matches (tenant_id, signal_id, helper_id, score, status)
      VALUES (${tid}::uuid, ${signal.id}::uuid, ${h.user_id}, ${h.matchScore}, 'pending')
      ON CONFLICT (signal_id, helper_id) DO NOTHING
      RETURNING *
    `;
    if (m) {
      created.push({ ...m, helper: { user_id: h.user_id, name: h.name, username: h.github_username } });
      await notify({ sql, tenantId: tid, userId: h.user_id, type: "help_match", title: `Someone needs help with ${signal.ref_id}`, body: `${ctx.profile?.name || user.id} is stuck on ${signal.kind} ${signal.ref_id}`, link: `/student/help` });
    }
  }
  await sql`UPDATE help_signals SET status='matched', updated_at=now() WHERE id=${signal.id}::uuid`;
  await writeAudit({ sql, actorId: user.id, tenantId: tid, action: "help_match", resource: "help_signal", resourceId: signal.id, after: { helpers: created.map(c=>c.helper_id) } });
  return ok({ helpers: created, signal });
}
