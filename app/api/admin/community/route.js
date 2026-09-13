import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";

const moderateSchema = z.object({
  targetType: z.enum(["thread", "reply", "snippet"]),
  targetId: z.string().uuid(),
  status: z.enum(["visible", "hidden"])
});

function scoped(ctx) {
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin access required", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  return null;
}

export async function GET() {
  const ctx = await getRequestContext({ adminOnly: true });
  const err = scoped(ctx);
  if (err) return err;
  const { tenant, sql } = ctx;
  const flaggedThreads = await sql`
    SELECT t.id, t.title, t.flag_count, p.name AS author_name FROM forum_threads t
    LEFT JOIN profiles p ON p.user_id = t.author_id
    WHERE t.tenant_id = ${tenant?.id ?? null}::uuid AND t.flag_count > 0 AND t.status = 'visible'
    ORDER BY t.flag_count DESC LIMIT 20
  `;
  const flaggedReplies = await sql`
    SELECT r.id, r.body, r.flag_count, r.thread_id, p.name AS author_name FROM forum_replies r
    JOIN forum_threads t ON t.id = r.thread_id
    LEFT JOIN profiles p ON p.user_id = r.author_id
    WHERE t.tenant_id = ${tenant?.id ?? null}::uuid AND r.flag_count > 0 AND r.status = 'visible'
    ORDER BY r.flag_count DESC LIMIT 20
  `;
  const pendingEdits = await sql`
    SELECT e.*, w.title AS page_title, w.slug, p.name AS requester_name FROM wiki_edit_requests e
    JOIN wiki_pages w ON w.id = e.page_id
    LEFT JOIN profiles p ON p.user_id = e.requester_id
    WHERE w.tenant_id = ${tenant?.id ?? null}::uuid AND e.status = 'pending'
    ORDER BY e.created_at DESC LIMIT 20
  `;
  return ok({ flaggedThreads, flaggedReplies, pendingEdits });
}

export async function PATCH(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  const err = scoped(ctx);
  if (err) return err;
  const { user, tenant, sql } = ctx;
  let body;
  try {
    body = moderateSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  if (body.targetType === "thread") {
    await sql`UPDATE forum_threads SET status = ${body.status} WHERE id = ${body.targetId} AND tenant_id = ${tenant?.id ?? null}::uuid`;
  } else if (body.targetType === "reply") {
    await sql`
      UPDATE forum_replies SET status = ${body.status} WHERE id = ${body.targetId}
        AND thread_id IN (SELECT id FROM forum_threads WHERE tenant_id = ${tenant?.id ?? null}::uuid)
    `;
  } else {
    await sql`UPDATE code_snippets SET status = ${body.status} WHERE id = ${body.targetId} AND (tenant_id IS NULL OR tenant_id = ${tenant?.id ?? null}::uuid)`;
  }
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: `moderated_${body.targetType}_${body.status}`, resource: body.targetType, resourceId: body.targetId });
  return ok({ status: body.status });
}
