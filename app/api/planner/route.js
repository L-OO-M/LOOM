import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";
import { isAdmin } from "@/lib/permissions";
import { PLANNER_YEAR, isoDate, isRelaxationDate } from "@/lib/planner";
import { loadPlanner } from "@/lib/planner-data";

const createSchema = z.object({
  title: z.string().min(3).max(160),
  description: z.string().max(4000).default(""),
  eventType: z.enum(["workshop", "hackathon", "talk", "mentoring", "contest"]).default("talk"),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable().optional(),
  location: z.string().max(300).nullable().optional(),
  week: z.number().int().min(1).max(28),
  kind: z.string().min(1).max(40).default("society"),
  ref: z.string().min(1).max(80).nullable().optional(),
});

const reassignSchema = z.object({
  action: z.literal("reassign"),
  fromUserId: z.string().uuid().nullable().optional(),
  toUserId: z.string().uuid(),
});

export async function GET(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);

  const { searchParams } = new URL(request.url);
  const track = searchParams.get("track") || "all";
  const weekParam = searchParams.get("week");
  const week = weekParam ? Number(weekParam) : null;
  if (week != null && (!Number.isInteger(week) || week < 1 || week > 28)) {
    return fail("VALIDATION_ERROR", "week must be between 1 and 28", 400);
  }

  const data = await loadPlanner({ sql, tenantId: tenant.id, track, week });
  return ok({ academicYear: PLANNER_YEAR, track, ...data });
}

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);
  if (!isAdmin({ role: profile.role }) && profile.role !== "vertical_lead") {
    return fail("FORBIDDEN", "Only leads and admins can schedule society events", 403);
  }

  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }

  const startDate = isoDate(body.startsAt);
  const endDate = body.endsAt ? isoDate(body.endsAt) : startDate;
  if (isRelaxationDate(startDate) || isRelaxationDate(endDate)) {
    return fail(
      "RELAXATION_WINDOW",
      "20 Nov – 20 Dec 2026 is a relaxation window: no workshops, labs or society events may be scheduled.",
      409
    );
  }

  try {
    const [event] = await sql`
      INSERT INTO events (tenant_id, event_type, title, description, domain, starts_at, ends_at, location, is_online, status, created_by, planner_year, planner_week, planner_kind, planner_ref)
      VALUES (${tenant.id}, ${body.eventType}, ${body.title}, ${body.description}, 'general', ${body.startsAt}, ${body.endsAt || null}, ${body.location || null}, false, 'upcoming', ${user.id}, ${PLANNER_YEAR}, ${body.week}, ${body.kind}, ${body.ref || null})
      RETURNING *
    `;
    await writeAudit({
      sql,
      actorId: user.id,
      tenantId: tenant.id,
      action: "created_planner_event",
      resource: "event",
      resourceId: event.id,
      after: { title: body.title, week: body.week, kind: body.kind },
    });
    return ok({ event }, { status: 201 });
  } catch (err) {
    if (String(err?.code) === "23505") {
      return fail("DUPLICATE", "A planner item with that reference already exists", 409);
    }
    throw err;
  }
}

/**
 * Reassign planner ownership — the handover path.
 *
 * Moves every session owned by `fromUserId` (or every unassigned session when
 * it is null) to `toUserId`, so a lead stepping down never leaves the calendar
 * ownerless. Admin or vertical lead only; the successor must be a member of
 * this chapter. Audited, and the successor is notified when it is not the actor.
 */
export async function PATCH(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);
  if (!isAdmin({ role: profile.role }) && profile.role !== "vertical_lead") {
    return fail("FORBIDDEN", "Only an admin or vertical lead can reassign planner ownership", 403);
  }

  let body;
  try {
    body = reassignSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const fromUserId = body.fromUserId || null;
  if (fromUserId && fromUserId === body.toUserId) {
    return fail("VALIDATION_ERROR", "Pick a different successor", 400);
  }

  const [successor] = await sql`
    SELECT user_id, name FROM profiles
    WHERE user_id = ${body.toUserId} AND tenant_id = ${tenant.id}::uuid
    LIMIT 1
  `;
  if (!successor) return fail("VALIDATION_ERROR", "The successor is not in this chapter", 400);

  const rows = await sql`
    UPDATE planner_sessions SET owner_user_id = ${body.toUserId}, updated_at = now()
    WHERE tenant_id = ${tenant.id}::uuid AND academic_year = ${PLANNER_YEAR}
      AND ((${fromUserId}::uuid IS NULL AND owner_user_id IS NULL) OR owner_user_id = ${fromUserId}::uuid)
    RETURNING id
  `;

  await writeAudit({
    sql,
    actorId: user.id,
    tenantId: tenant.id,
    action: "reassigned_planner_ownership",
    resource: "planner_session",
    resourceId: body.toUserId,
    after: { from: fromUserId, to: body.toUserId, sessions: rows.length },
  });

  if (body.toUserId !== user.id && rows.length > 0) {
    try {
      await notify({
        sql,
        tenantId: tenant.id,
        userId: body.toUserId,
        type: "planner_handover",
        title: "Planner handed to you",
        body: `${rows.length} session${rows.length === 1 ? "" : "s"} are now yours to run.`,
        link: "/lead/planner",
      });
    } catch {
      /* notify is best-effort; the reassignment already committed */
    }
  }

  return ok({ reassigned: rows.length, toUserId: body.toUserId });
}
