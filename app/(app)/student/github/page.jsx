import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { GithubConnectForm } from "@/components/actions";
import { Display, Meta, PlainStat, ActionLink } from "@/components/loom/primitives";
import { Heatmap } from "@/components/loom/Heatmap";
import { Evidence, ActivityStream } from "@/components/loom/Evidence";
import { DataTable } from "@/components/loom/DataTable";
import { OnboardingState } from "@/components/loom/States";
import ExportGithubButton from "./ExportButton";

export default async function GithubPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/github");
  const { user, tenant, sql } = ctx;
  const [conn] = await sql`SELECT * FROM github_connections WHERE user_id = ${user.id} LIMIT 1`;
  const repos = await sql`SELECT * FROM repositories WHERE student_id = ${user.id} ORDER BY connected_at DESC LIMIT 20`;
  const activity = await sql`SELECT day, commits, pull_requests, reviews FROM student_daily_activity WHERE student_id = ${user.id} ORDER BY day DESC LIMIT 120`;
  const total = activity.reduce((s, a) => s + (a.commits || 0), 0);
  const prs = activity.reduce((s, a) => s + (a.pull_requests || 0), 0);
  const streak = currentStreak(activity);

  const recentEvents = conn ? await sql`
    SELECT event_name, repository_id, actor_login, received_at, payload FROM github_events
    WHERE actor_login = ${conn.github_username}
    ORDER BY received_at DESC LIMIT 12
  ` : [];
  const repoIds = [...new Set(recentEvents.map((e) => e.repository_id).filter(Boolean))];
  const repoNames = {};
  if (repoIds.length > 0) {
    const found = await sql`SELECT id, full_name FROM repositories WHERE id = ANY(${repoIds})`;
    for (const r of found) repoNames[r.id] = r.full_name;
  }
  // Per-repo pulse: recent event counts for the timeline dots.
  const pulse = {};
  for (const e of recentEvents) {
    if (!e.repository_id) continue;
    pulse[e.repository_id] ??= 0;
    pulse[e.repository_id] += 1;
  }

  const verified = await sql`
    SELECT repo_url, pr_url, pr_number, title, contribution_type, status, merged_at, verified_at, created_at
    FROM student_oss_contributions WHERE student_id = ${user.id}
    ORDER BY created_at DESC LIMIT 4
  `;

  if (!conn) {
    return (
      <AppShell area="student" tenant={tenant} user={user}>
        <main className="mx-auto max-w-4xl px-4 sm:px-6">
          <OnboardingState
            eyebrow="GitHub · proof of building"
            title="Your work, becoming visible."
            why="Link your GitHub username and every push, pull request, and review flows in through webhooks — attributed to you, rolled into your growth story, and eligible as open-source evidence."
            steps={[
              { title: "Save your username", body: "Webhook events are matched to you by exact login." },
              { title: "Push like normal", body: "No plugins, no extra steps. Activity lands here on its own." },
              { title: "Claim open-source PRs", body: "Merged work becomes verified evidence with badges attached." }
            ]}
            action={
              <div className="mx-auto max-w-sm rounded-2xl border p-5 text-left" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <GithubConnectForm />
              </div>
            }
          />
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <Meta>GitHub · linked as <span className="font-mono normal-case tracking-normal">{conn.github_username}</span></Meta>
        <Display size="lg" className="mt-3">Proof of building.</Display>

        <section className="mt-8 grid gap-10 lg:grid-cols-[1fr_300px]" aria-label="Activity">
          <div>
            <Heatmap rows={activity} weeks={16} />
          </div>
          <div className="space-y-7">
            <PlainStat value={total} unit="commits" label="recorded in the last 120 days" />
            <PlainStat value={prs} unit="pull requests" label="opened in the same window" />
            <PlainStat value={streak} unit={streak === 1 ? "day" : "days"} label="current contribution streak" />
          </div>
        </section>

        <section className="mt-12" aria-label="Repositories">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="h-product">Repository explorer</h2>
            <span className="meta">{repos.length} tracked</span>
          </div>
          <div className="mt-4 border-y" style={{ borderColor: "var(--line)" }}>
            <DataTable
              caption="Tracked repositories with recent activity"
              empty="No repositories yet. They appear here when webhook events arrive for your repos."
              columns={[
                { key: "full_name", label: "Repository", mono: true, render: (r) => <span className="font-medium" style={{ color: "var(--text)" }}>{r.full_name}</span> },
                {
                  key: "pulse", label: "Recent pulse", render: (r) => (
                    <span className="flex gap-1" aria-hidden="true">
                      {Array.from({ length: Math.min(6, pulse[r.id] || 0) }).map((_, i) => (
                        <span key={i} className="size-1.5 rounded-full" style={{ background: "var(--accent)" }} />
                      ))}
                      {(pulse[r.id] || 0) === 0 && <span className="meta">quiet</span>}
                    </span>
                  )
                },
                { key: "connected_at", label: "Tracked since", render: (r) => new Date(r.connected_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }) }
              ]}
              rows={repos}
            />
          </div>
        </section>

        {verified.length > 0 && (
          <section className="mt-12" aria-label="Verified contributions">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="h-product">Verified contributions</h2>
              <ActionLink href="/student/opensource">Open source portal</ActionLink>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {verified.map((v, i) => (
                <Evidence
                  key={i}
                  kicker="Verified contribution"
                  title={v.title || `PR ${v.pr_number ? `#${v.pr_number}` : ""}`}
                  body={shortRepo(v.repo_url)}
                  href={v.pr_url}
                  hrefLabel="Open pull request"
                  meta={v.merged_at ? `merged ${new Date(v.merged_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}` : v.status}
                  checks={[
                    "Repository tracked by your chapter",
                    "Contribution detected via webhook",
                    v.verified_at || v.status === "merged" ? "Merge verified" : "Awaiting merge verification"
                  ]}
                />
              ))}
            </div>
          </section>
        )}

        <section className="mt-12 grid gap-10 lg:grid-cols-2" aria-label="Stream and connection">
          <div>
            <h2 className="h-product">Activity stream</h2>
            <div className="mt-2">
              {recentEvents.length > 0 ? (
                <ActivityStream
                  items={recentEvents.map((e) => ({
                    text: humanEvent(e),
                    meta: `${repoNames[e.repository_id] || "a repository"} · ${new Date(e.received_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}`,
                    hot: e.event_name?.startsWith("pull_request")
                  }))}
                />
              ) : (
                <p className="narrative mt-3">No webhook events attributed to you yet. Push to a tracked repo and it will stream in here.</p>
              )}
            </div>
          </div>
          <div>
            <h2 className="h-product">Connection</h2>
            <p className="narrative mt-3">
              Linked as <span className="font-mono" style={{ color: "var(--text)" }}>{conn.github_username}</span> since{" "}
              {new Date(conn.connected_at).toLocaleDateString("en-IN", { month: "long", day: "numeric", year: "numeric" })}.
              Webhook ingestion is live. Re-link below to change the username.
            </p>
            <div className="mt-4 max-w-sm">
              <GithubConnectForm />
            </div>
            <div className="mt-4">
              <ExportGithubButton data={{ username: conn?.github_username || null, exportedAt: new Date().toISOString(), repos: repos.map((r) => r.full_name), activity }} />
            </div>
          </div>
        </section>
      </main>
    </AppShell>
  );
}

