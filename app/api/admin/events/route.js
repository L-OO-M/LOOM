import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";

// Bulk event cleanup for the chapter console.
//
// This exists for the real case the console hit first: a chapter seeded with
// demonstration events wants them gone before it schedules anything real.
// It is not a shortcut around the single-event delete rules:
//
// - Events with approval history are archived, never deleted (migration 097
//   keeps `event_status_history` RESTRICT so the governance trail survives).
// - Events with live registrations are archived too, so nobody's seat silently
//   disappears; the single-event route is the place that asks before removing a
//   registration.
// - Everything else is deleted and cascades as usual.
//
// The caller has to send the literal confirmation string, so a stale button or
// an accidental fetch cannot wipe the calendar.
const deleteAllSchema = z.object({
  confirm: z.literal("DELETE ALL EVENTS")
});

export async function DELETE(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin access required", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;

  try {
    deleteAllSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }

  const tid = tenant?.id ?? null;
  if (!tid) return fail("TENANT_UNRESOLVED", "Chapter could not be resolved", 403);

  const result = await sql.begin(async (tx) => {
    const deletable = await tx`
      SELECT e.id, e.title
      FROM events e
      WHERE e.tenant_id = ${tid}::uuid
        AND NOT EXISTS (
          SELECT 1 FROM event_status_history h WHERE h.event_id = e.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM event_registrations r
          WHERE r.event_id = e.id AND r.status <> 'cancelled'
        )
    `;
    const ids = deletable.map((row) => row.id);

    if (ids.length > 0) {
      await tx`DELETE FROM events WHERE id = ANY(${ids}::uuid[]) AND tenant_id = ${tid}::uuid`;
    }

    // Anything with history or a live seat stays, but leaves the calendar.
    const archived = await tx`
      UPDATE events
      SET status = 'archived', lock_version = lock_version + 1
      WHERE tenant_id = ${tid}::uuid AND status <> 'archived'
      RETURNING id
    `;

    return { deleted: ids.length, archived: archived.length, titles: deletable.map((r) => r.title) };
  });

  await writeAudit({
    sql,
    actorId: user.id,
    tenantId: tid,
    action: "deleted_all_events",
    resource: "event",
    before: { deleted: result.deleted, archived: result.archived, titles: result.titles.slice(0, 50) }
  });

  return ok({ deleted: result.deleted, archived: result.archived });
}
