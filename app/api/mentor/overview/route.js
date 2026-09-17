import { ok, fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";

// Mentor's own dashboard data: requests, upcoming, stats, inbox threads.
export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, sql } = ctx;
  const [mentor] = await sql`SELECT * FROM mentors WHERE user_id = ${user.id} LIMIT 1`;
  if (!mentor) return fail("NOT_MENTOR", "Mentor profile not found", 403);

  const requests = await sql`
    SELECT s.*, p.name AS student_name FROM mentor_sessions s
    LEFT JOIN profiles p ON p.user_id = s.student_id
    WHERE s.mentor_id = ${user.id} AND s.status = 'requested'
    ORDER BY s.scheduled_at ASC NULLS LAST LIMIT 30
  `;
  const upcoming = await sql`
    SELECT s.*, p.name AS student_name FROM mentor_sessions s
    LEFT JOIN profiles p ON p.user_id = s.student_id
    WHERE s.mentor_id = ${user.id} AND s.status = 'scheduled'
    ORDER BY s.scheduled_at ASC NULLS LAST LIMIT 30
  `;
  const [stats] = await sql`
    SELECT (SELECT COUNT(*)::int FROM mentor_sessions WHERE mentor_id = ${user.id} AND status = 'completed') AS completed,
           (SELECT COUNT(DISTINCT student_id)::int FROM mentor_sessions WHERE mentor_id = ${user.id}) AS students,
           (SELECT COUNT(*)::int FROM mentor_sessions WHERE mentor_id = ${user.id} AND status = 'requested') AS pending,
           (SELECT COALESCE(AVG(rating),0)::numeric FROM mentor_reviews WHERE mentor_id = ${user.id}) AS rating,
           (SELECT COUNT(*)::int FROM mentor_reviews WHERE mentor_id = ${user.id}) AS reviews
  `;
  const availability = await sql`
    SELECT * FROM mentor_availability WHERE mentor_id = ${user.id}
    ORDER BY day_of_week, start_time
  `;
  const threads = await sql`
    SELECT DISTINCT ON (partner) partner, body, created_at, p.name AS partner_name
    FROM (
      SELECT CASE WHEN sender_id = ${user.id} THEN receiver_id ELSE sender_id END AS partner,
             body, created_at
      FROM mentor_messages WHERE sender_id = ${user.id} OR receiver_id = ${user.id}
    ) t LEFT JOIN profiles p ON p.user_id = t.partner
    ORDER BY partner, created_at DESC LIMIT 20
  `;
  return ok({
    mentor, requests, upcoming,
    stats: {
      completed: stats?.completed ?? 0,
      students: stats?.students ?? 0,
      pending: stats?.pending ?? 0,
      rating: Number(stats?.rating ?? 0),
      reviews: stats?.reviews ?? 0,
    },
    availability, threads,
  });
}
