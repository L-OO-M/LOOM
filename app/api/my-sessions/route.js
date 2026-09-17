import { ok, fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";

// The student's own sessions, grouped for the My Sessions page.
// Every row carries its mentor's display name.
export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, sql } = ctx;
  const sessions = await sql`
    SELECT s.*, p.name AS mentor_name, m.headline AS mentor_headline
    FROM mentor_sessions s
    LEFT JOIN profiles p ON p.user_id = s.mentor_id
    LEFT JOIN mentors m ON m.user_id = s.mentor_id
    WHERE s.student_id = ${user.id}
    ORDER BY s.scheduled_at DESC NULLS LAST, s.id DESC LIMIT 100
  `;
  const upcoming = sessions.filter((s) => ["requested", "scheduled"].includes(s.status));
  const past = sessions.filter((s) => ["completed"].includes(s.status));
  const cancelled = sessions.filter((s) => ["cancelled", "rejected"].includes(s.status));
  return ok({ upcoming, past, cancelled, total: sessions.length });
}
