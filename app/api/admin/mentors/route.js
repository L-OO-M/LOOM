import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";

const mentorSchema = z.object({
  userId: z.string().min(1),
  expertise: z.string().max(200).default(""),
  bio: z.string().max(2000).default(""),
  available: z.boolean().default(true)
});

export async function GET() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error) return fail(ctx.error, ctx.error === "FORBIDDEN" ? "Admin only" : "Auth required", ctx.error === "FORBIDDEN" ? 403 : 401);
  const { tenant, sql } = ctx;
  const mentors = await sql`
    SELECT m.*, p.name as mentor_name FROM mentors m
    LEFT JOIN profiles p ON p.user_id = m.user_id
    WHERE m.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL
    ORDER BY m.created_at DESC LIMIT 50
  `;
  // mentor_sessions has no tenant_id column (000_base_schema.sql:527) — it is
  // reached through mentors.user_id. Join through mentors so a tenant admin only
  // ever sees their own chapter's sessions.
  const sessions = await sql`
    SELECT s.* FROM mentor_sessions s
    JOIN mentors m ON m.user_id = s.mentor_id
    WHERE m.tenant_id = ${tenant?.id ?? null}::uuid
    ORDER BY s.created_at DESC LIMIT 30
  `;
  return ok({ mentors, sessions });
}

export async function POST(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error) return fail(ctx.error, ctx.error === "FORBIDDEN" ? "Admin only" : "Auth required", ctx.error === "FORBIDDEN" ? 403 : 401);
  const { user, tenant, sql } = ctx;
  let body;
  try {
    body = mentorSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [target] = await sql`SELECT user_id FROM profiles WHERE user_id = ${body.userId} AND (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL) LIMIT 1`;
  if (!target) return fail("NOT_FOUND", "User not in your college", 404);
  const [mentor] = await sql`
    INSERT INTO mentors (user_id, tenant_id, expertise, bio, available)
    VALUES (${body.userId}, ${tenant?.id ?? null}, ${body.expertise}, ${body.bio}, ${body.available})
    ON CONFLICT (user_id) DO UPDATE SET expertise = EXCLUDED.expertise, bio = EXCLUDED.bio, available = EXCLUDED.available
    RETURNING *
  `;
  await sql`UPDATE profiles SET role = 'core' WHERE user_id = ${body.userId} AND role = 'student'`;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "upserted_mentor", resource: "mentor", resourceId: mentor.id, after: { userId: body.userId } });
  return ok({ mentor }, { status: 201 });
}
