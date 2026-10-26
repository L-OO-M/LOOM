import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { issuesReady } from "@/lib/github-issues";
import AdminFeatureBoard from "./AdminFeatureBoard";
import "../_components/admin-ledger.css";

export default async function AdminFeatureRequestsPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/feature-requests");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  const { tenant, user, sql } = ctx;
  const tid = tenant?.id ?? null;
  let rows = [];
  try {
    rows = await sql`
      SELECT fr.*, p.name AS requester_name FROM feature_requests fr
      LEFT JOIN profiles p ON p.user_id = fr.requester_id
      WHERE fr.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL
      ORDER BY CASE fr.status WHEN 'pending' THEN 1 WHEN 'needs_info' THEN 2 WHEN 'approved' THEN 3 ELSE 4 END, fr.created_at DESC LIMIT 100
    `;
  } catch (e) {
    if (e?.code !== "42P01") throw e;
    rows = [];
  }
  const pending = rows.filter((r) => r.status === "pending").length;
  const approved = rows.filter((r) => r.status === "approved").length;
  const built = rows.filter((r) => r.status === "built").length;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <WorkspaceMasthead
          kicker={`${rows.length} ideas / ${pending} pending`}
          title="Feature requests"
          lede="Review, ask, approve, reject, or assign back to the requester to build. Every decision is audited."
          meta={`${approved} approved / ${built} built / ${issuesReady() ? "GitHub issues connected" : "GitHub issues not configured"}`}
          tone="ledger"
          stats={[
            { value: rows.length, label: "ideas on record" },
            { value: pending, label: "awaiting a decision" },
            { value: approved, label: "approved" },
            { value: built, label: "built" }
          ]}
        />
        <WorkspaceSection index="01" title="Request ledger" note="Ordered by decision state: pending, needs info, approved, then the rest. Newest first within each.">
          <div className="aled-feature-board"><AdminFeatureBoard initial={rows} githubConfigured={issuesReady()} /></div>
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
