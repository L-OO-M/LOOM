import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { requireCan, toGuardResponse } from "@/lib/requirePermission";
import { writeAudit } from "@/lib/auth-server";
import { TASK_KINDS, TASK_PRIORITIES, TASK_STATUSES, listTasks } from "@/lib/event-ops";

const createSchema = z.object({
  title: z.string().min(2).max(160),
  detail: z.string().max(2000).default(""),
  eventId: z.string().uuid().nullable().optional(),
  kind: z.enum(TASK_KINDS).default("checklist"),
  priority: z.enum(TASK_PRIORITIES).default("medium"),
  status: z.enum(TASK_STATUSES).default("todo"),
  ownerId: z.string().max(64).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional()
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

export async function GET(request) {
  let ctx;
  try {
    ctx = await requireCan("view_lead_tools");
  } catch (e) {
    const r = guard(e);
    if (r) return r;
    throw e;
  }
  const { tenant, sql } = ctx;
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("event") || null;
  const statusParam = (searchParams.get("status") || "").trim();
  const status = TASK_STATUSES.includes(statusParam) ? statusParam : null;
  const ownerId = searchParams.get("owner") || null;
  const dueSoon = searchParams.get("due") === "soon";
  const q = (searchParams.get("q") || "").trim().slice(0, 80);
  const tasks = await listTasks(sql, { tenantId: tenant.id, eventId, status, ownerId, dueSoon, q });
  return ok({ tasks });
}

export async function POST(request) {
  let ctx;
  try {
    ctx = await requireCan("manage_event_ops");
  } catch (e) {
    const r = guard(e);
    if (r) return r;
    throw e;
  }
  const { user, tenant, sql } = ctx;

  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  if (body.eventId && !(await eventInTenant(sql, tenant.id, body.eventId))) {
    return fail("VALIDATION_ERROR", "Unknown event", 400);
  }
  if (body.ownerId && !(await accountInTenant(sql, tenant.id, body.ownerId))) {
    return fail("VALIDATION_ERROR", "That account is not in this chapter", 400);
  }

  const [task] = await sql`
    INSERT INTO event_ops_tasks
      (tenant_id, event_id, title, detail, kind, priority, status, owner_id, due_at, created_by)
    VALUES
      (${tenant.id}::uuid, ${body.eventId ?? null}, ${body.title}, ${body.detail}, ${body.kind},
       ${body.priority}, ${body.status}, ${body.ownerId ?? null}, ${body.dueAt ?? null}, ${user.id})
    RETURNING id, event_id, title, detail, kind, priority, status, owner_id, due_at, created_at
  `;

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant.id,
    action: "eventops.create", resource: "event_ops_tasks", resourceId: task.id,
    after: { title: task.title, status: task.status }
  });
  return ok({ task }, { status: 201 });
}
