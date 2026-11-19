import { fail, ok } from "@/lib/api";
import { getSql } from "@/lib/db";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

// Public, anonymized chapter directory for the landing page + signed-out visitors.
// Allowed in middleware publicPaths. No member identities are exposed.
export async function GET(request) {
  // Public and unauthenticated, and it fans out into several subqueries per
  // call. One shared per-IP budget; a real visitor loads it once.
  const rl = await checkRateLimit(request, { durable: true, limit: 120, windowMs: 60_000 });
  if (!rl.ok) {
    const r = rateLimitResponse(rl.retryAfter);
    return fail(r.error.code, r.error.message, 429);
  }

  const sql = getSql();
  const chapters = await sql`
    SELECT c.slug, c.public_name, c.mission, c.website_url, c.is_featured,
           (SELECT COUNT(*)::int FROM profiles p WHERE p.tenant_id = c.tenant_id) AS members,
           (SELECT COUNT(*)::int FROM student_oss_contributions o WHERE o.tenant_id = c.tenant_id AND o.status = 'verified') AS oss_merges
    FROM chapter_profiles c
    WHERE c.is_public = true
    ORDER BY c.is_featured DESC, members DESC, c.slug ASC
    LIMIT 24
  `;
  const [{ students = 0 } = {}] = await sql`SELECT COUNT(*)::int AS students FROM profiles WHERE tenant_id IS NOT NULL`;
  return ok({ chapters, totals: { chapters: chapters.length, students } });
}
