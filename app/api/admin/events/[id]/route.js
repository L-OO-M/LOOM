import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { notify, writeAudit } from "@/lib/auth-server";
import { requireCan, toGuardResponse } from "@/lib/requirePermission";
import { normalizeDomainKey } from "@/lib/domains";
import { decideEventTransition } from "@/lib/event-transitions";
import { sanitizeEventPage } from "@/lib/event-page";
import {
  can,
  hasActiveScopedGrant,
  hasAnyActiveScopedGrant,
  hasVerticalLeadGrant,
  isAdmin
} from "@/lib/permissions";

// The FSM in lib/event-transitions.js is authoritative for status changes.
// Legacy status values submitted by older UI bundles are aliased here so
// they map into the FSM vocabulary before the transition is evaluated.
const STATUS_ALIASES = { past: "completed", upcoming: "published", proposed: "submitted" };

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
  // Long-form page. `sections` is validated by lib/event-page.js, not zod, so
  // the same rules apply to the UI and the API.
  tagline: z.string().max(160).nullable().optional(),
  coverImageUrl: z.string().max(500).nullable().optional(),
  sections: z.array(z.any()).max(12).optional(),
  // FSM target status — validated by decideEventTransition, not zod enum.
  status: z.string().optional(),
  // Optimistic concurrency: caller passes the lock_version they last read.
  lockVersion: z.number().int().nonnegative().optional(),
  // Required when targeting 'cancelled'.
  cancellationReason: z.string().max(500).nullable().optional(),
  reason: z.string().max(500).nullable().optional()
}).refine((v) => Object.keys(v).length > 0, "Nothing to update");

