import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";
import { can } from "@/lib/permissions";
import { scope } from "@/lib/tenant-scope";
import { isOptionalHttpUrl, HTTP_URL_MESSAGE } from "@/lib/content-safety";
import {
  TASK_KINDS,
  TASK_PRIORITIES,
  decideTaskAction,
  denyMessage,
  getDepartmentTask
} from "@/lib/department-tasks";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ACTION = z.enum([
  "update", "start", "block", "submit", "approve", "return", "reopen", "cancel"
]);

const patchSchema = z.object({
  action: ACTION,
  title: z.string().min(2).max(160).optional(),
  detail: z.string().max(2000).optional(),
  kind: z.enum(TASK_KINDS).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assigneeId: z.string().max(64).nullable().optional(),
  contributors: z.array(z.string().min(1).max(100)).max(20).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  evidenceUrl: z.string().max(500).nullable().optional().refine(isOptionalHttpUrl, HTTP_URL_MESSAGE),
  completionNote: z.string().max(2000).nullable().optional(),
  reviewNote: z.string().max(2000).nullable().optional()
});

// One task: read it, or move it through exactly one legal transition. Every
// check is duplicated on purpose — the permission matrix decides who may ask,
// decideTaskAction() decides whether that particular step is legal, and the
// self-review rule refuses an approval by the person who submitted the work.
export async function GET(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const { taskId } = await params;

  const task = UUID.test(taskId) ? await getDepartmentTask(sql, { tenantId: tenant.id, taskId }) : null;
  if (!task) return fail("NOT_FOUND", "Task not found", 404);

  const actor = actorFrom(user, profile);
  if (!can(actor, "view_department_tasks", { departmentId: task.department_id, assigneeId: user.id }).ok) {
    return fail("FORBIDDEN", "Forbidden", 403);
  }
  return ok({ task });
}

