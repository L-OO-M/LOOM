import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { outboxHealth, retryDeadOutboxRow } from "@/lib/outbox";

const retrySchema = z.object({ id: z.number().int().positive() });

function denied(ctx) {
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin access required", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  return null;
}

export async function GET() {
  const ctx = await getRequestContext({ adminOnly: true });
  const rejection = denied(ctx);
  if (rejection) return rejection;
  const health = await outboxHealth(ctx.sql, { tenantId: ctx.tenant.id });
  const dead = await ctx.sql`
    SELECT id, topic, attempts, last_error, created_at, completed_at
    FROM outbox
    WHERE tenant_id = ${ctx.tenant.id}::uuid AND status = 'dead'
    ORDER BY completed_at DESC NULLS LAST
    LIMIT 100
  `;
  return ok({ health, dead });
}

export async function POST(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  const rejection = denied(ctx);
  if (rejection) return rejection;
  let body;
  try {
    body = retrySchema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }
  const row = await retryDeadOutboxRow(ctx.sql, { tenantId: ctx.tenant.id, id: body.id });
  if (!row) return fail("NOT_FOUND", "Dead-letter row not found", 404);
  await writeAudit({
    sql: ctx.sql,
    actorId: ctx.user.id,
    tenantId: ctx.tenant.id,
    action: "outbox.retry",
    resource: "outbox",
    resourceId: String(body.id),
    after: { topic: row.topic }
  });
  return ok({ job: row });
}
