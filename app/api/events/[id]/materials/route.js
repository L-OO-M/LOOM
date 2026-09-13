import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";

const materialSchema = z.object({
  title: z.string().min(3).max(160),
  storageUrl: z.string().url().max(500),
  fileType: z.enum(["slide", "recording", "handout", "code", "link"]).default("link")
});

export async function POST(request, { params }) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin access required", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  let body;
  try {
    body = materialSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [event] = await sql`SELECT id FROM events WHERE id = ${id} AND tenant_id = ${tenant?.id ?? null}::uuid LIMIT 1`;
  if (!event) return fail("NOT_FOUND", "Event not found", 404);
  const [material] = await sql`
    INSERT INTO event_materials (event_id, file_type, title, storage_url)
    VALUES (${id}, ${body.fileType}, ${body.title}, ${body.storageUrl}) RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "added_event_material", resource: "event", resourceId: id, after: { title: body.title } });
  return ok({ material }, { status: 201 });
}
