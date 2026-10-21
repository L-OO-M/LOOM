import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { can, isAdmin } from "@/lib/permissions";
import {
  HANDOVER_ROLES,
  UUID_PATTERN,
  handoverScope,
  listCandidates,
  findCandidate
} from "@/lib/handover";

const briefSchema = z.object({
  summary: z.string().max(2000).default(""),
  responsibilities: z.string().max(4000).default(""),
  activeWork: z.string().max(4000).default(""),
  risks: z.string().max(4000).default(""),
  contacts: z.string().max(2000).default("")
});

const createSchema = z.object({
  toUserId: z.string().min(1).max(64),
  brief: briefSchema.default({}),
  transferPlanner: z.boolean().default(true),
  transferEventOps: z.boolean().default(true),
  transferHeadSlot: z.boolean().default(true),
  submit: z.boolean().default(false)
});

async function leadContext() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return { res: fail("UNAUTHORIZED", "Authentication required", 401) };
  if (ctx.error) return { res: fail("FORBIDDEN", "Leader profile required", 403) };
  const { user, profile, tenant, sql } = ctx;
  if (!tenant?.id) return { res: fail("FORBIDDEN", "No chapter context", 403) };
  if (!can(profile, "manage_handover").ok) {
    return { res: fail("FORBIDDEN", "Only a live department head, vertical lead or admin can hand over a seat", 403) };
  }
  return { user, profile, tenant, sql };
}

export async function GET(request) {
  const c = await leadContext();
  if (c.res) return c.res;
  const { user, profile, tenant, sql } = c;
  const { searchParams } = new URL(request.url);
  const all = searchParams.get("all") === "1";
  if (all && !isAdmin(profile)) return fail("FORBIDDEN", "Admin only", 403);

  const scope = handoverScope(profile);
  const candidates = scope.error || all ? [] : await listCandidates(sql, {
    tenantId: tenant.id,
    scope,
    fromUserId: user.id
  });

  const handovers = await sql`
    SELECT h.*, fp.name AS from_name, tp.name AS to_name, d.name AS department_name
    FROM lead_handovers h
    LEFT JOIN profiles fp ON fp.user_id = h.from_user_id
    LEFT JOIN profiles tp ON tp.user_id = h.to_user_id
    LEFT JOIN departments d ON d.id = h.department_id
    WHERE h.tenant_id = ${tenant.id}::uuid
      AND (${all} OR h.from_user_id = ${user.id})
    ORDER BY h.created_at DESC
    LIMIT 50
  `;

  return ok({
    handovers,
    candidates,
    canDraft: !scope.error && !all,
    reason: scope.error || null,
    role: scope.role || null,
    departmentName: scope.departmentName || null,
    vertical: scope.vertical || null
  });
}

export async function POST(request) {
  const c = await leadContext();
  if (c.res) return c.res;
  const { user, profile, tenant, sql } = c;
  const scope = handoverScope(profile);
  if (scope.error) return fail("VALIDATION_ERROR", scope.error, 400);
  if (!HANDOVER_ROLES.includes(scope.role)) {
    return fail("FORBIDDEN", "This role cannot be handed over", 403);
  }

  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  if (body.toUserId === user.id) return fail("VALIDATION_ERROR", "Pick a different successor", 400);
  if (body.transferPlanner && !UUID_PATTERN.test(body.toUserId)) {
    return fail("VALIDATION_ERROR", "Planner ownership can only move to an account with a UUID", 400);
  }

  const candidate = await findCandidate(sql, {
    tenantId: tenant.id,
    scope,
    fromUserId: user.id,
    toUserId: body.toUserId
  });
  if (!candidate) return fail("VALIDATION_ERROR", "The successor must be a core member or lead in your scope", 400);

  const [open] = await sql`
    SELECT id FROM lead_handovers
    WHERE tenant_id = ${tenant.id}::uuid AND from_user_id = ${user.id}
      AND status IN ('draft', 'submitted')
    LIMIT 1
  `;
  if (open) return fail("CONFLICT", "You already have a handover in progress", 409);
  if (body.submit && (body.brief.summary.trim().length < 20 || body.brief.responsibilities.trim().length < 20)) {
    return fail("VALIDATION_ERROR", "Before submitting, explain what the role owns and what is in flight (20 characters each).", 400);
  }

  const [handover] = await sql`
    INSERT INTO lead_handovers
      (tenant_id, from_user_id, to_user_id, role, department_id, vertical, brief,
       transfer_planner, transfer_event_ops, transfer_head_slot, status,
       submitted_at, created_by)
    VALUES
      (${tenant.id}::uuid, ${user.id}, ${body.toUserId}, ${scope.role},
       ${scope.departmentId ?? null}, ${scope.vertical ?? null}, ${sql.json(body.brief)},
       ${body.transferPlanner}, ${body.transferEventOps}, ${body.transferHeadSlot},
       ${body.submit ? "submitted" : "draft"},
       ${body.submit ? sql`NOW()` : null}, ${user.id})
    RETURNING *
  `;

  await writeAudit({
    sql,
    actorId: user.id,
    tenantId: tenant.id,
    action: body.submit ? "submitted_handover" : "created_handover",
    resource: "lead_handover",
    resourceId: handover.id,
    after: { to: body.toUserId, role: scope.role, departmentId: scope.departmentId ?? null, status: handover.status }
  });

  return ok({ handover, candidate: { user_id: candidate.user_id, name: candidate.name } }, { status: 201 });
}
