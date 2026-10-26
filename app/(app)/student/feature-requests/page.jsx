import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead } from "@/components/loom/WorkspaceMasthead";
import FeatureRequestList from "./FeatureRequestList";
import { listFeatureRequests } from "@/lib/feature-requests";
import { DiscoverTabs } from "@/components/student/SectionRails";

export default async function FeatureRequestsPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/feature-requests");
  const { user, tenant, sql, profile } = ctx;
  const tid = tenant?.id ?? null;
  let rows = [];
  try {
    rows = await listFeatureRequests({ sql, tenantId: tid, userId: user.id, isAdmin: profile?.role === "admin" });
  } catch (e) {
    if (e?.code !== "42P01") throw e;
    rows = [];
  }
  // enhance with isOwner flag for UI
  const withOwner = rows.map((r) => ({ ...r, isOwner: r.requester_id === user.id }));
  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <WorkspaceMasthead
          kicker="Community wishlist / ideas into builds"
          title="What should LOOM build next?"
          lede="Ideas live here — you propose, the chapter reviews. Approved ideas can be assigned back to you to build."
          meta={`${withOwner.length} idea${withOwner.length === 1 ? "" : "s"} on the board`}
          tone="field"
          art="/domains-art/domain-creative.png"
          artAlt=""
          stats={[
            { value: withOwner.length, label: "ideas on the board" },
            { value: withOwner.filter((r) => r.status === "approved").length, label: "approved" },
            { value: withOwner.filter((r) => r.status === "built").length, label: "built" },
            { value: withOwner.filter((r) => r.isOwner).length, label: "yours" }
          ]}
        />
        <DiscoverTabs active="/student/feature-requests" />
        <div className="mt-4 flex gap-2">
          <Link href="/student/feature-requests" className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{rows.length} ideas</Link>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>· Use the Suggest feature button →</span>
        </div>
        <div className="mt-6">
          <FeatureRequestList initial={withOwner} />
        </div>
      </main>
    </AppShell>
  );
}
