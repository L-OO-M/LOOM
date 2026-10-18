/**
 * Event operations — read helpers and constants.
 *
 * Operational tasks that turn an event into a checklist someone owns. Queries
 * take a tenantId and filter on it with plain equality (AGENTS.md tenant rule);
 * routes call these after a requireCan() gate.
 */

export const TASK_KINDS = ["checklist", "logistics", "venue", "marketing", "finance", "volunteers", "other"];
export const TASK_PRIORITIES = ["low", "medium", "high"];
export const TASK_STATUSES = ["todo", "in_progress", "blocked", "done"];

export function listTasks(sql, { tenantId, eventId = null, status = null, ownerId = null, dueSoon = false, q = "" }) {
  const term = `%${String(q).trim()}%`;
  const text = String(q).trim();
  return sql`
    SELECT t.id, t.event_id, t.title, t.detail, t.kind, t.priority, t.status,
           t.owner_id, t.due_at, t.done_at, t.created_at, t.updated_at,
           e.title AS event_title, e.starts_at AS event_starts_at,
           p.name AS owner_name
    FROM event_ops_tasks t
    LEFT JOIN events e ON e.id = t.event_id
    LEFT JOIN profiles p ON p.user_id = t.owner_id
    WHERE t.tenant_id = ${tenantId}::uuid AND t.is_active
      AND (${eventId}::uuid IS NULL OR t.event_id = ${eventId}::uuid)
      AND (${status}::text IS NULL OR t.status = ${status}::text)
      AND (${ownerId}::text IS NULL OR t.owner_id = ${ownerId}::text)
      AND (${dueSoon}::boolean = false OR (
        t.status <> 'done' AND t.due_at IS NOT NULL
        AND t.due_at <= (NOW() + INTERVAL '7 days')
      ))
      AND (${text} = '' OR t.title ILIKE ${term} OR t.detail ILIKE ${term})
    ORDER BY (t.status = 'done'), (t.due_at IS NULL), t.due_at, t.created_at DESC
    LIMIT 300
  `;
}

export async function getTask(sql, { tenantId, id }) {
  const [task] = await sql`
    SELECT t.*, e.title AS event_title, e.starts_at AS event_starts_at, p.name AS owner_name
    FROM event_ops_tasks t
    LEFT JOIN events e ON e.id = t.event_id
    LEFT JOIN profiles p ON p.user_id = t.owner_id
    WHERE t.id = ${id}::uuid AND t.tenant_id = ${tenantId}::uuid
    LIMIT 1
  `;
  return task || null;
}
