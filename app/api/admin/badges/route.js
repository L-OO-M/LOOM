import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";

const createSchema = z.object({
  name: z.string().min(3).max(120),
  description: z.string().max(500).default(""),
  tier: z.number().int().min(1).max(3).default(1),
  criteria: z.record(z.string(), z.any()).default({})
});

export async function GET() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin access required", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { tenant, sql } = ctx;
  const badges = await sql`
    SELECT b.*, (SELECT COUNT(*)::int FROM student_achievements a WHERE a.badge_id = b.id) AS earned
    FROM skill_badges b
    WHERE b.tenant_id IS NULL OR b.tenant_id = ${tenant?.id ?? null}::uuid
    ORDER BY b.tier DESC, b.created_at DESC LIMIT 100
  `;
  return ok({ badges });
}

export async function POST(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin access required", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [badge] = await sql`
    INSERT INTO skill_badges (tenant_id, name, description, tier, criteria)
    VALUES (${tenant?.id ?? null}, ${body.name}, ${body.description}, ${body.tier}, ${sql.json(body.criteria)})
    RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "created_skill_badge", resource: "skill_badge", resourceId: badge.id, after: { name: body.name } });
  return ok({ badge }, { status: 201 });
}
