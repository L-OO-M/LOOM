import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { signCredential } from "@/lib/credentials";
import { env } from "@/lib/env";

const issueSchema = z.object({
  achievementId: z.string().uuid(),
  expiresInDays: z.number().int().min(0).max(730).default(365)
});

function titleFor(a) {
  if (a.badge_name) return a.badge_name;
  if (a.source_type === "oss") return `Open source · ${a.source_ref}`;
  if (a.source_type === "contest") return `Contest · ${a.source_ref}`;
  if (a.source_type === "roadmap") return `Roadmap · ${a.source_ref}`;
  return "Achievement";
}

export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, sql } = ctx;
  const achievements = await sql`
    SELECT a.*, b.name AS badge_name, b.tier FROM student_achievements a
    LEFT JOIN skill_badges b ON b.id = a.badge_id
    WHERE a.student_id = ${user.id}
    ORDER BY a.earned_at DESC LIMIT 100
  `;
  const credentials = await sql`
    SELECT * FROM verifiable_credentials WHERE student_id = ${user.id}
    ORDER BY issued_at DESC LIMIT 100
  `;
  return ok({ achievements, credentials, appUrl: env.NEXT_PUBLIC_APP_URL });
}

// Issue a signed share link for an achievement the student owns.
export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, profile, sql } = ctx;
  let body;
  try {
    body = issueSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [a] = await sql`
    SELECT a.*, b.name AS badge_name FROM student_achievements a
    LEFT JOIN skill_badges b ON b.id = a.badge_id
    WHERE a.id = ${body.achievementId} AND a.student_id = ${user.id}
    LIMIT 1
  `;
  if (!a) return fail("NOT_FOUND", "Achievement not found", 404);
  const id = `cred_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const issuedAt = new Date().toISOString();
  const signature = signCredential({ id, studentId: user.id, type: "badge", issuedAt });
  const expiresAt = body.expiresInDays > 0
    ? new Date(Date.now() + body.expiresInDays * 86400000).toISOString()
    : null;
  const [cred] = await sql`
    INSERT INTO verifiable_credentials
      (id, student_id, tenant_id, achievement_id, credential_type, title, metadata, issued_at, expires_at, signature)
    VALUES (${id}, ${user.id}, ${tenant?.id ?? null}, ${a.id}, 'badge', ${titleFor(a)},
      ${sql.json({ holder: profile?.name || null, level: a.level, evidence_url: a.evidence_url })},
      ${issuedAt}, ${expiresAt}, ${signature})
    RETURNING *
  `;
  return ok({ credential: cred, url: `${env.NEXT_PUBLIC_APP_URL}/verify/credential/${id}` }, { status: 201 });
}
