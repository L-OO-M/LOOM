import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";

const contestSchema = z.object({
  title: z.string().min(3).max(160),
  description: z.string().max(2000).default(""),
  status: z.enum(["draft", "published", "active", "open", "closed"]).default("draft"),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional()
});

export async function GET() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error) return fail(ctx.error, ctx.error === "FORBIDDEN" ? "Admin only" : "Auth required", ctx.error === "FORBIDDEN" ? 403 : 401);
  const { tenant, sql } = ctx;
  const rows = await sql`SELECT c.*, (SELECT COUNT(*)::int FROM contest_registrations r WHERE r.contest_id = c.id) AS registrations FROM contests c WHERE c.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL ORDER BY c.created_at DESC LIMIT 50`;
  return ok({ contests: rows });
}

export async function POST(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error) return fail(ctx.error, ctx.error === "FORBIDDEN" ? "Admin only" : "Auth required", ctx.error === "FORBIDDEN" ? 403 : 401);
  const { user, tenant, sql } = ctx;
  let body;
  try {
    body = contestSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [contest] = await sql`
    INSERT INTO contests (tenant_id, title, description, status, starts_at, ends_at)
    VALUES (${tenant?.id ?? null}, ${body.title}, ${body.description || ""}, ${body.status}, ${body.startsAt || null}, ${body.endsAt || null})
    RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "created_contest", resource: "contest", resourceId: contest.id, after: { title: body.title } });
  return ok({ contest }, { status: 201 });
}
