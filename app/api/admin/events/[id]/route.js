import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { notify, writeAudit } from "@/lib/auth-server";
import { requireCan, toGuardResponse } from "@/lib/requirePermission";
import { normalizeDomainKey } from "@/lib/domains";

// The values the `events_status_check` constraint actually accepts. The editor
// used to offer "completed", which is NOT one of them: choosing it sent
// `{status:"completed"}` to this route, Postgres rejected the CHECK, and the
// admin got a 500 (and the event vanished from every student query, which only
// look for upcoming/live/past). "past" is the completed state; the UI labels it.
const STATUSES = ["upcoming", "live", "past", "cancelled", "proposed"];

// Legacy clients and older cached bundles still send "completed". Normalise it
// instead of failing a legitimate request on a vocabulary mismatch.
const STATUS_ALIASES = { completed: "past" };

const statusField = z.preprocess(
  (value) => (typeof value === "string" && STATUS_ALIASES[value] ? STATUS_ALIASES[value] : value),
  z.enum(STATUSES).optional()
);

const schema = z.object({
  title: z.string().min(3).max(160).optional(),
  description: z.string().max(4000).optional(),
  eventType: z.enum(["workshop", "hackathon", "talk", "mentoring", "contest"]).optional(),
  domain: z.string().min(1).max(40).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  location: z.string().max(300).nullable().optional(),
  capacity: z.number().int().min(0).nullable().optional(),
  speakerName: z.string().max(120).nullable().optional(),
  speakerBio: z.string().max(1000).nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  isOnline: z.boolean().optional(),
  status: statusField
}).refine((v) => Object.keys(v).length > 0, "Nothing to update");

// Admin/lead event workspace edits. Approving a proposed event stays on
// /api/events/:id/approve so the queue has one implementation; this route is
// for details and lifecycle changes after an event exists.
export async function PATCH(request, { params }) {
  let ctx;
  try {
    ctx = await requireCan("manage_event_ops");
  } catch (e) {
    const guard = toGuardResponse(e);
    if (!guard) throw e;
    return fail(guard.error.code, guard.error.message, guard.status);
  }
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  let body;
  try {
    body = schema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }

  const [event] = await sql`
    SELECT * FROM events
    WHERE id = ${id} AND tenant_id = ${tenant?.id ?? null}::uuid
    LIMIT 1
  `;
  if (!event) return fail("NOT_FOUND", "Event not found", 404);

  // Domain is shown on the public event page and used to group the calendar, so
  // it is stored as a canonical key. "general" is the only non-track value.
  let domain = event.domain;
  if (body.domain !== undefined) {
    const raw = String(body.domain).trim();
    const normalized = normalizeDomainKey(raw);
    if (!normalized && raw.toLowerCase() !== "general") {
      return fail("VALIDATION_ERROR", "Pick a track from the list.", 400, { field: "domain" });
    }
    domain = normalized || "general";
  }

  // A department must belong to this chapter (and, for a non-admin lead, to a
  // department they actually run). Otherwise an event could be filed against
  // another tenant's department id.
  let departmentId = event.department_id;
  if (body.departmentId !== undefined) {
    if (body.departmentId === null) {
      departmentId = null;
    } else {
      const [department] = await sql`
        SELECT id, vertical FROM departments
        WHERE id = ${body.departmentId} AND tenant_id = ${tenant?.id ?? null}::uuid
        LIMIT 1
      `;
      if (!department) return fail("NOT_FOUND", "Department not found", 404);
      const isChapterAdmin = ["admin", "platform_admin"].includes(ctx.profile?.role);
      if (!isChapterAdmin && ctx.profile?.vertical && department.vertical !== ctx.profile.vertical) {
        return fail("FORBIDDEN", "You can only file events under departments in your vertical", 403);
      }
      departmentId = department.id;
    }
  }

  const next = {
    title: body.title ?? event.title,
    description: body.description ?? event.description,
    eventType: body.eventType ?? event.event_type,
    domain,
    startsAt: body.startsAt ? new Date(body.startsAt).toISOString() : event.starts_at,
    endsAt: body.endsAt === undefined ? event.ends_at : body.endsAt ? new Date(body.endsAt).toISOString() : null,
    location: body.location === undefined ? event.location : body.location,
    capacity: body.capacity === undefined ? event.capacity : body.capacity,
    speakerName: body.speakerName === undefined ? event.speaker_name : body.speakerName,
    speakerBio: body.speakerBio === undefined ? event.speaker_bio : body.speakerBio,
    departmentId,
    isOnline: body.isOnline === undefined ? event.is_online : body.isOnline,
    status: body.status ?? event.status
  };

  // An end before the start is not a typo worth guessing at; it would render an
  // event that finishes before it begins.
  if (next.endsAt && new Date(next.endsAt).getTime() < new Date(next.startsAt).getTime()) {
    return fail("VALIDATION_ERROR", "The end time must be after the start time.", 400, { field: "endsAt" });
  }

  const [updated] = await sql`
    UPDATE events
    SET title = ${next.title},
        description = ${next.description},
        event_type = ${next.eventType},
        domain = ${next.domain},
        starts_at = ${next.startsAt},
        ends_at = ${next.endsAt},
        location = ${next.location},
        capacity = ${next.capacity},
        speaker_name = ${next.speakerName},
        speaker_bio = ${next.speakerBio},
        department_id = ${next.departmentId},
        is_online = ${next.isOnline},
        status = ${next.status}
    WHERE id = ${id} AND tenant_id = ${tenant?.id ?? null}::uuid
    RETURNING *
  `;

  await writeAudit({
    sql,
    actorId: user.id,
    tenantId: tenant?.id,
    action: "updated_event",
    resource: "event",
    resourceId: id,
    before: { status: event.status, title: event.title },
    after: { status: next.status, title: next.title }
  });

  // Students already hold a seat, so a cancelled event or a changed time/place
  // is a real notification, not a silent admin edit. Ordinary description
  // polish still lands on the event page without pinging everyone.
  const cancelled = next.status === "cancelled" && event.status !== "cancelled";
  const rescheduled = new Date(next.startsAt).getTime() !== new Date(event.starts_at).getTime();
  const moved = String(next.location || "") !== String(event.location || "");
  const titleChanged = next.title !== event.title;
  const onlineChanged = next.isOnline !== event.is_online;
  if (cancelled || rescheduled || moved || titleChanged || onlineChanged) {
    const recipients = await sql`
      SELECT student_id FROM event_registrations
      WHERE event_id = ${id} AND status <> 'cancelled'
      LIMIT 1000
    `;
    const when = new Date(next.startsAt).toLocaleString("en-IN", {
      weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
    });
    for (const r of recipients) {
      await notify({
        sql,
        tenantId: tenant?.id,
        userId: r.student_id,
        type: "event_update",
        title: cancelled ? `Event cancelled: ${next.title}` : `Event updated: ${next.title}`,
        body: cancelled
          ? "This gathering was cancelled. Your registration is no longer active."
          : [
              rescheduled ? `New time: ${when}.` : null,
              moved ? `New location: ${next.location || "online"}.` : null,
              onlineChanged ? (next.isOnline ? "This event is now online." : "This event is now in person.") : null,
              "Check the event page for the latest details."
            ].filter(Boolean).join(" "),
        link: `/student/events/${id}`
      });
    }
  }

  return ok({ event: updated });
}
