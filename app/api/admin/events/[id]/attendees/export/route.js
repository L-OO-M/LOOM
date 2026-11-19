import { fail } from "@/lib/api";
import { requireCan, toGuardResponse } from "@/lib/requirePermission";

function cell(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(_request, { params }) {
  let ctx;
  try {
    ctx = await requireCan("manage_event_ops");
  } catch (e) {
    const guard = toGuardResponse(e);
    if (!guard) throw e;
    return fail(guard.error.code, guard.error.message, guard.status);
  }
  const { tenant, sql } = ctx;
  const { id } = await params;

  const [event] = await sql`
    SELECT id, title FROM events
    WHERE id = ${id} AND tenant_id = ${tenant?.id ?? null}::uuid
    LIMIT 1
  `;
  if (!event) return fail("NOT_FOUND", "Event not found", 404);

  // `profiles` has no email column: the address lives on the identity row that
  // Auth0/Supabase wrote at link time (user_identities, migration 047). Reading
  // p.email here threw `column p.email does not exist` and turned the whole
  // export into a 500 for every event. Take the newest identity row instead, so
  // a re-linked account exports its current address rather than a stale one.
  const rows = await sql`
    SELECT r.status, r.check_in_code, r.registered_at, r.feedback_score,
      p.name AS student_name, p.primary_domain,
      (
        SELECT ui.email FROM user_identities ui
        WHERE ui.user_id = r.student_id
        ORDER BY ui.updated_at DESC NULLS LAST
        LIMIT 1
      ) AS email
    FROM event_registrations r
    LEFT JOIN profiles p ON p.user_id = r.student_id
    WHERE r.event_id = ${id}
    ORDER BY r.registered_at ASC
    LIMIT 5000
  `;

  const header = ["name", "email", "domain", "status", "check_in_code", "registered_at", "feedback_score"];
  const lines = [header.map(cell).join(",")];
  for (const row of rows) {
    lines.push([
      row.student_name,
      row.email,
      row.primary_domain,
      row.status,
      row.check_in_code,
      row.registered_at instanceof Date ? row.registered_at.toISOString() : row.registered_at,
      row.feedback_score
    ].map(cell).join(","));
  }
  const filename = `event-${String(event.title || id).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "attendees"}.csv`;

  return new Response(`\uFEFF${lines.join("\r\n")}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store"
    }
  });
}
