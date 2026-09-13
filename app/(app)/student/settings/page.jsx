import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card } from "@/components/ui";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/settings");
  const { tenant, user, profile, sql } = ctx;
  const [conn] = await sql`SELECT * FROM github_connections WHERE user_id = ${user.id} LIMIT 1`;
  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Account" title="Settings" desc="Profile, college membership, and preferences. Saving completes onboarding." />
        <SettingsClient profile={profile} />
        <div className="mt-4">
          <Card>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Membership</p>
            <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>College: {tenant?.name || "—"} ({tenant?.slug || "—"}) · Role: {profile?.role} · GitHub: {conn?.github_username || profile?.github_username || "not linked"}</p>
            <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>Onboarding: {profile?.onboarding_completed ? "completed" : "pending — save profile to complete"}</p>
            <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>How your data is handled: <Link href="/student/privacy" style={{ color: "var(--accent)" }} className="font-medium">Privacy Center →</Link></p>
          </Card>
        </div>
      </main>
    </AppShell>
  );
}
