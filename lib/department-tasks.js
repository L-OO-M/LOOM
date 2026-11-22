// Department work board rules (pure, no DB).
//
// The API resolves `canManage` / `canVerify` from the permission matrix and
// passes the current row here; this module only decides whether the transition
// is allowed and what it changes. Keeping it pure is deliberate: the
// anti-faking rule ("the person who submitted cannot approve it") is a policy
// statement, and it is cheap to test exhaustively.

export const TASK_KINDS = ["task", "deliverable", "review", "outreach", "documentation"];
export const TASK_PRIORITIES = ["low", "medium", "high"];
export const TASK_STATUSES = ["assigned", "in_progress", "blocked", "submitted", "done"];

/**
 * Why work stopped. Mirrors the CHECK constraint in migration 100 -- the list
 * is closed so the queue can group by it instead of mining free text.
 */
export const BLOCKED_CATEGORIES = [
  "waiting_on_person",
  "waiting_on_access",
  "waiting_on_dependency",
  "unclear_scope",
  "external"
];

export const BLOCKED_CATEGORY_LABEL = {
  waiting_on_person: "Waiting on a person",
  waiting_on_access: "Waiting on access",
  waiting_on_dependency: "Waiting on another piece of work",
  unclear_scope: "Scope is unclear",
  external: "Outside our control"
};

/** Work that is still somebody's problem: not approved, not cancelled. */
export const OPEN_TASK_STATUSES = ["assigned", "in_progress", "blocked", "submitted"];

export const TASK_STATUS_LABEL = {
  assigned: "Assigned",
  in_progress: "In progress",
  blocked: "Blocked",
  submitted: "Waiting for review",
  done: "Approved"
};

const deny = (reason) => ({ ok: false, reason });
const allow = (patch) => ({ ok: true, patch: patch || {} });

/**
 * Decide one transition.
 *
 * action:      update | start | block | submit | approve | return | reopen | cancel
 * task:        the current row (snake_case columns)
 * actorId:     profiles.user_id of the caller
 * canManage:   caller leads this department (or is admin)
 * canVerify:   caller may review this department's work (head / admin / VL)
 */
export function decideTaskAction({ action, task, actorId, canManage = false, canVerify = false }) {
  if (!task || !task.id) return deny("not_found");
  if (action !== "update" && action !== "cancel" && !task.is_active) return deny("inactive");

  const isAssignee = !!task.assignee_id && task.assignee_id === actorId;

  switch (action) {
    case "update":
      if (!canManage) return deny("forbidden");
      if (task.status === "done" || task.status === "submitted") return deny("wrong_status");
      return allow();

    case "start":
      if (!canManage && !isAssignee) return deny("forbidden");
      if (!["assigned", "blocked"].includes(task.status)) return deny("wrong_status");
      return allow({ status: "in_progress" });

    case "block":
      if (!canManage && !isAssignee) return deny("forbidden");
      if (!["assigned", "in_progress"].includes(task.status)) return deny("wrong_status");
      return allow({ status: "blocked" });

    case "submit":
      if (!isAssignee) return deny("forbidden");
      if (!["assigned", "in_progress", "blocked"].includes(task.status)) return deny("wrong_status");
      return allow({ status: "submitted" });

    case "approve":
      if (!canVerify) return deny("forbidden");
      if (task.status !== "submitted") return deny("wrong_status");
      // The reviewer is an independent pair of eyes. Neither the submitter,
      // the assignee, nor any contributor can approve the work.
      if (
        (task.submitted_by && task.submitted_by === actorId) ||
        (task.assignee_id && task.assignee_id === actorId) ||
        (Array.isArray(task.contributors) && task.contributors.includes(actorId))
      ) {
        return deny("self_review");
      }
      return allow({ status: "done" });

    case "return":
      if (!canVerify) return deny("forbidden");
      if (task.status !== "submitted") return deny("wrong_status");
      if (
        (task.submitted_by && task.submitted_by === actorId) ||
        (task.assignee_id && task.assignee_id === actorId) ||
        (Array.isArray(task.contributors) && task.contributors.includes(actorId))
      ) {
        return deny("self_review");
      }
      return allow({ status: "in_progress" });

    case "reopen":
      if (!canManage) return deny("forbidden");
      if (task.status !== "done") return deny("wrong_status");
      return allow({ status: "in_progress" });

    case "cancel":
      if (!canManage) return deny("forbidden");
      if (!task.is_active) return deny("inactive");
      return allow({ is_active: false });

    default:
      return deny("unknown_action");
  }
}

