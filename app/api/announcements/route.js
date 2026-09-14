import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { can, isAdmin } from "@/lib/permissions";

const postSchema = z.object({
  scope: z.enum(["society", "vertical", "department"]),
  departmentId: z.string().uuid().nullable().optional(),
  vertical: z.enum(["technical", "non_technical"]).nullable().optional(),
  title: z.string().min(3).max(160),
  body: z.string().max(4000).default("")
});

// Scoped feed: society-wide + my verticals + my departments. Visibility is
// derived from memberships, never from client claims.
export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { profile, tenant, sql } = ctx;
  const myDeptIds = (profile.memberships || []).map((m) => m.department_id);
  const myVerticals = [...new Set([
    ...(profile.vertical ? [profile.vertical] : []),
    ...(profile.memberships || []).map((m) => m.vertical).filter(Boolean)
  ])];
  const rows = await sql`
    SELECT a.*, d.name AS department_name, d.slug AS department_slug,
      p.name AS author_name
    FROM announcements a
    LEFT JOIN departments d ON d.id = a.department_id
    LEFT JOIN profiles p ON p.user_id = a.author_id
    WHERE (a.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
      AND (
        a.scope = 'society'
        OR (a.scope = 'vertical' AND a.vertical = ANY(${myVerticals}))
        OR (a.scope = 'department' AND a.department_id = ANY(${myDeptIds}))
      )
    ORDER BY a.created_at DESC
    LIMIT 50
  `;
  return ok({ announcements: rows });
}

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  let body;
  try {
    body = postSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const me = { id: user.id, role: profile.role, vertical: profile.vertical, memberships: profile.memberships || [] };

  let departmentId = null;
  let vertical = null;
  if (body.scope === "department") {
    if (!body.departmentId) return fail("VALIDATION_ERROR", "departmentId is required for department announcements", 400);
    const verdict = can(me, "post_announcement", { departmentId: body.departmentId });
    if (!verdict.ok) return fail("FORBIDDEN", "Only the department's Head, Co-Head, or above can post here", 403);
    // own_feed note: a dept_lead may only speak to feeds they lead.
    if (verdict.note === "own_feed" && me.memberships.find((m) => m.department_id === body.departmentId)?.level !== "dept_lead") {
      return fail("FORBIDDEN", "You can only post to departments you lead", 403);
    }
    departmentId = body.departmentId;
  } else if (body.scope === "vertical") {
    vertical = body.vertical || me.vertical;
    if (!vertical) return fail("VALIDATION_ERROR", "vertical is required for vertical announcements", 400);
    if (!isAdmin(me) && me.vertical !== vertical) {
      return fail("FORBIDDEN", "You can only post to your own vertical", 403);
    }
    const verdict = can(me, "post_announcement", { vertical });
    if (!verdict.ok) return fail("FORBIDDEN", "Insufficient permission for vertical announcements", 403);
  } else {
    const verdict = can(me, "post_announcement", {});
    if (!verdict.ok || verdict.note) return fail("FORBIDDEN", "Only Vertical Leads and Super Admins post society-wide", 403);
  }

  const [announcement] = await sql`
    INSERT INTO announcements (tenant_id, scope, department_id, vertical, title, body, author_id)
    VALUES (${tenant?.id ?? null}, ${body.scope}, ${departmentId}, ${vertical}, ${body.title}, ${body.body}, ${user.id})
    RETURNING *
  `;

  // Fan-out into per-user notifications (existing inbox, no new surface).
  try {
    const link = "/student/notifications";
    const title = body.scope === "society" ? `Announcement: ${body.title}` : `[${body.scope}] ${body.title}`;
    if (body.scope === "society") {
      await sql`
        INSERT INTO notifications (tenant_id, user_id, type, title, body, link)
        SELECT ${tenant?.id ?? null}, p.user_id, 'announcement', ${title}, ${body.body.slice(0, 280)}, ${link}
        FROM profiles p WHERE p.tenant_id = ${tenant?.id ?? null}::uuid AND p.user_id <> ${user.id}`;
    } else if (body.scope === "vertical") {
      await sql`
        INSERT INTO notifications (tenant_id, user_id, type, title, body, link)
        SELECT DISTINCT ${tenant?.id ?? null}, m.user_id, 'announcement', ${title}, ${body.body.slice(0, 280)}, ${link}
        FROM department_memberships m JOIN departments d ON d.id = m.department_id
        WHERE d.tenant_id = ${tenant?.id ?? null}::uuid AND d.vertical = ${vertical} AND m.user_id <> ${user.id}`;
    } else {
      await sql`
        INSERT INTO notifications (tenant_id, user_id, type, title, body, link)
        SELECT ${tenant?.id ?? null}, m.user_id, 'announcement', ${title}, ${body.body.slice(0, 280)}, ${link}
        FROM department_memberships m WHERE m.department_id = ${departmentId} AND m.user_id <> ${user.id}`;
    }
  } catch { /* delivery must never break posting */ }

  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "posted_announcement", resource: "announcement", resourceId: announcement.id, after: { scope: body.scope, title: body.title } });
  return ok({ announcement }, { status: 201 });
}