function currentStreak(activity) {
  const byDay = new Map(activity.map((r) => [String(r.day).slice(0, 10), r]));
  let streak = 0;
  const d = new Date();
  const todayIso = d.toISOString().slice(0, 10);
  const today = byDay.get(todayIso);
  const todayActive = today && (today.commits || 0) + (today.pull_requests || 0) + (today.reviews || 0) > 0;
  if (!todayActive) d.setDate(d.getDate() - 1);
  for (;;) {
    const iso = d.toISOString().slice(0, 10);
    const r = byDay.get(iso);
    if (!r || (r.commits || 0) + (r.pull_requests || 0) + (r.reviews || 0) <= 0) break;
    streak += 1;
    d.setDate(d.getDate() - 1);
    if (streak > 400) break;
  }
  return streak;
}

function shortRepo(url) {
  if (!url) return "";
  return String(url).replace("https://github.com/", "").replace(/\/$/, "");
}

function humanEvent(e) {
  const name = e.event_name || "activity";
  if (name === "push") {
    const n = e.payload?.commits?.length ?? e.payload?.size ?? null;
    return n ? `pushed ${n} commit${n === 1 ? "" : "s"}` : "pushed commits";
  }
  if (name === "pull_request") {
    const action = e.payload?.action;
    const num = e.payload?.number ?? e.payload?.pull_request?.number;
    return `${action || "updated"} pull request${num ? ` #${num}` : ""}`;
  }
  if (name === "pull_request_review") return "reviewed a pull request";
  if (name === "issues") return `${e.payload?.action || "touched"} an issue`;
  return name.replace(/_/g, " ");
}
