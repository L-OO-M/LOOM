import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { can, isAdmin } from "@/lib/permissions";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { AnnouncementComposer } from "@/components/lead/AnnouncementComposer";

export const dynamic = "force-dynamic";

const LEAD_ROLES = ["dept_lead", "vertical_lead", "admin"];

export default async function Page() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect(`/login?redirect=${encodeURIComponent("/lead/announcements")}`);
  const { user, profile, tenant, sql } = ctx;
  if (!LEAD_ROLES.includes(profile.role) && !isAdmin(profile)) redirect("/student");

  const me = { id: user.id, role: profile.role, vertical: profile.vertical, memberships: profile.memberships || [] };
  const canChapter = can(me, "post_announcement", {}).ok && !can(me, "post_announcement", {}).note;
  const myDeptIds = (profile.memberships || []).map((m) => m.department_id);
  const myVerticals = [...new Set([
    ...(profile.vertical ? [profile.vertical] : []),
    ...(profile.memberships || []).map((m) => m.vertical).filter(Boolean)
  ])];

  const departments = isAdmin(profile)
    ? await sql`SELECT id, name, vertical FROM departments WHERE tenant_id = ${tenant.id}::uuid ORDER BY name`
    : await sql`
        SELECT DISTINCT d.id, d.name, d.vertical
        FROM departments d
        JOIN department_memberships m ON m.department_id = d.id
        WHERE d.tenant_id = ${tenant.id}::uuid AND m.user_id = ${user.id} AND m.level = 'dept_lead'
        ORDER BY d.name
      `;
  const announcements = await sql`
    SELECT a.*, d.name AS department_name, p.name AS author_name
    FROM announcements a
    LEFT JOIN departments d ON d.id = a.department_id
    LEFT JOIN profiles p ON p.user_id = a.author_id
    WHERE a.tenant_id = ${tenant.id}::uuid
      AND (
        ${isAdmin(profile)}::boolean = true
        OR a.scope = 'society'
        OR (a.scope = 'vertical' AND a.vertical = ANY(${myVerticals}))
        OR (a.scope = 'department' AND a.department_id = ANY(${myDeptIds}))
      )
    ORDER BY a.created_at DESC
    LIMIT 50
  `;
  const draftCount = announcements.filter((a) => a.status === "draft").length;
  const publishedCount = announcements.filter((a) => a.status === "published").length;

  return (
    <AppShell area="lead" tenant={tenant} user={user}>
      <main className="animate-in mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <WorkspaceMasthead
          kicker={`Chapter / ${publishedCount} published / ${draftCount} draft${draftCount === 1 ? "" : "s"}`}
          title="Announcements."
          lede="Write once, preview it as a student will read it, then publish to a department or the whole chapter. Drafts stay private until you send them."
          meta={`${departments.length} department${departments.length === 1 ? "" : "s"} in your scope / ${canChapter ? "chapter-wide posting enabled" : "department posting only"}`}
          tone="ledger"
          art="/storyloom/opportunity.png"
          artAlt=""
          stats={[
            { value: announcements.length, label: "in your scope" },
            { value: draftCount, label: "drafts" },
            { value: publishedCount, label: "published" },
            { value: departments.length, label: "audiences" }
          ]}
        />
        <WorkspaceSection index="01" title="Composer" note="Preview before publishing. Drafts are only visible to leads and admins.">
          <AnnouncementComposer departments={departments} canChapter={canChapter} initialAnnouncements={announcements} />
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
