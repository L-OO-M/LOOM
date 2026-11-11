import { announcementKeyPrefix } from "@/lib/announcement-fanout";

/**
 * Deliver one published announcement into the existing notifications inbox.
 *
 * Set-based on purpose: three INSERT ... SELECT statements, no per-user loop.
 * The dedupe key makes a retry (or a second publish request) a no-op. Callers
 * catch failures because the announcement row is already committed.
 */
export async function fanOutAnnouncement({ sql, tenantId, authorId, announcement }) {
  const link = "/student/notifications";
  const title = announcement.scope === "society"
    ? `Announcement: ${announcement.title}`
    : `[${announcement.scope}] ${announcement.title}`;
  const dedupePrefix = announcementKeyPrefix(announcement.id);
  const body = String(announcement.body || "").slice(0, 280);

  if (announcement.scope === "society") {
    await sql`
      INSERT INTO notifications (tenant_id, user_id, type, title, body, link, dedupe_key)
      SELECT ${tenantId}, p.user_id, 'announcement', ${title}, ${body}, ${link},
        ${dedupePrefix} || p.user_id::text
      FROM profiles p WHERE p.tenant_id = ${tenantId}::uuid AND p.user_id <> ${authorId}
      ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`;
    return;
  }
  if (announcement.scope === "vertical") {
    await sql`
      INSERT INTO notifications (tenant_id, user_id, type, title, body, link, dedupe_key)
      SELECT DISTINCT ${tenantId}, m.user_id, 'announcement', ${title}, ${body}, ${link},
        ${dedupePrefix} || m.user_id::text
      FROM department_memberships m JOIN departments d ON d.id = m.department_id
      WHERE d.tenant_id = ${tenantId}::uuid AND d.vertical = ${announcement.vertical}
        AND m.user_id <> ${authorId}
      ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`;
    return;
  }
  await sql`
    INSERT INTO notifications (tenant_id, user_id, type, title, body, link, dedupe_key)
    SELECT ${tenantId}, m.user_id, 'announcement', ${title}, ${body}, ${link},
      ${dedupePrefix} || m.user_id::text
    FROM department_memberships m
    WHERE m.department_id = ${announcement.department_id} AND m.user_id <> ${authorId}
    ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`;
}
