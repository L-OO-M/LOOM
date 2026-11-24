import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { can } from "@/lib/permissions";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead } from "@/components/loom/WorkspaceMasthead";
import { UsageReport } from "@/components/usage/UsageReport";
import { loadUsageReport } from "@/lib/usage-report";
import { formatCount } from "@/lib/usage";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Usage"
};

/**
 * Lead-facing usage report.
 *
 * Deliberately identical numbers to the admin page, because the data has no
 * department attribution to filter by: telemetry stores a route, a workspace
 * and a session, never which department a reader belongs to. Splitting it by
 * vertical would mean inventing an attribution the schema does not have, so
 * this page says so instead of faking a scope.
 *
 * Gated by `view_usage` (Head and above; Core sees it read-only).
 */
export default async function LeadAnalyticsPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/lead/analytics");
  const { user, profile, tenant, sql } = ctx;

  const subject = {
    id: user.id,
    tenantId: tenant.id,
    role: profile.role,
    vertical: profile.vertical || null,
    memberships: profile.memberships || [],
    scopedGrants: profile.scopedGrants || [],
    roleTermEnd: profile.roleTermEnd ?? profile.role_term_end ?? null,
    isPlatformAdmin: !!profile.isPlatformAdmin
  };
  const permission = can(subject, "view_usage");
  if (!permission.ok) redirect("/student");

  const usage = await loadUsageReport(sql, { tenantId: tenant.id });
  const totals = usage.routes.totals;

  return (
    <AppShell area="lead" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <WorkspaceMasthead
          kicker={`Usage / last ${usage.windowDays} days / rolled up nightly`}
          title="Where the chapter actually goes"
          lede="Page views and tour behaviour, aggregated from first-party telemetry. No names: the tables carry no per-member usage record, so nothing here can be turned into a ranking of people."
          meta={permission.note === "view_only" ? "Read-only seat / your role can read this but not act on it" : "Head and above / read-only report"}
          tone="ledger"
          stats={[
            { value: formatCount(totals.views), label: "page views" },
            { value: `${totals.signedInShare}%`, label: "signed in" },
            { value: formatCount(totals.routes), label: "routes seen" },
            { value: usage.tours[0] ? `${usage.tours[0].completionRate}%` : "n/a", label: "tour completion" }
          ]}
        />
        <UsageReport report={usage} index="01" />
      </main>
    </AppShell>
  );
}
