import { ok, fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { enrichMentors, availabilityMap, bookedTimesFor } from "@/lib/mentors";

// Mentor profile detail: mentor + weekly schedule + reviews +
// already-taken slots for the next 14 days (drives the booking UI).
export async function GET(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { tenant, sql } = ctx;
  const { id } = await params;
  const [row] = await sql`
    SELECT m.*, p.name AS mentor_name, p.branch, p.year
    FROM mentors m LEFT JOIN profiles p ON p.user_id = m.user_id
    WHERE (m.user_id = ${id} OR m.id::text = ${id})
      AND (m.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
    LIMIT 1
  `;
  if (!row) return fail("NOT_FOUND", "Mentor not found", 404);
  const [mentor] = await enrichMentors(sql, [row]);
  const availability = await availabilityMap(sql, [mentor.user_id]);
  const reviews = await sql`
    SELECT r.*, p.name AS reviewer_name FROM mentor_reviews r
    LEFT JOIN profiles p ON p.user_id = r.reviewer_id
    WHERE r.mentor_id = ${mentor.user_id}
    ORDER BY r.reviewed_at DESC LIMIT 20
  `;
  const booked = {};
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    booked[iso] = await bookedTimesFor(sql, mentor.user_id, iso);
  }
  return ok({ mentor, availability: availability[mentor.user_id] || [], reviews, booked });
}
