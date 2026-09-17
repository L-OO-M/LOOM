import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z.string().max(1000).optional().default(""),
});

export async function GET(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { sql } = ctx;
  const { id } = await params;
  const reviews = await sql`
    SELECT r.*, p.name AS reviewer_name FROM mentor_reviews r
    LEFT JOIN profiles p ON p.user_id = r.reviewer_id
    WHERE r.mentor_id = ${id} OR r.mentor_id IN (SELECT user_id FROM mentors WHERE id::text = ${id})
    ORDER BY r.reviewed_at DESC LIMIT 30
  `;
  return ok({ reviews });
}

// Review a mentor. Only after a completed session with them; one review
// per student (upsert keeps the latest).
export async function POST(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  let body;
  try {
    body = reviewSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [mentor] = await sql`SELECT * FROM mentors WHERE user_id = ${id} OR id::text = ${id} LIMIT 1`;
  if (!mentor) return fail("NOT_FOUND", "Mentor not found", 404);
  const [done] = await sql`
    SELECT id FROM mentor_sessions
    WHERE mentor_id = ${mentor.user_id} AND student_id = ${user.id} AND status = 'completed'
    LIMIT 1
  `;
  if (!done) return fail("NOT_ELIGIBLE", "Reviews open after a completed session", 403);
  const [review] = await sql`
    INSERT INTO mentor_reviews (mentor_id, reviewer_id, rating, review_text, session_id)
    VALUES (${mentor.user_id}, ${user.id}, ${body.rating}, ${body.text}, ${done.id})
    ON CONFLICT (mentor_id, reviewer_id)
    DO UPDATE SET rating = EXCLUDED.rating, review_text = EXCLUDED.review_text, session_id = EXCLUDED.session_id, reviewed_at = NOW()
    RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "reviewed_mentor", resource: "mentor_review", resourceId: review.id, after: { mentor: mentor.user_id, rating: body.rating } });
  await notify({ sql, tenantId: tenant?.id, userId: mentor.user_id, type: "mentorship", title: "New review received", body: `${body.rating}★ from a mentee`, link: "/student/mentorship/manage" });
  return ok({ review }, { status: 201 });
}
