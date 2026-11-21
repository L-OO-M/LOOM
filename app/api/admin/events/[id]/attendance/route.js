import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { writeAudit, notify } from "@/lib/auth-server";
import { requireCan, toGuardResponse } from "@/lib/requirePermission";
import { signCertificateForTenant } from "@/lib/credential-keyring";
import { recordEvidence } from "@/lib/ranking";
import { enqueue } from "@/lib/outbox";

const attendSchema = z.object({
  checkInCode: z.string().min(4).max(20)
  // or studentId for manual override:
}).or(z.object({ studentId: z.string().min(1).max(100) }));

// Check in an attendee by door code (or student id override), mark attended,
// and issue their certificate exactly once.
export async function POST(request, { params }) {
  const { id } = await params;
  // The door belongs to the department that owns the event, the lead of that
  // vertical, or an admin. `check_in_attendees` reads the event's department,
  // so a head cannot run the door for an event their department does not own.
  let ctx;
  try {
    ctx = await requireCan("check_in_attendees", async ({ sql, tenant }) => {
      const [row] = await sql`
        SELECT e.department_id, d.vertical AS department_vertical
        FROM events e
        LEFT JOIN departments d ON d.id = e.department_id
        WHERE e.id = ${id} AND e.tenant_id = ${tenant?.id ?? null}::uuid
        LIMIT 1
      `;
      // Explicit null = society-wide event, not "fall back to my department".
      return {
        departmentId: row?.department_id ?? null,
        vertical: row?.department_vertical ?? null,
        eventId: id
      };
    });
  } catch (e) {
    const guard = toGuardResponse(e);
    if (!guard) throw e;
    return fail(guard.error.code, guard.error.message, guard.status);
  }
  const { user, tenant, sql } = ctx;
  let body;
  try {
    body = attendSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [event] = await sql`SELECT * FROM events WHERE id = ${id} AND tenant_id = ${tenant?.id ?? null}::uuid LIMIT 1`;
  if (!event) return fail("NOT_FOUND", "Event not found", 404);
  // Lifecycle guards: a cancelled event has no attendance, and check-in must
  // not open before the event starts. Without these, a cancelled or not-yet-run
  // event could mint certificates.
  if (event.status === "cancelled") {
    return fail("EVENT_CANCELLED", "This event was cancelled — check-in is closed", 409);
  }
  if (event.starts_at && Date.now() < new Date(event.starts_at).getTime()) {
    return fail("EVENT_NOT_STARTED", "Check-in opens when the event starts", 409);
  }

  // Never check in a cancelled registration (re-registering mints a new row, so
  // a cancelled code must not still admit anyone).
  const result = await sql.begin(async (tx) => {
    const [reg] = "checkInCode" in body
      ? await tx`SELECT * FROM event_registrations WHERE event_id = ${id} AND check_in_code = ${body.checkInCode} AND status <> 'cancelled' LIMIT 1`
      : await tx`SELECT * FROM event_registrations WHERE event_id = ${id} AND student_id = ${body.studentId} AND status <> 'cancelled' LIMIT 1`;
    if (!reg) return null;

    await tx`UPDATE event_registrations SET status = 'attended', attended_at = now() WHERE id = ${reg.id}`;
    // Attendance is evidence, not a counter: one row per event per student.
    // Staff checking themselves in must not verify their own standing.
    if (reg.student_id !== user.id) {
      await recordEvidence({
        sql: tx,
        tenantId: tenant?.id ?? null,
        userId: reg.student_id,
        kind: "event_attended",
        refId: id,
        verifiedBy: user.id,
        source: "event_checkin",
        evidence: { eventId: id, checkedInBy: user.id }
      });
      if (tenant?.id) {
        await enqueue(tx, {
          tenantId: tenant.id,
          topic: "ranking.recompute",
          payload: { userId: reg.student_id },
          dedupeKey: `ranking.recompute:${tenant.id}:${reg.student_id}:event:${id}`
        });
      }
    }

    // One certificate per student per event - enforced by
    // certificates_event_student_key (migration 029). The conflict target must
    // be that pair; a random verification_code can never collide, which is why
    // the previous version minted a duplicate on every re-check-in.
    const certId = randomUUID();
    const issuedAt = new Date();
    const signed = await signCertificateForTenant(tx, {
      id: certId,
      studentId: reg.student_id,
      tenantId: tenant?.id ?? null,
      eventId: id,
      issuedAt
    });
    const [cert] = await tx`
      INSERT INTO certificates (
        id, event_id, student_id, tenant_id, title, verification_code, issued_at,
        signature, credential_version, algorithm, key_id, signed_payload
      )
      VALUES (
        ${certId},
        ${id},
        ${reg.student_id},
        ${tenant?.id ?? null},
        ${`Participation - ${event.title}`},
        ${`CERT-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`},
        ${issuedAt},
        ${signed.signature},
        ${signed.credentialVersion},
        ${signed.algorithm},
        ${signed.keyId},
        ${signed.payload ? tx.json(signed.payload) : null}
      )
      ON CONFLICT (event_id, student_id) DO UPDATE SET
        title = EXCLUDED.title,
        signature = COALESCE(certificates.signature, EXCLUDED.signature),
        credential_version = CASE WHEN certificates.signature IS NULL THEN EXCLUDED.credential_version ELSE certificates.credential_version END,
        algorithm = CASE WHEN certificates.signature IS NULL THEN EXCLUDED.algorithm ELSE certificates.algorithm END,
        key_id = CASE WHEN certificates.signature IS NULL THEN EXCLUDED.key_id ELSE certificates.key_id END,
        signed_payload = CASE WHEN certificates.signature IS NULL THEN EXCLUDED.signed_payload ELSE certificates.signed_payload END
      RETURNING *
    `;
    return { reg, cert };
  });
  if (!result?.reg) return fail("NOT_FOUND", "No registration matches", 404);
  const { reg } = result;
  const existing = result.cert;
  if (!existing) return fail("NOT_FOUND", "No registration matches", 404);

  await notify({
    sql, tenantId: tenant?.id, userId: reg.student_id, type: "certificate",
    title: `Certificate issued: ${event.title}`,
    body: "Your participation certificate is ready to view and print.",
    link: `/student/certificates/${existing.verification_code}`
  });
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "checked_in_attendee", resource: "event", resourceId: id, after: { student: reg.student_id } });
  return ok({ attended: true, certificate: existing });
}
