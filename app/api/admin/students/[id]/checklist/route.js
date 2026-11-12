import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { checklistProgress, checklistTemplate } from "@/lib/people";

const patchSchema = z.object({
  kind: z.enum(["onboarding", "offboarding"]),
  itemKey: z.string().trim().min(1).max(80),
  done: z.boolean()
});

export async function PATCH(request, { params }) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin only", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);

  const { id } = await params;
  let body;
  try {
    body = patchSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }

  const [target] = await sql`
    SELECT user_id, name, role FROM profiles
    WHERE user_id = ${id} AND tenant_id = ${tenant.id}::uuid
    LIMIT 1
  `;
  if (!target) return fail("NOT_FOUND", "Member not in your chapter", 404);

  const template = checklistTemplate(target.role, body.kind);
  const item = template.find((i) => i.key === body.itemKey);
  if (!item) {
    return fail("UNKNOWN_ITEM", "That item is not part of this role's checklist", 400);
  }

  await sql`
    INSERT INTO people_checklist_items
      (tenant_id, user_id, kind, role, item_key, done, done_at, done_by, updated_at)
    VALUES (
      ${tenant.id}, ${target.user_id}, ${body.kind}, ${target.role}, ${body.itemKey},
      ${body.done}, ${body.done ? sql`NOW()` : null}, ${body.done ? user.id : null}, NOW()
    )
    ON CONFLICT (tenant_id, user_id, kind, role, item_key)
    DO UPDATE SET
      done = EXCLUDED.done,
      done_at = EXCLUDED.done_at,
      done_by = EXCLUDED.done_by,
      updated_at = NOW()
  `;

  await writeAudit({
    sql,
    actorId: user.id,
    tenantId: tenant.id,
    action: body.done ? "completed_people_checklist_item" : "reopened_people_checklist_item",
    resource: "profile",
    resourceId: target.user_id,
    after: { kind: body.kind, role: target.role, itemKey: body.itemKey, done: body.done }
  });

  const rows = await sql`
    SELECT kind, item_key, done FROM people_checklist_items
    WHERE tenant_id = ${tenant.id}::uuid
      AND user_id = ${target.user_id}
      AND kind = ${body.kind}
      AND role = ${target.role}
  `;
  return ok({ checklist: checklistProgress(rows, target.role, body.kind) });
}
