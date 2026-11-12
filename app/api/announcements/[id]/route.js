import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { isAdmin } from "@/lib/permissions";
import { createLogger, requestIdFrom } from "@/lib/log";
import { fanOutAnnouncement } from "@/lib/announcement-publish";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const patchSchema = z.object({
  status: z.literal("published")
});

export async function PATCH(request, { params }) {
  const log = createLogger("announcements", { requestId: requestIdFrom(request) });
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const tid = tenant?.id ?? null;
  if (!tid) return fail("TENANT_UNRESOLVED", "Chapter not resolved", 404);
  const { id } = await params;
  if (!UUID.test(id)) return fail("NOT_FOUND", "Announcement not found", 404);

  let body;
  try {
    body = patchSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }

  const [existing] = await sql`
    SELECT * FROM announcements
    WHERE id = ${id}::uuid AND tenant_id = ${tid}::uuid
    LIMIT 1
  `;
  if (!existing) return fail("NOT_FOUND", "Announcement not found", 404);
  if (existing.author_id !== user.id && !isAdmin(profile)) {
    return fail("FORBIDDEN", "Only the author or an admin can publish this draft", 403);
  }
  if (existing.status === "published") return ok({ announcement: existing, alreadyPublished: true });

  const [announcement] = await sql`
    UPDATE announcements
    SET status = ${body.status}, published_at = NOW(), updated_at = NOW(), updated_by = ${user.id}
    WHERE id = ${id}::uuid AND tenant_id = ${tid}::uuid AND status = 'draft'
    RETURNING *
  `;
  if (!announcement) return fail("CONFLICT", "This announcement is no longer a draft", 409);

  try {
    await fanOutAnnouncement({ sql, tenantId: tid, authorId: user.id, announcement });
  } catch (error) {
    log.warn("notification fan-out failed", { announcementId: announcement.id, err: error });
  }

  await writeAudit({
    sql, actorId: user.id, tenantId: tid, action: "posted_announcement",
    resource: "announcement", resourceId: id,
    before: { status: "draft" }, after: { status: "published" }
  });
  return ok({ announcement });
}
