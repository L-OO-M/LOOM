import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { reputationFor } from "@/lib/reputation";

const reviewSchema = z.object({
  mentorId: z.string().min(1).max(100),
  rating: z.number().int().min(1).max(5),
  reviewText: z.string().max(1000).default("")
});

// Trending this week: most-upvoted threads, top contributors by live reputation,
// mentors by average rating. All scoped to the student's chapter.
export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { tenant, sql } = ctx;
  const tid = tenant?.id ?? null;

  const threads = await sql`
    SELECT t.id, t.title, t.upvote_count, t.reply_count, p.name AS author_name FROM forum_threads t
    LEFT JOIN profiles p ON p.user_id = t.author_id
    WHERE t.tenant_id = ${tid}::uuid AND t.status = 'visible' AND t.created_at >= now() - interval '7 days'
    ORDER BY t.upvote_count DESC LIMIT 5
  `;
  const mentors = await sql`
    SELECT m.user_id, m.expertise, p.name, COUNT(r.id)::int AS reviews,
      COALESCE(AVG(r.rating),0)::numeric AS avg_rating
    FROM mentors m
    LEFT JOIN profiles p ON p.user_id = m.user_id
    LEFT JOIN mentor_reviews r ON r.mentor_id = m.user_id
    WHERE m.tenant_id = ${tid}::uuid AND m.available = true
    GROUP BY m.user_id, m.expertise, p.name ORDER BY avg_rating DESC, reviews DESC LIMIT 5
  `;
  const students = await sql`SELECT user_id, name FROM profiles WHERE tenant_id = ${tid}::uuid AND role = 'student' LIMIT 30`;
  const scored = [];
  for (const s of students) {
    const rep = await reputationFor(sql, s.user_id).catch(() => ({ score: 0 }));
    if (rep.score > 0) scored.push({ ...s, score: rep.score });
  }
  scored.sort((a, b) => b.score - a.score);
  return ok({ threads, mentors, rising: scored.slice(0, 5) });
}

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  let body;
  try {
    body = reviewSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [mentor] = await sql`
    SELECT user_id FROM mentors WHERE user_id = ${body.mentorId}
      AND (tenant_id IS NULL OR tenant_id = ${tenant?.id ?? null}::uuid) LIMIT 1
  `;
  if (!mentor) return fail("NOT_FOUND", "Mentor not found", 404);
  if (body.mentorId === user.id) return fail("INVALID", "You cannot review yourself", 400);
  const [review] = await sql`
    INSERT INTO mentor_reviews (mentor_id, reviewer_id, rating, review_text)
    VALUES (${body.mentorId}, ${user.id}, ${body.rating}, ${body.reviewText})
    ON CONFLICT (mentor_id, reviewer_id) DO UPDATE SET rating = EXCLUDED.rating, review_text = EXCLUDED.review_text, reviewed_at = now()
    RETURNING *
  `;
  return ok({ review }, { status: 201 });
}
