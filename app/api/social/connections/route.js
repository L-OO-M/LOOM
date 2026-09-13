import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, notify } from "@/lib/auth-server";

const followSchema = z.object({ username: z.string().min(2).max(30) });
const endorseSchema = z.object({
  username: z.string().min(2).max(30),
  skill: z.string().min(2).max(40)
});

async function resolveUser(sql, username) {
  const [card] = await sql`SELECT user_id FROM user_profiles WHERE username = ${username.trim().toLowerCase()} LIMIT 1`;
  return card?.user_id || null;
}

export async function GET(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { searchParams } = new URL(request.url);
  const target = await resolveUser(ctx.sql, searchParams.get("username") || "");
  if (!target) return fail("NOT_FOUND", "User not found", 404);
  const { user, sql } = ctx;
  const [following] = await sql`SELECT id FROM followers WHERE follower_id = ${user.id} AND following_id = ${target} LIMIT 1`;
  const endorsements = await sql`
    SELECT skill, COUNT(*)::int AS n FROM user_endorsements WHERE endorsee_id = ${target} GROUP BY skill ORDER BY n DESC LIMIT 10
  `;
  const [{ followers = 0 } = {}] = await sql`SELECT COUNT(*)::int AS followers FROM followers WHERE following_id = ${target}`;
  return ok({ following: !!following, endorsements, followers });
}

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") === "endorse" ? "endorse" : "follow";
  let body;
  try {
    body = (mode === "endorse" ? endorseSchema : followSchema).parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const target = await resolveUser(sql, body.username);
  if (!target) return fail("NOT_FOUND", "User not found", 404);
  if (target === user.id) return fail("INVALID", "You cannot follow or endorse yourself", 400);

  if (mode === "endorse") {
    await sql`
      INSERT INTO user_endorsements (endorser_id, endorsee_id, skill)
      VALUES (${user.id}, ${target}, ${body.skill.trim()}) ON CONFLICT DO NOTHING
    `;
    return ok({ endorsed: true });
  }
  const existing = await sql`SELECT id FROM followers WHERE follower_id = ${user.id} AND following_id = ${target} LIMIT 1`;
  if (existing.length) {
    await sql`DELETE FROM followers WHERE follower_id = ${user.id} AND following_id = ${target}`;
    return ok({ following: false });
  }
  await sql`INSERT INTO followers (follower_id, following_id) VALUES (${user.id}, ${target}) ON CONFLICT DO NOTHING`;
  await notify({
    sql, tenantId: tenant?.id, userId: target, type: "follow",
    title: "New follower", body: "Someone from your chapter followed you.", link: "/student/discover"
  });
  return ok({ following: true });
}
