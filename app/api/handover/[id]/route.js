import { scope } from "@/lib/tenant-scope";
import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { isAdmin } from "@/lib/permissions";

const patchSchema = z.object({
  done: z.boolean().optional(),
  detail: z.string().max(4000).optional(),
  ownerId: z.string().min(1).max(64).nullable().optional()
}).refine((b) => b.done !== undefined || b.detail !== undefined || b.ownerId !== undefined, {
  message: "Nothing to update — pass done and/or detail"
});

// Handover item update: admin only.
export async function PATCH(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  if (!isAdmin({ role: profile.role })) return fail("FORBIDDEN", "Admin only", 403);
  let body;
  try {
    body = patchSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const { id } = await params;
  const tid = tenant?.id ?? null;
  if (body.ownerId) {
    const [owner] = await sql`
      SELECT user_id FROM profiles
      WHERE tenant_id = ${scope(tid)}::uuid AND user_id = ${body.ownerId}
      LIMIT 1
    `;
    if (!owner) return fail("INVALID_OWNER", "Owner must be a member of this chapter", 400);
  }
  const [item] = await sql`
    UPDATE handover_checklists SET
      done = COALESCE(${body.done ?? null}, done),
      detail = COALESCE(${body.detail ?? null}, detail),
      owner_id = CASE WHEN ${body.ownerId === undefined} THEN owner_id ELSE ${body.ownerId ?? null} END
    WHERE id = ${id} AND tenant_id = ${scope(tid)}::uuid
    RETURNING *
  `;
  if (!item) return fail("NOT_FOUND", "Handover item not found", 404);
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id, action: "updated_handover_item",
    resource: "handover", resourceId: id, after: { done: item.done }
  });
  return ok({ item });
}
