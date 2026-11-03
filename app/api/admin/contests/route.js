import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { pageWindow, paginationMeta, requestPage } from "@/lib/pagination";

const STATUSES = ["draft", "published", "active", "open", "closed"];
const PAGE_SIZE = 50;

const contestSchema = z.object({
  title: z.string().min(3).max(160),
  description: z.string().max(2000).default(""),
  status: z.enum(STATUSES).default("draft"),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional()
});

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(STATUSES)
});

export async function GET(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error) return fail(ctx.error, ctx.error === "FORBIDDEN" ? "Admin only" : "Auth required", ctx.error === "FORBIDDEN" ? 403 : 401);
  const { tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);
  const url = new URL(request?.url ?? "http://localhost/api/admin/contests");
  const { page, pageSize } = requestPage(url.searchParams, { defaultPageSize: PAGE_SIZE });

  // COUNT first, in the same tenant scope, so the page window is known before
  // the row query decides whether it needs to run at all.
  const [{ total = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS total FROM contests c
    WHERE c.tenant_id = ${tenant.id}::uuid
  `;
  const win = pageWindow(total, page, pageSize);

  let rows = [];
  if (win.total > 0 && !win.outOfRange) {
    rows = await sql`
      SELECT c.*, (SELECT COUNT(*)::int FROM contest_registrations r WHERE r.contest_id = c.id) AS registrations
      FROM contests c
      WHERE c.tenant_id = ${tenant.id}::uuid
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT ${pageSize} OFFSET ${win.offset}
    `;
  }
  return ok({ contests: rows, pagination: paginationMeta(win) });
}

export async function POST(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error) return fail(ctx.error, ctx.error === "FORBIDDEN" ? "Admin only" : "Auth required", ctx.error === "FORBIDDEN" ? 403 : 401);
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);
  let body;
  try {
    body = contestSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [contest] = await sql`
    INSERT INTO contests (tenant_id, title, description, status, starts_at, ends_at)
    VALUES (${tenant.id}, ${body.title}, ${body.description || ""}, ${body.status}, ${body.startsAt || null}, ${body.endsAt || null})
    RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant.id, action: "created_contest", resource: "contest", resourceId: contest.id, after: { title: body.title } });
  return ok({ contest }, { status: 201 });
}

// Close (or re-open) a contest from the admin workspace. Lead and admin used to
// have different control surfaces; both now converge on a tenant-pinned update,
// so a chapter admin can finish a competition without leaving the page.
export async function PATCH(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error) return fail(ctx.error, ctx.error === "FORBIDDEN" ? "Admin only" : "Auth required", ctx.error === "FORBIDDEN" ? 403 : 401);
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);
  let body;
  try {
    body = statusSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [contest] = await sql`
    UPDATE contests SET status = ${body.status}
    WHERE id = ${body.id} AND tenant_id = ${tenant.id}::uuid
    RETURNING *
  `;
  if (!contest) return fail("NOT_FOUND", "Contest not found", 404);
  await writeAudit({ sql, actorId: user.id, tenantId: tenant.id, action: "updated_contest", resource: "contest", resourceId: contest.id, after: { status: body.status } });
  return ok({ contest });
}
