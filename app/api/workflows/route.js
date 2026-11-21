import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { activeScopedGrantIds, can, isAdmin } from "@/lib/permissions";
import {
  DEPARTMENT_DELIVERABLE_SCHEMAS,
  SOCIETY_WORKSHOP_PIPELINE,
  WORKFLOW_TYPES
} from "@/lib/department-handoffs";

const createSchema = z.object({
  workflowType: z.literal(WORKFLOW_TYPES.SOCIETY_WORKSHOP),
  title: z.string().min(3).max(180),
  initiatingDepartmentId: z.string().uuid(),
  eventId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  ownerId: z.string().max(100).optional(),
  deadline: z.string().datetime().nullable().optional()
});

function actor(ctx) {
  return {
    id: ctx.user.id,
    tenantId: ctx.tenant.id,
    role: ctx.profile.role,
    vertical: ctx.profile.vertical || null,
    memberships: ctx.profile.memberships || [],
    scopedGrants: ctx.profile.scopedGrants || []
  };
}

export async function GET(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const status = new URL(request.url).searchParams.get("status");
  if (status && !["draft", "active", "blocked", "completed", "cancelled"].includes(status)) {
    return fail("VALIDATION_ERROR", "Unknown workflow status", 400);
  }
  const me = actor(ctx);
  const admin = isAdmin(me);
  const departmentIds = [...new Set(
    (ctx.profile.memberships || []).map((membership) => membership.department_id).filter(Boolean)
  )];
  const verticals = activeScopedGrantIds(me, "vertical_lead", "vertical");
  const workflows = await ctx.sql`
    SELECT wi.*, d.slug AS initiating_department_slug, d.name AS initiating_department_name,
      (SELECT COUNT(*)::int FROM workflow_handoffs wh
       WHERE wh.workflow_id = wi.id AND wh.tenant_id = wi.tenant_id) AS step_count,
      (SELECT COUNT(*)::int FROM workflow_handoffs wh
       WHERE wh.workflow_id = wi.id AND wh.tenant_id = wi.tenant_id
         AND wh.status = 'approved') AS approved_steps
    FROM workflow_instances wi
    JOIN departments d ON d.id = wi.initiating_department_id AND d.tenant_id = wi.tenant_id
    WHERE wi.tenant_id = ${ctx.tenant.id}::uuid
      AND (${status}::text IS NULL OR wi.status = ${status})
      AND (
        ${admin}::boolean = true
        OR wi.owner_id = ${ctx.user.id}
        OR wi.initiating_department_id = ANY(${departmentIds}::uuid[])
        OR d.vertical = ANY(${verticals}::text[])
        OR EXISTS (
          SELECT 1
          FROM workflow_handoffs visible_handoff
          JOIN departments visible_department
            ON visible_department.id = visible_handoff.to_department_id
           AND visible_department.tenant_id = visible_handoff.tenant_id
          WHERE visible_handoff.workflow_id = wi.id
            AND visible_handoff.tenant_id = wi.tenant_id
            AND (
              visible_handoff.to_department_id = ANY(${departmentIds}::uuid[])
              OR visible_department.vertical = ANY(${verticals}::text[])
            )
        )
      )
    ORDER BY wi.created_at DESC
    LIMIT 100
  `;
  return ok({ workflows });
}

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }
  const { user, tenant, sql } = ctx;
  const [initiator] = await sql`
    SELECT id, slug, vertical FROM departments
    WHERE id = ${body.initiatingDepartmentId}::uuid
      AND tenant_id = ${tenant.id}::uuid AND is_active
    LIMIT 1
  `;
  if (!initiator) return fail("NOT_FOUND", "Initiating department not found", 404);
  if (initiator.vertical !== "technical") {
    return fail("VALIDATION_ERROR", "The current workshop workflow must start in a technical department", 400);
  }
  const permission = can(actor(ctx), "manage_department_tasks", {
    departmentId: initiator.id,
    vertical: initiator.vertical
  });
  if (!permission.ok) return fail("FORBIDDEN", "You cannot initiate work for this department", 403);

  if (body.eventId) {
    const [event] = await sql`
      SELECT id, department_id FROM events
      WHERE id = ${body.eventId}::uuid AND tenant_id = ${tenant.id}::uuid LIMIT 1
    `;
    if (!event) return fail("NOT_FOUND", "Linked event not found", 404);
    if (event.department_id !== initiator.id) {
      return fail("VALIDATION_ERROR", "Linked event must belong to the initiating department", 400);
    }
  }
  if (body.projectId) {
    const [project] = await sql`
      SELECT id FROM projects WHERE id = ${body.projectId}::uuid AND tenant_id = ${tenant.id}::uuid LIMIT 1
    `;
    if (!project) return fail("NOT_FOUND", "Linked project not found", 404);
  }
  const ownerId = body.ownerId || user.id;
  const [owner] = await sql`
    SELECT user_id FROM profiles
    WHERE tenant_id = ${tenant.id}::uuid AND user_id = ${ownerId}
    LIMIT 1
  `;
  if (!owner) return fail("VALIDATION_ERROR", "Workflow owner is not in this chapter", 400);

  const departments = await sql`
    SELECT id, slug FROM departments WHERE tenant_id = ${tenant.id}::uuid AND is_active
  `;
  const bySlug = new Map(departments.map((department) => [department.slug, department]));
  const pipeline = SOCIETY_WORKSHOP_PIPELINE;
  const missing = pipeline
    .map((step) => step.owningDepartment === "technical" ? null : step.owningDepartment)
    .filter((slug) => slug && !bySlug.has(slug));
  if (missing.length) {
    return fail("WORKFLOW_DEPARTMENT_MISSING", `Missing departments: ${[...new Set(missing)].join(", ")}`, 409);
  }

  const result = await sql.begin(async (tx) => {
    const [workflow] = await tx`
      INSERT INTO workflow_instances (
        tenant_id, workflow_type, title, event_id, project_id,
        initiating_department_id, owner_id, status, metadata
      ) VALUES (
        ${tenant.id}::uuid, ${body.workflowType}, ${body.title}, ${body.eventId || null},
        ${body.projectId || null}, ${initiator.id}, ${ownerId}, 'active',
        ${tx.json({ pipeline: "society_workshop_v1" })}
      ) RETURNING *
    `;
    const handoffs = [];
    let previousDepartmentId = null;
    for (const step of pipeline) {
      const department = step.owningDepartment === "technical"
        ? initiator
        : bySlug.get(step.owningDepartment);
      const deliverableSlug = step.owningDepartment === "technical"
        ? initiator.slug
        : step.owningDepartment;
      const requiredFields = (
        DEPARTMENT_DELIVERABLE_SCHEMAS[deliverableSlug] ||
        DEPARTMENT_DELIVERABLE_SCHEMAS.technical
      ).requiredFields;
      const [handoff] = await tx`
        INSERT INTO workflow_handoffs (
          tenant_id, workflow_id, step_key, sequence, from_department_id,
          to_department_id, required_deliverables, dependencies, deadline, status
        ) VALUES (
          ${tenant.id}::uuid, ${workflow.id}, ${step.id}, ${step.step},
          ${previousDepartmentId}, ${department.id}, ${tx.json(requiredFields)},
          ${step.inputs || []}, ${body.deadline || null}::timestamptz,
          ${step.step === 1 ? "ready" : "pending"}
        ) RETURNING *
      `;
      handoffs.push(handoff);
      previousDepartmentId = department.id;
    }
    await tx`
      INSERT INTO audit_logs (actor_id, tenant_id, action, resource, resource_id, after, metadata)
      VALUES (
        ${user.id}, ${tenant.id}::uuid, 'workflow.created', 'workflow_instance',
        ${workflow.id}::text, ${tx.json({ type: body.workflowType, steps: handoffs.length })},
        ${tx.json({ tenant_id: tenant.id })}
      )
    `;
    return { workflow, handoffs };
  });
  return ok(result, { status: 201 });
}
