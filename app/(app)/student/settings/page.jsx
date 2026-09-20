import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta } from "@/components/loom/primitives";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/settings");
  const { tenant, user, profile, sql } = ctx;
  const [conn] = await sql`SELECT * FROM github_connections WHERE user_id = ${user.id} LIMIT 1`;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-3xl px-4 sm:px-6">
        <Meta>Account · profile, membership, sign-out</Meta>
        <Display size="lg" className="mt-3">Settings.</Display>

        <section className="mt-8" aria-label="Profile">
          <SettingsClient profile={profile} />
        </section>

        <section className="mt-10" aria-label="Membership">
          <Meta>Membership</Meta>
          <dl className="mt-4">
            {[
              ["College", `${tenant?.name || "—"} (${tenant?.slug || "—"})`],
              ["Role", profile?.role || "student"],
              ["GitHub", conn?.github_username || profile?.github_username || "not linked"],
              ["Onboarding", profile?.onboarding_completed ? "completed" : "pending — save your profile to complete"]
            ].map(([k, v]) => (
              <div key={k} className="flex flex-wrap items-baseline justify-between gap-2 border-b py-3.5 first:border-t" style={{ borderColor: "var(--line)" }}>
                <dt className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>{k}</dt>
                <dd className="font-mono text-sm" style={{ color: "var(--text)" }}>{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="privacy" className="mt-10 scroll-mt-20" aria-label="Privacy control center">
          <Meta>Privacy — you control what becomes visible</Meta>
          <dl className="mt-4">
            {[
              ["Public profile card", "Manage in Community →", "/student/community"],
              ["GitHub linkage", "Manage on GitHub →", "/student/github"],
              ["Standings", "See standings →", "/student/leaderboard"],
              ["College visibility", "Membership above", "#membership"]
            ].map(([k, v, href]) => (
              <div key={k} className="flex flex-wrap items-baseline justify-between gap-2 border-b py-3.5 first:border-t" style={{ borderColor: "var(--line)" }}>
                <dt className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>{k}</dt>
                <dd><Link href={href} className="text-sm font-semibold hover:underline" style={{ color: "var(--accent)" }}>{v}</Link></dd>
              </div>
            ))}
          </dl>
          <p className="narrative mt-3">Only public usernames are stored — never tokens. Audit logs record ids, never bodies. Full deletion is manual and audited — ask your admin.</p>
        </section>

        <section className="mt-10" aria-label="Trust and session">
          <Meta>Trust & session</Meta>
          <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3">
            <Link href="/student/notifications" className="text-sm font-semibold hover:underline" style={{ color: "var(--accent)" }}>
              Notification history →
            </Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-sm font-semibold hover:underline" style={{ color: "var(--danger)" }}>
                Sign out
              </button>
            </form>
          </div>
          <p className="narrative mt-5">Sessions are Supabase Auth cookies. Signing out ends the session on this device.</p>
        </section>
      </main>
    </AppShell>
  );
}
