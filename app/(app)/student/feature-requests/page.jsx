import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta } from "@/components/loom/primitives";
import FeatureRequestList from "./FeatureRequestList";

export default async function FeatureRequestsPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/feature-requests");
  const { user, tenant, sql } = ctx;
  const tid = tenant?.id ?? null;
  let rows = [];
  try {
    rows = await sql`SELECT fr.*, p.name AS requester_name FROM feature_requests fr LEFT JOIN profiles p ON p.user_id = fr.requester_id WHERE fr.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL ORDER BY fr.created_at DESC LIMIT 100`;
  } catch (e) {
    if (e?.code !== "42P01") throw e;
    rows = [];
  }
  // enhance with isOwner flag for UI
  const withOwner = rows.map((r) => ({ ...r, isOwner: r.requester_id === user.id }));
  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <Meta>Community wishlist</Meta>
        <Display size="lg" className="mt-3">What should L.O.O.M. build next?</Display>
        <p className="narrative mt-3">Ideas live here — you propose, the chapter reviews. Approved ideas can be assigned back to you to build.</p>
        <div className="mt-4 flex gap-2">
          <Link href="/student/feature-requests" className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{rows.length} ideas</Link>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>· Use the 💡 Suggest feature button →</span>
        </div>
        <div className="mt-6">
          <FeatureRequestList initial={withOwner} />
        </div>
      </main>
    </AppShell>
  );
}
