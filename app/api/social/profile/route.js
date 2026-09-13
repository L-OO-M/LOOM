import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { validUsername } from "@/lib/reputation";

const cardSchema = z.object({
  username: z.string().min(2).max(30),
  bio: z.string().max(300).default(""),
  location: z.string().max(100).nullable().optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
  github: z.string().max(60).nullable().optional(),
  linkedin: z.string().url().max(200).nullable().optional(),
  isPublic: z.boolean().default(true)
});

// My public card (auto-created from profile name on first save view).
export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, sql } = ctx;
  const [card] = await sql`SELECT * FROM user_profiles WHERE user_id = ${user.id} LIMIT 1`;
  return ok({ card: card || null });
}

export async function PUT(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, profile, sql } = ctx;
  let body;
  try {
    body = cardSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const username = body.username.trim().toLowerCase();
  if (!validUsername(username)) return fail("INVALID_USERNAME", "Use 2-30 letters, numbers, - or _", 400);
  const [taken] = await sql`SELECT user_id FROM user_profiles WHERE username = ${username} AND user_id <> ${user.id} LIMIT 1`;
  if (taken) return fail("USERNAME_TAKEN", "That username is taken", 409);
  const links = {};
  if (body.github) links.github = `https://github.com/${body.github.replace(/^@/, "")}`;
  if (body.linkedin) links.linkedin = body.linkedin;
  const [card] = await sql`
    INSERT INTO user_profiles (user_id, tenant_id, username, bio, avatar_url, location, social_links, primary_domain, is_public)
    VALUES (${user.id}, ${tenant?.id ?? null}, ${username}, ${body.bio}, ${body.avatarUrl || null}, ${body.location || null}, ${sql.json(links)}, ${profile?.primary_domain || null}, ${body.isPublic})
    ON CONFLICT (user_id) DO UPDATE SET
      username = EXCLUDED.username, bio = EXCLUDED.bio, avatar_url = EXCLUDED.avatar_url,
      location = EXCLUDED.location, social_links = EXCLUDED.social_links,
      primary_domain = COALESCE(EXCLUDED.primary_domain, user_profiles.primary_domain),
      is_public = EXCLUDED.is_public, updated_at = now()
    RETURNING *
  `;
  return ok({ card });
}