/** Human sentence for a denied transition, safe to return to the caller. */
export function denyMessage(reason) {
  switch (reason) {
    case "forbidden":
      return "Only this department's Head, Co-Head, or an admin can do that";
    case "wrong_status":
      return "That step is not available in this task's current state";
    case "self_review":
      return "A submission cannot be approved by the person who submitted it";
    case "inactive":
      return "That task was cancelled";
    default:
      return "That change is not allowed";
  }
}

// --- Database reads -------------------------------------------------------
// The board, the task detail and a member's own work select the same columns
// (written out in each query — `sql.unsafe` is banned outside migrations), so
// every surface shows the same proof and the same reviewer.

/** Board for one department. `assigneeId` narrows it to one member's work. */
export async function listDepartmentTasks(sql, { tenantId, departmentId, assigneeId = null }) {
  return sql`
    SELECT
      t.id, t.department_id, t.title, t.detail, t.kind, t.priority, t.status,
      t.assignee_id, '{}'::text[] AS contributors, t.due_at, t.submitted_at, t.submitted_by, t.evidence_url,
      t.completion_note, t.reviewed_at, t.reviewed_by, t.review_note,
      t.blocked_reason, t.blocked_category,
      t.created_by, t.is_active, t.created_at, t.updated_at,
      a.name AS assignee_name,
      r.name AS reviewer_name
    FROM department_tasks t
    LEFT JOIN profiles a ON a.user_id = t.assignee_id
    LEFT JOIN profiles r ON r.user_id = t.reviewed_by
    WHERE t.tenant_id = ${tenantId}::uuid
      AND t.department_id = ${departmentId}::uuid
      AND t.is_active
      AND (${assigneeId}::text IS NULL OR t.assignee_id = ${assigneeId})
    ORDER BY (t.status = 'done'), (t.status = 'submitted') DESC, t.due_at ASC NULLS LAST, t.created_at DESC
    LIMIT 200
  `;
}

/** One row, tenant-scoped. Callers still authorize against its department. */
export async function getDepartmentTask(sql, { tenantId, taskId }) {
  const [task] = await sql`
    SELECT
      t.id, t.department_id, t.title, t.detail, t.kind, t.priority, t.status,
      t.assignee_id, '{}'::text[] AS contributors, t.due_at, t.submitted_at, t.submitted_by, t.evidence_url,
      t.completion_note, t.reviewed_at, t.reviewed_by, t.review_note,
      t.blocked_reason, t.blocked_category,
      t.created_by, t.is_active, t.created_at, t.updated_at,
      a.name AS assignee_name,
      r.name AS reviewer_name
    FROM department_tasks t
    LEFT JOIN profiles a ON a.user_id = t.assignee_id
    LEFT JOIN profiles r ON r.user_id = t.reviewed_by
    WHERE t.tenant_id = ${tenantId}::uuid
      AND t.id = ${taskId}::uuid
    LIMIT 1
  `;
  return task ?? null;
}

/**
 * Everything assigned to one person across the chapter, for the member-facing
 * "my work" page. Membership is not required: work already given to someone
 * stays theirs to finish even if their department membership changed.
 */
export async function listTasksForAssignee(sql, { tenantId, userId }) {
  return sql`
    SELECT
      t.id, t.department_id, t.title, t.detail, t.kind, t.priority, t.status,
      t.assignee_id, '{}'::text[] AS contributors, t.due_at, t.submitted_at, t.submitted_by, t.evidence_url,
      t.completion_note, t.reviewed_at, t.reviewed_by, t.review_note,
      t.blocked_reason, t.blocked_category,
      t.created_by, t.is_active, t.created_at, t.updated_at,
      a.name AS assignee_name,
      r.name AS reviewer_name,
      d.name AS department_name, d.slug AS department_slug
    FROM department_tasks t
    JOIN departments d ON d.id = t.department_id
    LEFT JOIN profiles a ON a.user_id = t.assignee_id
    LEFT JOIN profiles r ON r.user_id = t.reviewed_by
    WHERE t.tenant_id = ${tenantId}::uuid
      AND t.assignee_id = ${userId}
      AND t.is_active
    ORDER BY (t.status = 'done'), (t.status = 'submitted') DESC, t.due_at ASC NULLS LAST
    LIMIT 100
  `;
}

/** Open / awaiting-review counts for a department index card. */
export async function taskCounts(sql, { tenantId, departmentId }) {
  const [row] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status IN ('assigned', 'in_progress', 'blocked'))::int AS open,
      COUNT(*) FILTER (WHERE status = 'submitted')::int AS awaiting_review
    FROM department_tasks
    WHERE tenant_id = ${tenantId}::uuid
      AND department_id = ${departmentId}::uuid
      AND is_active
  `;
  return { open: row?.open ?? 0, awaitingReview: row?.awaiting_review ?? 0 };
}
