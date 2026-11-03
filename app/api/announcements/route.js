import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { can, isAdmin } from "@/lib/permissions";
import { createLogger, requestIdFrom } from "@/lib/log";
import { announcementKeyPrefix } from "@/lib/announcement-fanout";

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
  const tid = tenant?.id ?? null;
  if (!tid) return fail("TENANT_UNRESOLVED", "Chapter not resolved", 404);
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
    WHERE a.tenant_id = ${tid}::uuid
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
  const log = createLogger("announcements", { requestId: requestIdFrom(request) });
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const tid = tenant?.id ?? null;
  if (!tid) return fail("TENANT_UNRESOLVED", "Chapter not resolved", 404);
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
    const [dept] = await sql`
      SELECT id, vertical FROM departments
      WHERE id = ${body.departmentId}
        AND tenant_id = ${tid}::uuid
      LIMIT 1
    `;
    if (!dept) return fail("NOT_FOUND", "Department not found", 404);
    const verdict = can(me, "post_announcement", { departmentId: body.departmentId, vertical: dept.vertical });
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
    VALUES (${tid}, ${body.scope}, ${departmentId}, ${vertical}, ${body.title}, ${body.body}, ${user.id})
    RETURNING *
  `;

  // Fan-out into per-user notifications (existing inbox, no new surface).
  //
  // Safe to retry: every row carries a deterministic dedupe key matching
  // lib/announcement-fanout.js, and the partial unique index on
  // (user_id, dedupe_key) makes a re-run insert nothing. Delivery failures are
  // logged, never thrown — the announcement is already committed.
  try {
    const link = "/student/notifications";
    const title = body.scope === "society" ? `Announcement: ${body.title}` : `[${body.scope}] ${body.title}`;
    // One prefix per post; the recipient id is appended in SQL so the fan-out
    // stays a single statement. Format owned by lib/announcement-fanout.js.
    const dedupePrefix = announcementKeyPrefix(announcement.id);
    if (body.scope === "society") {
      await sql`
        INSERT INTO notifications (tenant_id, user_id, type, title, body, link, dedupe_key)
        SELECT ${tid}, p.user_id, 'announcement', ${title}, ${body.body.slice(0, 280)}, ${link},
          ${dedupePrefix} || p.user_id::text
        FROM profiles p WHERE p.tenant_id = ${tid}::uuid AND p.user_id <> ${user.id}
        ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`;
    } else if (body.scope === "vertical") {
      await sql`
        INSERT INTO notifications (tenant_id, user_id, type, title, body, link, dedupe_key)
        SELECT DISTINCT ${tid}, m.user_id, 'announcement', ${title}, ${body.body.slice(0, 280)}, ${link},
          ${dedupePrefix} || m.user_id::text
        FROM department_memberships m JOIN departments d ON d.id = m.department_id
        WHERE d.tenant_id = ${tid}::uuid AND d.vertical = ${vertical} AND m.user_id <> ${user.id}
        ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`;
    } else {
      await sql`
        INSERT INTO notifications (tenant_id, user_id, type, title, body, link, dedupe_key)
        SELECT ${tid}, m.user_id, 'announcement', ${title}, ${body.body.slice(0, 280)}, ${link},
          ${dedupePrefix} || m.user_id::text
        FROM department_memberships m WHERE m.department_id = ${departmentId} AND m.user_id <> ${user.id}
        ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`;
    }
  } catch (error) {
    log.warn("notification fan-out failed", {
      announcementId: announcement.id,
      scope: body.scope,
      err: error
    });
  }

  await writeAudit({ sql, actorId: user.id, tenantId: tid, action: "posted_announcement", resource: "announcement", resourceId: announcement.id, after: { scope: body.scope, title: body.title } });
  return ok({ announcement }, { status: 201 });
}
