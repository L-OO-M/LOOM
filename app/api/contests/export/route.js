import { fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { can } from "@/lib/permissions";
import { csvResponse, toCsv } from "@/lib/csv";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail("FORBIDDEN", "Leader profile required", 403);
  const { profile, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);
  if (!can(profile, "manage_contests").ok) return fail("FORBIDDEN", "Leads only", 403);

  const contestId = new URL(request.url).searchParams.get("contestId") || "";
  if (!UUID.test(contestId)) return fail("VALIDATION_ERROR", "Unknown contest", 400);

  const [contest] = await sql`
    SELECT id, title FROM contests
    WHERE id = ${contestId} AND tenant_id = ${tenant.id}::uuid
    LIMIT 1
  `;
  if (!contest) return fail("NOT_FOUND", "Contest not found", 404);

  const rows = await sql`
    SELECT
      COALESCE(p.name, u.username, r.student_id) AS name,
      p.roll_number, p.branch, p.year, u.username,
      r.status, r.created_at
    FROM contest_registrations r
    LEFT JOIN profiles p ON p.user_id = r.student_id
    LEFT JOIN user_profiles u ON u.user_id = r.student_id
    WHERE r.contest_id = ${contest.id}
    ORDER BY r.created_at ASC
  `;

  const csv = toCsv(
    ["Name", "Roll number", "Branch", "Year", "Username", "Registration status", "Registered at"],
    rows.map((r) => [
      r.name, r.roll_number, r.branch, r.year, r.username, r.status,
      r.created_at ? new Date(r.created_at).toISOString() : ""
    ])
  );

  return csvResponse(`contest-${contest.id.slice(0, 8)}-registrations.csv`, csv);
}
