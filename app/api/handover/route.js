import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { isAdmin } from "@/lib/permissions";

const createSchema = z.object({
  title: z.string().min(3).max(200),
  category: z.string().min(1).max(60).default("general"),
  detail: z.string().max(4000).default("")
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
    SELECT * FROM handover_checklists
    WHERE (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
    ORDER BY done ASC, created_at ASC
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
  const [item] = await sql`
    INSERT INTO handover_checklists (tenant_id, title, category, detail)
    VALUES (${tenant?.id ?? null}, ${body.title}, ${body.category}, ${body.detail})
    RETURNING *
  `;
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id, action: "created_handover_item",
    resource: "handover", resourceId: item.id, after: { title: body.title }
  });
  return ok({ item }, { status: 201 });
}
