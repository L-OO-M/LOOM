import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { enrichMentors, availabilityMap } from "@/lib/mentors";

const querySchema = z.object({
  q: z.string().max(120).optional().default(""),
  expertise: z.string().max(80).optional().default("all"),
});

// Mentor directory. Server applies text filters (name/skills/expertise/
// headline/bio); availability/experience/sort run client-side from the
// same payload. Tenant-scoped, any signed-in member may browse.
export async function GET(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { tenant, sql } = ctx;
  let query;
  try {
    query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  } catch (e) {
    return validationError(e);
  }
  const rows = await sql`
    SELECT m.*, p.name AS mentor_name, p.branch, p.year
    FROM mentors m LEFT JOIN profiles p ON p.user_id = m.user_id
    WHERE (m.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
    ORDER BY m.created_at DESC LIMIT 100
  `;
  const q = query.q.trim().toLowerCase();
  const exp = query.expertise.trim().toLowerCase();
  const filtered = rows.filter((m) => {
    const hay = [m.mentor_name, m.headline, m.expertise, m.skills, m.bio].filter(Boolean).join(" ").toLowerCase();
    if (q && !q.split(/\s+/).every((w) => hay.includes(w))) return false;
    if (exp && exp !== "all" && !hay.includes(exp)) return false;
    return true;
  });
  const mentors = await enrichMentors(sql, filtered);
  const availability = await availabilityMap(sql, mentors.map((m) => m.user_id));
  return ok({ mentors, availability });
}
