import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";

const schema = z.object({ body: z.string().min(2).max(2000) });

export async function POST(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error) return fail(ctx.error, "Auth required", 401);
  const { id } = await params;
  const { user, tenant, sql } = ctx;
  let body;
  try { body = schema.parse(await request.json()); } catch (e) { return validationError(e); }
  const [req] = await sql`SELECT id, requester_id FROM feature_requests WHERE id = ${id}::uuid AND (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL) LIMIT 1`;
  if (!req) return fail("NOT_FOUND", "Not found", 404);
  const isOwner = req.requester_id === user.id;
  const isAdmin = ctx.profile?.role === "admin";
  if (!isOwner && !isAdmin) return fail("FORBIDDEN", "Only requester or admin can comment", 403);
  const [comment] = await sql`INSERT INTO feature_request_comments (request_id, author_id, body) VALUES (${id}::uuid, ${user.id}, ${body.body}) RETURNING *`;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "commented_feature_request", resource: "feature_request", resourceId: id });
  return ok({ comment }, { status: 201 });
}
