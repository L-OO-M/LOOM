import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { requireCan, toGuardResponse } from "@/lib/requirePermission";
import { writeAudit } from "@/lib/auth-server";
import { TASK_KINDS, TASK_PRIORITIES, TASK_STATUSES, getTask } from "@/lib/event-ops";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const patchSchema = z.object({
  title: z.string().min(2).max(160).optional(),
  detail: z.string().max(2000).optional(),
  eventId: z.string().uuid().nullable().optional(),
  kind: z.enum(TASK_KINDS).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  ownerId: z.string().max(64).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional()
});

function guard(e) {
  const g = toGuardResponse(e);
  return g ? fail(g.error.code, g.error.message, g.status) : null;
}

async function eventInTenant(sql, tenantId, eventId) {
  const [row] = await sql`
    SELECT id FROM events
    WHERE id = ${eventId}::uuid AND tenant_id = ${tenantId}::uuid LIMIT 1`;
  return !!row;
}

async function accountInTenant(sql, tenantId, userId) {
  const [row] = await sql`
    SELECT user_id FROM profiles
    WHERE user_id = ${userId} AND tenant_id = ${tenantId}::uuid LIMIT 1`;
  return !!row;
}

export async function GET(request, { params }) {
  let ctx;
  try {
    ctx = await requireCan("view_lead_tools");
  } catch (e) {
    const r = guard(e);
    if (r) return r;
    throw e;
  }
  const { id } = await params;
  if (!UUID.test(id)) return fail("NOT_FOUND", "Task not found", 404);
  const task = await getTask(ctx.sql, { tenantId: ctx.tenant.id, id });
  if (!task) return fail("NOT_FOUND", "Task not found", 404);
  return ok({ task });
}

export async function PATCH(request, { params }) {
  let ctx;
  try {
    ctx = await requireCan("manage_event_ops");
  } catch (e) {
    const r = guard(e);
    if (r) return r;
    throw e;
  }
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  if (!UUID.test(id)) return fail("NOT_FOUND", "Task not found", 404);

  let body;
  try {
    body = patchSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }

  const existing = await getTask(sql, { tenantId: tenant.id, id });
  if (!existing) return fail("NOT_FOUND", "Task not found", 404);

  if (body.eventId !== undefined && body.eventId !== null
      && !(await eventInTenant(sql, tenant.id, body.eventId))) {
    return fail("VALIDATION_ERROR", "Unknown event", 400);
  }
  if (body.ownerId !== undefined && body.ownerId !== null
      && !(await accountInTenant(sql, tenant.id, body.ownerId))) {
    return fail("VALIDATION_ERROR", "That account is not in this chapter", 400);
  }

  const next = {
    title: body.title ?? existing.title,
    detail: body.detail ?? existing.detail,
    eventId: body.eventId === undefined ? existing.event_id : body.eventId,
    kind: body.kind ?? existing.kind,
    priority: body.priority ?? existing.priority,
    status: body.status ?? existing.status,
    ownerId: body.ownerId === undefined ? existing.owner_id : body.ownerId,
    dueAt: body.dueAt === undefined ? existing.due_at : body.dueAt,
    isActive: body.isActive === undefined ? existing.is_active : body.isActive
  };
  // Completing a task stamps done_at/done_by; reopening clears them.
  const justDone = next.status === "done" && existing.status !== "done";
  const reopened = next.status !== "done" && existing.status === "done";
  // A moved deadline resets the reminder so the new date can be announced.
  const dueChanged = String(next.dueAt || "") !== String(existing.due_at || "");

  const [task] = await sql`
    UPDATE event_ops_tasks SET
      title = ${next.title}, detail = ${next.detail}, event_id = ${next.eventId},
      kind = ${next.kind}, priority = ${next.priority}, status = ${next.status},
      owner_id = ${next.ownerId}, due_at = ${next.dueAt}, is_active = ${next.isActive},
      done_at = CASE WHEN ${justDone} THEN NOW() WHEN ${reopened} THEN NULL ELSE done_at END,
      done_by = CASE WHEN ${justDone} THEN ${user.id} WHEN ${reopened} THEN NULL ELSE done_by END,
      reminded_at = CASE WHEN ${dueChanged} THEN NULL ELSE reminded_at END,
      updated_at = NOW()
    WHERE id = ${id}::uuid AND tenant_id = ${tenant.id}::uuid
    RETURNING id, event_id, title, detail, kind, priority, status, owner_id, due_at, done_at, is_active,
              created_at, updated_at
  `;

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant.id,
    action: "eventops.update", resource: "event_ops_tasks", resourceId: id,
    before: { status: existing.status },
    after: { status: task.status }
  });
  return ok({ task });
}

export async function DELETE(request, { params }) {
  let ctx;
  try {
    ctx = await requireCan("manage_event_ops");
  } catch (e) {
    const r = guard(e);
    if (r) return r;
    throw e;
  }
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  if (!UUID.test(id)) return fail("NOT_FOUND", "Task not found", 404);

  const [task] = await sql`
    UPDATE event_ops_tasks SET is_active = false, updated_at = NOW()
    WHERE id = ${id}::uuid AND tenant_id = ${tenant.id}::uuid AND is_active
    RETURNING id, title
  `;
  if (!task) return fail("NOT_FOUND", "Task not found", 404);

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant.id,
    action: "eventops.archive", resource: "event_ops_tasks", resourceId: id,
    before: { title: task.title }, after: { isActive: false }
  });
  return ok({ archived: true, id });
}
