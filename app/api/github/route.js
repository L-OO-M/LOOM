import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { isGithubEnabled } from "@/lib/github";

export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const [conn] = await sql`SELECT * FROM github_connections WHERE user_id = ${user.id} LIMIT 1`;
  const repos = await sql`SELECT * FROM repositories WHERE student_id = ${user.id} ORDER BY connected_at DESC LIMIT 20`;
  // Same 120-day window the /student/github page renders.
  const activity = await sql`SELECT day, commits, pull_requests, reviews FROM student_daily_activity WHERE student_id = ${user.id} ORDER BY day DESC LIMIT 120`;
  // Fail-closed: missing flag/table/error reads as paused (see lib/github.js).
  const ingestionPaused = tenant?.id ? !(await isGithubEnabled(sql, tenant.id)) : true;
  let lastEventAt = null;
  if (conn?.github_username) {
    try {
      const [row] = await sql`
        SELECT MAX(received_at) AS m FROM github_events
        WHERE lower(actor_login) = lower(${conn.github_username})
      `;
      lastEventAt = row?.m ?? null;
    } catch {
      lastEventAt = null;
    }
  }
  return ok({
    connected: !!conn,
    githubUsername: conn?.github_username ?? null,
    oauthConfigured: false,
    ingestionPaused,
    lastEventAt,
    repos, activity,
    note: !conn
      ? "Save your GitHub username to link activity manually; there is no GitHub App OAuth yet."
      : ingestionPaused
        ? "Ingestion is currently paused for your chapter, so new activity is not being recorded. Previously recorded data is still shown."
        : null
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

// Unlink the caller's own GitHub connection. Ownership is the session
// user_id — one student's disconnect can never touch another student's row.
export async function DELETE() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const [before] = await sql`SELECT github_username FROM github_connections WHERE user_id = ${user.id} LIMIT 1`;
  await sql`DELETE FROM github_connections WHERE user_id = ${user.id}`;
  await sql`UPDATE profiles SET github_username = NULL WHERE user_id = ${user.id}`;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "unlinked_github", resource: "github_connection", resourceId: user.id, before: before ? { githubUsername: before.github_username } : null, after: { connected: false } });
  return ok({ connected: false, githubUsername: null });
}
