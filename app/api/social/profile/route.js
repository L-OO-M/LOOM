import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { RESERVED_USERNAMES, validUsername } from "@/lib/reputation";
import { isHttpUrl, isOptionalHttpUrl, HTTP_URL_MESSAGE, screenProfileCard } from "@/lib/content-safety";
import { checkRateLimit } from "@/lib/rate-limit";

const cardSchema = z.object({
  username: z.string().min(2).max(30),
  bio: z.string().max(300).default(""),
  location: z.string().max(100).nullable().optional(),
  avatarUrl: z.string().max(500).nullable().optional().refine(isOptionalHttpUrl, "Photo URL must be an http(s) URL"),
  github: z.string().max(60).nullable().optional(),
  linkedin: z.string().max(200).nullable().optional().refine(isOptionalHttpUrl, "LinkedIn URL must be an http(s) URL"),
  isPublic: z.boolean().default(true),
  endorsementsVisible: z.boolean().optional()
});

// A displayed photo is for leads and heads only. Plain students never store one
// (AGENTS.md: profiles carry a photo from dept_lead upward, not below).
const PHOTO_ROLES = ["dept_lead", "vertical_lead", "admin", "platform_admin"];

// A handle is the member's public identity. A short cooldown and a lifetime cap
// keep it stable for peers/mentors while still allowing a mistake to be fixed.
const USERNAME_COOLDOWN_DAYS = 30;
const USERNAME_CHANGE_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

function cooldownMessage(changedAt) {
  const next = new Date(new Date(changedAt).getTime() + USERNAME_COOLDOWN_DAYS * DAY_MS);
  return `Usernames can change once every ${USERNAME_COOLDOWN_DAYS} days. You can change it again on ${next.toISOString().slice(0, 10)}.`;
}

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
  const limited = await checkRateLimit(`social-profile:${user.id}`, { durable: true, limit: 30, windowMs: 60_000 });
  if (!limited.ok) return fail("RATE_LIMITED", "Too many profile saves — slow down", 429);
  let body;
  try {
    body = cardSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  if (body.avatarUrl && !isHttpUrl(body.avatarUrl)) {
    return fail("INVALID_URL", "Photo URL must be an http(s) URL", 400);
  }
  const username = body.username.trim().toLowerCase();
  if (RESERVED_USERNAMES.includes(username)) return fail("INVALID_USERNAME", "That name is reserved for app pages — pick another", 400);
  if (!validUsername(username)) return fail("INVALID_USERNAME", "Use 2-30 letters, numbers, - or _", 400);
  const screened = screenProfileCard({ bio: body.bio, location: body.location, github: body.github, linkedin: body.linkedin });
  if (!screened.ok) return fail(screened.code, screened.message, 400);
  const canPhoto = PHOTO_ROLES.includes(profile?.role);
  if (body.avatarUrl && !canPhoto) {
    return fail("FORBIDDEN", "A public photo is for leads and heads on the site", 403);
  }
  const avatarUrl = canPhoto ? (body.avatarUrl ?? null) : null;
  const [taken] = await sql`SELECT user_id FROM user_profiles WHERE username = ${username} AND user_id <> ${user.id} LIMIT 1`;
  if (taken) return fail("USERNAME_TAKEN", "That username is taken", 409);
  const [existing] = await sql`
    SELECT username, username_changed_at, username_change_count
    FROM user_profiles WHERE user_id = ${user.id} LIMIT 1
  `;
  let usernameChangedAt = existing?.username_changed_at ?? null;
  let usernameChangeCount = existing?.username_change_count ?? 0;
  if (existing && existing.username !== username) {
    if (usernameChangeCount >= USERNAME_CHANGE_LIMIT) {
      return fail(
        "USERNAME_CHANGE_LIMIT",
        `A username can be changed ${USERNAME_CHANGE_LIMIT} times. This account has reached that limit.`,
        403
      );
    }
    if (usernameChangedAt && Date.now() - new Date(usernameChangedAt).getTime() < USERNAME_COOLDOWN_DAYS * DAY_MS) {
      return fail("USERNAME_COOLDOWN", cooldownMessage(usernameChangedAt), 409);
    }
    usernameChangedAt = new Date().toISOString();
    usernameChangeCount += 1;
  }
  const links = {};
  if (body.github) links.github = `https://github.com/${body.github.replace(/^@/, "")}`;
  if (body.linkedin) links.linkedin = body.linkedin;
  const [card] = await sql`
    INSERT INTO user_profiles (user_id, tenant_id, username, bio, avatar_url, location, social_links, primary_domain, is_public, endorsements_visible, username_changed_at, username_change_count)
    VALUES (${user.id}, ${tenant?.id ?? null}, ${username}, ${body.bio}, ${avatarUrl}, ${body.location || null}, ${sql.json(links)}, ${profile?.primary_domain || null}, ${body.isPublic}, COALESCE(${body.endorsementsVisible ?? null}::boolean, true), ${usernameChangedAt}::timestamptz, ${usernameChangeCount})
    ON CONFLICT (user_id) DO UPDATE SET
      username = EXCLUDED.username, bio = EXCLUDED.bio, avatar_url = EXCLUDED.avatar_url,
      location = EXCLUDED.location, social_links = EXCLUDED.social_links,
      primary_domain = COALESCE(EXCLUDED.primary_domain, user_profiles.primary_domain),
      is_public = EXCLUDED.is_public,
      endorsements_visible = COALESCE(EXCLUDED.endorsements_visible, user_profiles.endorsements_visible),
      username_changed_at = EXCLUDED.username_changed_at,
      username_change_count = EXCLUDED.username_change_count,
      updated_at = now()
    RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "updated_profile_card", resource: "user_profile", resourceId: user.id, after: { username: card.username, is_public: card.is_public } });
  return ok({ card });
}
