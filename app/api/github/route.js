import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";

export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, sql } = ctx;
  const [conn] = await sql`SELECT * FROM github_connections WHERE user_id = ${user.id} LIMIT 1`;
  const repos = await sql`SELECT * FROM repositories WHERE student_id = ${user.id} ORDER BY connected_at DESC LIMIT 20`;
  const activity = await sql`SELECT * FROM student_daily_activity WHERE student_id = ${user.id} ORDER BY day DESC LIMIT 14`;
  return ok({
    connected: !!conn,
    githubUsername: conn?.github_username ?? null,
    oauthConfigured: false,
    repos, activity,
    note: conn ? null : "GitHub App OAuth is not configured yet. Save your GitHub username to link activity manually; webhook ingestion is live."
  });
}

const connectSchema = z.object({ githubUsername: z.string().min(1).max(39).regex(/^[a-zA-Z0-9-]+$/) });

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  let body;
  try {
    body = connectSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  await sql`
    INSERT INTO github_connections (user_id, github_username)
    VALUES (${user.id}, ${body.githubUsername})
    ON CONFLICT (user_id) DO UPDATE SET github_username = EXCLUDED.github_username
  `;
  await sql`UPDATE profiles SET github_username = ${body.githubUsername} WHERE user_id = ${user.id}`;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "linked_github", resource: "github_connection", resourceId: user.id, after: { githubUsername: body.githubUsername } });
  return ok({ connected: true, githubUsername: body.githubUsername });
}
