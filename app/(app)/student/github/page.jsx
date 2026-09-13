import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card } from "@/components/ui";
import { GithubConnectForm } from "@/components/actions";
import ExportGithubButton from "./ExportButton";

export default async function GithubPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/github");
  const { user, tenant, sql } = ctx;
  const [conn] = await sql`SELECT * FROM github_connections WHERE user_id = ${user.id} LIMIT 1`;
  const repos = await sql`SELECT * FROM repositories WHERE student_id = ${user.id} ORDER BY connected_at DESC LIMIT 20`;
  const activity = await sql`SELECT * FROM student_daily_activity WHERE student_id = ${user.id} ORDER BY day DESC LIMIT 14`;
  const total = activity.reduce((s, a) => s + (a.commits || 0), 0);

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Developer activity" title="GitHub" desc={conn ? `Linked as ${conn.github_username}. Webhook ingestion is live; OAuth install is not configured yet.` : "Link your GitHub username. Webhook ingestion is live; OAuth install is not configured yet."} />
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Connection</p>
            {conn ? (
              <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Linked as <span className="font-mono" style={{ color: "var(--text)" }}>{conn.github_username}</span> since {new Date(conn.connected_at).toLocaleDateString("en-IN")}. Re-link below to change.</p>
            ) : (
              <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Not linked. Save your username so webhook events can be attributed to you.</p>
            )}
            <GithubConnectForm />
          </Card>
          <Card>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>14-day commits</p>
            <p className="mt-2 font-mono text-3xl font-semibold" style={{ color: "var(--text)" }}>{total}</p>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{repos.length} repositories tracked</p>
            <div className="mt-3">
              <ExportGithubButton data={{ username: conn?.github_username || null, exportedAt: new Date().toISOString(), repos: repos.map((r) => r.full_name), activity }} />
            </div>
          </Card>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Repositories</p>
            <div className="mt-3 space-y-2">
              {repos.map((r) => <p key={r.id} className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>{r.full_name}</p>)}
              {repos.length === 0 && <p className="text-sm" style={{ color: "var(--text-muted)" }}>No repositories yet. They appear here when webhook events arrive for your repos.</p>}
            </div>
          </Card>
          <Card>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Daily activity</p>
            <div className="mt-3 space-y-1.5">
              {activity.map((a) => (
                <div key={a.day} className="flex items-center justify-between text-xs" style={{ color: "var(--text-muted)" }}>
                  <span className="font-mono">{new Date(a.day).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</span>
                  <span>{a.commits} commits · {a.pull_requests} PRs · {a.reviews} reviews</span>
                </div>
              ))}
              {activity.length === 0 && <p className="text-sm" style={{ color: "var(--text-muted)" }}>No activity in the last 14 days.</p>}
            </div>
          </Card>
        </div>
      </main>
    </AppShell>
  );
}
