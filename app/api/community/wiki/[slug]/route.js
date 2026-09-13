import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";

const editSchema = z.object({
  action: z.enum(["suggest", "review"]),
  title: z.string().min(3).max(160).optional(),
  content: z.string().max(20000).optional(),
  reason: z.string().max(300).default(""),
  editId: z.string().uuid().optional(),
  decision: z.enum(["approved", "rejected"]).optional()
});

export async function GET(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { tenant, sql } = ctx;
  const { slug } = await params;
  const [page] = await sql`
    SELECT w.*, p.name AS author_name FROM wiki_pages w
    LEFT JOIN profiles p ON p.user_id = w.author_id
    WHERE w.tenant_id = ${tenant?.id ?? null}::uuid AND w.slug = ${slug} AND w.status = 'published'
    LIMIT 1
  `;
  if (!page) return fail("NOT_FOUND", "Page not found", 404);
  await sql`UPDATE wiki_pages SET view_count = view_count + 1 WHERE id = ${page.id}`;
  const edits = await sql`
    SELECT e.*, p.name AS requester_name FROM wiki_edit_requests e
    LEFT JOIN profiles p ON p.user_id = e.requester_id
    WHERE e.page_id = ${page.id} ORDER BY e.created_at DESC LIMIT 20
  `;
  return ok({ page, edits });
}

// Students suggest edits (pending); admins apply directly or review the queue.
export async function PATCH(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const { slug } = await params;
  let body;
  try {
    body = editSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [page] = await sql`
    SELECT * FROM wiki_pages WHERE tenant_id = ${tenant?.id ?? null}::uuid AND slug = ${slug} LIMIT 1
  `;
  if (!page) return fail("NOT_FOUND", "Page not found", 404);
  const isAdmin = profile?.role === "admin";

  if (body.action === "review") {
    if (!isAdmin) return fail("FORBIDDEN", "Admin access required", 403);
    if (!body.editId || !body.decision) return fail("VALIDATION_ERROR", "editId and decision are required", 400);
    const [edit] = await sql`SELECT * FROM wiki_edit_requests WHERE id = ${body.editId} AND page_id = ${page.id} AND status = 'pending' LIMIT 1`;
    if (!edit) return fail("NOT_FOUND", "Edit request not found", 404);
    if (body.decision === "approved") {
      await sql`
        UPDATE wiki_pages SET title = COALESCE(${edit.proposed_title || null}, title),
          content = ${edit.proposed_content}, version = version + 1, updated_at = now()
        WHERE id = ${page.id}
      `;
    }
    await sql`UPDATE wiki_edit_requests SET status = ${body.decision} WHERE id = ${body.editId}`;
    await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: `wiki_edit_${body.decision}`, resource: "wiki_page", resourceId: page.id, after: { edit: body.editId } });
    return ok({ decision: body.decision });
  }

  if (!body.content && !body.title) return fail("VALIDATION_ERROR", "Nothing to suggest", 400);
  if (isAdmin) {
    const [updated] = await sql`
      UPDATE wiki_pages SET title = COALESCE(${body.title || null}, title),
        content = COALESCE(${body.content || null}, content), version = version + 1, updated_at = now()
      WHERE id = ${page.id} RETURNING *
    `;
    return ok({ page: updated, applied: true });
  }
  const [edit] = await sql`
    INSERT INTO wiki_edit_requests (page_id, requester_id, proposed_title, proposed_content, reason)
    VALUES (${page.id}, ${user.id}, ${body.title || null}, ${body.content || ""}, ${body.reason})
    RETURNING *
  `;
  return ok({ edit, applied: false }, { status: 201 });
}