export async function PATCH(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const { id, taskId } = await params;

  let body;
  try {
    body = patchSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }

  if (!UUID.test(taskId)) return fail("NOT_FOUND", "Task not found", 404);
  const existing = await getDepartmentTask(sql, { tenantId: tenant.id, taskId });
  if (!existing) return fail("NOT_FOUND", "Task not found", 404);
  if (existing.department_id !== id) return fail("NOT_FOUND", "Task not found", 404);

  const [dept] = await sql`
    SELECT id, name, slug FROM departments
    WHERE id = ${existing.department_id} AND tenant_id = ${scope(tenant.id)}::uuid
    LIMIT 1
  `;
  if (!dept) return fail("NOT_FOUND", "Task not found", 404);

  const actor = actorFrom(user, profile);
  const canManage = can(actor, "manage_department_tasks", { departmentId: dept.id }).ok;
  // verify_department_work permission without anti-self scope — the self-review check
  // lives in decideTaskAction which has the full task context.
  const canVerify = can(actor, "verify_department_work", { departmentId: dept.id }).ok;
  // Assignee authority is about this row, not about the caller's membership
  // level: the scope names the person the work was actually given to.
  const isAssignee = !!existing.assignee_id && existing.assignee_id === user.id;
  const canAssigned = isAssignee && can(actor, "update_assigned_department_task", {
    departmentId: dept.id, assigneeId: user.id
  }).ok;

  // Who may even attempt this verb.
  const needsManage = ["update", "reopen", "cancel"].includes(body.action);
  const needsVerify = ["approve", "return"].includes(body.action);
  if (needsManage && !canManage) {
    return fail("FORBIDDEN", "Only this department's Head, Co-Head, or an admin can do that", 403);
  }
  if (needsVerify && !canVerify) {
    return fail("FORBIDDEN", "Only this department's Head, Co-Head, or an admin can review this work", 403);
  }
  if (!needsManage && !needsVerify && !canManage && !canAssigned) {
    return fail("FORBIDDEN", "That work is not assigned to you", 403);
  }

  const decision = decideTaskAction({
    action: body.action,
    task: existing,
    actorId: user.id,
    canManage,
    canVerify
  });
  if (!decision.ok) return fail("FORBIDDEN", denyMessage(decision.reason), 403);

  // Submission is the proof step: no evidence URL, no submission.
  if (body.action === "submit" && !body.evidenceUrl) {
    return fail("VALIDATION_ERROR", "Attach an evidence link before submitting the work", 400);
  }
  if (body.action === "return" && !String(body.reviewNote || "").trim()) {
    return fail("VALIDATION_ERROR", "Say what needs to change before returning the work", 400);
  }

  // Editing fields is its own verb. `start`/`submit` must not smuggle a title,
  // deadline or assignee change past the update rules.
  const editing = body.action === "update";
  const nextAssignee = editing && body.assigneeId !== undefined ? body.assigneeId : existing.assignee_id;
  if (editing && body.assigneeId !== undefined && body.assigneeId !== null && body.assigneeId !== existing.assignee_id) {
    const [member] = await sql`
      SELECT user_id FROM department_memberships
      WHERE tenant_id = ${tenant.id}::uuid
        AND department_id = ${dept.id}::uuid
        AND user_id = ${body.assigneeId}
      LIMIT 1
    `;
    if (!member) return fail("VALIDATION_ERROR", "Add that person to the department first", 400);
  }
  const nextContributors = editing && body.contributors !== undefined
    ? [...new Set(body.contributors.filter((id) => id !== nextAssignee))]
    : (existing.contributors || []);
  if (editing && body.contributors !== undefined && nextContributors.length) {
    const members = await sql`
      SELECT user_id FROM department_memberships
      WHERE tenant_id = ${tenant.id}::uuid
        AND department_id = ${dept.id}::uuid
        AND user_id = ANY(${nextContributors}::text[])
    `;
    if (members.length !== nextContributors.length) {
      return fail("VALIDATION_ERROR", "Every contributor must belong to the department", 400);
    }
  }

  const nextStatus = decision.patch.status ?? existing.status;
  const isSubmit = body.action === "submit";
  const isReview = body.action === "approve" || body.action === "return";
  const isReopen = body.action === "reopen";
  const isCancel = body.action === "cancel";

  const [task] = await sql`
    UPDATE department_tasks SET
      title = ${editing && body.title !== undefined ? body.title : existing.title},
      detail = ${editing && body.detail !== undefined ? body.detail : existing.detail},
      kind = ${editing && body.kind !== undefined ? body.kind : existing.kind},
      priority = ${editing && body.priority !== undefined ? body.priority : existing.priority},
      status = ${nextStatus},
      assignee_id = ${nextAssignee},
      contributors = ${nextContributors},
      due_at = ${editing && body.dueAt !== undefined ? body.dueAt : existing.due_at}::timestamptz,
      submitted_at = CASE WHEN ${isSubmit} THEN NOW() ELSE submitted_at END,
      submitted_by = CASE WHEN ${isSubmit} THEN ${user.id} ELSE submitted_by END,
      evidence_url = CASE WHEN ${isSubmit} THEN ${body.evidenceUrl ?? null} ELSE evidence_url END,
      completion_note = CASE WHEN ${isSubmit} THEN ${body.completionNote ?? null} ELSE completion_note END,
      reviewed_at = CASE WHEN ${isReopen} OR ${isSubmit} THEN NULL WHEN ${isReview} THEN NOW() ELSE reviewed_at END,
      reviewed_by = CASE WHEN ${isReopen} OR ${isSubmit} THEN NULL WHEN ${isReview} THEN ${user.id} ELSE reviewed_by END,
      review_note = CASE WHEN ${isReopen} OR ${isSubmit} THEN NULL WHEN ${isReview} THEN ${body.reviewNote ?? null} ELSE review_note END,
      is_active = CASE WHEN ${isCancel} THEN false ELSE is_active END,
      updated_at = NOW()
    WHERE id = ${taskId}::uuid AND tenant_id = ${tenant.id}::uuid
    RETURNING *
  `;

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant.id,
    action: `department_task.${body.action}`,
    resource: "department_tasks", resourceId: task.id,
    before: {
      status: existing.status, assigneeId: existing.assignee_id,
      submittedBy: existing.submitted_by, reviewedBy: existing.reviewed_by
    },
    after: {
      status: task.status, assigneeId: task.assignee_id,
      submittedBy: task.submitted_by, reviewedBy: task.reviewed_by,
      department: dept.slug
    }
  });

  await notifyForTransition({ sql, tenantId: tenant.id, dept, task, existing, actorId: user.id, action: body.action });

  return ok({ task });
}

function actorFrom(user, profile) {
  return {
    id: user.id,
    role: profile.role,
    vertical: profile.vertical || null,
    memberships: profile.memberships || [],
    scopedGrants: profile.scopedGrants || []
  };
}

/**
 * Tell the humans who are waiting. Notifications never break the request, and
 * a head who is also the actor is skipped rather than notified about their own
 * click.
 */
async function notifyForTransition({ sql, tenantId, dept, task, existing, actorId, action }) {
  const link = "/student/work";

  if (action === "submit") {
    const heads = await sql`
      SELECT user_id FROM department_memberships
      WHERE tenant_id = ${tenantId}::uuid
        AND department_id = ${dept.id}::uuid
        AND level = 'dept_lead'
    `;
    for (const h of heads) {
      if (h.user_id === actorId) continue;
      await notify({
        sql, tenantId, userId: h.user_id, type: "department_task",
        title: `Work waiting for review: ${task.title}`,
        body: `${task.submitted_by ? "A team member" : "Someone"} submitted evidence in ${dept.name}.`,
        link
      });
    }
  }

  if (action === "approve" || action === "return") {
    const target = task.submitted_by || task.assignee_id;
    if (target && target !== actorId) {
      await notify({
        sql, tenantId, userId: target, type: "department_task",
        title: action === "approve"
          ? `Approved: ${task.title}`
          : `Changes requested: ${task.title}`,
        body: task.review_note ? String(task.review_note).slice(0, 200) : null,
        link
      });
    }
  }

  if (task.assignee_id && task.assignee_id !== existing.assignee_id && task.assignee_id !== actorId) {
    await notify({
      sql, tenantId, userId: task.assignee_id, type: "department_task",
      title: `Assigned to you: ${task.title}`,
      body: null,
      link
    });
  }
}
