import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { AnnouncementComposer } from "@/components/lead/AnnouncementComposer";

export const dynamic = "force-dynamic";

export default async function AdminAnnouncementsPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/announcements");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/announcements");
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) redirect("/admin");

  const departments = await sql`
    SELECT id, name, vertical FROM departments
    WHERE tenant_id = ${tenant.id}::uuid
    ORDER BY name
  `;
  const announcements = await sql`
    SELECT a.*, d.name AS department_name, p.name AS author_name
    FROM announcements a
    LEFT JOIN departments d ON d.id = a.department_id
    LEFT JOIN profiles p ON p.user_id = a.author_id
    WHERE a.tenant_id = ${tenant.id}::uuid
    ORDER BY a.created_at DESC
    LIMIT 50
  `;
  const draftCount = announcements.filter((a) => a.status === "draft").length;
  const publishedCount = announcements.filter((a) => a.status === "published").length;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="animate-in mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <WorkspaceMasthead
          kicker={`Chapter / ${publishedCount} published / ${draftCount} draft${draftCount === 1 ? "" : "s"}`}
          title="Announcements."
          lede="The chapter's one composer. Publish to every student or a single department; drafts stay out of student feeds until sent."
          meta={`${departments.length} departments / chapter-wide posting enabled`}
          tone="ledger"
          art="/storyloom/opportunity.png"
          artAlt=""
          stats={[
            { value: announcements.length, label: "in this chapter" },
            { value: draftCount, label: "drafts" },
            { value: publishedCount, label: "published" },
            { value: departments.length, label: "audiences" }
          ]}
        />
        <WorkspaceSection index="01" title="Composer" note="Preview before publishing. Drafts are only visible to leads and admins.">
          <AnnouncementComposer departments={departments} canChapter initialAnnouncements={announcements} />
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
