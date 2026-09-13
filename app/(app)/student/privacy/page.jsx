import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card } from "@/components/ui";

const points = [
  { title: "College-scoped data", body: "Your profile, progress, projects, and activity belong to your college workspace. The server derives your college from your profile — the app never asks your browser which college to read." },
  { title: "What we store", body: "Profile fields you enter, roadmap and resource progress, projects you create, contest registrations, mentorship requests, GitHub usernames you link, and webhook events GitHub sends about your repositories." },
  { title: "What we never store", body: "Passwords (handled by Supabase Auth), GitHub tokens (OAuth is not enabled; only your public username is linked), and secrets. Audit logs record actions and resource ids — never request bodies or tokens." },
  { title: "Who can see what", body: "Students see their own data plus college leaderboards and public college content. Admins of your college can view student progress for mentoring and operations. No cross-college access." },
  { title: "Your controls", body: "Edit or correct your profile anytime in Settings. Unlink GitHub from the GitHub page. Sign out ends your session on that device. For full deletion, ask your college admin — removal is manual and audited." }
];

export default async function PrivacyPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/privacy");
  const { tenant, user } = ctx;
  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}><Link href="/student/settings" style={{ color: "var(--accent)" }}>← Settings</Link></p>
        <PageHeader kicker="Trust" title="Privacy Center" desc="Plain-language answers about your data. No legal fog, no hidden tracking." />
        <div className="space-y-3">
          {points.map((p, i) => (
            <Card key={p.title}>
              <p className="font-mono text-xs" style={{ color: "var(--accent)" }}>0{i + 1}</p>
              <p className="mt-2 text-sm font-medium" style={{ color: "var(--text)" }}>{p.title}</p>
              <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{p.body}</p>
            </Card>
          ))}
        </div>
        <div className="mt-4">
          <Card>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Questions?</p>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
              Contact your college admin. Technical detail: sessions are Supabase Auth cookies, data lives in Supabase Postgres, and every admin change writes an audit log you can ask to review.
            </p>
          </Card>
        </div>
      </main>
    </AppShell>
  );
}
