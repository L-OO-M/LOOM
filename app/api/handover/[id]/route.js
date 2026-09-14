import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { isAdmin } from "@/lib/permissions";

const patchSchema = z.object({
  done: z.boolean().optional(),
  detail: z.string().max(4000).optional()
}).refine((b) => b.done !== undefined || b.detail !== undefined, {
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
  const [item] = await sql`
    UPDATE handover_checklists SET
      done = COALESCE(${body.done ?? null}, done),
      detail = COALESCE(${body.detail ?? null}, detail)
    WHERE id = ${id} AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
    RETURNING *
  `;
  if (!item) return fail("NOT_FOUND", "Handover item not found", 404);
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id, action: "updated_handover_item",
    resource: "handover", resourceId: id, after: { done: item.done }
  });
  return ok({ item });
}
