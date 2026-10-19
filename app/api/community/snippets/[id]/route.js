import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { screenSnippet } from "@/lib/community";

// Author-only edit / delete for a published snippet.
//
// The security report flagged that once a snippet was published there was no way
// for its author to edit or remove it -- only a platform admin could hide it.
// These handlers let the author fix a typo or withdraw their own code, scoped to
// their tenant and their own rows. Admins keep the separate moderation path in
// app/api/admin/community/route.js.

const patchSchema = z.object({
  title: z.string().min(3).max(120).optional(),
  code: z.string().min(1).max(8000).optional(),
  language: z.string().min(1).max(30).optional(),
  domain: z.string().min(1).max(40).optional(),
  description: z.string().max(500).optional(),
  tags: z.array(z.string().max(30)).max(5).optional()
});

async function loadOwnedSnippet(sql, id, tid, userId, isAdmin) {
  const [row] = await sql`
    SELECT * FROM code_snippets
    WHERE id = ${id}::uuid AND tenant_id = ${tid}::uuid
    LIMIT 1`;
  if (!row) return { error: fail("NOT_FOUND", "Not found", 404) };
  if (row.author_id !== userId && !isAdmin) return { error: fail("FORBIDDEN", "You can only change your own snippets", 403) };
  return { row };
}

export async function PATCH(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, profile, sql } = ctx;
  const tid = tenant?.id ?? null;
  const { id } = await params;

  let body;
  try { body = patchSchema.parse(await request.json()); } catch (e) { return validationError(e); }

  const owned = await loadOwnedSnippet(sql, id, tid, user.id, profile?.role === "admin");
  if (owned.error) return owned.error;
  const existing = owned.row;

  const next = {
    title: body.title ?? existing.title,
    code: body.code ?? existing.code,
    language: body.language ?? existing.language,
    domain: body.domain ?? existing.domain,
    description: body.description ?? existing.description,
    tags: body.tags ?? existing.tags
  };
  const screened = screenSnippet(next);
  if (!screened.ok) return fail(screened.code, screened.message, 400);

  const [updated] = await sql`
    UPDATE code_snippets SET
      title = ${next.title}, code = ${next.code}, language = ${next.language},
      domain = ${next.domain}, description = ${next.description}, tags = ${next.tags}
    WHERE id = ${id}::uuid AND tenant_id = ${tid}::uuid
    RETURNING *`;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "updated_snippet", resource: "code_snippet", resourceId: id, after: { title: next.title } });
  return ok({ snippet: updated });
}

export async function DELETE(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, profile, sql } = ctx;
  const tid = tenant?.id ?? null;
  const { id } = await params;

  const owned = await loadOwnedSnippet(sql, id, tid, user.id, profile?.role === "admin");
  if (owned.error) return owned.error;

  // Soft delete: status='hidden' is the schema's terminal state, and it keeps the
  // votes/upvote_count row consistent while removing the snippet from every read.
  const [updated] = await sql`
    UPDATE code_snippets SET status = 'hidden'
    WHERE id = ${id}::uuid AND tenant_id = ${tid}::uuid
    RETURNING id`;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "deleted_snippet", resource: "code_snippet", resourceId: id });
  return ok({ deleted: true, id: updated?.id ?? id });
}
