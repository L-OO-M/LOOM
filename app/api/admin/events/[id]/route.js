import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { writeAudit } from "@/lib/auth-server";
import { requireCan, toGuardResponse } from "@/lib/requirePermission";

const STATUSES = ["upcoming", "live", "completed", "cancelled", "proposed"];

const schema = z.object({
  title: z.string().min(3).max(160).optional(),
  description: z.string().max(4000).optional(),
  startsAt: z.string().datetime().optional(),
  location: z.string().max(300).nullable().optional(),
  capacity: z.number().int().min(0).nullable().optional(),
  speakerName: z.string().max(120).nullable().optional(),
  isOnline: z.boolean().optional(),
  status: z.enum(STATUSES).optional()
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

  const next = {
    title: body.title ?? event.title,
    description: body.description ?? event.description,
    startsAt: body.startsAt ? new Date(body.startsAt).toISOString() : event.starts_at,
    location: body.location === undefined ? event.location : body.location,
    capacity: body.capacity === undefined ? event.capacity : body.capacity,
    speakerName: body.speakerName === undefined ? event.speaker_name : body.speakerName,
    isOnline: body.isOnline === undefined ? event.is_online : body.isOnline,
    status: body.status ?? event.status
  };

  const [updated] = await sql`
    UPDATE events
    SET title = ${next.title},
        description = ${next.description},
        starts_at = ${next.startsAt},
        location = ${next.location},
        capacity = ${next.capacity},
        speaker_name = ${next.speakerName},
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

  return ok({ event: updated });
}
