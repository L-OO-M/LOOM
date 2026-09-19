import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { GithubConnectForm } from "@/components/actions";
import { Display, Meta, PlainStat, ActionLink, StatusPill } from "@/components/loom/primitives";
import { Heatmap } from "@/components/loom/Heatmap";
import { Evidence } from "@/components/loom/Evidence";
import { OnboardingState } from "@/components/loom/States";
import { eventUrlFromPayload, isGithubEnabled, nextMoveState, repoFullNameFromPayload } from "@/lib/github";
import { GithubTabs, ConnectionControls } from "./GithubBits";

export default async function GithubPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/github");
  const { user, tenant, sql } = ctx;
  const [conn] = await sql`SELECT * FROM github_connections WHERE user_id = ${user.id} LIMIT 1`;
  const paused = tenant?.id ? !(await isGithubEnabled(sql, tenant.id)) : true;
  const activity = await sql`SELECT day, commits, pull_requests, reviews FROM student_daily_activity WHERE student_id = ${user.id} ORDER BY day DESC LIMIT 120`;
  const total = activity.reduce((s, a) => s + (a.commits || 0), 0);
  const prs = activity.reduce((s, a) => s + (a.pull_requests || 0), 0);
  const streak = currentStreak(activity);

  const recentEvents = conn ? await sql`
    SELECT event_name, repository_id, actor_login, received_at, payload FROM github_events
    WHERE lower(actor_login) = lower(${conn.github_username})
    ORDER BY received_at DESC LIMIT 20
  ` : [];
  const repoIds = [...new Set(recentEvents.map((e) => e.repository_id).filter(Boolean))];
  const repoNames = {};
  if (repoIds.length > 0) {
    const found = await sql`SELECT id, full_name FROM repositories WHERE id = ANY(${repoIds})`;
    for (const r of found) repoNames[r.id] = r.full_name;
  }

  const contributions = await sql`
    SELECT repo_url, pr_url, pr_number, title, contribution_type, status, merged_at, verified_at, created_at,
      files_changed, lines_added, lines_deleted
    FROM student_oss_contributions WHERE student_id = ${user.id}
    ORDER BY created_at DESC LIMIT 12
  `;
  const verified = contributions.filter((c) => c.status === "verified").slice(0, 6);
  const pending = contributions.filter((c) => c.status !== "verified" && c.status !== "rejected");
  const [badgeRow] = await sql`SELECT COUNT(*)::int AS c FROM oss_badges WHERE student_id = ${user.id}`;
  const badgeCount = badgeRow?.c ?? 0;

  // Enrich events from real payloads: repo name prefers
  // payload.repository.full_name (repository_id is often NULL), links prefer
  // payload PR/issue URLs. Serializable for the client tabs.
  const items = recentEvents.map((e) => enrichEvent(e, repoNames));
  const repoGroups = groupRepos(items);
  const lastActive = items.length > 0 ? items[0].date : null;
  const move = nextMoveState({ connected: !!conn, eventCount: items.length, pendingCount: pending.length, verifiedCount: verified.length });
  const moveHref = move.kind === "first-push" && conn ? `https://github.com/${conn.github_username}` : move.href;
  const moveExternal = move.kind === "first-push";
  const profileUrl = conn ? `https://github.com/${conn.github_username}` : null;

  const exportData = {
    username: conn?.github_username || null,
    exportedAt: new Date().toISOString(),
    repos: repoGroups.map((r) => r.name),
    activity
  };

  if (!conn) {
    return (
      <AppShell area="student" tenant={tenant} user={user}>
        <main className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mt-4">
            {paused && (
              <section aria-label="Ingestion paused" className="rounded-2xl border border-dashed px-5 py-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <p className="meta" style={{ color: "var(--accent)" }}>GitHub activity is currently paused</p>
                <p className="narrative mt-2">Your chapter has not enabled GitHub ingestion yet. You can still link your account now — activity will start flowing once ingestion is on.</p>
              </section>
            )}
            <OnboardingState
              eyebrow="GitHub · proof of building"
              title="Your work, becoming visible."
              why="Link your GitHub username and every push, pull request, and review flows in through webhooks — attributed to you, rolled into your growth story, and eligible as open-source evidence."
              steps={[
                { title: "Save your username", body: "Events are matched to you by login — no OAuth, no plugins." },
                { title: "Push like normal", body: "Activity lands here on its own once your chapter enables ingestion." },
                { title: "Claim open-source PRs", body: "Merged work becomes verified evidence with badges attached." }
              ]}
              action={
                <div className="mx-auto max-w-sm rounded-2xl border p-5 text-left" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                  <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>Manual linking — type the exact GitHub login</p>
                  <GithubConnectForm />
                </div>
              }
            />
          </div>
          <Bridge eventCount={0} claimCount={0} verifiedCount={0} badgeCount={0} />
          <NextMove move={move} href={null} external={false} />
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <Hero paused={paused} connected username={conn.github_username} profileUrl={profileUrl} lastActive={lastActive} />

        {paused && (
          <section aria-label="Ingestion paused" className="mt-6 rounded-2xl border border-dashed px-5 py-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <p className="meta" style={{ color: "var(--accent)" }}>GitHub activity is currently paused</p>
            <p className="narrative mt-2">Your account is still linked, but new activity is not currently being ingested by LOOM. Everything below is previously recorded data — it stays as history and picks up again once your chapter re-enables ingestion.</p>
          </section>
        )}

        <section className="mt-10" aria-label="Activity overview">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="h-product">Activity overview</h2>
            <span className="meta">last 120 days</span>
          </div>
          {activity.length === 0 && items.length === 0 ? (
            <div className="mt-4 rounded-2xl border px-5 py-8 text-center" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <p className="text-[1.05rem] font-semibold" style={{ color: "var(--text)" }}>No GitHub activity has reached LOOM yet.</p>
              <p className="narrative mx-auto mt-2 text-center">
                {paused
                  ? "Ingestion is paused for your chapter, so new pushes are not being recorded right now."
                  : "Once GitHub events are being recorded, your building activity will appear here — push to a watched repository to start the stream."}
              </p>
            </div>
          ) : (
            <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_280px]">
              <div className="min-w-0 rounded-2xl border px-5 py-5 transition-colors" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <div className="overflow-x-auto pb-1">
                  <Heatmap rows={activity} weeks={16} />
                </div>
                <p className="mt-4 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                  Each square is one day. Shade deepens with more recorded commits, pull requests, and reviews — empty squares are days with nothing recorded, not a verdict.
                </p>
              </div>
              <div className="space-y-7">
                <div title="Commits recorded from push events in the last 120 days" className="rounded-xl transition-colors">
                  <PlainStat value={total} unit="commits" label="recorded in the last 120 days" />
                </div>
                <div title="Pull-request events attributed to you in the last 120 days" className="rounded-xl transition-colors">
                  <PlainStat value={prs} unit="pull requests" label="opened in the same window" />
                </div>
                <div title="Consecutive days with recorded activity, ending today or yesterday" className="rounded-xl transition-colors">
                  <PlainStat value={streak} unit={streak === 1 ? "day" : "days"} label="current contribution streak" />
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="mt-12" aria-label="Building activity">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="h-product">Your building activity</h2>
            <span className="meta">{items.length} recent event{items.length === 1 ? "" : "s"}</span>
          </div>
          <div className="mt-4">
            <GithubTabs items={items} repos={repoGroups} />
          </div>
        </section>

        <section className="mt-12" aria-label="Verified and pending work">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="h-product">Verified work</h2>
            <ActionLink href="/student/opensource">Open source portal</ActionLink>
          </div>
          {verified.length === 0 && pending.length === 0 ? (
            <div className="mt-4 rounded-2xl border px-5 py-8 text-center" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <p className="text-[1.05rem] font-semibold" style={{ color: "var(--text)" }}>Your verified contributions will appear here.</p>
              <p className="narrative mx-auto mt-2 text-center">Merged pull requests in curated repositories verify automatically and become LOOM evidence with badges attached.</p>
              <div className="mt-4">
                <ActionLink href="/student/opensource">Explore open-source opportunities</ActionLink>
              </div>
            </div>
          ) : (
            <>
              {verified.length > 0 && (
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {verified.map((v, i) => (
                    <Evidence
                      key={v.pr_url || i}
                      kicker="Verified contribution"
                      title={v.title || `PR ${v.pr_number ? `#${v.pr_number}` : ""}`}
                      body={shortRepo(v.repo_url)}
                      href={v.pr_url}
                      hrefLabel="Open pull request"
                      meta={evidenceMeta(v)}
                      checks={evidenceChecks(v)}
                    />
                  ))}
                </div>
              )}
              {pending.length > 0 && (
                <div className="mt-8">
                  <p className="meta" style={{ color: "var(--accent)" }}>Awaiting merge · {pending.length}</p>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {pending.map((v, i) => (
                      <article key={v.pr_url || `p-${i}`} className="rounded-[6px_14px_14px_6px] border px-5 py-4 transition-colors" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                        <p className="meta">Pending verification</p>
                        <h3 className="mt-1.5 text-[0.95rem] font-semibold leading-6" style={{ color: "var(--text)" }}>{v.title || `PR ${v.pr_number ? `#${v.pr_number}` : ""}`}</h3>
                        {shortRepo(v.repo_url) && <p className="mt-1 font-mono text-xs" style={{ color: "var(--text-muted)" }}>{shortRepo(v.repo_url)}</p>}
                        <p className="mt-2 text-xs leading-5" style={{ color: "var(--text-muted)" }}>Once the contribution is merged and verified, it can become part of your LOOM evidence.</p>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          {v.pr_url ? (
                            <a href={v.pr_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                              Open pull request →
                            </a>
                          ) : <span />}
                          <span className="meta">claimed · awaiting merge</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <Bridge eventCount={items.length} claimCount={contributions.length} verifiedCount={verified.length} badgeCount={badgeCount} />

        <NextMove move={move} href={moveHref} external={moveExternal} />

        <section id="github-connection" aria-label="Connected account" className="mt-12 scroll-mt-24">
          <h2 className="h-product">Connected account</h2>
          <div className="mt-4 rounded-2xl border px-5 py-5 sm:px-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
              <div>
                <dt className="meta">GitHub</dt>
                <dd className="mt-1.5 font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>@{conn.github_username}</dd>
              </div>
              <div>
                <dt className="meta">Connected since</dt>
                <dd className="mt-1.5 text-sm" style={{ color: "var(--text)" }}>{fmtLong(conn.connected_at)}</dd>
              </div>
              <div>
                <dt className="meta">Ingestion</dt>
                <dd className="mt-1.5"><StatusPill tone={paused ? "" : "live"}>{paused ? "Paused" : "Live"}</StatusPill></dd>
              </div>
            </dl>
            <p className="narrative mt-4">LOOM matches webhook events to you by this username — manual linking, no OAuth scopes. Proof comes from merged work, not from login, so keep the handle exact.</p>
            <ConnectionControls username={conn.github_username} exportData={exportData} />
          </div>
        </section>
      </main>
    </AppShell>
  );
}

function Hero({ paused, connected, username, profileUrl, lastActive, title = "Your work, becoming visible." }) {
  return (
    <header className="hero-field rounded-2xl border px-5 py-8 sm:px-8 sm:py-10" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 max-w-2xl">
          <Meta>GitHub · proof of building</Meta>
          {title && <Display size="lg" className="mt-3">{title}</Display>}
          <p className="narrative mt-4">Turn real GitHub activity into a record of what you build, contribute, and ship.</p>
          {connected && (
            <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>
              Linked as{" "}
              <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="font-mono font-semibold hover:underline" style={{ color: "var(--text)" }}>
                @{username} ↗
              </a>
              {lastActive && <span className="meta ml-3 normal-case tracking-normal">last activity · {lastActive}</span>}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <StatusPill tone={!connected ? "" : paused ? "" : "live"}>
            {!connected ? "Not connected" : paused ? "Paused" : "Live"}
          </StatusPill>
          {connected && (
            <span className="meta normal-case tracking-normal">{paused ? "link kept · ingestion off" : "ingesting pushes · PRs · reviews"}</span>
          )}
        </div>
      </div>
    </header>
  );
}

function Bridge({ eventCount, claimCount, verifiedCount, badgeCount }) {
  const steps = [
    { n: "01", title: "Build", body: "Pushes, PRs, and reviews flow in through webhooks.", meta: `${eventCount} recorded event${eventCount === 1 ? "" : "s"}` },
    { n: "02", title: "Contribute", body: "Claim pull requests in curated chapter repos.", meta: `${claimCount} contribution${claimCount === 1 ? "" : "s"}` },
    { n: "03", title: "Verify", body: "Merges verify automatically — no judging queue.", meta: `${verifiedCount} verified` },
    { n: "04", title: "Prove", body: "Badges and credentials travel beyond the chapter.", meta: `${badgeCount} badge${badgeCount === 1 ? "" : "s"}` }
  ];
  return (
    <section className="mt-12" aria-label="How GitHub becomes proof">
      <h2 className="h-product">How activity becomes proof</h2>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <li key={s.n} className="row-link rounded-2xl border px-4 py-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <p className="index-num">{s.n}</p>
            <p className="mt-2 text-sm font-semibold" style={{ color: "var(--text)" }}>{s.title}</p>
            <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-muted)" }}>{s.body}</p>
            <p className="meta mt-3 normal-case tracking-normal">{s.meta}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function NextMove({ move, href, external }) {
  return (
    <section className="mt-12" aria-label="Your next move">
      <div className="rounded-2xl border px-5 py-6 sm:px-7" style={{ borderColor: "var(--line)", background: "var(--bg-muted)" }}>
        <p className="meta" style={{ color: "var(--accent)" }}>Your next move</p>
        <h2 className="h-product mt-2">{move.title}</h2>
        <p className="narrative mt-2">{move.body}</p>
        <div className="mt-4">
          {external && href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="btn-ink">
              {move.cta} <span aria-hidden="true">↗</span>
            </a>
          ) : href ? (
            <ActionLink href={href}>{move.cta}</ActionLink>
          ) : (
            <Link href="/student/github#github-connection" prefetch={false} className="btn-ink">
              {move.cta} <span aria-hidden="true">↓</span>
            </Link>
          )}
        </div>
      </div>
    </section>
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

function kindOf(name) {
  if (name === "push") return "push";
  if (name === "pull_request") return "pull request";
  if (name === "pull_request_review") return "review";
  if (name === "issues") return "issue";
  return (name || "activity").replace(/_/g, " ");
}

function fmtShort(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

function fmtLong(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { month: "long", day: "numeric", year: "numeric" });
}

function enrichEvent(e, repoNames) {
  const payload = e.payload || {};
  const repo = repoFullNameFromPayload(payload, (e.repository_id && repoNames[e.repository_id]) || null) || "a repository";
  const url = eventUrlFromPayload(payload);
  const at = e.received_at ? new Date(e.received_at).toISOString() : null;
  return {
    kind: kindOf(e.event_name),
    text: humanEvent(e),
    repo,
    url,
    at,
    date: fmtShort(e.received_at) || "recently"
  };
}

function groupRepos(items) {
  const map = new Map();
  for (const it of items) {
    if (!it.repo || it.repo === "a repository") continue;
    const hit = map.get(it.repo) || { name: it.repo, count: 0, lastAt: null, kinds: new Set() };
    hit.count += 1;
    hit.kinds.add(it.kind);
    if (!hit.lastAt || (it.at && it.at > hit.lastAt)) hit.lastAt = it.at;
    map.set(it.repo, hit);
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((r) => ({ name: r.name, count: r.count, kinds: [...r.kinds].join(" · "), lastDate: fmtShort(r.lastAt) || "recently" }));
}

function evidenceMeta(v) {
  if (v.merged_at) return `merged ${fmtShort(v.merged_at)}`;
  if (v.verified_at) return `verified ${fmtShort(v.verified_at)}`;
  return v.status;
}

function evidenceChecks(v) {
  const checks = ["Repository tracked by your chapter"];
  const files = v.files_changed || 0;
  const added = v.lines_added || 0;
  const removed = v.lines_deleted || 0;
  if (files > 0 || added > 0 || removed > 0) {
    checks.push(`${files} file${files === 1 ? "" : "s"} · +${added} −${removed}`);
  }
  checks.push(v.verified_at || v.status === "verified" ? "Merge verified" : "Awaiting merge verification");
  return checks;
}
