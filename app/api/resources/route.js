import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";

export async function GET(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, sql } = ctx;
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get("domain");
  const q = searchParams.get("q");
  const kind = ["article", "doc", "video", "course"].includes(searchParams.get("kind")) ? searchParams.get("kind") : null;

  const resources = await sql`
    SELECT * FROM resources
    WHERE TRUE
    ${domain ? sql`AND domain = ${domain}` : sql``}
    ${q ? sql`AND title ILIKE ${"%" + q + "%"}` : sql``}
    ${kind ? sql`AND kind = ${kind}` : sql``}
    ORDER BY minutes ASC LIMIT 50
  `;
  const done = await sql`SELECT resource_id FROM resource_progress WHERE student_id = ${user.id} AND status = 'completed'`;
  const doneSet = new Set(done.map((d) => d.resource_id));
  return ok({ resources: resources.map((r) => ({ ...r, completed: doneSet.has(r.id) })) });
}

const completeSchema = z.object({ resourceId: z.string().min(1) });

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  let body;
  try {
    body = completeSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [resource] = await sql`SELECT id, title FROM resources WHERE id = ${body.resourceId} LIMIT 1`;
  if (!resource) return fail("NOT_FOUND", "Resource not found", 404);
  const [row] = await sql`
    INSERT INTO resource_progress (student_id, resource_id, status, completed_at)
    VALUES (${user.id}, ${body.resourceId}, 'completed', NOW())
    ON CONFLICT (student_id, resource_id) DO UPDATE SET status = 'completed', completed_at = NOW(), updated_at = NOW()
    RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "completed_resource", resource: "resource", resourceId: body.resourceId, after: { resourceId: body.resourceId } });
  return ok({ progress: row });
}
