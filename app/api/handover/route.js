import { scope } from "@/lib/tenant-scope";
import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { isAdmin } from "@/lib/permissions";

const createSchema = z.object({
  title: z.string().min(3).max(200),
  category: z.string().min(1).max(60).default("general"),
  detail: z.string().max(4000).default(""),
  ownerId: z.string().min(1).max(64)
});

// Handover checklist: continuity items for leadership transitions.
// Admin only — both listing and creation.
export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { profile, tenant, sql } = ctx;
  if (!isAdmin({ role: profile.role })) return fail("FORBIDDEN", "Admin only", 403);
  const tid = tenant?.id ?? null;
  const items = await sql`
    SELECT hc.*, p.name AS owner_name, d.name AS department_name
    FROM handover_checklists hc
    LEFT JOIN profiles p ON p.user_id = hc.owner_id AND p.tenant_id = hc.tenant_id
    LEFT JOIN departments d ON d.id = hc.department_id AND d.tenant_id = hc.tenant_id
    WHERE hc.tenant_id = ${scope(tid)}::uuid
    ORDER BY hc.done ASC, hc.created_at ASC
  `;
  return ok({ items });
}

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  if (!isAdmin({ role: profile.role })) return fail("FORBIDDEN", "Admin only", 403);
  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  if (body.ownerId) {
    const [owner] = await sql`
      SELECT user_id FROM profiles
      WHERE tenant_id = ${scope(tenant?.id ?? null)}::uuid AND user_id = ${body.ownerId}
      LIMIT 1
    `;
    if (!owner) return fail("INVALID_OWNER", "Owner must be a member of this chapter", 400);
  }
  const [item] = await sql`
    INSERT INTO handover_checklists (tenant_id, title, category, detail, owner_id)
    VALUES (${tenant?.id ?? null}, ${body.title}, ${body.category}, ${body.detail}, ${body.ownerId ?? null})
    RETURNING *
  `;
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id, action: "created_handover_item",
    resource: "handover", resourceId: item.id, after: { title: body.title, ownerId: body.ownerId ?? null }
  });
  return ok({ item }, { status: 201 });
}
