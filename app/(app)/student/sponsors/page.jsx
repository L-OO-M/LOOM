import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import { ConnectTabs } from "@/components/student/SectionRails";

export const dynamic = "force-dynamic";

export default async function StudentSponsorsPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/sponsors");
  const { user, tenant, sql } = ctx;

  const sponsors = await sql`
    SELECT name, status
    FROM sponsorships
    WHERE tenant_id = ${tenant?.id ?? null}::uuid
      AND status IN ('committed', 'received')
    ORDER BY CASE status WHEN 'received' THEN 0 ELSE 1 END, name ASC
    LIMIT 100
  `;
  const received = sponsors.filter((s) => s.status === "received").length;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-3xl px-4 pb-14 sm:px-6">
        <WorkspaceMasthead
          kicker="Connect / the people who back the work"
          title="Sponsors and partners."
          lede="Chapters publish sponsors once the commitment is real. Pipeline conversations stay private until they are committed."
          meta={`${sponsors.length} public sponsor${sponsors.length === 1 ? "" : "s"} / ${received} received`}
          tone="paper"
          art="/storyloom/opportunity.png"
          artAlt=""
        />

        <ConnectTabs active="/student/sponsors" />

        <WorkspaceSection index="01" title="Backing this chapter" note="Only committed and received sponsorships appear here.">
          {sponsors.length === 0 ? (
            <WorkspaceEmpty title="No public sponsors yet" body="When a sponsorship is committed, it appears here for students." />
          ) : (
            <ul className="divide-y rounded-2xl border" style={{ borderColor: "var(--line)" }}>
              {sponsors.map((s) => (
                <li key={`${s.name}-${s.status}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{s.name}</span>
                  <span className="mono-tag">{s.status}</span>
                </li>
              ))}
            </ul>
          )}
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
