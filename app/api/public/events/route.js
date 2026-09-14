import { ok } from "@/lib/api";
import { getSql } from "@/lib/db";
import { getTenantFromRequest } from "@/lib/tenant";

// Public upcoming-events read. No auth — tenant is resolved from the host,
// exactly like lib/tenant.js resolveTenantFromHost. Only real DB rows;
// an empty list means no workshops are scheduled, not a failure.
export async function GET(request) {
  let tenant = null;
  try {
    tenant = await getTenantFromRequest(request);
  } catch {
    tenant = null;
  }
  const tid = tenant?.id ?? null;
  const sql = getSql();
  let events = [];
  try {
    events = await sql`
      SELECT e.id, e.event_type, e.title, e.description, e.domain,
             e.speaker_name, e.starts_at, e.ends_at, e.location,
             e.capacity, e.is_online, e.department_id,
             d.name AS department_name, d.slug AS department_slug
      FROM events e
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE (e.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
        AND e.status IN ('upcoming', 'live')
        AND e.starts_at >= NOW() - INTERVAL '2 hours'
      ORDER BY e.starts_at ASC
      LIMIT 50
    `;
  } catch {
    events = [];
  }
  return ok({ events });
}
