import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { requireCan, toGuardResponse } from "@/lib/requirePermission";
import { writeAudit, notify } from "@/lib/auth-server";
import { scope } from "@/lib/tenant-scope";
import {
  TASK_KINDS,
  TASK_PRIORITIES,
  listDepartmentTasks
} from "@/lib/department-tasks";

const createSchema = z.object({
  title: z.string().min(2).max(160),
  detail: z.string().max(2000).default(""),
  kind: z.enum(TASK_KINDS).default("task"),
  priority: z.enum(TASK_PRIORITIES).default("medium"),
  assigneeId: z.string().max(64).nullable().optional(),
  contributors: z.array(z.string().min(1).max(100)).max(20).default([]),
  dueAt: z.string().datetime().nullable().optional()
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function guard(e) {
  const g = toGuardResponse(e);
  return g ? fail(g.error.code, g.error.message, g.status) : null;
}

async function departmentInTenant(sql, tenantId, id) {
  const [dept] = await sql`
    SELECT id, name, slug FROM departments
    WHERE id = ${id} AND tenant_id = ${scope(tenantId)}::uuid AND is_active
    LIMIT 1
  `;
  return dept ?? null;
}

// The board: every open piece of work in one department, with its proof and
// reviewer. Any member of the department may read it; an assignee may always
// read their own rows even after their membership changed.
export async function GET(request, { params }) {
  const { id } = await params;
  const mine = new URL(request.url).searchParams.get("mine") === "1";
  let ctx;
  try {
    // The resolved user id is needed for the "my own assignments" arm, and the
    // guard does not know it until the context exists. A removed assignee may
    // still read their own work, but not the rest of the board.
    ctx = await requireCan("view_department_tasks", (c) => ({
      departmentId: id,
      assigneeId: mine ? c.user.id : null
    }));
  } catch (e) {
    const r = guard(e);
    if (r) return r;
    throw e;
  }
  const { user, tenant, sql } = ctx;
  const dept = await departmentInTenant(sql, tenant?.id, id);
  if (!dept) return fail("NOT_FOUND", "Department not found", 404);

  const tasks = await listDepartmentTasks(sql, {
    tenantId: tenant.id,
    departmentId: dept.id,
    assigneeId: mine ? user.id : null
  });
  return ok({ department: dept, tasks });
}

// Assign work inside this department. The assignee must already be on the
// roster: a task sent to a stranger is the first step of a blame game.
export async function POST(request, { params }) {
  const { id } = await params;
  let ctx;
  try {
    ctx = await requireCan("manage_department_tasks", { departmentId: id });
  } catch (e) {
    const r = guard(e);
    if (r) return r;
    throw e;
  }
  const { user, tenant, sql } = ctx;
  const dept = await departmentInTenant(sql, tenant?.id, id);
  if (!dept) return fail("NOT_FOUND", "Department not found", 404);

  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }

  if (body.assigneeId) {
    const [member] = await sql`
      SELECT m.user_id, p.name FROM department_memberships m
      LEFT JOIN profiles p ON p.user_id = m.user_id
      WHERE m.tenant_id = ${tenant.id}::uuid
        AND m.department_id = ${dept.id}::uuid
        AND m.user_id = ${body.assigneeId}
      LIMIT 1
    `;
    if (!member) return fail("VALIDATION_ERROR", "Add that person to the department first", 400);
  }
  const contributorIds = [...new Set(body.contributors.filter((id) => id !== body.assigneeId))];
  if (contributorIds.length) {
    const members = await sql`
      SELECT user_id FROM department_memberships
      WHERE tenant_id = ${tenant.id}::uuid
        AND department_id = ${dept.id}::uuid
        AND user_id = ANY(${contributorIds}::text[])
    `;
    if (members.length !== contributorIds.length) {
      return fail("VALIDATION_ERROR", "Every contributor must belong to the department", 400);
    }
  }

  const [task] = await sql`
    INSERT INTO department_tasks
      (tenant_id, department_id, title, detail, kind, priority, assignee_id, contributors, due_at, created_by)
    VALUES
      (${tenant.id}::uuid, ${dept.id}::uuid, ${body.title}, ${body.detail},
       ${body.kind}, ${body.priority}, ${body.assigneeId ?? null}, ${contributorIds}, ${body.dueAt ?? null}::timestamptz,
       ${user.id})
    RETURNING *
  `;

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant.id,
    action: "department_task.assigned", resource: "department_tasks", resourceId: task.id,
    after: {
      department: dept.slug, title: task.title, assigneeId: task.assignee_id, dueAt: task.due_at
    }
  });

  if (task.assignee_id) {
    await notify({
      sql,
      tenantId: tenant.id,
      userId: task.assignee_id,
      type: "department_task",
      title: `New work from ${dept.name}: ${task.title}`,
      body: task.detail ? String(task.detail).slice(0, 200) : null,
      link: "/student/work"
    });
  }

  return ok({ task }, { status: 201 });
}
