import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";

const createSchema = z.object({
  title: z.string().min(4).max(160),
  description: z.string().min(10).max(2000),
  integration: z.string().max(2000).default(""),
  tradeoffs: z.string().max(2000).default(""),
  implementation: z.string().max(2000).default(""),
  category: z.enum(["general", "ui", "performance", "content", "integration", "other"]).default("general"),
});

export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error) return fail(ctx.error, "Auth required", ctx.error === "UNAUTHORIZED" ? 401 : 404);
  const { user, tenant, sql } = ctx;
  const tid = tenant?.id ?? null;
  const isAdmin = ctx.profile?.role === "admin";
  const rows = isAdmin
    ? await sql`SELECT fr.*, p.name AS requester_name FROM feature_requests fr LEFT JOIN profiles p ON p.user_id = fr.requester_id WHERE fr.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL ORDER BY fr.created_at DESC LIMIT 100`
    : await sql`SELECT fr.*, p.name AS requester_name FROM feature_requests fr LEFT JOIN profiles p ON p.user_id = fr.requester_id WHERE (fr.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL) AND (fr.requester_id = ${user.id} OR fr.status IN ('approved','built')) ORDER BY fr.created_at DESC LIMIT 100`;
  return ok({ requests: rows });
}

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error) return fail(ctx.error, "Auth required", ctx.error === "UNAUTHORIZED" ? 401 : 404);
  const { user, tenant, sql } = ctx;
  let body;
  try { body = createSchema.parse(await request.json()); } catch (e) { return validationError(e); }
  const [row] = await sql`
    INSERT INTO feature_requests (tenant_id, requester_id, title, description, integration, tradeoffs, implementation, category)
    VALUES (${tenant?.id ?? null}, ${user.id}, ${body.title}, ${body.description}, ${body.integration || ""}, ${body.tradeoffs || ""}, ${body.implementation || ""}, ${body.category})
    RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "created_feature_request", resource: "feature_request", resourceId: row.id, after: { title: body.title } });
  // notify admins
  const admins = await sql`SELECT user_id FROM profiles WHERE role = 'admin' AND (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL) LIMIT 10`;
  for (const a of admins) {
    await notify({ sql, tenantId: tenant?.id, userId: a.user_id, type: "feature_request", title: `New feature idea: ${body.title}`, body: `From ${ctx.profile?.name || user.id}`, link: "/admin/feature-requests" });
  }
  return ok({ request: row }, { status: 201 });
}
