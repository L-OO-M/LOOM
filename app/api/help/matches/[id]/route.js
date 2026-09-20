import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { writeAudit, notify } from "@/lib/auth-server";
import { requireCan, toGuardResponse } from "@/lib/requirePermission";

const patchSchema = z.object({
  status: z.enum(["accepted", "declined", "resolved", "closed"]),
});

export async function PATCH(request, { params }) {
  let ctx;
  try { ctx = await requireCan("help:request"); } catch (e) { const g = toGuardResponse(e); if (g) return fail(g.error.code, g.error.message, g.status); throw e; }
  const { user, tenant, sql } = ctx;
  const id = params.id;
  let body;
  try { body = patchSchema.parse(await request.json()); } catch (e) { return validationError(e); }
  const [m] = await sql`SELECT * FROM help_matches WHERE id=${id}::uuid LIMIT 1`;
  if (!m) return fail("NOT_FOUND", "Match not found", 404);
  // Only signal owner or helper can update
  const [sig] = await sql`SELECT * FROM help_signals WHERE id=${m.signal_id}::uuid LIMIT 1`;
  if (!sig || (sig.user_id !== user.id && m.helper_id !== user.id)) return fail("FORBIDDEN", "Not participant", 403);
  const [updated] = await sql`UPDATE help_matches SET status=${body.status}, updated_at=now() WHERE id=${id}::uuid RETURNING *`;
  if (body.status === "resolved" && sig) {
    await sql`UPDATE help_signals SET status='resolved', updated_at=now() WHERE id=${sig.id}::uuid`;
  }
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: `help_${body.status}`, resource: "help_match", resourceId: id, after: body });
  // Notify other party
  const otherId = sig.user_id === user.id ? m.helper_id : sig.user_id;
  await notify({ sql, tenantId: tenant?.id, userId: otherId, type: "help_update", title: `Help ${body.status}`, body: `${ctx.profile?.name || user.id} marked help as ${body.status}`, link: "/student/help" });
  return ok({ match: updated });
}

export async function GET(_, { params }) {
  let ctx;
  try { ctx = await requireCan("help:request"); } catch (e) { const g = toGuardResponse(e); if (g) return fail(g.error.code, g.error.message, g.status); throw e; }
  const { sql } = ctx;
  const [m] = await sql`SELECT * FROM help_matches WHERE id=${params.id}::uuid LIMIT 1`;
  if (!m) return fail("NOT_FOUND", "Not found", 404);
  return ok({ match: m });
}
