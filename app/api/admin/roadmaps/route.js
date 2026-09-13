import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";

const nodeSchema = z.object({
  id: z.string().min(1).max(80).optional(),
  title: z.string().min(3).max(120),
  description: z.string().max(2000).default(""),
  domain: z.string().min(1).max(40).default("web"),
  sortOrder: z.number().int().min(0).default(0)
});

export async function GET() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error) return fail(ctx.error, ctx.error === "FORBIDDEN" ? "Admin only" : "Auth required", ctx.error === "FORBIDDEN" ? 403 : 401);
  const { sql } = ctx;
  const nodes = await sql`SELECT * FROM roadmap_nodes ORDER BY sort_order ASC`;
  return ok({ nodes });
}

export async function POST(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error) return fail(ctx.error, ctx.error === "FORBIDDEN" ? "Admin only" : "Auth required", ctx.error === "FORBIDDEN" ? 403 : 401);
  const { user, tenant, sql } = ctx;
  let body;
  try {
    body = nodeSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const id = body.id || `node_${Date.now().toString(36)}`;
  const [node] = await sql`
    INSERT INTO roadmap_nodes (id, title, description, domain, sort_order)
    VALUES (${id}, ${body.title}, ${body.description || ""}, ${body.domain}, ${body.sortOrder})
    ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, domain = EXCLUDED.domain, sort_order = EXCLUDED.sort_order
    RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "upserted_roadmap_node", resource: "roadmap_node", resourceId: id, after: { title: body.title } });
  return ok({ node }, { status: 201 });
}
