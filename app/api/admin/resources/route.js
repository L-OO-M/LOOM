import { z } from "zod";
import { revalidateTag } from "next/cache";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";

const resourceSchema = z.object({
  id: z.string().min(1).max(80).optional(),
  title: z.string().min(3).max(160),
  domain: z.string().min(1).max(40).default("web"),
  level: z.string().min(1).max(40).default("foundation"),
  kind: z.enum(["article", "doc", "video", "course"]).default("article"),
  url: z.string().url().nullable().optional(),
  minutes: z.number().int().min(1).max(600).default(30),
  // Optional link to the exact roadmap node this resource teaches. Without it a
  // node page can only fall back to the whole domain (migration 045).
  nodeId: z.string().max(120).nullable().optional()
});

export async function GET() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error) return fail(ctx.error, ctx.error === "FORBIDDEN" ? "Admin only" : "Auth required", ctx.error === "FORBIDDEN" ? 403 : 401);
  const { sql } = ctx;
  const rows = await sql`SELECT * FROM resources ORDER BY domain ASC, minutes ASC LIMIT 200`;
  return ok({ resources: rows });
}

export async function POST(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error) return fail(ctx.error, ctx.error === "FORBIDDEN" ? "Admin only" : "Auth required", ctx.error === "FORBIDDEN" ? 403 : 401);
  const { user, tenant, sql } = ctx;
  let body;
  try {
    body = resourceSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const id = body.id || `res_${Date.now().toString(36)}`;
  const [resource] = await sql`
    INSERT INTO resources (id, title, domain, level, kind, url, minutes, node_id)
    VALUES (${id}, ${body.title}, ${body.domain}, ${body.level}, ${body.kind}, ${body.url || null}, ${body.minutes}, ${body.nodeId || null})
    ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, domain = EXCLUDED.domain, level = EXCLUDED.level, kind = EXCLUDED.kind, url = EXCLUDED.url, minutes = EXCLUDED.minutes, node_id = EXCLUDED.node_id
    RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "upserted_resource", resource: "resource", resourceId: id, after: { title: body.title, nodeId: body.nodeId || null } });
  revalidateTag("resources:counts");
  revalidateTag("resources:levels");
  revalidateTag("resources:total");
  return ok({ resource }, { status: 201 });
}
