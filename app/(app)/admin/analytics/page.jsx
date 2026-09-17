import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { getAnalyticsSummary } from "@/lib/analytics";
import { AppShell } from "@/components/AppShell";
import { AnalyticsDashboard } from "./_components/AnalyticsDashboard";

export const dynamic = "force-dynamic";

// Private workspace — never indexed.
export const metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminAnalyticsPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/analytics");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/analytics");
  const { tenant, user, sql } = ctx;

  // Sequential page queries (pooler rule); the service fans out per tab
  // client-side from this single payload + ?period= refetches.
  let initial = null;
  try {
    initial = await getAnalyticsSummary(sql, tenant?.id ?? null, "monthly");
  } catch {
    initial = null; // Client shows the error state with retry.
  }

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <AnalyticsDashboard
        initial={initial}
        user={{ name: ctx.profile?.name || user?.email?.split("@")[0] || "Admin", role: ctx.profile?.role || "admin" }}
      />
    </AppShell>
  );
}
