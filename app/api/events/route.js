import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { isAdmin } from "@/lib/permissions";

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
  departmentId: z.string().uuid().nullable().optional()
});

export async function GET(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") === "past" ? "past" : "upcoming";
  const events = await sql`
    SELECT e.*, (SELECT COUNT(*)::int FROM event_registrations r WHERE r.event_id = e.id AND r.status <> 'cancelled') AS seats_taken,
      EXISTS (SELECT 1 FROM event_registrations r WHERE r.event_id = e.id AND r.student_id = ${user.id} AND r.status <> 'cancelled') AS registered
    FROM events e
    WHERE e.tenant_id = ${tenant?.id ?? null}::uuid AND e.status <> 'cancelled'
      AND ${scope === "past" ? sql`e.starts_at < now()` : sql`e.starts_at >= now() - interval '2 hours'`}
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

  // Who may publish what: admins and vertical leads go live; a dept lead's
  // department workshop goes live attached to its department; a dept lead's
  // society-wide post waits as 'proposed' for the approval queue.
  let status = "upcoming";
  let departmentId = null;
  if (admin || role === "vertical_lead") {
    departmentId = body.scope === "department" ? body.departmentId || null : null;
    if (body.scope === "department" && body.departmentId) {
      const [d] = await sql`SELECT id FROM departments WHERE id = ${body.departmentId} AND (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL) LIMIT 1`;
      if (!d) return fail("NOT_FOUND", "Department not found", 404);
    }
  } else if (role === "dept_lead") {
    if (body.scope === "department") {
      if (!body.departmentId) return fail("VALIDATION_ERROR", "departmentId is required for department workshops", 400);
      const mine = (profile.memberships || []).find((m) => m.department_id === body.departmentId);
      if (mine?.level !== "dept_lead") return fail("FORBIDDEN", "You can only post workshops for departments you lead", 403);
      departmentId = body.departmentId;
    } else {
      status = "proposed";
    }
  } else {
    return fail("FORBIDDEN", "Only leads and admins can post events", 403);
  }

  const [event] = await sql`
    INSERT INTO events (tenant_id, department_id, event_type, title, description, domain, speaker_name, speaker_bio, starts_at, ends_at, location, capacity, is_online, status, created_by)
    VALUES (${tenant?.id ?? null}, ${departmentId}, ${body.eventType}, ${body.title}, ${body.description}, ${body.domain}, ${body.speakerName || null}, ${body.speakerBio || null}, ${body.startsAt}, ${body.endsAt || null}, ${body.location || null}, ${body.capacity ?? null}, ${body.isOnline}, ${status}, ${user.id})
    RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: status === "proposed" ? "proposed_event" : "created_event", resource: "event", resourceId: event.id, after: { title: body.title, status } });
  return ok({ event }, { status: 201 });
}
