import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { isPrimaryDomain } from "@/lib/domains";

const schema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().regex(/^[a-z0-9-]{1,80}$/),
  title: z.string().min(1).max(160),
  domain: z.string().refine(isPrimaryDomain, "Choose a LOOM primary domain."),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  repoPath: z.string().regex(/^domains\/[a-z0-9-]+\/[a-z0-9-]+$/),
  brief: z.string().max(5000).default(""),
  verification: z.string().max(5000).default(""),
  isPublished: z.boolean().default(false)
});

export async function POST(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin access required", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);

  let body;
  try {
    body = schema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }

  try {
    const result = await sql.begin(async (tx) => {
      let existing = null;
      if (body.id) {
        [existing] = await tx`
          SELECT *
          FROM debug_challenges
          WHERE id = ${body.id}::uuid AND tenant_id = ${tenant.id}::uuid
          FOR UPDATE
        `;
        if (!existing) return { missing: true };
      }

      const [challenge] = await tx`
        INSERT INTO debug_challenges
          (id, tenant_id, slug, title, domain, difficulty, repo_path, brief, verification,
           is_published, published_at, created_by, updated_at)
        VALUES (
          COALESCE(${body.id ?? null}::uuid, gen_random_uuid()),
          ${tenant.id}::uuid,
          ${body.slug},
          ${body.title.trim()},
          ${body.domain},
          ${body.difficulty},
          ${body.repoPath},
          ${body.brief.trim()},
          ${body.verification.trim()},
          ${body.isPublished},
          ${body.isPublished ? new Date() : null},
          ${user.id},
          NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          slug = EXCLUDED.slug,
          title = EXCLUDED.title,
          domain = EXCLUDED.domain,
          difficulty = EXCLUDED.difficulty,
          repo_path = EXCLUDED.repo_path,
          brief = EXCLUDED.brief,
          verification = EXCLUDED.verification,
          is_published = EXCLUDED.is_published,
          published_at = CASE
            WHEN EXCLUDED.is_published AND debug_challenges.published_at IS NULL THEN NOW()
            ELSE debug_challenges.published_at
          END,
          updated_at = NOW()
        RETURNING *
      `;

      await writeAudit({
        sql: tx,
        actorId: user.id,
        tenantId: tenant.id,
        action: existing ? "updated_debug_challenge" : "created_debug_challenge",
        resource: "debug_challenge",
        resourceId: challenge.id,
        before: existing
          ? { slug: existing.slug, title: existing.title, isPublished: existing.is_published }
          : null,
        after: {
          slug: challenge.slug,
          title: challenge.title,
          domain: challenge.domain,
          isPublished: challenge.is_published
        }
      });
      return { challenge };
    });

    if (result.missing) return fail("NOT_FOUND", "Debug challenge not found", 404);
    return ok({
      id: result.challenge.id,
      slug: result.challenge.slug,
      title: result.challenge.title,
      isPublished: result.challenge.is_published
    });
  } catch (error) {
    if (error?.code === "23505") {
      return fail("CHALLENGE_EXISTS", "A challenge with that slug already exists.", 409);
    }
    throw error;
  }
}
