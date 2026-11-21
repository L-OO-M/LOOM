import { scope } from "@/lib/tenant-scope";
import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { hasAnyActiveScopedGrant, hasVerticalLeadGrant, isAdmin, termExpired } from "@/lib/permissions";
import { PLANNER_YEAR, isoDate, isRelaxationDate } from "@/lib/planner";

const createSchema = z.object({
  title: z.string().min(3).max(160),
  description: z.string().max(4000).default(""),
  eventType: z.enum(["workshop", "hackathon", "talk", "mentoring", "contest"]).default("workshop"),
  domain: z.string().min(1).max(40).default("general"),
  speakerName: z.string().max(120).nullable().optional(),
  speakerBio: z.string().max(1000).nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable().optional(),
  location: z.string().max(300).nullable().optional(),
  capacity: z.number().int().min(0).nullable().optional(),
  isOnline: z.boolean().default(false),
  scope: z.enum(["society", "department"]).default("society"),
  departmentId: z.string().uuid().nullable().optional(),
  plannerWeek: z.number().int().min(1).max(28).nullable().optional(),
  plannerKind: z.string().max(40).nullable().optional(),
  plannerRef: z.string().max(80).nullable().optional()
});

export async function GET(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const { searchParams } = new URL(request.url);
  const rawScope = searchParams.get("scope");
  const scope = rawScope === "past" ? "past" : rawScope === "registered" ? "registered" : "upcoming";
  // Students only ever see approved events: upcoming/live going forward,
  // approved history going back. `proposed` stays in the lead/admin queue.
  if (scope === "registered") {
    const events = await sql`
      SELECT e.*, (SELECT COUNT(*)::int FROM event_registrations r WHERE r.event_id = e.id AND r.status <> 'cancelled') AS seats_taken,
        TRUE AS registered
      FROM events e JOIN event_registrations r ON r.event_id = e.id
      WHERE r.student_id = ${user.id} AND r.status <> 'cancelled'
        AND e.tenant_id = ${tenant?.id ?? null}::uuid AND e.status <> 'cancelled'
      ORDER BY e.starts_at DESC
      LIMIT 50
    `;
    return ok({ events });
  }
  const events = await sql`
    SELECT e.*, (SELECT COUNT(*)::int FROM event_registrations r WHERE r.event_id = e.id AND r.status <> 'cancelled') AS seats_taken,
      EXISTS (SELECT 1 FROM event_registrations r WHERE r.event_id = e.id AND r.student_id = ${user.id} AND r.status <> 'cancelled') AS registered
    FROM events e
    WHERE e.tenant_id = ${tenant?.id ?? null}::uuid
      AND ${scope === "past"
        ? sql`e.status IN ('published', 'registration_closed', 'live', 'completed', 'upcoming', 'past') AND e.starts_at < now() - interval '2 hours'`
        : sql`e.status IN ('published', 'registration_closed', 'live', 'upcoming') AND e.starts_at >= now() - interval '2 hours'`}
    ORDER BY e.starts_at ${scope === "past" ? sql`DESC` : sql`ASC`}
    LIMIT 50
  `;
  return ok({ events });
}

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const admin = isAdmin({ role: profile.role });
  const role = profile.role;

  // The relaxation window is closed to every workshop, lab and society event.
  // The window bounds are tenant-configurable via tenants.settings.relaxation_window;
  // the default falls back to the hardcoded 20 Nov – 20 Dec 2026 period.
  // Note: the client may never pass an `isExempt` flag — the check is server-only.
  const tenantSettings = typeof tenant?.settings === "object" ? tenant.settings : null;
  const startDate = isoDate(body.startsAt);
  const endDate = body.endsAt ? isoDate(body.endsAt) : startDate;
  if (isRelaxationDate(startDate, tenantSettings) || isRelaxationDate(endDate, tenantSettings)) {
    return fail(
      "RELAXATION_WINDOW",
      "This period is a relaxation window: no workshops, labs or society events may be scheduled.",
      409
    );
  }

  // Who may publish what: admins and scoped vertical leads publish; a dept
  // lead's society-wide post enters the FSM as submitted for independent review.
  let status = "published";
  let departmentId = null;
  const grantUser = {
    id: user.id,
    tenantId: tenant?.id,
    scopedGrants: profile.scopedGrants || []
  };
  const verticalLead = role === "vertical_lead" && hasAnyActiveScopedGrant(
    grantUser,
    "vertical_lead",
    "vertical"
  );
  if (admin || verticalLead) {
    departmentId = body.scope === "department" ? body.departmentId || null : null;
    if (body.scope === "department" && body.departmentId) {
      const [d] = await sql`
        SELECT id, vertical FROM departments
        WHERE id = ${body.departmentId}
          AND tenant_id = ${scope(tenant?.id ?? null)}::uuid
        LIMIT 1
      `;
      if (!d) return fail("NOT_FOUND", "Department not found", 404);
      // A vertical lead runs their own domain only. Admins are the only
      // cross-vertical authority in a chapter.
      if (!admin && !hasVerticalLeadGrant(grantUser, d.vertical)) {
        return fail("FORBIDDEN", "You can only schedule events for departments in your vertical", 403);
      }
    }
  } else if (role === "dept_lead") {
    const liveLedMemberships = (profile.memberships || []).filter((membership) =>
      membership.level === "dept_lead" && !termExpired(membership.term_end)
    );
    if (liveLedMemberships.length === 0) {
      return fail("FORBIDDEN", "An active department appointment is required to post events", 403);
    }
    if (body.scope === "department") {
      if (!body.departmentId) return fail("VALIDATION_ERROR", "departmentId is required for department workshops", 400);
      const mine = liveLedMemberships.find((membership) => membership.department_id === body.departmentId);
      if (!mine) return fail("FORBIDDEN", "You can only post workshops for departments you lead", 403);
      departmentId = body.departmentId;
    } else {
      status = "submitted";
    }
  } else {
    return fail("FORBIDDEN", "Only leads and admins can post events", 403);
  }

  const [event] = await sql`
    INSERT INTO events (tenant_id, department_id, event_type, title, description, domain, speaker_name, speaker_bio, starts_at, ends_at, location, capacity, is_online, status, created_by, planner_year, planner_week, planner_kind, planner_ref)
    VALUES (${tenant?.id ?? null}, ${departmentId}, ${body.eventType}, ${body.title}, ${body.description}, ${body.domain}, ${body.speakerName || null}, ${body.speakerBio || null}, ${body.startsAt}, ${body.endsAt || null}, ${body.location || null}, ${body.capacity ?? null}, ${body.isOnline}, ${status}, ${user.id}, ${body.plannerWeek != null ? PLANNER_YEAR : null}, ${body.plannerWeek ?? null}, ${body.plannerKind || null}, ${body.plannerRef || null})
    RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: status === "submitted" ? "submitted_event" : "created_event", resource: "event", resourceId: event.id, after: { title: body.title, status } });
  return ok({ event }, { status: 201 });
}
