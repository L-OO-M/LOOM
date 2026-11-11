import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { requireCan, toGuardResponse } from "@/lib/requirePermission";
import { writeAudit, notify } from "@/lib/auth-server";
import { getMou } from "@/lib/mou";
import { canAccessVertical } from "@/lib/scope";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z.object({
  ownerId: z.string().min(1).max(100).optional(),
  nextAction: z.string().min(5).max(500),
  dueOn: z.string().regex(DATE).nullable().optional()
});

const closeSchema = z.object({
  action: z.literal("close"),
  taskId: z.string().regex(UUID)
});

function guard(e) {
  const g = toGuardResponse(e);
  return g ? fail(g.error.code, g.error.message, g.status) : null;
}

export async function POST(request, { params }) {
  let ctx;
  try {
    ctx = await requireCan("manage_mou");
  } catch (e) {
    const r = guard(e);
    if (r) return r;
    throw e;
  }
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  if (!UUID.test(id)) return fail("NOT_FOUND", "MoU not found", 404);

  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }

  const mou = await getMou(sql, { tenantId: tenant.id, id });
  if (!mou) return fail("NOT_FOUND", "MoU not found", 404);
  if (!canAccessVertical(ctx.profile, mou.vertical)) {
    return fail("FORBIDDEN", "That MoU belongs to another domain", 403);
  }

  const ownerId = body.ownerId || user.id;
  const [owner] = await sql`
    SELECT user_id, name FROM profiles
    WHERE user_id = ${ownerId} AND tenant_id = ${tenant.id}::uuid
    LIMIT 1
  `;
  if (!owner) return fail("VALIDATION_ERROR", "Pick an owner from this chapter", 400);

  const [existing] = await sql`
    SELECT id FROM mou_renewal_tasks
    WHERE mou_id = ${id}::uuid AND tenant_id = ${tenant.id}::uuid AND status = 'open'
    LIMIT 1
  `;
  if (existing) return fail("CONFLICT", "This MoU already has an open renewal task", 409);

  const [task] = await sql`
    INSERT INTO mou_renewal_tasks (tenant_id, mou_id, owner_id, next_action, due_on, created_by)
    VALUES (${tenant.id}::uuid, ${id}::uuid, ${ownerId}, ${body.nextAction}, ${body.dueOn ?? null}, ${user.id})
    RETURNING id, mou_id, owner_id, next_action, due_on, status, created_at
  `;

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant.id,
    action: "mou.renewal_open", resource: "mou_renewal_tasks", resourceId: task.id,
    after: { mouId: id, ownerId, nextAction: task.next_action, dueOn: task.due_on }
  });
  if (ownerId !== user.id) {
    await notify(sql, {
      tenantId: tenant.id, userId: ownerId, type: "mou_renewal",
      title: `Renewal task: ${mou.title}`,
      body: body.nextAction,
      link: "/lead/mous"
    });
  }
  return ok({ task, owner: { id: owner.user_id, name: owner.name } }, { status: 201 });
}

export async function PATCH(request, { params }) {
  let ctx;
  try {
    ctx = await requireCan("manage_mou");
  } catch (e) {
    const r = guard(e);
    if (r) return r;
    throw e;
  }
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  if (!UUID.test(id)) return fail("NOT_FOUND", "MoU not found", 404);

  let body;
  try {
    body = closeSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }

  const mou = await getMou(sql, { tenantId: tenant.id, id });
  if (!mou) return fail("NOT_FOUND", "MoU not found", 404);
  if (!canAccessVertical(ctx.profile, mou.vertical)) {
    return fail("FORBIDDEN", "That MoU belongs to another domain", 403);
  }

  const [task] = await sql`
    UPDATE mou_renewal_tasks
    SET status = 'done', closed_by = ${user.id}, closed_at = NOW()
    WHERE id = ${body.taskId}::uuid AND mou_id = ${id}::uuid
      AND tenant_id = ${tenant.id}::uuid AND status = 'open'
    RETURNING id, mou_id, owner_id, next_action, due_on, status, created_at, closed_by, closed_at
  `;
  if (!task) return fail("NOT_FOUND", "Open renewal task not found", 404);

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant.id,
    action: "mou.renewal_close", resource: "mou_renewal_tasks", resourceId: task.id,
    before: { status: "open" }, after: { status: "done", closedBy: user.id }
  });
  return ok({ task });
}