// Admin/lead event workspace edits. Status transitions are enforced through
// the event FSM (lib/event-transitions.js). Every status change is recorded in
// event_status_history so there is a full audit trail.
export async function PATCH(request, { params }) {
  let ctx;
  try {
    ctx = await requireCan("view_lead_tools");
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
    SELECT e.*,
      d.vertical AS department_vertical,
      COALESCE(
        d.vertical,
        (SELECT d2.vertical
         FROM department_memberships dm2
         JOIN departments d2 ON d2.id = dm2.department_id
         WHERE dm2.user_id = e.created_by AND dm2.tenant_id = e.tenant_id
           AND (dm2.level <> 'dept_lead' OR dm2.term_end IS NULL OR dm2.term_end >= CURRENT_DATE)
         ORDER BY CASE WHEN dm2.level = 'dept_lead' THEN 0 ELSE 1 END
         LIMIT 1)
      ) AS authority_vertical
    FROM events e
    LEFT JOIN departments d ON d.id = e.department_id AND d.tenant_id = e.tenant_id
    WHERE e.id = ${id} AND e.tenant_id = ${tenant?.id ?? null}::uuid
    LIMIT 1
  `;
  if (!event) return fail("NOT_FOUND", "Event not found", 404);

  const permissionUser = {
    id: user.id,
    tenantId: tenant?.id ?? null,
    role: ctx.profile?.role,
    vertical: ctx.profile?.vertical ?? null,
    memberships: ctx.profile?.memberships || [],
    scopedGrants: ctx.profile?.scopedGrants || []
  };
  const eventScope = {
    eventId: event.id,
    departmentId: event.department_id,
    vertical: event.authority_vertical
  };
  const hasBroadEventOps = isAdmin(permissionUser) || (permissionUser.memberships || []).some(
    (membership) => membership.level === "dept_lead" && can(
      permissionUser,
      "manage_event_ops",
      { departmentId: membership.department_id }
    ).ok
  );
  const hasScopedEventAuthority = can(permissionUser, "post_workshop_dept", eventScope).ok;
  const hasEventLeadGrant = hasActiveScopedGrant(
    permissionUser,
    "event_lead",
    "event",
    event.id
  );
  if (!hasBroadEventOps && !hasScopedEventAuthority && !hasEventLeadGrant) {
    return fail("FORBIDDEN", "You cannot manage this event", 403);
  }

  // Normalize legacy status from database to FSM vocabulary.
  const normalizeStatus = (s) => STATUS_ALIASES[s] ?? s;
  const currentFsmStatus = normalizeStatus(event.status);

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
      const targetPermission = can(permissionUser, "post_workshop_dept", {
        eventId: event.id,
        departmentId: department.id,
        vertical: department.vertical
      });
      if (!hasBroadEventOps && !targetPermission.ok) {
        return fail("FORBIDDEN", "You can only file events under departments in your vertical", 403);
      }
      departmentId = department.id;
    }
  }

  // Resolve status change through the FSM.
  // Alias legacy vocabulary before passing to FSM.
  let targetStatus = body.status !== undefined
    ? (STATUS_ALIASES[body.status] ?? body.status)
    : null;

  let fsmPatch = {};
  if (targetStatus && targetStatus !== currentFsmStatus) {
    // Determine authorization context for the FSM.
    const actorRole = ctx.profile?.role;
    const actorIsAdmin = isAdmin(permissionUser);

    // Check whether actor leads the department that owns this event.
    let isOwningDeptLead = false;
    let eventVertical = event.authority_vertical ?? null;
    if (event.department_id) {
      const [deptMembership] = await sql`
        SELECT dm.id, d.vertical
        FROM department_memberships dm
        JOIN departments d ON d.id = dm.department_id
        WHERE dm.user_id = ${user.id}
          AND dm.department_id = ${event.department_id}
          AND dm.level = 'dept_lead'
          AND (dm.term_end IS NULL OR dm.term_end >= CURRENT_DATE)
          AND dm.tenant_id = ${tenant?.id ?? null}::uuid
        LIMIT 1
      `;
      isOwningDeptLead = !!deptMembership;
      if (deptMembership?.vertical) {
        eventVertical = deptMembership.vertical;
      } else {
        const [department] = await sql`
          SELECT vertical FROM departments
          WHERE id = ${event.department_id}
            AND tenant_id = ${tenant?.id ?? null}::uuid
          LIMIT 1
        `;
        eventVertical = department?.vertical ?? null;
      }
    }
    const isVerticalLead = actorRole === "vertical_lead" && (
      eventVertical
        ? hasVerticalLeadGrant(permissionUser, eventVertical)
        : hasAnyActiveScopedGrant(permissionUser, "vertical_lead", "vertical")
    );

    const decision = decideEventTransition({
      event: { ...event, status: currentFsmStatus },
      targetStatus,
      actorId: user.id,
      actorRole,
      isOwningDeptLead,
      isVerticalLead,
      isAdmin: actorIsAdmin,
      cancellationReason: body.cancellationReason ?? body.reason ?? null,
      expectedVersion: body.lockVersion ?? null
    });

    if (!decision.ok) {
      const httpStatus = decision.reason === "CONCURRENCY_CONFLICT" ? 409
        : decision.reason === "FORBIDDEN" ? 403
        : decision.reason === "INVALID_TRANSITION" ? 422
        : 400;
      return fail(decision.reason, decision.message, httpStatus);
    }

    fsmPatch = decision.patch;
  }

  const page = sanitizeEventPage({
    tagline: body.tagline === undefined ? event.tagline : body.tagline,
    coverImageUrl: body.coverImageUrl === undefined ? event.cover_image_url : body.coverImageUrl,
    sections: body.sections === undefined ? event.page_sections : body.sections
  });

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
    tagline: page.tagline,
    coverImageUrl: page.coverImageUrl,
    sections: page.sections,
    // fsmPatch.status may differ from targetStatus after aliasing; fall through
    // to existing status when no transition was requested.
    status: fsmPatch.status ?? event.status,
    cancellationReason: fsmPatch.cancellation_reason ?? event.cancellation_reason ?? null,
    completedAt: fsmPatch.completed_at ?? event.completed_at ?? null,
    completedBy: fsmPatch.completed_by ?? event.completed_by ?? null
  };

  // An end before the start is not a typo worth guessing at; it would render an
  // event that finishes before it begins.
  if (next.endsAt && new Date(next.endsAt).getTime() < new Date(next.startsAt).getTime()) {
    return fail("VALIDATION_ERROR", "The end time must be after the start time.", 400, { field: "endsAt" });
  }

  // Execute update + FSM history write in a single transaction.
  const statusChanged = next.status !== event.status;
  const transitionResult = await sql.begin(async (tx) => {
    const [row] = await tx`
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
          tagline = ${next.tagline},
          cover_image_url = ${next.coverImageUrl},
          page_sections = ${JSON.stringify(next.sections)}::jsonb,
          status = ${next.status},
          cancellation_reason = ${next.cancellationReason},
          completed_at = ${next.completedAt},
          completed_by = ${next.completedBy},
          lock_version = lock_version + 1
      WHERE id = ${id}
        AND tenant_id = ${tenant?.id ?? null}::uuid
        AND lock_version = ${event.lock_version ?? 1}
      RETURNING *
    `;

    if (!row) return { conflict: true, updated: null };

    if (statusChanged) {
      // Record every status move for a full, tamper-evident audit trail.
      await tx`
        INSERT INTO event_status_history (
          event_id, tenant_id, previous_status, new_status, performed_by, reason
        )
        VALUES (
          ${id},
          ${tenant?.id ?? null}::uuid,
          ${event.status},
          ${next.status},
          ${user.id},
          ${body.reason ?? body.cancellationReason ?? null}
        )
      `;
    }

    return { conflict: false, updated: row };
  });
  if (transitionResult.conflict) {
    return fail("CONCURRENCY_CONFLICT", "Event was changed by another user. Refresh and try again.", 409);
  }
  const updated = transitionResult.updated;

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

// Delete an event. This is admin-only on purpose: it is the one event action
// that removes rows rather than moving a status. Two safeguards stay in place:
//
// - An event with approval history is refused. `event_status_history` is the
//   governance record and migration 097 deliberately made it RESTRICT, so the
//   honest answer is "archive it instead", not a cascade that erases the trail.
// - An event with live registrations needs `{ force: true }` in the body. The
//   first call returns 409 HAS_REGISTRATIONS with the count, the UI asks again,
//   and the confirmed delete notifies every registered student before removing
//   the row. Registrations, materials, volunteer slots and social rows cascade.
export async function DELETE(request, { params }) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin access required", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const { id } = await params;

  let body = {};
  try {
    body = (await request.json()) || {};
  } catch {
    body = {};
  }
  const force = body?.force === true;

  const [event] = await sql`
    SELECT id, title, status FROM events
    WHERE id = ${id} AND tenant_id = ${tenant?.id ?? null}::uuid
    LIMIT 1
  `;
  if (!event) return fail("NOT_FOUND", "Event not found", 404);

  const [history] = await sql`
    SELECT 1 AS present FROM event_status_history
    WHERE event_id = ${id} LIMIT 1
  `;
  if (history) {
    return fail(
      "HAS_HISTORY",
      "This event has approval history, so it cannot be deleted. Archive it instead.",
      409
    );
  }

  const [counts] = await sql`
    SELECT COUNT(*)::int AS registrations
    FROM event_registrations
    WHERE event_id = ${id} AND status <> 'cancelled'
  `;
  const registrations = Number(counts?.registrations || 0);
  if (registrations > 0 && !force) {
    return fail(
      "HAS_REGISTRATIONS",
      `${registrations} ${registrations === 1 ? "student is" : "students are"} registered. Confirm to delete and notify them.`,
      409,
      { registrations }
    );
  }

  const recipients = registrations > 0
    ? await sql`
        SELECT student_id FROM event_registrations
        WHERE event_id = ${id} AND status <> 'cancelled'
        LIMIT 1000
      `
    : [];

  const [deleted] = await sql`
    DELETE FROM events
    WHERE id = ${id} AND tenant_id = ${tenant?.id ?? null}::uuid
    RETURNING id
  `;
  if (!deleted) return fail("NOT_FOUND", "Event not found", 404);

  await writeAudit({
    sql,
    actorId: user.id,
    tenantId: tenant?.id,
    action: "deleted_event",
    resource: "event",
    resourceId: id,
    before: { title: event.title, status: event.status, registrations }
  });

  for (const r of recipients) {
    await notify({
      sql,
      tenantId: tenant?.id,
      userId: r.student_id,
      type: "event_update",
      title: `Event removed: ${event.title}`,
      body: "This gathering was removed from the calendar. Any seat you held is no longer active.",
      link: "/student/events"
    });
  }

  return ok({ deleted: true, registrations, notified: recipients.length });
}
