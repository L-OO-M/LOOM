import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { can } from "@/lib/permissions";

const STATUSES = ["draft", "published", "active", "open", "closed"];

const createSchema = z.object({
  title: z.string().min(3).max(160),
  description: z.string().max(2000).default(""),
  status: z.enum(STATUSES).default("draft"),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional()
});

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(STATUSES)
});

async function leadContext() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return { res: fail("UNAUTHORIZED", "Authentication required", 401) };
  if (ctx.error) return { res: fail("FORBIDDEN", "Leader profile required", 403) };
  const { user, profile, tenant, sql } = ctx;
  if (!tenant?.id) return { res: fail("FORBIDDEN", "No chapter context", 403) };
  if (!can(profile, "manage_contests").ok) return { res: fail("FORBIDDEN", "Leads only", 403) };
  return { ctx, user, profile, tenant, sql };
}

export async function GET() {
  const c = await leadContext();
  if (c.res) return c.res;
  const { tenant, sql } = c;
  const contests = await sql`
    SELECT c.*,
      (SELECT COUNT(*)::int FROM contest_registrations r WHERE r.contest_id = c.id) AS registrations,
      (SELECT COUNT(*)::int FROM contest_submissions s WHERE s.contest_id = c.id) AS submissions
    FROM contests c
    WHERE c.tenant_id = ${tenant.id}::uuid
    ORDER BY c.created_at DESC LIMIT 100
  `;
  return ok({ contests });
}

export async function POST(request) {
  const c = await leadContext();
  if (c.res) return c.res;
  const { user, tenant, sql } = c;
  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [contest] = await sql`
    INSERT INTO contests (tenant_id, title, description, status, starts_at, ends_at)
    VALUES (${tenant.id}::uuid, ${body.title}, ${body.description || ""}, ${body.status}, ${body.startsAt || null}, ${body.endsAt || null})
    RETURNING *
  `;
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant.id, action: "created_contest",
    resource: "contest", resourceId: contest.id, after: { title: body.title, status: body.status }
  });
  return ok({ contest }, { status: 201 });
}

export async function PATCH(request) {
  const c = await leadContext();
  if (c.res) return c.res;
  const { user, tenant, sql } = c;
  let body;
  try {
    body = updateSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [contest] = await sql`
    UPDATE contests SET status = ${body.status}
    WHERE id = ${body.id} AND tenant_id = ${tenant.id}::uuid
    RETURNING *
  `;
  if (!contest) return fail("NOT_FOUND", "Contest not found", 404);
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant.id, action: "updated_contest",
    resource: "contest", resourceId: contest.id, after: { status: body.status }
  });
  return ok({ contest });
}
